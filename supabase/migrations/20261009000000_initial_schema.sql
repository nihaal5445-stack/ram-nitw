-- Enable pgcrypto for crypt() in seed
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- ENUM
-- ─────────────────────────────────────────────
create type user_role as enum (
  'student',
  'parent',
  'counter_staff',
  'mess_rep',
  'mess_admin',
  'warden'
);

-- ─────────────────────────────────────────────
-- PROFILES TABLE
-- ─────────────────────────────────────────────
create table public.profiles (
  id                uuid        not null references auth.users on delete cascade,
  role              user_role   not null default 'student',
  full_name         text,
  email             text        not null,
  linked_student_id uuid        references public.profiles(id) on delete set null,
  assigned_mess_id  text,
  preferred_locale  text        not null default 'en' check (preferred_locale in ('en', 'te', 'hi')),
  preferred_theme   text        not null default 'system' check (preferred_theme in ('light', 'dark', 'system')),
  created_at        timestamptz not null default now(),
  primary key (id)
);

comment on table public.profiles is 'One row per auth.users row. Role drives RLS on every table.';
comment on column public.profiles.linked_student_id is 'Non-null only for parent role; points to the student profile they can view.';
comment on column public.profiles.assigned_mess_id  is 'References messes.id string from src/config/messes.ts. Non-null for counter_staff, mess_rep, mess_admin.';

-- ─────────────────────────────────────────────
-- HELPER FUNCTIONS (security definer so they can
-- read profiles without triggering recursive RLS)
-- ─────────────────────────────────────────────
create or replace function public.get_my_role()
  returns user_role
  language sql
  security definer
  set search_path = public
  stable
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function public.get_my_assigned_mess_id()
  returns text
  language sql
  security definer
  set search_path = public
  stable
as $$
  select assigned_mess_id from profiles where id = auth.uid();
$$;

create or replace function public.get_my_linked_student_id()
  returns uuid
  language sql
  security definer
  set search_path = public
  stable
as $$
  select linked_student_id from profiles where id = auth.uid();
$$;

-- ─────────────────────────────────────────────
-- RLS — profiles
-- ─────────────────────────────────────────────
alter table public.profiles enable row level security;

-- SELECT: own row
create policy "profiles: own row"
  on public.profiles for select
  using ( auth.uid() = id );

-- SELECT: warden sees all
create policy "profiles: warden sees all"
  on public.profiles for select
  using ( public.get_my_role() = 'warden' );

-- SELECT: mess_admin sees profiles assigned to their mess
create policy "profiles: mess_admin sees their mess"
  on public.profiles for select
  using (
    public.get_my_role() = 'mess_admin'
    and assigned_mess_id is not null
    and assigned_mess_id = public.get_my_assigned_mess_id()
  );

-- SELECT: parent sees their linked student
create policy "profiles: parent sees linked student"
  on public.profiles for select
  using (
    id = public.get_my_linked_student_id()
  );

-- UPDATE: own row
create policy "profiles: own row update"
  on public.profiles for update
  using ( auth.uid() = id );

-- UPDATE: warden updates any
create policy "profiles: warden updates any"
  on public.profiles for update
  using ( public.get_my_role() = 'warden' );

-- INSERT — only via trigger (no direct inserts from clients)
create policy "profiles: no direct insert"
  on public.profiles for insert
  with check ( false );

-- ─────────────────────────────────────────────
-- TRIGGER: prevent unauthorized profile modifications
-- Non-wardens may only update: full_name, preferred_locale, preferred_theme.
-- Protected columns: role, linked_student_id, assigned_mess_id, email, id.
-- ─────────────────────────────────────────────
create or replace function public.protect_profile_fields()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- When executed in an authenticated user session, non-wardens cannot touch protected columns
  if auth.uid() is not null and coalesce(public.get_my_role(), 'student') != 'warden' then
    if new.id is distinct from old.id then
      raise exception 'Unauthorized: Cannot modify id';
    end if;

    if new.role is distinct from old.role then
      raise exception 'Unauthorized: Only wardens can modify user roles';
    end if;

    if new.email is distinct from old.email then
      raise exception 'Unauthorized: Email is managed by auth';
    end if;

    if new.linked_student_id is distinct from old.linked_student_id then
      raise exception 'Unauthorized: Only wardens can modify linked student';
    end if;

    if new.assigned_mess_id is distinct from old.assigned_mess_id then
      raise exception 'Unauthorized: Only wardens can modify assigned mess';
    end if;
  end if;

  return new;
end;
$$;

create trigger tr_protect_profile_fields
  before update on public.profiles
  for each row execute procedure public.protect_profile_fields();

-- ─────────────────────────────────────────────
-- TRIGGER: auto-create profile on sign-up
-- Enforces student email domain at DB level.
-- ─────────────────────────────────────────────
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_role user_role;
begin
  -- Student domain check: @student.nitw.ac.in → student role
  -- Everything else gets 'parent' by default; wardens promote via UPDATE.
  if new.email ilike '%@student.nitw.ac.in' then
    v_role := 'student';
  else
    v_role := 'parent';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
