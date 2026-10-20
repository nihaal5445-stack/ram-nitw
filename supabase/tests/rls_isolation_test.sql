-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Isolation Tests: Parent and Mess Admin Visibility
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 1. PARENT RLS CHECK
-- Parent: 22222222-2222-2222-2222-222222222222
-- Linked student: 11111111-1111-1111-1111-111111111111
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select '=== PARENT VISIBILITY CHECK ===' as test_section;
select id, email, role, linked_student_id
from public.profiles
order by email;

-- Assert parent sees exactly 2 profiles: self and linked student
do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.profiles;
  if v_count != 2 then
    raise exception 'RLS FAILURE: Parent saw % profiles instead of 2 (self + linked student)', v_count;
  end if;
  raise notice 'SUCCESS: Parent can only view self and linked student (count = 2).';
end;
$$;

-- 2. MESS ADMIN RLS CHECK
-- Mess Admin: 55555555-5555-5555-5555-555555555555 (assigned_mess_id: 'ifc-a')
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "55555555-5555-5555-5555-555555555555", "role": "authenticated"}';

select '=== MESS ADMIN VISIBILITY CHECK ===' as test_section;
select id, email, role, assigned_mess_id
from public.profiles
order by email;

-- Assert mess_admin only sees profiles assigned to 'ifc-a'
do $$
declare
  v_invalid_count integer;
  v_total_count integer;
begin
  select count(*) into v_total_count from public.profiles;
  select count(*) into v_invalid_count
  from public.profiles
  where coalesce(assigned_mess_id, '') != 'ifc-a';

  if v_invalid_count > 0 then
    raise exception 'RLS FAILURE: Mess Admin saw % profiles from outside their mess!', v_invalid_count;
  end if;
  raise notice 'SUCCESS: Mess Admin can only view profiles assigned to their own mess (total = %, non-mess = 0).', v_total_count;
end;
$$;

rollback;
