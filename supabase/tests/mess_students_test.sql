-- ─────────────────────────────────────────────────────────────────────────────
-- Mess membership rules: a mess admin can add/remove students ONLY in their own mess; the warden can do it anywhere and move students.
-- Enforced in SQL (functions + the profile guard + RLS). Run: npm run test:db. Everything rolls back.
-- ─────────────────────────────────────────────────────────────────────────────
begin;
create temp table _r (n serial, name text, ok boolean, detail text);
grant all on _r to public;
grant usage, select, update on sequence _r_n_seq to public;
create function pg_temp.t(p_name text, p_ok boolean, p_detail text default null) returns void language sql as
$$ insert into _r (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true); end $$;
create function pg_temp.err(stmt text) returns text language plpgsql as $$
begin execute stmt; return 'OK'; exception when others then return sqlerrm; end $$;
grant execute on function pg_temp.t(text, boolean, text), pg_temp.as_user(uuid), pg_temp.as_postgres(), pg_temp.err(text) to public;

do $$
declare
  A_A uuid := '55555555-5555-5555-5555-555555555555';  -- mess admin IFC-A
  A_B uuid := '88888888-8888-8888-8888-888888888888';  -- mess admin IFC-B
  W   uuid := '66666666-6666-6666-6666-666666666666';
  S1  uuid := '11111111-1111-1111-1111-111111111111';  -- student, IFC-A
  S2  uuid := '77777777-7777-7777-7777-777777777777';  -- student, IFC-B
  C   uuid := '33333333-3333-3333-3333-333333333333';
  P   uuid := '22222222-2222-2222-2222-222222222222';
  r jsonb;
begin
  -- ── add (new account) ──
  perform pg_temp.as_user(A_B);
  r := public.admin_add_student('new.one@student.nitw.ac.in', 'New One', 'tnew0001');
  perform pg_temp.as_postgres();
  perform pg_temp.t('IFC-B admin: add a new student -> an allow-list row for IFC-B with the roll (upper-cased)',
    r->>'action' = 'create_account' and exists (select 1 from public.provisioned_accounts where email = 'new.one@student.nitw.ac.in' and assigned_mess_id = 'ifc-b' and roll_number = 'TNEW0001' and role = 'student' and provisioned_by = A_B));
  perform pg_temp.as_user(A_B);
  perform pg_temp.t('IFC-B admin cannot add to IFC-A (explicit mess)', pg_temp.err($q$select public.admin_add_student('x.two@student.nitw.ac.in', 'X Two', 'TNEW0002', 'ifc-a')$q$) like 'wrong_mess%');
  perform pg_temp.t('non-student email is refused', pg_temp.err($q$select public.admin_add_student('x@gmail.com', 'X Two', 'TNEW0003')$q$) like 'bad_email%');
  perform pg_temp.t('bad roll number is refused', pg_temp.err($q$select public.admin_add_student('x3@student.nitw.ac.in', 'X Three', 'a b')$q$) like 'bad_roll%');
  perform pg_temp.t('an already used roll number is refused', pg_temp.err($q$select public.admin_add_student('x4@student.nitw.ac.in', 'X Four', 'DEMO0001')$q$) like 'roll_taken%');
  perform pg_temp.t('the same roll twice among pending invites is refused', pg_temp.err($q$select public.admin_add_student('x5@student.nitw.ac.in', 'X Five', 'TNEW0001')$q$) like 'roll_taken%');
  perform pg_temp.as_postgres();

  -- ── who may call it ──
  perform pg_temp.as_user(S1);
  perform pg_temp.t('a student cannot add students', pg_temp.err($q$select public.admin_add_student('y@student.nitw.ac.in', 'Y Y', 'TNEW0010')$q$) like '%not authorized%');
  perform pg_temp.as_user(C);
  perform pg_temp.t('counter staff cannot add students', pg_temp.err($q$select public.admin_add_student('y@student.nitw.ac.in', 'Y Y', 'TNEW0010')$q$) like '%not authorized%');
  perform pg_temp.as_user(P);
  perform pg_temp.t('a parent cannot add students', pg_temp.err($q$select public.admin_add_student('y@student.nitw.ac.in', 'Y Y', 'TNEW0010')$q$) like '%not authorized%');
  perform pg_temp.as_postgres();

  -- ── remove ──
  perform pg_temp.as_user(A_B);
  perform pg_temp.t('IFC-B admin cannot remove an IFC-A student', pg_temp.err(format($q$select public.admin_remove_student(%L)$q$, S1)) like 'wrong_mess%');
  perform pg_temp.t('IFC-B admin sees only IFC-B students (RLS)', (select count(*) from public.profiles where role = 'student' and assigned_mess_id is distinct from 'ifc-b') = 0 and (select count(*) from public.profiles where id = S2) = 1);
  perform pg_temp.t('IFC-B admin cannot write assigned_mess_id directly (own row, guard)', pg_temp.err(format($q$update public.profiles set assigned_mess_id = 'ifc-a' where id = %L$q$, A_B)) like '%Only wardens%');
  perform public.admin_remove_student(S2);
  perform pg_temp.as_postgres();
  perform pg_temp.t('IFC-B admin removed their student: mess cleared, account kept, logged',
    (select assigned_mess_id is null from public.profiles where id = S2) and exists (select 1 from public.mess_membership_log where student_id = S2 and action = 'remove' and from_mess = 'ifc-b' and by_user = A_B));
  perform pg_temp.as_user(A_A);
  perform pg_temp.t('a direct UPDATE of another student''s mess by an admin changes nothing', pg_temp.err(format($q$update public.profiles set assigned_mess_id = null where id = %L$q$, S1)) = 'OK');
  perform pg_temp.as_postgres();
  perform pg_temp.t('...and the student is still in IFC-A', (select assigned_mess_id from public.profiles where id = S1) = 'ifc-a');

  -- ── add an existing unassigned student ──
  perform pg_temp.as_user(A_B);
  perform pg_temp.t('an unassigned student of another admin... IFC-B admin cannot take a student of IFC-A', pg_temp.err($q$select public.admin_add_student('student@student.nitw.ac.in', 'Demo Student', 'DEMO0001')$q$) like 'in_other_mess%');
  perform pg_temp.as_user(A_A);
  r := public.admin_add_student('student2@student.nitw.ac.in', 'Demo Student Two', 'DEMO0002');
  perform pg_temp.as_postgres();
  perform pg_temp.t('IFC-A admin assigns the existing unassigned student account to IFC-A', r->>'action' = 'assigned_existing' and (select assigned_mess_id from public.profiles where id = S2) = 'ifc-a');
  perform pg_temp.as_user(A_B);
  perform pg_temp.t('now IFC-B admin cannot take them (already in another mess)', pg_temp.err($q$select public.admin_add_student('student2@student.nitw.ac.in', 'Demo Student Two', 'DEMO0002')$q$) like 'in_other_mess%');
  perform pg_temp.as_postgres();

  -- ── warden ──
  perform pg_temp.as_user(A_A);
  perform pg_temp.t('a mess admin cannot move students', pg_temp.err(format($q$select public.warden_move_student(%L, 'krishna')$q$, S1)) like '%only the warden%');
  perform pg_temp.as_user(W);
  perform pg_temp.t('warden must name the mess when adding', pg_temp.err($q$select public.admin_add_student('w1@student.nitw.ac.in', 'W One', 'TWAR0001')$q$) like 'bad_mess%');
  r := public.admin_add_student('w1@student.nitw.ac.in', 'W One', 'TWAR0001', 'krishna');
  perform pg_temp.t('warden adds a student to any mess (Krishna)', r->>'action' = 'create_account' and (select assigned_mess_id from public.provisioned_accounts where email = 'w1@student.nitw.ac.in') = 'krishna');
  perform public.warden_move_student(S1, 'krishna');
  perform pg_temp.t('warden moves a student between messes', (select assigned_mess_id from public.profiles where id = S1) = 'krishna');
  perform pg_temp.t('warden: unknown mess refused', pg_temp.err(format($q$select public.warden_move_student(%L, 'nowhere')$q$, S1)) like 'bad_mess%');
  perform public.admin_remove_student(S1);
  perform pg_temp.t('warden can remove from any mess', (select assigned_mess_id is null from public.profiles where id = S1));
  perform pg_temp.t('warden sees the membership log (remove, add, move rows)', (select count(*) from public.mess_membership_log) >= 4);
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(A_A);
  perform pg_temp.t('mess admin sees only log rows of their own mess', (select count(*) from public.mess_membership_log where 'ifc-a' not in (coalesce(from_mess, ''), coalesce(to_mess, ''))) = 0);
  perform pg_temp.as_postgres();
  perform pg_temp.t('the profile guard still blocks a non-warden after the functions ran', current_setting('ram.membership_fn', true) = 'off');
end $$;

select n, name, case when ok then 'PASS' else 'FAIL' end as result, coalesce(detail, '') as detail from _r order by n;
do $$ begin
  if exists (select 1 from _r where not ok) then raise exception 'MESS STUDENT TESTS FAILED: %', (select string_agg(name, '; ') from _r where not ok); end if;
  raise notice 'ALL % MESS STUDENT TESTS PASSED', (select count(*) from _r);
end $$;
rollback;
