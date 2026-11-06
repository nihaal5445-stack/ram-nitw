-- 1) complaints: an "in progress" outcome (answered but not finished; can be answered again)
alter table public.complaints drop constraint complaints_status_check;
alter table public.complaints add constraint complaints_status_check check (status in ('open','in_progress','resolved','cannot_resolve'));
alter table public.complaint_events drop constraint complaint_events_kind_check;
alter table public.complaint_events add constraint complaint_events_kind_check check (kind in ('filed','replied','in_progress','resolved','cannot_resolve','posted'));

create or replace function public.respond_complaint(p_id uuid, p_outcome text, p_reply text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_c public.complaints;
begin
  select * into v_c from public.complaints where id = p_id for update;
  if v_c.id is null or public.get_my_role() <> 'mess_admin' or v_c.mess_id is distinct from public.get_my_assigned_mess_id() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_c.status not in ('open','in_progress') then raise exception 'already_answered'; end if;
  if p_outcome not in ('resolved','in_progress','cannot_resolve') then raise exception 'bad outcome'; end if;
  if length(trim(coalesce(p_reply, ''))) < 10 then raise exception 'reply_required'; end if;
  if p_outcome = 'cannot_resolve' and length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'reason_required'; end if;
  update public.complaints set status = p_outcome, reply = trim(p_reply),
         cannot_reason = case when p_outcome = 'cannot_resolve' then trim(p_reason) end,
         responded_by = auth.uid(), responded_at = now() where id = p_id;
  insert into public.complaint_events (complaint_id, kind, note) values (p_id, 'replied', null),
         (p_id, p_outcome, case when p_outcome = 'cannot_resolve' then trim(p_reason) end);
end $$;

-- 2) direct messages: student <-> the admin of the student's mess
create table public.admin_messages (
  id              bigserial primary key,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  mess_id         text not null,
  sender          text not null check (sender in ('student','admin')),
  body            text not null check (length(trim(body)) between 1 and 1000),
  created_at      timestamptz not null default now(),
  read_by_admin   boolean not null default false,
  read_by_student boolean not null default false
);
create index admin_messages_student on public.admin_messages (student_id, created_at);
create index admin_messages_mess on public.admin_messages (mess_id, created_at);
alter table public.admin_messages enable row level security;
revoke all on public.admin_messages from public, anon, authenticated;
grant select on public.admin_messages to authenticated;
create policy "admin_messages: own thread" on public.admin_messages for select to authenticated using (student_id = auth.uid());
-- admins read through the functions below (their mess only)

create or replace function public.send_student_message(p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare v_mess text := public.get_my_assigned_mess_id();
begin
  if public.get_my_role() <> 'student' or v_mess is null then raise exception 'students only' using errcode = '42501'; end if;
  if (select count(*) from public.admin_messages where student_id = auth.uid() and sender = 'student' and created_at > now() - interval '1 hour') >= 30 then raise exception 'rate_limited'; end if;
  insert into public.admin_messages (student_id, mess_id, sender, body, read_by_student) values (auth.uid(), v_mess, 'student', trim(p_body), true);
end $$;

create or replace function public.student_thread_read() returns void
language sql security definer set search_path = public as $$
  update public.admin_messages set read_by_student = true where student_id = auth.uid() and sender = 'admin' and not read_by_student
$$;

create or replace function public.student_unread_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.admin_messages where student_id = auth.uid() and sender = 'admin' and not read_by_student
$$;

create or replace function public.admin_inbox() returns table (student_id uuid, student_name text, roll text, last_body text, last_sender text, last_at timestamptz, unread integer)
language sql stable security definer set search_path = public as $$
  select m.student_id, p.full_name, p.roll_number,
         (array_agg(m.body order by m.created_at desc))[1], (array_agg(m.sender order by m.created_at desc))[1], max(m.created_at),
         count(*) filter (where m.sender = 'student' and not m.read_by_admin)::int
  from public.admin_messages m join public.profiles p on p.id = m.student_id
  where public.get_my_role() = 'mess_admin' and m.mess_id = public.get_my_assigned_mess_id()
  group by m.student_id, p.full_name, p.roll_number order by max(m.created_at) desc
$$;

create or replace function public.admin_thread(p_student uuid) returns table (id bigint, sender text, body text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if public.get_my_role() <> 'mess_admin' then return; end if;
  update public.admin_messages set read_by_admin = true
   where student_id = p_student and mess_id = public.get_my_assigned_mess_id() and sender = 'student' and not read_by_admin;
  return query select m.id, m.sender, m.body, m.created_at from public.admin_messages m
   where m.student_id = p_student and m.mess_id = public.get_my_assigned_mess_id() order by m.created_at;
end $$;

create or replace function public.admin_reply_message(p_student uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare v_mess text := public.get_my_assigned_mess_id();
begin
  if public.get_my_role() <> 'mess_admin' or v_mess is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.admin_messages where student_id = p_student and mess_id = v_mess) then raise exception 'no such thread' using errcode = '42501'; end if;
  insert into public.admin_messages (student_id, mess_id, sender, body, read_by_admin) values (p_student, v_mess, 'admin', trim(p_body), true);
end $$;

revoke execute on function public.send_student_message(text), public.student_thread_read(), public.student_unread_count(), public.admin_inbox(),
  public.admin_thread(uuid), public.admin_reply_message(uuid, text) from public, anon, authenticated;
grant execute on function public.send_student_message(text), public.student_thread_read(), public.student_unread_count(), public.admin_inbox(),
  public.admin_thread(uuid), public.admin_reply_message(uuid, text) to authenticated;
