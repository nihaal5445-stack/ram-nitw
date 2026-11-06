-- ─────────────────────────────────────────────────────────────────────────────
-- Restrict sign-ups at the database layer.
--
-- A new auth user is accepted only when EITHER
--   (a) the email ends with @student.nitw.ac.in  -> becomes a 'student', or
--   (b) a warden (or seed/admin code) has put that email on the allow-list
--       public.provisioned_accounts first. The row supplies the role, mess and
--       linked student, and is consumed (deleted) when the account is created.
--
-- Why an allow-list and not a flag on the auth user: GoTrue's admin createUser
-- INSERTs the user first and writes app_metadata afterwards, so an INSERT
-- trigger can never see an app_metadata marker. user_metadata is chosen by the
-- person signing up, so it can't be trusted either. The allow-list is written
-- only by wardens (RLS) or by code holding the service role / direct SQL.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.provisioned_accounts (
  email             text primary key check (email = lower(email)),
  role              user_role not null,
  full_name         text,
  assigned_mess_id  text,
  linked_student_id uuid references public.profiles(id) on delete set null,
  provisioned_by    uuid references public.profiles(id) on delete set null, -- null = seed/admin code
  created_at        timestamptz not null default now()
);

alter table public.provisioned_accounts enable row level security;

create policy "provisioned_accounts: warden select"
  on public.provisioned_accounts for select
  using (public.get_my_role() = 'warden');

create policy "provisioned_accounts: warden insert"
  on public.provisioned_accounts for insert
  with check (public.get_my_role() = 'warden' and provisioned_by = auth.uid());

create policy "provisioned_accounts: warden delete"
  on public.provisioned_accounts for delete
  using (public.get_my_role() = 'warden');

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_pre     public.provisioned_accounts%rowtype;
  v_student boolean := coalesce(new.email ilike '%@student.nitw.ac.in', false);
begin
  select * into v_pre from public.provisioned_accounts where email = lower(new.email);

  if not found and not v_student then
    raise exception 'signup_not_allowed: only @student.nitw.ac.in emails may sign up; other accounts must be added by a warden'
      using errcode = 'P0001';
  end if;

  if found then
    insert into public.profiles (id, email, full_name, role, assigned_mess_id, linked_student_id)
    values (new.id, new.email,
            coalesce(v_pre.full_name, new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
            v_pre.role, v_pre.assigned_mess_id, v_pre.linked_student_id);
    delete from public.provisioned_accounts where email = v_pre.email; -- single use
  else
    insert into public.profiles (id, email, full_name, role)
    values (new.id, new.email,
            coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
            'student');
  end if;

  return new;
end;
$$;
