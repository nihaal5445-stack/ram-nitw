-- Post-meal feedback: 40 minutes after an ACCEPTED scan the student is asked for stars + a review.
-- Prompts are created lazily from the student's own accepted redemptions; no push, just an in-app banner and bell.

create table public.feedback_prefs (
  student_id  uuid primary key references public.profiles(id) on delete cascade,
  skippable   boolean not null default true,
  remind_once boolean not null default true
);

create table public.feedback_prompts (
  redemption_id uuid primary key references public.meal_redemptions(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  mess_id       text not null,
  slot          text not null,
  meal_date     date not null,
  due_at        timestamptz not null,
  snooze_until  timestamptz,
  reminded      boolean not null default false,
  status        text not null default 'pending' check (status in ('pending','submitted','skipped')),
  stars         integer check (stars between 1 and 5),
  review        text check (length(review) <= 1000),
  improve       text check (length(improve) <= 1000),
  answered_at   timestamptz
);
create index feedback_prompts_student on public.feedback_prompts (student_id, status, due_at);

alter table public.feedback_prefs enable row level security;
alter table public.feedback_prompts enable row level security;
revoke all on public.feedback_prefs, public.feedback_prompts from public, anon, authenticated;
grant select on public.feedback_prefs, public.feedback_prompts to authenticated;
create policy "feedback_prefs: own" on public.feedback_prefs for select to authenticated using (student_id = auth.uid());
create policy "feedback_prompts: own" on public.feedback_prompts for select to authenticated using (student_id = auth.uid());
-- Mess staff see only aggregates (mess_feedback_summary) so reviews cannot be tied to students by accident.

create or replace function public.get_feedback_prefs() returns public.feedback_prefs
language plpgsql security definer set search_path = public as $$
declare r public.feedback_prefs;
begin
  insert into public.feedback_prefs (student_id) values (auth.uid()) on conflict do nothing;
  select * into r from public.feedback_prefs where student_id = auth.uid();
  return r;
end $$;

create or replace function public.set_feedback_prefs(p_skippable boolean, p_remind_once boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() <> 'student' then raise exception 'students only' using errcode = '42501'; end if;
  insert into public.feedback_prefs (student_id, skippable, remind_once) values (auth.uid(), p_skippable, p_remind_once)
  on conflict (student_id) do update set skippable = excluded.skippable, remind_once = excluded.remind_once;
end $$;

-- Creates prompts for the caller's accepted scans of the last 24 h (due 40 min after the scan) and returns the ones due now.
create or replace function public.my_feedback_prompts()
returns table (redemption_id uuid, mess_id text, slot text, meal_date date, due_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() <> 'student' then return; end if;
  insert into public.feedback_prompts (redemption_id, student_id, mess_id, slot, meal_date, due_at)
  select r.id, r.student_id, r.mess_id, r.slot, r.meal_date, r.scanned_at + interval '40 minutes'
  from public.meal_redemptions r
  where r.student_id = auth.uid() and r.status = 'accepted' and r.scanned_at > now() - interval '24 hours'
  on conflict do nothing;
  return query
  select p.redemption_id, p.mess_id, p.slot, p.meal_date, p.due_at from public.feedback_prompts p
  where p.student_id = auth.uid() and p.status = 'pending' and p.due_at <= now() and (p.snooze_until is null or p.snooze_until <= now())
  order by p.due_at;
end $$;

create or replace function public.submit_feedback(p_redemption uuid, p_stars integer, p_review text, p_improve text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.feedback_prompts set status = 'submitted', stars = p_stars, review = nullif(trim(p_review), ''), improve = nullif(trim(p_improve), ''), answered_at = now()
   where redemption_id = p_redemption and student_id = auth.uid() and status = 'pending' and p_stars between 1 and 5;
  if not found then raise exception 'cannot submit this feedback'; end if;
end $$;

-- Skip: refused when the student turned "skippable" off. With "remind once" the first skip snoozes 30 min, the second is final.
create or replace function public.skip_feedback(p_redemption uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_prefs public.feedback_prefs; v_p public.feedback_prompts;
begin
  v_prefs := public.get_feedback_prefs();
  if not v_prefs.skippable then raise exception 'not_skippable'; end if;
  select * into v_p from public.feedback_prompts where redemption_id = p_redemption and student_id = auth.uid() and status = 'pending' for update;
  if v_p.redemption_id is null then raise exception 'nothing to skip'; end if;
  if v_prefs.remind_once and not v_p.reminded then
    update public.feedback_prompts set reminded = true, snooze_until = now() + interval '30 minutes' where redemption_id = p_redemption;
    return 'snoozed';
  end if;
  update public.feedback_prompts set status = 'skipped', answered_at = now() where redemption_id = p_redemption;
  return 'skipped';
end $$;

-- DEMO TOOL: "Simulate 40 min passed": makes the caller's newest prompt due now.
create or replace function public.simulate_feedback_due() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform count(*) from public.my_feedback_prompts();
  update public.feedback_prompts set due_at = now(), snooze_until = null
   where redemption_id = (select redemption_id from public.feedback_prompts where student_id = auth.uid() and status = 'pending' order by due_at desc limit 1);
  get diagnostics n = row_count;
  return n;
end $$;

-- Aggregates only (no student ids): mess staff and wardens.
create or replace function public.mess_feedback_summary() returns table (mess_id text, n integer, avg_stars numeric)
language sql stable security definer set search_path = public as $$
  select p.mess_id, count(*)::int, round(avg(p.stars), 1) from public.feedback_prompts p
  where p.status = 'submitted' and (public.get_my_role() = 'warden' or (public.get_my_role() = 'mess_admin' and p.mess_id = public.get_my_assigned_mess_id()))
  group by p.mess_id
$$;

revoke execute on function public.get_feedback_prefs(), public.set_feedback_prefs(boolean, boolean), public.my_feedback_prompts(),
  public.submit_feedback(uuid, integer, text, text), public.skip_feedback(uuid), public.simulate_feedback_due(), public.mess_feedback_summary()
  from public, anon, authenticated;
grant execute on function public.get_feedback_prefs(), public.set_feedback_prefs(boolean, boolean), public.my_feedback_prompts(),
  public.submit_feedback(uuid, integer, text, text), public.skip_feedback(uuid), public.simulate_feedback_due(), public.mess_feedback_summary() to authenticated;
