-- Mess admins add and remove students of THEIR OWN mess; wardens do it for any mess and move students between messes.
-- Every rule is enforced here (SQL), not in the UI. Accounts are created through the existing allow-list (provisioned_accounts).

alter table public.provisioned_accounts add column roll_number text;

-- carry the roll number from the allow-list row into the new profile
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pre     public.provisioned_accounts%rowtype;
  v_student boolean := coalesce(new.email ilike '%@student.nitw.ac.in', false);
begin
  select * into v_pre from public.provisioned_accounts where email = lower(new.email);
  if not found and not v_student then
    raise exception 'signup_not_allowed: only @student.nitw.ac.in emails may sign up; other accounts must be added by a warden' using errcode = 'P0001';
  end if;
  if found then
    insert into public.profiles (id, email, full_name, role, assigned_mess_id, linked_student_id, roll_number)
    values (new.id, new.email, coalesce(v_pre.full_name, new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
            v_pre.role, v_pre.assigned_mess_id, v_pre.linked_student_id, v_pre.roll_number);
    delete from public.provisioned_accounts where email = v_pre.email; -- single use
  else
    insert into public.profiles (id, email, full_name, role) values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 'student');
  end if;
  return new;
end $$;

-- The profile guard stays: nobody but a warden may change role / mess / links directly. The membership functions below are the ONLY
-- other path; they switch the guard off for their own transaction only (set_config(..., is_local => true)).
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('ram.membership_fn', true) = 'on' then return new; end if;
  if auth.uid() is not null and coalesce(public.get_my_role(), 'student') != 'warden' then
    if new.id is distinct from old.id then raise exception 'Unauthorized: Cannot modify id'; end if;
    if new.role is distinct from old.role then raise exception 'Unauthorized: Only wardens can modify user roles'; end if;
    if new.email is distinct from old.email then raise exception 'Unauthorized: Email is managed by auth'; end if;
    if new.linked_student_id is distinct from old.linked_student_id then raise exception 'Unauthorized: Only wardens can modify linked student'; end if;
    if new.assigned_mess_id is distinct from old.assigned_mess_id then raise exception 'Unauthorized: Only wardens can modify assigned mess'; end if;
  end if;
  return new;
end $$;

create table public.mess_membership_log (
  id         bigserial primary key,
  student_id uuid not null,
  from_mess  text,
  to_mess    text,
  action     text not null check (action in ('add','remove','move')),
  by_user    uuid not null,
  at         timestamptz not null default now()
);
alter table public.mess_membership_log enable row level security;
revoke all on public.mess_membership_log from public, anon, authenticated;
grant select on public.mess_membership_log to authenticated;
create policy "membership log: warden" on public.mess_membership_log for select to authenticated using (public.get_my_role() = 'warden');
create policy "membership log: admin of the mess" on public.mess_membership_log for select to authenticated
  using (public.get_my_role() = 'mess_admin' and public.get_my_assigned_mess_id() in (from_mess, to_mess));

-- Which mess may the caller manage? mess_admin: their own (a different p_mess is an error); warden: p_mess (required).
create or replace function public._managed_mess(p_mess text) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_role user_role := public.get_my_role(); v_own text := public.get_my_assigned_mess_id();
begin
  if v_role = 'mess_admin' and v_own is not null then
    if p_mess is not null and p_mess <> v_own then raise exception 'wrong_mess: a mess admin can only manage their own mess' using errcode = '42501'; end if;
    return v_own;
  elsif v_role = 'warden' then
    if p_mess is null or not exists (select 1 from public.mess_capacity where mess_id = p_mess) then raise exception 'bad_mess'; end if;
    return p_mess;
  end if;
  raise exception 'not authorized' using errcode = '42501';
end $$;

-- Add: a new account (allow-list row; the server then creates the auth user) or an existing, unassigned student account.
create or replace function public.admin_add_student(p_email text, p_name text, p_roll text, p_mess text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_mess text := public._managed_mess(p_mess); v_email text := lower(trim(p_email)); v_roll text := upper(trim(p_roll)); v_p public.profiles;
begin
  if v_email !~ '^[a-z0-9._+-]+@student\.nitw\.ac\.in$' then raise exception 'bad_email: students use an @student.nitw.ac.in address'; end if;
  if length(trim(p_name)) not between 2 and 80 then raise exception 'bad_name'; end if;
  if v_roll !~ '^[A-Z0-9]{4,15}$' then raise exception 'bad_roll'; end if;
  select * into v_p from public.profiles where email = v_email;
  if v_p.id is not null then
    if v_p.role <> 'student' then raise exception 'not_a_student'; end if;
    if v_p.assigned_mess_id is not null and v_p.assigned_mess_id <> v_mess then raise exception 'in_other_mess: already in another mess; ask the warden to move them' using errcode = '42501'; end if;
    if v_p.assigned_mess_id = v_mess then raise exception 'already_in_mess'; end if;
    if exists (select 1 from public.profiles where roll_number = v_roll and id <> v_p.id) then raise exception 'roll_taken'; end if;
    perform set_config('ram.membership_fn', 'on', true);
    update public.profiles set assigned_mess_id = v_mess, roll_number = coalesce(roll_number, v_roll) where id = v_p.id;
    perform set_config('ram.membership_fn', 'off', true);
    insert into public.mess_membership_log (student_id, from_mess, to_mess, action, by_user) values (v_p.id, null, v_mess, 'add', auth.uid());
    return jsonb_build_object('action', 'assigned_existing', 'student_id', v_p.id, 'mess', v_mess);
  end if;
  if exists (select 1 from public.profiles where roll_number = v_roll) or exists (select 1 from public.provisioned_accounts where roll_number = v_roll) then raise exception 'roll_taken'; end if;
  insert into public.provisioned_accounts (email, role, full_name, assigned_mess_id, roll_number, provisioned_by)
  values (v_email, 'student', trim(p_name), v_mess, v_roll, auth.uid())
  on conflict (email) do update set full_name = excluded.full_name, assigned_mess_id = excluded.assigned_mess_id, roll_number = excluded.roll_number, provisioned_by = excluded.provisioned_by;
  return jsonb_build_object('action', 'create_account', 'mess', v_mess, 'email', v_email);
end $$;

-- Remove from the mess (the account stays; they just no longer belong to this mess).
create or replace function public.admin_remove_student(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_mess text := public._managed_mess(case when public.get_my_role() = 'warden' then (select assigned_mess_id from public.profiles where id = p_student) end); v_p public.profiles;
begin
  select * into v_p from public.profiles where id = p_student for update;
  if v_p.id is null or v_p.role <> 'student' then raise exception 'not_a_student'; end if;
  if v_p.assigned_mess_id is distinct from v_mess then raise exception 'wrong_mess: that student is not in your mess' using errcode = '42501'; end if;
  perform set_config('ram.membership_fn', 'on', true);
  update public.profiles set assigned_mess_id = null where id = p_student;
  perform set_config('ram.membership_fn', 'off', true);
  insert into public.mess_membership_log (student_id, from_mess, to_mess, action, by_user) values (p_student, v_mess, null, 'remove', auth.uid());
end $$;

-- Warden only: move a student to another mess.
create or replace function public.warden_move_student(p_student uuid, p_mess text) returns void
language plpgsql security definer set search_path = public as $$
declare v_p public.profiles;
begin
  if public.get_my_role() <> 'warden' then raise exception 'only the warden can move students' using errcode = '42501'; end if;
  if not exists (select 1 from public.mess_capacity where mess_id = p_mess) then raise exception 'bad_mess'; end if;
  select * into v_p from public.profiles where id = p_student for update;
  if v_p.id is null or v_p.role <> 'student' then raise exception 'not_a_student'; end if;
  perform set_config('ram.membership_fn', 'on', true);
  update public.profiles set assigned_mess_id = p_mess where id = p_student;
  perform set_config('ram.membership_fn', 'off', true);
  insert into public.mess_membership_log (student_id, from_mess, to_mess, action, by_user) values (p_student, v_p.assigned_mess_id, p_mess, 'move', auth.uid());
end $$;

-- the allow-list row for an account whose creation failed
create or replace function public.admin_cancel_student_invite(p_email text) returns void
language sql security definer set search_path = public as $$
  delete from public.provisioned_accounts where email = lower(trim(p_email)) and provisioned_by = auth.uid() and public.get_my_role() in ('mess_admin','warden')
$$;

revoke execute on function public._managed_mess(text), public.admin_add_student(text, text, text, text), public.admin_remove_student(uuid),
  public.warden_move_student(uuid, text), public.admin_cancel_student_invite(text) from public, anon, authenticated;
grant execute on function public.admin_add_student(text, text, text, text), public.admin_remove_student(uuid), public.warden_move_student(uuid, text),
  public.admin_cancel_student_invite(text) to authenticated;
