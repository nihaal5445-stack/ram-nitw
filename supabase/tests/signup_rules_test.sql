-- ─────────────────────────────────────────────────────────────────────────────
-- Sign-up restriction tests for public.handle_new_user().
-- Run:  npm run test:db   (everything rolls back; nothing is left behind)
-- ─────────────────────────────────────────────────────────────────────────────
begin;

create temp table _r (n int, name text, ok boolean);

create or replace function pg_temp.try_insert(p_email text, p_app jsonb default '{"provider":"email"}', p_user jsonb default '{}')
returns text language plpgsql as $$
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change,
                          email_change_token_new, email_change_token_current, reauthentication_token,
                          phone_change, phone_change_token)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_email, p_app, p_user, now(), now(), '', '', '', '', '', '', '', '');
  return 'accepted';
exception when others then
  return 'rejected: ' || sqlerrm;
end $$;

do $$
declare v text; v_role text; v_mess text;
begin
  -- 1. Student domain, self sign-up: accepted, role student
  v := pg_temp.try_insert('t1@student.nitw.ac.in');
  select role::text into v_role from public.profiles where email = 't1@student.nitw.ac.in';
  insert into _r values (1, 'student email accepted as student', v = 'accepted' and v_role = 'student');

  -- 2. Student domain is case-insensitive
  v := pg_temp.try_insert('T2@STUDENT.NITW.AC.IN');
  insert into _r values (2, 'student domain case-insensitive', v = 'accepted');

  -- 3. Other domain, not on the allow-list: rejected
  v := pg_temp.try_insert('t3@gmail.com');
  insert into _r values (3, 'non-student email rejected', v like 'rejected: signup_not_allowed%');

  -- 4/5. Lookalike domains: rejected
  v := pg_temp.try_insert('t4@student.nitw.ac.in.evil.com');
  insert into _r values (4, 'lookalike suffix domain rejected', v like 'rejected:%');
  v := pg_temp.try_insert('t5@evilstudent.nitw.ac.in');
  insert into _r values (5, 'lookalike subdomain rejected', v like 'rejected:%');

  -- 6. Forged flags in either metadata blob (all a self-signup controls) do not bypass
  v := pg_temp.try_insert('t6@gmail.com', '{"provider":"email","ram_provisioned":true}', '{"ram_provisioned":true,"ram_role":"warden"}');
  insert into _r values (6, 'forged metadata flags ignored', v like 'rejected:%');

  -- 7. No email at all (phone/anonymous): rejected
  v := pg_temp.try_insert(null, '{"provider":"phone"}');
  insert into _r values (7, 'no email rejected', v like 'rejected:%');

  -- 8. Allow-listed non-student email: accepted with the allow-listed role + mess
  insert into public.provisioned_accounts (email, role, assigned_mess_id) values ('t8@nitw.ac.in', 'mess_admin', 'ifc-a');
  v := pg_temp.try_insert('T8@nitw.ac.in');  -- mixed case still matches
  select role::text, assigned_mess_id into v_role, v_mess from public.profiles where email = 'T8@nitw.ac.in';
  insert into _r values (8, 'allow-listed email accepted with role and mess', v = 'accepted' and v_role = 'mess_admin' and v_mess = 'ifc-a');

  -- 9. The allow-list row is single-use
  insert into _r values (9, 'allow-list row consumed after use', not exists (select 1 from public.provisioned_accounts where email = 't8@nitw.ac.in'));

  -- 10. Allow-list entry for one email does not open the door for another
  insert into public.provisioned_accounts (email, role) values ('t10@example.com', 'parent');
  v := pg_temp.try_insert('t10-other@example.com');
  insert into _r values (10, 'allow-list is per exact email', v like 'rejected:%');

  -- 11. Student self sign-up can never pick a role through metadata
  v := pg_temp.try_insert('t11@student.nitw.ac.in', '{"provider":"email"}', '{"role":"warden","ram_role":"warden"}');
  select role::text into v_role from public.profiles where email = 't11@student.nitw.ac.in';
  insert into _r values (11, 'student self sign-up cannot pick a role', v = 'accepted' and v_role = 'student');

  -- 12. Rejected sign-up leaves no profile behind
  insert into _r values (12, 'rejected sign-up leaves no profile',
    not exists (select 1 from public.profiles where email in ('t3@gmail.com','t6@gmail.com')));
end $$;

-- RLS on the allow-list: only a warden may write/read it
do $$
declare v_ok boolean;
begin
  -- student cannot insert
  begin
    set local role authenticated;
    set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
    insert into public.provisioned_accounts (email, role, provisioned_by) values ('t13@example.com', 'warden', '11111111-1111-1111-1111-111111111111');
    v_ok := false;
  exception when others then v_ok := true;
  end;
  reset role;
  insert into _r values (13, 'student cannot write allow-list (RLS)', v_ok);

  -- student cannot read it
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
  v_ok := (select count(*) from public.provisioned_accounts) = 0;
  reset role;
  insert into _r values (14, 'student cannot read allow-list (RLS)', v_ok);

  -- warden can insert (provisioned_by must be themselves)
  begin
    set local role authenticated;
    set local "request.jwt.claims" = '{"sub": "66666666-6666-6666-6666-666666666666", "role": "authenticated"}';
    insert into public.provisioned_accounts (email, role, provisioned_by) values ('t15@example.com', 'parent', '66666666-6666-6666-6666-666666666666');
    v_ok := true;
  exception when others then v_ok := false;
  end;
  reset role;
  insert into _r values (15, 'warden can write allow-list', v_ok);

  -- warden cannot attribute the entry to someone else
  begin
    set local role authenticated;
    set local "request.jwt.claims" = '{"sub": "66666666-6666-6666-6666-666666666666", "role": "authenticated"}';
    insert into public.provisioned_accounts (email, role, provisioned_by) values ('t16@example.com', 'parent', '11111111-1111-1111-1111-111111111111');
    v_ok := false;
  exception when others then v_ok := true;
  end;
  reset role;
  insert into _r values (16, 'warden cannot forge provisioned_by', v_ok);
end $$;

select n, name, case when ok then 'PASS' else 'FAIL' end as result from _r order by n;

do $$ begin
  if exists (select 1 from _r where not ok) then raise exception 'SIGNUP RULE TESTS FAILED'; end if;
  raise notice 'ALL % SIGNUP RULE TESTS PASSED', (select count(*) from _r);
end $$;

rollback;
