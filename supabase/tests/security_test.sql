-- ─────────────────────────────────────────────────────────────────────────────
-- SQL Security Tests: Verify profile field protection
-- Run against local Supabase instance
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- TEST 1: Student cannot escalate their own role to 'warden'
do $$
declare
  v_err_occurred boolean := false;
begin
  -- Impersonate student (11111111-1111-1111-1111-111111111111)
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

  begin
    update public.profiles
      set role = 'warden'
      where id = '11111111-1111-1111-1111-111111111111';
  exception
    when others then
      v_err_occurred := true;
      raise notice 'TEST 1 PASSED: Student privilege escalation to warden blocked with message: %', sqlerrm;
  end;

  if not v_err_occurred then
    raise exception 'TEST 1 FAILED: Student was able to set role to warden!';
  end if;
end;
$$;

-- TEST 2: Parent cannot modify linked_student_id
do $$
declare
  v_err_occurred boolean := false;
begin
  -- Impersonate parent (22222222-2222-2222-2222-222222222222)
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

  begin
    update public.profiles
      set linked_student_id = '33333333-3333-3333-3333-333333333333'
      where id = '22222222-2222-2222-2222-222222222222';
  exception
    when others then
      v_err_occurred := true;
      raise notice 'TEST 2 PASSED: Parent modification of linked_student_id blocked with message: %', sqlerrm;
  end;

  if not v_err_occurred then
    raise exception 'TEST 2 FAILED: Parent was able to change linked_student_id!';
  end if;
end;
$$;

-- TEST 3: Student CAN update their own allowed fields (full_name, preferred_theme, preferred_locale)
do $$
begin
  -- Impersonate student
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

  update public.profiles
    set full_name = 'Updated Student Name',
        preferred_theme = 'dark',
        preferred_locale = 'te'
    where id = '11111111-1111-1111-1111-111111111111';

  raise notice 'TEST 3 PASSED: Student successfully updated permitted profile fields.';
end;
$$;

-- TEST 4: Warden CAN update any role and any student link
do $$
begin
  -- Impersonate warden (66666666-6666-6666-6666-666666666666)
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "66666666-6666-6666-6666-666666666666", "role": "authenticated"}';

  update public.profiles
    set role = 'mess_rep'
    where id = '11111111-1111-1111-1111-111111111111';

  raise notice 'TEST 4 PASSED: Warden successfully updated user role.';
end;
$$;

rollback;
