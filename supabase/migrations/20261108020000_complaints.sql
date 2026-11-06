-- Grievance redressal: students/parents file complaints; the mess admin groups them, replies, resolves or declines (with a reason).

create table public.complaints (
  id            uuid primary key default gen_random_uuid(),
  filer_id      uuid not null references public.profiles(id) on delete cascade,
  mess_id       text not null,
  category      text not null check (category in ('food_quality','hygiene','quantity','service','other')),
  meal_date     date not null,
  slot          text not null check (slot in ('breakfast','lunch','snacks','dinner')),
  body          text not null check (length(trim(body)) between 10 and 1000),
  anonymous     boolean not null default false,
  status        text not null default 'open' check (status in ('open','resolved','cannot_resolve')),
  reply         text,
  cannot_reason text,
  responded_by  uuid references public.profiles(id),
  responded_at  timestamptz,
  public_text   text,                -- set when the admin posts the fix to the public Daily Progress board
  posted_at     timestamptz,
  created_at    timestamptz not null default now()
);
create index complaints_filer on public.complaints (filer_id, created_at desc);
create index complaints_mess on public.complaints (mess_id, status, meal_date);

create table public.complaint_events (
  id           bigserial primary key,
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  kind         text not null check (kind in ('filed','replied','resolved','cannot_resolve','posted')),
  note         text,
  at           timestamptz not null default now()
);

alter table public.complaints enable row level security;
alter table public.complaint_events enable row level security;
revoke all on public.complaints, public.complaint_events from public, anon, authenticated;
grant select on public.complaints, public.complaint_events to authenticated;
-- A filer reads only their own rows. The mess admin and warden read through admin_complaints() (hides anonymous filers).
create policy "complaints: own" on public.complaints for select to authenticated using (filer_id = auth.uid());
create policy "complaint_events: own" on public.complaint_events for select to authenticated
  using (exists (select 1 from public.complaints c where c.id = complaint_id and c.filer_id = auth.uid()));

-- Slot window end + 30 min = SLA deadline (IST).
create or replace function public.complaint_sla_due(p_mess text, p_date date, p_slot text) returns timestamptz
language sql stable security definer set search_path = public as $$
  select ((p_date + ends) at time zone 'Asia/Kolkata') + interval '30 minutes' from public.mess_slots where mess_id = p_mess and slot = p_slot
$$;

create or replace function public.file_complaint(p_mess text, p_category text, p_date date, p_slot text, p_body text, p_anonymous boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role user_role := public.get_my_role(); v_id uuid;
        v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if v_role not in ('student','parent') then raise exception 'only students and parents can file complaints' using errcode = '42501'; end if;
  if not exists (select 1 from public.mess_slots where mess_id = p_mess and slot = p_slot) then raise exception 'unknown mess or meal'; end if;
  if p_date > v_today or p_date < v_today - 2 then raise exception 'date_out_of_range'; end if;
  if (select count(*) from public.complaints where filer_id = v_uid and created_at > now() - interval '1 day') >= 5 then raise exception 'rate_limited'; end if;
  insert into public.complaints (filer_id, mess_id, category, meal_date, slot, body, anonymous)
  values (v_uid, p_mess, p_category, p_date, p_slot, trim(p_body), coalesce(p_anonymous, false)) returning id into v_id;
  insert into public.complaint_events (complaint_id, kind) values (v_id, 'filed');
  return v_id;
end $$;

-- The mess admin's (and warden's) view: no filer identity when the complaint is anonymous.
create or replace function public.admin_complaints()
returns table (id uuid, mess_id text, category text, meal_date date, slot text, body text, anonymous boolean, filer_name text,
               status text, reply text, cannot_reason text, responded_at timestamptz, posted_at timestamptz, created_at timestamptz, sla_due timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.mess_id, c.category, c.meal_date, c.slot, c.body, c.anonymous,
         case when c.anonymous then null else p.full_name end,
         c.status, c.reply, c.cannot_reason, c.responded_at, c.posted_at, c.created_at,
         public.complaint_sla_due(c.mess_id, c.meal_date, c.slot)
  from public.complaints c join public.profiles p on p.id = c.filer_id
  where (public.get_my_role() = 'mess_admin' and c.mess_id = public.get_my_assigned_mess_id()) or public.get_my_role() = 'warden'
  order by c.created_at desc
$$;

create or replace function public.respond_complaint(p_id uuid, p_outcome text, p_reply text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_c public.complaints;
begin
  select * into v_c from public.complaints where id = p_id for update;
  if v_c.id is null or public.get_my_role() <> 'mess_admin' or v_c.mess_id is distinct from public.get_my_assigned_mess_id() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_c.status <> 'open' then raise exception 'already_answered'; end if;
  if p_outcome not in ('resolved','cannot_resolve') then raise exception 'bad outcome'; end if;
  if length(trim(coalesce(p_reply, ''))) < 10 then raise exception 'reply_required'; end if;
  if p_outcome = 'cannot_resolve' and length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'reason_required'; end if;
  update public.complaints set status = p_outcome, reply = trim(p_reply),
         cannot_reason = case when p_outcome = 'cannot_resolve' then trim(p_reason) end,
         responded_by = auth.uid(), responded_at = now() where id = p_id;
  insert into public.complaint_events (complaint_id, kind, note) values (p_id, 'replied', null),
         (p_id, p_outcome, case when p_outcome = 'cannot_resolve' then trim(p_reason) end);
end $$;

create or replace function public.post_complaint_progress(p_id uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare v_c public.complaints;
begin
  select * into v_c from public.complaints where id = p_id for update;
  if v_c.id is null or public.get_my_role() <> 'mess_admin' or v_c.mess_id is distinct from public.get_my_assigned_mess_id() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_c.status <> 'resolved' then raise exception 'only resolved complaints can be posted'; end if;
  if length(trim(coalesce(p_text, ''))) < 10 then raise exception 'text_required'; end if;
  update public.complaints set public_text = trim(p_text), posted_at = now() where id = p_id;
  insert into public.complaint_events (complaint_id, kind) values (p_id, 'posted');
end $$;

-- Anonymous-safe: only the admin's own public sentence, mess and date. Never the complaint text, filer or category link.
create or replace function public.public_progress() returns table (mess_id text, on_date date, text text)
language sql stable security definer set search_path = public as $$
  select mess_id, (posted_at at time zone 'Asia/Kolkata')::date, public_text from public.complaints
  where posted_at is not null order by posted_at desc limit 10
$$;

revoke execute on function public.complaint_sla_due(text, date, text), public.file_complaint(text, text, date, text, text, boolean),
  public.admin_complaints(), public.respond_complaint(uuid, text, text, text), public.post_complaint_progress(uuid, text), public.public_progress()
  from public, anon, authenticated;
grant execute on function public.file_complaint(text, text, date, text, text, boolean), public.admin_complaints(),
  public.respond_complaint(uuid, text, text, text), public.post_complaint_progress(uuid, text) to authenticated;
grant execute on function public.public_progress() to anon, authenticated, service_role;
