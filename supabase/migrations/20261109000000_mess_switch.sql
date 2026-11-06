-- "Eat here this meal": a student at a crowded mess can get a single-meal pass for a less crowded one.
-- Allowed only while the warden flag allow_mess_switch is on (or DEMO MODE). Redeemed by the scanner at the other mess; logged for billing.

insert into public.app_settings values ('allow_mess_switch', 'off') on conflict do nothing;

create or replace function public.mess_switch_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select public.demo_mode() or coalesce((select value = 'on' from public.app_settings where key = 'allow_mess_switch'), false)
$$;

create or replace function public.set_mess_switch(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() <> 'warden' then raise exception 'only the warden can change this' using errcode = '42501'; end if;
  insert into public.app_settings values ('allow_mess_switch', case when p_on then 'on' else 'off' end)
  on conflict (key) do update set value = excluded.value;
end $$;

create table public.mess_switch_passes (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id),
  from_mess   text not null,
  to_mess     text not null,
  meal_date   date not null,
  slot        text not null check (slot in ('breakfast','lunch','snacks','dinner')),
  status      text not null default 'issued' check (status in ('issued','redeemed')),
  from_pct    integer,
  to_pct      integer,
  created_at  timestamptz not null default now(),
  redeemed_at timestamptz,
  redemption_id uuid references public.meal_redemptions(id),   -- the accepted meal record at the other mess (billing)
  unique (student_id, meal_date, slot)
);
alter table public.mess_switch_passes enable row level security;
revoke all on public.mess_switch_passes from public, anon, authenticated;
grant select on public.mess_switch_passes to authenticated;
create policy "passes: own" on public.mess_switch_passes for select to authenticated using (student_id = auth.uid());
create policy "passes: warden" on public.mess_switch_passes for select to authenticated using (public.get_my_role() = 'warden');
create policy "passes: staff of either mess" on public.mess_switch_passes for select to authenticated
  using (public.get_my_role() in ('counter_staff','mess_admin') and public.get_my_assigned_mess_id() in (from_mess, to_mess));

create or replace function public.issue_switch_pass(p_to_mess text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_from text := public.get_my_assigned_mess_id(); v_slot text;
  v_date date := (now() at time zone 'Asia/Kolkata')::date; v_from_pct int; v_to_pct int; v_id uuid;
begin
  if public.get_my_role() <> 'student' or v_from is null then raise exception 'only students with a mess can do this' using errcode = '42501'; end if;
  if not public.mess_switch_allowed() then raise exception 'switching_off'; end if;
  if p_to_mess = v_from or not exists (select 1 from public.mess_capacity where mess_id = p_to_mess) then raise exception 'bad_mess'; end if;
  if p_to_mess = 'priyadarshini' then raise exception 'not_eligible'; end if;    -- Ladies' Halls mess. TODO: verify eligibility rules
  v_slot := public.effective_slot(p_to_mess, now());
  if v_slot is null then raise exception 'no_open_slot'; end if;
  select pct into v_from_pct from public.mess_crowd() where mess_id = v_from;
  select pct into v_to_pct from public.mess_crowd() where mess_id = p_to_mess;
  if coalesce(v_to_pct, 0) >= coalesce(v_from_pct, 0) then raise exception 'not_less_crowded'; end if;
  if exists (select 1 from public.meal_redemptions where student_id = v_uid and meal_date = v_date and slot = v_slot and status = 'accepted') then
    raise exception 'already_ate';
  end if;
  insert into public.mess_switch_passes (student_id, from_mess, to_mess, meal_date, slot, from_pct, to_pct)
  values (v_uid, v_from, p_to_mess, v_date, v_slot, v_from_pct, v_to_pct) returning id into v_id;
  return jsonb_build_object('id', v_id, 'slot', v_slot, 'meal_date', v_date, 'from_mess', v_from, 'to_mess', p_to_mess);
exception when unique_violation then raise exception 'already_issued';
end $$;

-- Service role only: the scanner at to_mess accepted the pass offline; record the meal there (once).
create or replace function public.redeem_switch_pass(p_staff_id uuid, p_scanner_id uuid, p_pass_id uuid, p_scanned_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_scanner public.scanner_devices; v_p public.mess_switch_passes; v_rid uuid := gen_random_uuid();
begin
  select * into v_scanner from public.scanner_devices where id = p_scanner_id and revoked_at is null;
  if v_scanner.id is null or v_scanner.staff_id <> p_staff_id then raise exception 'not authorized for this scanner' using errcode = '42501'; end if;
  select * into v_p from public.mess_switch_passes where id = p_pass_id for update;
  if v_p.id is null then return jsonb_build_object('status','rejected','reason','unknown_ticket'); end if;
  if v_p.to_mess <> v_scanner.mess_id then return jsonb_build_object('status','rejected','reason','wrong_mess'); end if;
  if (p_scanned_at at time zone 'Asia/Kolkata')::date <> v_p.meal_date
     or (not public.demo_mode() and public.effective_slot(v_p.to_mess, p_scanned_at) is distinct from v_p.slot) then
    return jsonb_build_object('status','rejected','reason','outside_meal_time');
  end if;
  if v_p.status = 'redeemed' then return jsonb_build_object('status','duplicate','reason','already_redeemed'); end if;
  begin
    insert into public.meal_redemptions (id, student_id, mess_id, meal_date, slot, method, scanned_at, scanner_id, staff_id, status)
    values (v_rid, v_p.student_id, v_p.to_mess, v_p.meal_date, v_p.slot, 'qr', p_scanned_at, p_scanner_id, p_staff_id, 'accepted');
  exception when unique_violation then
    return jsonb_build_object('status','duplicate','reason','already_admitted');   -- the student already ate this slot elsewhere
  end;
  update public.mess_switch_passes set status = 'redeemed', redeemed_at = p_scanned_at, redemption_id = v_rid where id = v_p.id;
  return jsonb_build_object('status','accepted');
end $$;

revoke execute on function public.mess_switch_allowed(), public.set_mess_switch(boolean), public.issue_switch_pass(text),
  public.redeem_switch_pass(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.mess_switch_allowed(), public.set_mess_switch(boolean), public.issue_switch_pass(text) to authenticated;
grant execute on function public.redeem_switch_pass(uuid, uuid, uuid, timestamptz) to service_role;
