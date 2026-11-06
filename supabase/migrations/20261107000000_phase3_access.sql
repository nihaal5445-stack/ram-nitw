-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3: Access + Scanner (docs/SPEC.md 8.1)
-- Signed rotating QR. The phone keeps a non-extractable ECDSA P-256 private key; the DB stores only the
-- PUBLIC key (not secret). Scanners get public keys in a bundle and verify offline. Scans are synced later
-- through record_scans(), which only the service role can execute: the Next.js route verifies the ECDSA
-- signatures first (Postgres cannot), then this function applies every other rule and writes fraud flags.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles add column roll_number text unique;

-- ── mess slots (moves into full menu management in Phase 4; values TODO: verify) ──
create table public.mess_slots (
  mess_id text not null,
  slot    text not null check (slot in ('breakfast','lunch','snacks','dinner')),
  starts  time not null,
  ends    time not null,
  primary key (mess_id, slot)
);
insert into public.mess_slots (mess_id, slot, starts, ends)
select m, s.slot, s.starts, s.ends
from unnest(array['ifc-a','ifc-b','krishna','priyadarshini']) as m,
     (values ('breakfast','07:30'::time,'09:30'::time), ('lunch','12:00','14:00'),
             ('snacks','16:30','17:30'), ('dinner','19:30','21:30')) as s(slot, starts, ends);

-- ── student devices: one ACTIVE device per student ──
create table public.student_devices (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  device_key     text not null unique check (device_key ~ '^[A-Za-z0-9_-]{11}$'),
  public_key     bytea not null check (octet_length(public_key) = 65 and get_byte(public_key, 0) = 4),
  label          text,
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  revoked_reason text,
  revoked_by     uuid references public.profiles(id) on delete set null
);
create unique index one_active_device_per_student on public.student_devices (student_id) where revoked_at is null;

-- ── scanner devices + audit of every bundle download ──
create table public.scanner_devices (
  id           uuid primary key default gen_random_uuid(),
  mess_id      text not null,
  staff_id     uuid not null references public.profiles(id) on delete cascade,
  label        text,
  created_at   timestamptz not null default now(),
  last_sync_at timestamptz,
  revoked_at   timestamptz
);
create table public.bundle_issues (
  id            uuid primary key default gen_random_uuid(),
  scanner_id    uuid not null references public.scanner_devices(id) on delete cascade,
  staff_id      uuid not null references public.profiles(id) on delete cascade,
  mess_id       text not null,
  issued_at     timestamptz not null default now(),
  expires_at    timestamptz not null,
  student_count int not null
);

-- ── redemptions (accepted / duplicate / rejected all kept for audit) ──
create table public.meal_redemptions (
  id            uuid primary key,                       -- client scan id: makes sync idempotent
  student_id    uuid references public.profiles(id),    -- null when the device/roll is unknown
  device_id     uuid references public.student_devices(id),
  mess_id       text not null,
  meal_date     date,
  slot          text,
  method        text not null check (method in ('qr','manual')),
  scanned_at    timestamptz not null,
  received_at   timestamptz not null default now(),
  scanner_id    uuid references public.scanner_devices(id),
  staff_id      uuid references public.profiles(id),
  step          bigint,
  status        text not null check (status in ('accepted','duplicate','rejected')),
  reject_reason text,
  roll_number   text,
  manual_reason text,
  manual_note   text
);
create unique index one_admission_per_slot on public.meal_redemptions (student_id, meal_date, slot) where status = 'accepted';
create index meal_redemptions_staff_manual on public.meal_redemptions (staff_id, scanned_at) where method = 'manual';

create table public.fraud_flags (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('duplicate_cross_scanner','duplicate_same_scanner','wrong_mess','stale_code',
                   'bad_signature','revoked_device','unknown_device','clock_skew','manual_overuse')),
  student_id     uuid references public.profiles(id),
  mess_id        text,
  redemption_ids uuid[] not null default '{}',
  details        jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references public.profiles(id),
  note           text
);

-- ── privileges: clients can read (subject to RLS) and nothing else; all writes go through functions ──
revoke all on public.mess_slots, public.student_devices, public.scanner_devices, public.bundle_issues,
              public.meal_redemptions, public.fraud_flags from anon, authenticated;
grant select on public.mess_slots, public.student_devices, public.scanner_devices, public.bundle_issues,
                public.meal_redemptions, public.fraud_flags to authenticated;

alter table public.mess_slots        enable row level security;
alter table public.student_devices   enable row level security;
alter table public.scanner_devices   enable row level security;
alter table public.bundle_issues     enable row level security;
alter table public.meal_redemptions  enable row level security;
alter table public.fraud_flags       enable row level security;

create policy "mess_slots: anyone signed in reads" on public.mess_slots for select to authenticated using (true);

create policy "student_devices: own" on public.student_devices for select to authenticated using (student_id = auth.uid());
create policy "student_devices: warden" on public.student_devices for select to authenticated using (public.get_my_role() = 'warden');

create policy "scanner_devices: own" on public.scanner_devices for select to authenticated using (staff_id = auth.uid());
create policy "scanner_devices: warden" on public.scanner_devices for select to authenticated using (public.get_my_role() = 'warden');

create policy "bundle_issues: own" on public.bundle_issues for select to authenticated using (staff_id = auth.uid());
create policy "bundle_issues: warden" on public.bundle_issues for select to authenticated using (public.get_my_role() = 'warden');

create policy "redemptions: student own" on public.meal_redemptions for select to authenticated using (student_id = auth.uid());
create policy "redemptions: parent of linked student" on public.meal_redemptions for select to authenticated
  using (student_id is not null and student_id = public.get_my_linked_student_id());
create policy "redemptions: staff of the mess" on public.meal_redemptions for select to authenticated
  using (public.get_my_role() in ('counter_staff','mess_admin') and mess_id = public.get_my_assigned_mess_id());
create policy "redemptions: warden" on public.meal_redemptions for select to authenticated using (public.get_my_role() = 'warden');

create policy "fraud_flags: warden" on public.fraud_flags for select to authenticated using (public.get_my_role() = 'warden');
create policy "fraud_flags: mess admin of the mess" on public.fraud_flags for select to authenticated
  using (public.get_my_role() = 'mess_admin' and mess_id = public.get_my_assigned_mess_id());

-- ── helpers ──
create or replace function public.b64u_encode(p bytea) returns text language sql immutable as
$$ select translate(replace(encode(p, 'base64'), E'\n', ''), '+/=', '-_') $$;

create or replace function public.b64u_decode(p text) returns bytea language sql immutable as
$$ select decode(rpad(translate(p, '-_', '+/'), (ceil(length(p) / 4.0) * 4)::int, '='), 'base64') $$;

create or replace function public._flag(p_kind text, p_student uuid, p_mess text, p_ids uuid[], p_details jsonb)
returns void language sql security definer set search_path = public as
$$ insert into public.fraud_flags (kind, student_id, mess_id, redemption_ids, details) values (p_kind, p_student, p_mess, p_ids, p_details) $$;

-- ── enrol a device: student only, fresh sign-in, 3 per day, replaces the previous device ──
create or replace function public.enroll_device(p_label text, p_public_key_b64u text)
returns table (device_id uuid, device_key text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pub bytea;
  v_key text;
  v_id  uuid;
  v_last timestamptz;
begin
  if v_uid is null or coalesce(public.get_my_role()::text, '') <> 'student' then
    raise exception 'only students can enroll a device' using errcode = '42501';
  end if;
  select last_sign_in_at into v_last from auth.users where id = v_uid;
  if v_last is null or v_last < now() - interval '10 minutes' then
    raise exception 'reauth_required: sign in again before enrolling a device' using errcode = 'P0001';
  end if;
  if (select count(*) from public.student_devices where student_id = v_uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'rate_limited: at most 3 device enrolments per day' using errcode = 'P0001';
  end if;
  begin
    v_pub := public.b64u_decode(p_public_key_b64u);
  exception when others then
    raise exception 'invalid public key' using errcode = '22023';
  end;
  if octet_length(v_pub) <> 65 or get_byte(v_pub, 0) <> 4 then
    raise exception 'invalid public key (expected 65-byte uncompressed P-256 point)' using errcode = '22023';
  end if;

  update public.student_devices
     set revoked_at = now(), revoked_reason = 'replaced', revoked_by = v_uid
   where student_id = v_uid and revoked_at is null;

  v_key := public.b64u_encode(extensions.gen_random_bytes(8));
  insert into public.student_devices (student_id, device_key, public_key, label)
  values (v_uid, v_key, v_pub, left(p_label, 60)) returning id into v_id;
  return query select v_id, v_key;
end $$;

create or replace function public.revoke_device(p_device_id uuid, p_reason text default 'revoked')
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.student_devices
     set revoked_at = now(), revoked_reason = left(p_reason, 100), revoked_by = auth.uid()
   where id = p_device_id and revoked_at is null
     and (student_id = auth.uid() or public.get_my_role() = 'warden');
  if not found then raise exception 'device not found or not yours' using errcode = '42501'; end if;
end $$;

-- ── scanner registration and bundle ──
create or replace function public.register_scanner(p_label text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if public.get_my_role() not in ('counter_staff','mess_admin') or public.get_my_assigned_mess_id() is null then
    raise exception 'only counter staff or mess admins with an assigned mess can register a scanner' using errcode = '42501';
  end if;
  insert into public.scanner_devices (mess_id, staff_id, label)
  values (public.get_my_assigned_mess_id(), auth.uid(), left(p_label, 60)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.issue_scanner_bundle(p_scanner_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_scanner public.scanner_devices;
  v_expires timestamptz := now() + interval '12 hours';
  v_students jsonb;
  v_count int;
begin
  select * into v_scanner from public.scanner_devices where id = p_scanner_id and revoked_at is null;
  if v_scanner.id is null or v_scanner.staff_id <> auth.uid()
     or public.get_my_role() not in ('counter_staff','mess_admin')
     or public.get_my_assigned_mess_id() is distinct from v_scanner.mess_id then
    raise exception 'not authorized for this scanner' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'student_id', p.id, 'name', p.full_name, 'roll', p.roll_number,
           'device_key', d.device_key, 'public_key', public.b64u_encode(d.public_key)) order by p.full_name), '[]'),
         count(*)
    into v_students, v_count
    from public.profiles p
    left join public.student_devices d on d.student_id = p.id and d.revoked_at is null
   where p.role = 'student' and p.assigned_mess_id = v_scanner.mess_id;

  insert into public.bundle_issues (scanner_id, staff_id, mess_id, expires_at, student_count)
  values (v_scanner.id, auth.uid(), v_scanner.mess_id, v_expires, v_count);

  return jsonb_build_object(
    'scanner_id', v_scanner.id, 'mess_id', v_scanner.mess_id,
    'issued_at', now(), 'expires_at', v_expires, 'server_time', now(),
    'students', v_students,
    'revoked_keys', coalesce((select jsonb_agg(d.device_key) from public.student_devices d
                               join public.profiles p on p.id = d.student_id
                              where d.revoked_at is not null and d.revoked_at > now() - interval '7 days'
                                and p.assigned_mess_id = v_scanner.mess_id), '[]'),
    'slots', (select jsonb_agg(jsonb_build_object('slot', slot, 'starts', to_char(starts, 'HH24:MI'), 'ends', to_char(ends, 'HH24:MI')) order by starts)
                from public.mess_slots where mess_id = v_scanner.mess_id)
  );
end $$;

-- ── warden: resolve a fraud flag ──
create or replace function public.resolve_fraud_flag(p_flag uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() <> 'warden' then raise exception 'only wardens can resolve flags' using errcode = '42501'; end if;
  update public.fraud_flags set resolved_at = now(), resolved_by = auth.uid(), note = left(p_note, 500) where id = p_flag;
end $$;

-- ── sync: SERVICE ROLE ONLY. The route has already verified every ECDSA signature (sig_ok). ──
-- Scan object: { id, method: 'qr'|'manual', scanned_at, device_key?, step?, sig_ok?, roll_number?, reason_code?, note? }
create or replace function public.record_scans(p_staff_id uuid, p_scanner_id uuid, p_scans jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_scanner public.scanner_devices;
  v_staff   public.profiles;
  v_scan    jsonb;
  v_out     jsonb := '[]'::jsonb;
  v_id uuid; v_method text; v_scanned timestamptz; v_step bigint;
  v_device public.student_devices; v_student public.profiles;
  v_slot text; v_date date; v_local time;
  v_status text; v_reason text; v_existing public.meal_redemptions;
  v_roll text; v_rcode text; v_note text; v_now_step bigint;
begin
  select * into v_scanner from public.scanner_devices where id = p_scanner_id and revoked_at is null;
  select * into v_staff from public.profiles where id = p_staff_id;
  if v_scanner.id is null or v_staff.id is null or v_scanner.staff_id <> p_staff_id
     or v_staff.role not in ('counter_staff','mess_admin') or v_staff.assigned_mess_id is distinct from v_scanner.mess_id then
    raise exception 'not authorized for this scanner' using errcode = '42501';
  end if;

  for v_scan in select value from jsonb_array_elements(p_scans) order by (value->>'scanned_at')::timestamptz loop
    v_status := null; v_reason := null; v_device := null; v_student := null; v_slot := null; v_step := null;
    begin
      v_id := (v_scan->>'id')::uuid;
      v_method := v_scan->>'method';
      v_scanned := (v_scan->>'scanned_at')::timestamptz;
      v_roll := nullif(v_scan->>'roll_number', '');
      v_rcode := nullif(v_scan->>'reason_code', '');
      v_note := nullif(v_scan->>'note', '');
      v_step := nullif(v_scan->>'step', '')::bigint;
    exception when others then
      v_out := v_out || jsonb_build_object('id', v_scan->>'id', 'status', 'rejected', 'reason', 'malformed');
      continue;
    end;
    if v_method not in ('qr','manual') then
      v_out := v_out || jsonb_build_object('id', v_id, 'status', 'rejected', 'reason', 'malformed'); continue;
    end if;

    -- idempotent replay
    select * into v_existing from public.meal_redemptions where id = v_id;
    if found then
      v_out := v_out || jsonb_build_object('id', v_id, 'status', v_existing.status, 'reason', coalesce(v_existing.reject_reason, 'already_recorded'), 'replay', true);
      continue;
    end if;

    v_date := (v_scanned at time zone 'Asia/Kolkata')::date;
    v_local := (v_scanned at time zone 'Asia/Kolkata')::time;
    -- minutes arithmetic (not time - interval): `time` arithmetic wraps at midnight, which broke windows touching 00:00/24:00
    select slot into v_slot from public.mess_slots
     where mess_id = v_scanner.mess_id
       and extract(epoch from v_local) / 60 >= extract(epoch from starts) / 60 - 15
       and extract(epoch from v_local) / 60 <  extract(epoch from ends) / 60 + 15 limit 1;

    -- identify the student
    if v_method = 'qr' then
      select * into v_device from public.student_devices where device_key = v_scan->>'device_key';
      if v_device.id is not null then select * into v_student from public.profiles where id = v_device.student_id; end if;
    else
      select * into v_student from public.profiles where role = 'student' and roll_number = v_roll;
    end if;

    v_now_step := floor(extract(epoch from v_scanned) / 30);

    -- rules, in order; first failure wins
    if v_scanned > now() + interval '5 minutes' then
      v_reason := 'clock_in_future';
      perform public._flag('clock_skew', v_student.id, v_scanner.mess_id, '{}', jsonb_build_object('scanner', v_scanner.id, 'scanned_at', v_scanned, 'server_now', now()));
    elsif v_scanned < now() - interval '72 hours' then
      v_reason := 'too_old';
    elsif v_student.id is null then
      v_reason := case when v_method = 'qr' then 'unknown_device' else 'unknown_roll' end;
      if v_method = 'qr' then perform public._flag('unknown_device', null, v_scanner.mess_id, '{}', jsonb_build_object('device_key', v_scan->>'device_key', 'scanner', v_scanner.id)); end if;
    elsif v_student.assigned_mess_id is distinct from v_scanner.mess_id then
      v_reason := 'wrong_mess';
      perform public._flag('wrong_mess', v_student.id, v_scanner.mess_id, '{}', jsonb_build_object('student_mess', v_student.assigned_mess_id, 'scanner', v_scanner.id));
    elsif v_method = 'qr' and v_device.revoked_at is not null and v_device.revoked_at <= v_scanned then
      v_reason := 'revoked_device';
      perform public._flag('revoked_device', v_student.id, v_scanner.mess_id, '{}', jsonb_build_object('device', v_device.id, 'revoked_at', v_device.revoked_at, 'scanner', v_scanner.id));
    elsif v_method = 'qr' and not coalesce((v_scan->>'sig_ok')::boolean, false) then
      v_reason := 'bad_signature';
      perform public._flag('bad_signature', v_student.id, v_scanner.mess_id, '{}', jsonb_build_object('device', v_device.id, 'scanner', v_scanner.id));
    elsif v_method = 'qr' and v_step is null then
      v_reason := 'malformed';
    elsif v_method = 'qr' and v_step < v_now_step - 1 then
      v_reason := 'stale_code';
      perform public._flag('stale_code', v_student.id, v_scanner.mess_id, '{}', jsonb_build_object('step', v_step, 'scan_step', v_now_step, 'age_steps', v_now_step - v_step, 'scanner', v_scanner.id));
    elsif v_method = 'qr' and v_step > v_now_step + 1 then
      v_reason := 'future_code';
    elsif v_slot is null then
      v_reason := 'outside_meal_time';
    elsif v_method = 'manual' and (v_rcode is null or v_rcode not in ('phone_dead','app_problem','lost_phone','clock_wrong','other')
                                   or (v_rcode = 'other' and coalesce(length(v_note), 0) < 5)) then
      v_reason := 'manual_reason_required';
    elsif v_method = 'manual' and (select count(*) from public.meal_redemptions
                                    where method = 'manual' and staff_id = p_staff_id and status = 'accepted'
                                      and scanned_at > v_scanned - interval '1 hour' and scanned_at <= v_scanned) >= 10 then
      v_reason := 'manual_rate_limit_staff';
      perform public._flag('manual_overuse', v_student.id, v_scanner.mess_id, '{}', jsonb_build_object('limit', '10/hour per staff', 'staff', p_staff_id));
    elsif v_method = 'manual' and (select count(*) from public.meal_redemptions
                                    where method = 'manual' and student_id = v_student.id and status = 'accepted'
                                      and scanned_at > v_scanned - interval '7 days' and scanned_at <= v_scanned) >= 3 then
      v_reason := 'manual_rate_limit_student';
      perform public._flag('manual_overuse', v_student.id, v_scanner.mess_id, '{}', jsonb_build_object('limit', '3/week per student', 'staff', p_staff_id));
    end if;

    if v_reason is not null then
      insert into public.meal_redemptions (id, student_id, device_id, mess_id, meal_date, slot, method, scanned_at, scanner_id, staff_id, step, status, reject_reason, roll_number, manual_reason, manual_note)
      values (v_id, v_student.id, v_device.id, v_scanner.mess_id, v_date, v_slot, v_method, v_scanned, v_scanner.id, p_staff_id, v_step, 'rejected', v_reason, v_roll, v_rcode, v_note);
      v_out := v_out || jsonb_build_object('id', v_id, 'status', 'rejected', 'reason', v_reason);
      continue;
    end if;

    -- one admission per student per slot: earliest scanned_at wins
    select * into v_existing from public.meal_redemptions
     where student_id = v_student.id and meal_date = v_date and slot = v_slot and status = 'accepted';
    if found and v_existing.scanned_at <= v_scanned then
      insert into public.meal_redemptions (id, student_id, device_id, mess_id, meal_date, slot, method, scanned_at, scanner_id, staff_id, step, status, reject_reason, roll_number, manual_reason, manual_note)
      values (v_id, v_student.id, v_device.id, v_scanner.mess_id, v_date, v_slot, v_method, v_scanned, v_scanner.id, p_staff_id, v_step, 'duplicate', 'already_admitted', v_roll, v_rcode, v_note);
      perform public._flag(case when v_existing.scanner_id is distinct from v_scanner.id then 'duplicate_cross_scanner' else 'duplicate_same_scanner' end,
                           v_student.id, v_scanner.mess_id, array[v_existing.id, v_id],
                           jsonb_build_object('first_scan', v_existing.scanned_at, 'duplicate_scan', v_scanned, 'first_scanner', v_existing.scanner_id, 'duplicate_scanner', v_scanner.id));
      v_out := v_out || jsonb_build_object('id', v_id, 'status', 'duplicate', 'reason', 'already_admitted');
      continue;
    elsif found then
      -- this scan is EARLIER than the one already accepted (arrived out of order): it wins, the other becomes the duplicate
      update public.meal_redemptions set status = 'duplicate', reject_reason = 'already_admitted' where id = v_existing.id;
      perform public._flag(case when v_existing.scanner_id is distinct from v_scanner.id then 'duplicate_cross_scanner' else 'duplicate_same_scanner' end,
                           v_student.id, v_scanner.mess_id, array[v_id, v_existing.id],
                           jsonb_build_object('first_scan', v_scanned, 'duplicate_scan', v_existing.scanned_at, 'first_scanner', v_scanner.id, 'duplicate_scanner', v_existing.scanner_id));
    end if;

    insert into public.meal_redemptions (id, student_id, device_id, mess_id, meal_date, slot, method, scanned_at, scanner_id, staff_id, step, status, roll_number, manual_reason, manual_note)
    values (v_id, v_student.id, v_device.id, v_scanner.mess_id, v_date, v_slot, v_method, v_scanned, v_scanner.id, p_staff_id, v_step, 'accepted', v_roll, v_rcode, v_note);
    v_out := v_out || jsonb_build_object('id', v_id, 'status', 'accepted');
  end loop;

  update public.scanner_devices set last_sync_at = now() where id = v_scanner.id;
  return v_out;
end $$;

-- ── execute grants ──
revoke execute on all functions in schema public from public, anon, authenticated;  -- reset, then grant explicitly
grant execute on function public.get_my_role(), public.get_my_assigned_mess_id(), public.get_my_linked_student_id() to authenticated, anon;
grant execute on function public.enroll_device(text, text), public.revoke_device(uuid, text), public.register_scanner(text),
                          public.issue_scanner_bundle(uuid), public.resolve_fraud_flag(uuid, text) to authenticated;
grant execute on function public.record_scans(uuid, uuid, jsonb) to service_role;
grant execute on function public.b64u_encode(bytea), public.b64u_decode(text) to authenticated, service_role;
