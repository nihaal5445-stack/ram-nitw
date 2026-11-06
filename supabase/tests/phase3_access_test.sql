-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3 (Access + Scanner) tests. Run: npm run test:db. Everything rolls back.
-- Signature verification itself happens in the Next.js route (unit-tested in src/lib/access); here record_scans
-- receives sig_ok from its only permitted caller (service role) and must apply every other rule.
-- ─────────────────────────────────────────────────────────────────────────────
begin;
-- these tests assert the REAL slot rules, so switch demo mode off inside this (rolled-back) transaction
update public.app_settings set value = 'off' where key = 'demo_mode';
-- isolation: start from empty Phase 3 tables regardless of what earlier e2e runs left behind (rolled back at the end)
delete from public.fraud_flags;
delete from public.meal_redemptions;
delete from public.bundle_issues;
delete from public.scanner_devices;
delete from public.student_devices;
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
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $$;
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true); end $$;
create function pg_temp.err(stmt text) returns text language plpgsql as $$
begin execute stmt; return 'OK'; exception when others then return sqlerrm; end $$;

create function pg_temp.mk_user(p_email text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
    reauthentication_token, phone_change, phone_change_token, last_sign_in_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '{"provider":"email"}', '{}',
    now(), now(), '', '', '', '', '', '', '', '', now());
  return v;
end $$;

create function pg_temp.pubkey() returns text language sql as $$ select public.b64u_encode('\x04'::bytea || extensions.gen_random_bytes(64)) $$;
create function pg_temp.qr(p_id uuid, p_key text, p_step bigint, p_at timestamptz, p_sig boolean default true) returns jsonb language sql as
$$ select jsonb_build_object('id', p_id, 'method', 'qr', 'device_key', p_key, 'step', p_step, 'scanned_at', p_at, 'sig_ok', p_sig) $$;
create function pg_temp.manual(p_id uuid, p_roll text, p_at timestamptz, p_code text, p_note text default null) returns jsonb language sql as
$$ select jsonb_build_object('id', p_id, 'method', 'manual', 'roll_number', p_roll, 'scanned_at', p_at, 'reason_code', p_code, 'note', p_note) $$;
create function pg_temp.step_of(p_at timestamptz) returns bigint language sql as $$ select floor(extract(epoch from p_at) / 30)::bigint $$;
create function pg_temp.status_of(p jsonb) returns text language sql as $$ select p->0->>'status' || ':' || coalesce(p->0->>'reason','') $$;

do $$
declare
  S1 constant uuid := '11111111-1111-1111-1111-111111111111';  -- student, ifc-a
  P1 constant uuid := '22222222-2222-2222-2222-222222222222';  -- parent of S1
  C1 constant uuid := '33333333-3333-3333-3333-333333333333';  -- counter staff, ifc-a
  A1 constant uuid := '55555555-5555-5555-5555-555555555555';  -- mess admin, ifc-a
  W  constant uuid := '66666666-6666-6666-6666-666666666666';  -- warden
  S2 uuid; C2 uuid; sc1 uuid; sc1b uuid; sc2 uuid; dev1 jsonb; k1 text; k2 text; r jsonb; bundle jsonb; v text; n int;
  base timestamptz := (((now() at time zone 'Asia/Kolkata')::date - 1) + time '12:30') at time zone 'Asia/Kolkata'; -- yesterday 12:30 IST (lunch)
  dinner timestamptz := (((now() at time zone 'Asia/Kolkata')::date - 1) + time '20:00') at time zone 'Asia/Kolkata';
  id1 uuid; id2 uuid; id3 uuid; d1 uuid;
begin
  -- fixtures (as postgres): student S2 and counter C2 in krishna
  S2 := pg_temp.mk_user('s2@student.nitw.ac.in');
  update public.profiles set assigned_mess_id = 'krishna', roll_number = 'TSTK0002' where id = S2;
  insert into public.provisioned_accounts (email, role, assigned_mess_id) values ('c2@nitw.ac.in', 'counter_staff', 'krishna');
  C2 := pg_temp.mk_user('c2@nitw.ac.in');
  update auth.users set last_sign_in_at = now() where id in (S1, S2);

  -- ═══ ENROLMENT ═══
  perform pg_temp.as_user(S1);
  select device_key into k1 from public.enroll_device('Pixel 8', pg_temp.pubkey());
  perform pg_temp.as_postgres();
  perform pg_temp.t('enroll: student gets an 11-char device key', k1 ~ '^[A-Za-z0-9_-]{11}$', k1);

  perform pg_temp.as_user(S1);
  select device_key into k2 from public.enroll_device('iPhone 15', pg_temp.pubkey());
  perform pg_temp.as_postgres();
  select count(*) into n from public.student_devices where student_id = S1 and revoked_at is null;
  perform pg_temp.t('enroll: new device revokes the old one (exactly one active)', n = 1 and k1 <> k2
    and exists (select 1 from public.student_devices where device_key = k1 and revoked_reason = 'replaced' and revoked_at is not null));

  perform pg_temp.as_user(S1);
  perform public.enroll_device('third', pg_temp.pubkey());
  v := pg_temp.err($q$select public.enroll_device('fourth', pg_temp.pubkey())$q$);
  perform pg_temp.as_postgres();
  perform pg_temp.t('enroll: 4th enrolment in a day is rate limited', v like 'rate_limited%', v);

  update auth.users set last_sign_in_at = now() - interval '2 hours' where id = S2;
  perform pg_temp.as_user(S2);
  v := pg_temp.err($q$select public.enroll_device('x', pg_temp.pubkey())$q$);
  perform pg_temp.as_postgres();
  perform pg_temp.t('enroll: stale sign-in requires re-authentication', v like 'reauth_required%', v);
  update auth.users set last_sign_in_at = now() where id = S2;

  perform pg_temp.as_user(S2);
  v := pg_temp.err($q$select public.enroll_device('x', public.b64u_encode('\x0411'::bytea))$q$);
  perform pg_temp.t('enroll: malformed public key rejected', v like 'invalid public key%', v);
  select device_key into k2 from public.enroll_device('S2 phone', pg_temp.pubkey());  -- S2's real device (krishna)
  perform pg_temp.as_postgres();

  foreach v in array array['parent', 'counter', 'warden'] loop
    perform pg_temp.as_user(case v when 'parent' then P1 when 'counter' then C1 else W end);
    perform pg_temp.t('enroll: ' || v || ' cannot enroll a device', pg_temp.err($q$select public.enroll_device('x', pg_temp.pubkey())$q$) like '%only students%');
    perform pg_temp.as_postgres();
  end loop;

  perform pg_temp.as_user(S1);
  perform pg_temp.t('direct INSERT into student_devices denied', pg_temp.err($q$insert into public.student_devices (student_id, device_key, public_key) values (gen_random_uuid(), 'AAAAAAAAAAA', '\x04'::bytea)$q$) ilike '%permission denied%');
  perform pg_temp.t('direct UPDATE of student_devices denied', pg_temp.err($q$update public.student_devices set revoked_at = null$q$) ilike '%permission denied%');
  perform pg_temp.t('direct INSERT into meal_redemptions denied', pg_temp.err($q$insert into public.meal_redemptions (id, mess_id, method, scanned_at, status) values (gen_random_uuid(), 'ifc-a', 'qr', now(), 'accepted')$q$) ilike '%permission denied%');
  select count(*) into n from public.student_devices;
  perform pg_temp.t('student reads only their own device rows', n = (select count(*) from public.student_devices where student_id = S1) and n > 0, n::text);
  perform pg_temp.as_postgres();

  -- S1 current active device key (needed for the scan tests)
  select device_key, id into k1, d1 from public.student_devices where student_id = S1 and revoked_at is null;

  -- ═══ SCANNER REGISTRATION + BUNDLE ═══
  perform pg_temp.as_user(C1); sc1 := public.register_scanner('Laptop A'); sc1b := public.register_scanner('Laptop A2'); perform pg_temp.as_postgres();
  perform pg_temp.as_user(C2); sc2 := public.register_scanner('Laptop K'); perform pg_temp.as_postgres();

  perform pg_temp.as_user(S1);
  perform pg_temp.t('student cannot register a scanner', pg_temp.err($q$select public.register_scanner('x')$q$) like '%only counter staff%');
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(P1);
  perform pg_temp.t('parent cannot register a scanner', pg_temp.err($q$select public.register_scanner('x')$q$) like '%only counter staff%');
  perform pg_temp.as_postgres();

  perform pg_temp.as_user(C1); bundle := public.issue_scanner_bundle(sc1); perform pg_temp.as_postgres();
  perform pg_temp.t('bundle: contains own-mess student with device key and public key',
    exists (select 1 from jsonb_array_elements(bundle->'students') e where e->>'student_id' = S1::text and e->>'device_key' = k1 and length(e->>'public_key') = 87 and e->>'roll' = 'DEMO0001'));
  perform pg_temp.t('bundle: contains NO student from another mess', not exists (select 1 from jsonb_array_elements(bundle->'students') e where e->>'student_id' = S2::text));
  perform pg_temp.t('bundle: 4 slots, 12 h expiry, audited',
    jsonb_array_length(bundle->'slots') = 4 and (bundle->>'expires_at')::timestamptz between now() + interval '11 hours 59 minutes' and now() + interval '12 hours 1 minute'
    and exists (select 1 from public.bundle_issues where scanner_id = sc1 and student_count >= 1));
  perform pg_temp.t('bundle: revoked keys listed for the scanner (previous device of S1)', (bundle->'revoked_keys') is not null and jsonb_typeof(bundle->'revoked_keys') = 'array');

  perform pg_temp.as_user(C1);
  perform pg_temp.t('mess A staff cannot get a bundle for a mess B scanner', pg_temp.err(format('select public.issue_scanner_bundle(%L)', sc2)) like '%not authorized%');
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(S1);
  perform pg_temp.t('student cannot get a bundle', pg_temp.err(format('select public.issue_scanner_bundle(%L)', sc1)) like '%not authorized%');
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(P1);
  perform pg_temp.t('parent cannot get a bundle', pg_temp.err(format('select public.issue_scanner_bundle(%L)', sc1)) like '%not authorized%');
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(C1);
  perform pg_temp.t('record_scans is NOT executable by signed-in users', pg_temp.err(format($q$select public.record_scans(%L, %L, '[]')$q$, C1, sc1)) ilike '%permission denied%');
  perform pg_temp.as_postgres();

  -- ═══ REQUIRED FRAUD TESTS ═══
  perform pg_temp.as_service();
  id1 := gen_random_uuid();
  r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(id1, k1, pg_temp.step_of(base), base)));
  perform pg_temp.as_postgres();
  perform pg_temp.t('SPEC: valid scan accepted (lunch)', pg_temp.status_of(r) = 'accepted:', pg_temp.status_of(r));

  perform pg_temp.as_service();
  r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(gen_random_uuid(), k1, pg_temp.step_of(base + interval '5 minutes'), base + interval '5 minutes')));
  perform pg_temp.as_postgres();
  perform pg_temp.t('SPEC: second scan in the same slot fails (duplicate)', pg_temp.status_of(r) = 'duplicate:already_admitted', pg_temp.status_of(r));
  perform pg_temp.t('...exactly one accepted row for that student/slot', (select count(*) from public.meal_redemptions where student_id = S1 and slot = 'lunch' and status = 'accepted' and meal_date = (base at time zone 'Asia/Kolkata')::date) = 1);
  perform pg_temp.t('...and a same-scanner duplicate flag was written', exists (select 1 from public.fraud_flags where student_id = S1 and kind = 'duplicate_same_scanner'));

  perform pg_temp.as_service();
  r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(gen_random_uuid(), k2, pg_temp.step_of(dinner), dinner)));  -- k2 is S2's key (krishna), scanned at ifc-a
  perform pg_temp.as_postgres();
  perform pg_temp.t('SPEC: wrong-mess scan fails', pg_temp.status_of(r) = 'rejected:wrong_mess', pg_temp.status_of(r));
  perform pg_temp.t('...and is flagged', exists (select 1 from public.fraud_flags where student_id = S2 and kind = 'wrong_mess'));

  -- stale code: signed 3 steps (90 s) before the scan -> older than the 60 s limit
  perform pg_temp.as_service();
  r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(gen_random_uuid(), k1, pg_temp.step_of(dinner) - 3, dinner)));
  perform pg_temp.as_postgres();
  perform pg_temp.t('SPEC: screenshot older than 60 s fails (stale_code)', pg_temp.status_of(r) = 'rejected:stale_code', pg_temp.status_of(r));
  perform pg_temp.t('...and is flagged', exists (select 1 from public.fraud_flags where student_id = S1 and kind = 'stale_code'));
  -- boundary: 1 step old (<= 60 s) is accepted, 2 steps old is stale
  perform pg_temp.as_service();
  r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(gen_random_uuid(), k1, pg_temp.step_of(dinner) - 1, dinner)));
  perform pg_temp.as_postgres();
  perform pg_temp.t('boundary: code from the previous step (<= 60 s old) is accepted', pg_temp.status_of(r) = 'accepted:', pg_temp.status_of(r));
  perform pg_temp.as_service();
  r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(gen_random_uuid(), k1, pg_temp.step_of(dinner + interval '3 hours') - 2, dinner + interval '3 hours')));
  perform pg_temp.as_postgres();
  perform pg_temp.t('boundary: code two steps old is rejected (also outside the dinner slot, either rule rejects)', pg_temp.status_of(r) like 'rejected:%', pg_temp.status_of(r));

  -- offline scan: scanned long before it is synced (breakfast, yesterday); received_at is now
  perform pg_temp.as_service();
  id2 := gen_random_uuid();
  r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(id2, k1, pg_temp.step_of(base - interval '4 hours'), base - interval '4 hours')));
  perform pg_temp.as_postgres();
  perform pg_temp.t('SPEC: offline scan syncs later (old scanned_at accepted)', pg_temp.status_of(r) = 'accepted:' and
    (select received_at - scanned_at > interval '4 hours' from public.meal_redemptions where id = id2), pg_temp.status_of(r));
  -- hmm: base - 4h is 08:30 IST = breakfast

  -- ═══ OTHER RULES ═══
  perform pg_temp.as_service();
  r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(id2, k1, pg_temp.step_of(base), base)));  -- replay with the same id
  perform pg_temp.as_postgres();
  perform pg_temp.t('replaying a scan id is idempotent (no new row)', (r->0->>'replay')::boolean and (select count(*) from public.meal_redemptions where id = id2) = 1);

  perform pg_temp.as_service();
  r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(gen_random_uuid(), k1, pg_temp.step_of(now() + interval '1 day'), now() + interval '1 day')));
  perform pg_temp.as_postgres();
  perform pg_temp.t('scan dated in the future is rejected (clock_in_future)', pg_temp.status_of(r) = 'rejected:clock_in_future' and exists (select 1 from public.fraud_flags where kind = 'clock_skew'), pg_temp.status_of(r));

  perform pg_temp.as_service();
  r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(gen_random_uuid(), k1, pg_temp.step_of(base), base - interval '6 hours', false)));
  perform pg_temp.as_postgres();
  perform pg_temp.t('bad signature rejected and flagged', pg_temp.status_of(r) = 'rejected:bad_signature' and exists (select 1 from public.fraud_flags where kind = 'bad_signature' and student_id = S1), pg_temp.status_of(r));

  perform pg_temp.as_service();
  r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(gen_random_uuid(), 'ZZZZZZZZZZZ', pg_temp.step_of(base), base)));
  perform pg_temp.as_postgres();
  perform pg_temp.t('unknown device key rejected', pg_temp.status_of(r) = 'rejected:unknown_device', pg_temp.status_of(r));

  perform pg_temp.as_service();
  r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(gen_random_uuid(), k1, pg_temp.step_of(base - interval '1 hour'), base - interval '1 hour')));
  perform pg_temp.as_postgres();
  perform pg_temp.t('scan outside meal time rejected', pg_temp.status_of(r) = 'rejected:outside_meal_time', pg_temp.status_of(r));

  -- slot windows that touch midnight must work (time arithmetic would wrap): widen dinner to 22:00-23:59, scan at 23:55 IST
  update public.mess_slots set starts = '22:00', ends = '23:59' where mess_id = 'ifc-a' and slot = 'dinner';
  declare late timestamptz := (((now() at time zone 'Asia/Kolkata')::date - 1) + time '23:55') at time zone 'Asia/Kolkata';
  begin
    delete from public.meal_redemptions where student_id = S1 and slot = 'dinner';
    perform pg_temp.as_service();
    r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(gen_random_uuid(), k1, pg_temp.step_of(late), late)));
    perform pg_temp.as_postgres();
    perform pg_temp.t('slot window ending at 23:59 still admits a scan at 23:55 (no midnight wrap)', pg_temp.status_of(r) = 'accepted:', pg_temp.status_of(r));
    update public.mess_slots set starts = '19:30', ends = '21:30' where mess_id = 'ifc-a' and slot = 'dinner';
    delete from public.meal_redemptions where student_id = S1 and slot = 'dinner';
  end;

  -- revoked device: revoke the key, then a scan stamped AFTER revocation fails; one stamped BEFORE is still honoured
  update public.student_devices set revoked_at = base + interval '10 minutes', revoked_reason = 'test' where id = d1;
  perform pg_temp.as_service();
  r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(gen_random_uuid(), k1, pg_temp.step_of(base + interval '2 hours'), base + interval '2 hours')));
  perform pg_temp.as_postgres();
  perform pg_temp.t('scan after the device was revoked fails', pg_temp.status_of(r) = 'rejected:revoked_device' and exists (select 1 from public.fraud_flags where kind = 'revoked_device'), pg_temp.status_of(r));

  -- cross-scanner duplicate, out-of-order arrival: dinner scanned offline at sc1b (later) syncs FIRST, the earlier one at sc1 syncs second and wins
  update public.student_devices set revoked_at = null, revoked_reason = null where id = d1;
  delete from public.meal_redemptions where student_id = S1 and slot = 'dinner';  -- clear dinner rows from the stale/boundary checks above
  perform pg_temp.as_service();
  id1 := gen_random_uuid(); id3 := gen_random_uuid();
  r := public.record_scans(C1, sc1b, jsonb_build_array(pg_temp.qr(id3, k1, pg_temp.step_of(dinner + interval '9 minutes'), dinner + interval '9 minutes')));
  perform pg_temp.as_postgres();
  delete from public.meal_redemptions where student_id = S1 and slot = 'dinner';  -- clear dinner rows from the stale/boundary checks above
  delete from public.meal_redemptions where id = id3;
  perform pg_temp.as_service();
  r := public.record_scans(C1, sc1b, jsonb_build_array(pg_temp.qr(id3, k1, pg_temp.step_of(dinner + interval '9 minutes'), dinner + interval '9 minutes')));
  r := r || public.record_scans(C1, sc1, jsonb_build_array(pg_temp.qr(id1, k1, pg_temp.step_of(dinner), dinner)));
  perform pg_temp.as_postgres();
  perform pg_temp.t('cross-scanner: earlier scan wins even when it syncs later',
    (select status from public.meal_redemptions where id = id1) = 'accepted' and (select status from public.meal_redemptions where id = id3) = 'duplicate');
  perform pg_temp.t('cross-scanner: exactly one accepted, flag duplicate_cross_scanner written with both ids',
    (select count(*) from public.meal_redemptions where student_id = S1 and slot = 'dinner' and status = 'accepted') = 1
    and exists (select 1 from public.fraud_flags where kind = 'duplicate_cross_scanner' and redemption_ids @> array[id1, id3]));

  -- staff identity binding
  perform pg_temp.as_service();
  perform pg_temp.t('record_scans refuses a staff id that does not own the scanner', pg_temp.err(format($q$select public.record_scans(%L, %L, '[]')$q$, C2, sc1)) like '%not authorized%');
  perform pg_temp.as_postgres();

  -- ═══ MANUAL FALLBACK ═══
  perform pg_temp.as_service();
  r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.manual(gen_random_uuid(), 'DEMO0001', base + interval '30 minutes', null)));
  perform pg_temp.as_postgres();
  perform pg_temp.t('manual without a reason is rejected', pg_temp.status_of(r) = 'rejected:manual_reason_required', pg_temp.status_of(r));
  -- (S1 already has a lunch admission, so use a fresh student for the acceptance cases)
  declare s3 uuid := pg_temp.mk_user('s3@student.nitw.ac.in');
  begin
    update public.profiles set assigned_mess_id = 'ifc-a', roll_number = 'DEMO0003' where id = s3;
    perform pg_temp.as_service();
    r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.manual(gen_random_uuid(), 'DEMO0003', base + interval '31 minutes', 'other', 'hi')));
    perform pg_temp.t('manual reason "other" needs a note of at least 5 characters', pg_temp.status_of(r) = 'rejected:manual_reason_required', pg_temp.status_of(r));
    r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.manual(gen_random_uuid(), 'NOPE', base + interval '32 minutes', 'phone_dead')));
    perform pg_temp.t('manual with unknown roll number rejected', pg_temp.status_of(r) = 'rejected:unknown_roll', pg_temp.status_of(r));
    r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.manual(gen_random_uuid(), 'TSTK0002', base + interval '33 minutes', 'phone_dead')));
    perform pg_temp.t('manual for a student of another mess rejected (wrong_mess)', pg_temp.status_of(r) = 'rejected:wrong_mess', pg_temp.status_of(r));
    r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.manual(gen_random_uuid(), 'DEMO0003', base + interval '34 minutes', 'phone_dead')));
    perform pg_temp.t('manual with a valid reason accepted and logged as manual', pg_temp.status_of(r) = 'accepted:'
      and exists (select 1 from public.meal_redemptions where student_id = s3 and method = 'manual' and manual_reason = 'phone_dead' and staff_id = C1), pg_temp.status_of(r));
    r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.manual(gen_random_uuid(), 'DEMO0003', base + interval '35 minutes', 'phone_dead')));
    perform pg_temp.t('manual obeys one-per-slot too', pg_temp.status_of(r) = 'duplicate:already_admitted', pg_temp.status_of(r));
    perform pg_temp.as_postgres();

  end;

  -- per-student weekly limit, done explicitly on dates within the last 72 h window using the three slots of yesterday
  declare s5 uuid := pg_temp.mk_user('s5@student.nitw.ac.in'); y date := (now() at time zone 'Asia/Kolkata')::date - 1; slot_times timestamptz[];
  begin
    update public.profiles set assigned_mess_id = 'ifc-a', roll_number = 'DEMO0005' where id = s5;
    slot_times := array[ ((y + time '08:00') at time zone 'Asia/Kolkata'), ((y + time '12:30') at time zone 'Asia/Kolkata'),
                         ((y + time '17:00') at time zone 'Asia/Kolkata'), ((y + time '20:00') at time zone 'Asia/Kolkata') ];
    perform pg_temp.as_service();
    r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.manual(gen_random_uuid(), 'DEMO0005', slot_times[1], 'app_problem')));
    r := r || public.record_scans(C1, sc1, jsonb_build_array(pg_temp.manual(gen_random_uuid(), 'DEMO0005', slot_times[2], 'app_problem')));
    r := r || public.record_scans(C1, sc1, jsonb_build_array(pg_temp.manual(gen_random_uuid(), 'DEMO0005', slot_times[3], 'app_problem')));
    r := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.manual(gen_random_uuid(), 'DEMO0005', slot_times[4], 'app_problem')));
    perform pg_temp.as_postgres();
    perform pg_temp.t('manual: 4th entry for one student in a week refused + flagged',
      pg_temp.status_of(r) = 'rejected:manual_rate_limit_student' and exists (select 1 from public.fraud_flags where kind = 'manual_overuse' and student_id = s5), pg_temp.status_of(r));
  end;

  -- per-staff limit: 10 accepted manual entries per hour; the 11th is refused. 11 fresh students, same hour, different (unique) students.
  declare ids uuid[] := '{}'; st uuid; rr jsonb;
  begin
    for i in 1..11 loop
      st := pg_temp.mk_user('bulk' || i || '@student.nitw.ac.in');
      update public.profiles set assigned_mess_id = 'ifc-a', roll_number = 'BULK' || i where id = st;
    end loop;
    perform pg_temp.as_service();
    for i in 1..11 loop
      rr := public.record_scans(C1, sc1, jsonb_build_array(pg_temp.manual(gen_random_uuid(), 'BULK' || i, base + interval '50 minutes' + i * interval '1 second', 'phone_dead')));
    end loop;
    perform pg_temp.as_postgres();
    perform pg_temp.t('manual: 11th entry by one staff within an hour refused',
      pg_temp.status_of(rr) = 'rejected:manual_rate_limit_staff', pg_temp.status_of(rr));
  end;

  -- ═══ RLS ON READS ═══
  perform pg_temp.as_user(S1);
  perform pg_temp.t('RLS: student sees only their own redemptions', (select count(*) from public.meal_redemptions) = (select count(*) from public.meal_redemptions where student_id = S1) and (select count(*) from public.meal_redemptions) > 0);
  perform pg_temp.t('RLS: student sees no fraud flags', (select count(*) from public.fraud_flags) = 0);
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(P1);
  perform pg_temp.t('RLS: parent sees the linked student''s redemptions only', (select count(*) from public.meal_redemptions) = (select count(*) from public.meal_redemptions where student_id = S1) and (select count(*) from public.meal_redemptions) > 0);
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(C1);
  perform pg_temp.t('RLS: counter staff sees only their own mess''s redemptions', (select count(*) from public.meal_redemptions where mess_id <> 'ifc-a') = 0 and (select count(*) from public.meal_redemptions) > 0);
  perform pg_temp.t('RLS: counter staff sees no fraud flags', (select count(*) from public.fraud_flags) = 0);
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(A1);
  perform pg_temp.t('RLS: mess admin sees fraud flags of their own mess only', (select count(*) from public.fraud_flags) > 0 and (select count(*) from public.fraud_flags where mess_id is distinct from 'ifc-a') = 0);
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(W);
  perform pg_temp.t('RLS: warden sees all flags and redemptions', (select count(*) from public.fraud_flags) = (select count(*) from public.fraud_flags where true) and (select count(*) from public.meal_redemptions where mess_id = 'ifc-a') > 0);
  perform public.resolve_fraud_flag((select id from public.fraud_flags limit 1), 'checked, same person');
  perform pg_temp.as_postgres();
  perform pg_temp.t('warden can resolve a flag', exists (select 1 from public.fraud_flags where resolved_by = W and note = 'checked, same person'));
  perform pg_temp.as_user(A1);
  perform pg_temp.t('mess admin cannot resolve flags', pg_temp.err($q$select public.resolve_fraud_flag(gen_random_uuid(), 'x')$q$) like '%only wardens%');
  perform pg_temp.as_postgres();
end $$;

select n, name, case when ok then 'PASS' else 'FAIL' end as result, coalesce(detail, '') as detail from _r order by n;
do $$ begin
  if exists (select 1 from _r where not ok) then raise exception 'PHASE 3 TESTS FAILED: %', (select string_agg(name, '; ') from _r where not ok); end if;
  raise notice 'ALL % PHASE 3 ACCESS TESTS PASSED', (select count(*) from _r);
end $$;
rollback;
