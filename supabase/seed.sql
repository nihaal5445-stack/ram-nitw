-- ─────────────────────────────────────────────────────────────────────────────
-- RAM Seed Data  (dev only — never run against production)
-- Applied automatically by: npm run db:reset  (npx supabase db reset)
-- ─────────────────────────────────────────────────────────────────────────────

-- Seed auth.users directly (bypasses email OTP for dev convenience)
insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  reauthentication_token, phone_change, phone_change_token
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'student@student.nitw.ac.in',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Demo Student"}',
    now(), now(),
    '', '',
    '', '', '',
    '', '', ''
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'parent@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Demo Parent"}',
    now(), now(),
    '', '',
    '', '', '',
    '', '', ''
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'counter@nitw.ac.in',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Demo Counter Staff"}',
    now(), now(),
    '', '',
    '', '', '',
    '', '', ''
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'rep@student.nitw.ac.in',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Demo Mess Rep"}',
    now(), now(),
    '', '',
    '', '', '',
    '', '', ''
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'admin@nitw.ac.in',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Demo Mess Admin"}',
    now(), now(),
    '', '',
    '', '', '',
    '', '', ''
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'warden@nitw.ac.in',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Demo Warden"}',
    now(), now(),
    '', '',
    '', '', '',
    '', '', ''
  );

-- Matching auth.identities rows for all seeded auth users
insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  id,
  id,
  id::text,
  json_build_object('sub', id::text, 'email', email)::jsonb,
  'email',
  now(),
  now(),
  now()
from auth.users
on conflict (provider_id, provider) do nothing;

-- The handle_new_user trigger fires on the inserts above and creates profiles.
-- Now correct the roles that the trigger can't infer (non-student domains).
update public.profiles
  set role = 'student', assigned_mess_id = 'ifc-a'
  where id = '11111111-1111-1111-1111-111111111111';

update public.profiles
  set role = 'parent',
      linked_student_id = '11111111-1111-1111-1111-111111111111'
  where id = '22222222-2222-2222-2222-222222222222';

update public.profiles
  set role = 'counter_staff', assigned_mess_id = 'ifc-a'
  where id = '33333333-3333-3333-3333-333333333333';

update public.profiles
  set role = 'mess_rep', assigned_mess_id = 'ifc-a'
  where id = '44444444-4444-4444-4444-444444444444';

update public.profiles
  set role = 'mess_admin', assigned_mess_id = 'ifc-a'
  where id = '55555555-5555-5555-5555-555555555555';

update public.profiles
  set role = 'warden'
  where id = '66666666-6666-6666-6666-666666666666';
