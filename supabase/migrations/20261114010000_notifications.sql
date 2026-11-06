-- Notifications and announcements.
--  * announcements: posted by a mess admin (own mess) or a warden (one / several / all messes). Fan out into one `notifications` row per
--    targeted student and per parent of those students (the recipients are fixed at post time).
--  * notifications: RLS lets a user read ONLY rows addressed to them; writes only through SECURITY DEFINER functions.
--  * Automatic ones: complaint status changes, admin direct messages, the 40-minute feedback prompt, a new add-on on sale, meal-timing edits.
--    (Menus live in config, there is no menu editor yet; admins announce menu changes with the "Menu change" category.)
--  * Live: every new row sends a tiny Realtime broadcast `notif` on the per-user topic `notif:<user id>` (payload = notification id only).
--  * Users can mute categories (not complaint_update / admin_message). Public site: public_announcements() (closure, special meal, timings only).
-- DB-triggered notifications (add-on, timings) fire only for edits made through a signed-in user session (auth.uid() not null), so
-- seeding and service-role scripts stay quiet.

create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(trim(title)) between 3 and 120),
  body       text not null check (length(trim(body)) between 3 and 2000),
  category   text not null check (category in ('menu_change','timings','closure','special_meal','addon','admin_message','general')),
  pinned     boolean not null default false,
  expires_at timestamptz,
  mess_ids   text[] not null check (cardinality(mess_ids) > 0),
  is_public  boolean not null default false check (not is_public or category in ('closure','special_meal','timings')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id              bigserial primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  category        text not null check (category in ('menu_change','timings','closure','special_meal','addon','complaint_update','feedback_request','admin_message','general')),
  title           text not null,
  body            text,
  link            text,
  announcement_id uuid references public.announcements(id) on delete cascade,
  pinned          boolean not null default false,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);
create index notifications_user on public.notifications (user_id, created_at desc);
create index notifications_user_unread on public.notifications (user_id) where read_at is null;

create table public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  muted   text[] not null default '{}'
);

alter table public.announcements enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;
revoke all on public.announcements, public.notifications, public.notification_prefs from public, anon, authenticated;
grant select on public.announcements, public.notifications, public.notification_prefs to authenticated;
create policy "notifications: addressed to me" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notification_prefs: own" on public.notification_prefs for select to authenticated using (user_id = auth.uid());
create policy "announcements: mine" on public.announcements for select to authenticated using (created_by = auth.uid());

-- ── internal: create one notification (respects mutes) and ping the user's Realtime topic ──
create or replace function public._notify(p_user uuid, p_cat text, p_title text, p_body text, p_link text,
  p_ann uuid default null, p_pinned boolean default false, p_exp timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_cat not in ('complaint_update','admin_message')
     and exists (select 1 from public.notification_prefs where user_id = p_user and p_cat = any(muted)) then return; end if;
  insert into public.notifications (user_id, category, title, body, link, announcement_id, pinned, expires_at)
  values (p_user, p_cat, p_title, p_body, p_link, p_ann, p_pinned, p_exp) returning id into v_id;
  perform realtime.send(jsonb_build_object('id', v_id), 'notif', 'notif:' || p_user::text, false);
end $$;

create or replace function public._profile_link(p_user uuid, p_student text, p_parent text) returns text
language sql stable security definer set search_path = public as $$
  select case role when 'parent' then p_parent else p_student end from public.profiles where id = p_user
$$;

-- ── internal: publish an announcement and fan it out; returns the number of recipients ──
create or replace function public._publish_announcement(p_by uuid, p_title text, p_body text, p_cat text, p_pinned boolean,
  p_exp timestamptz, p_mess text[], p_public boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n integer := 0; r record;
begin
  insert into public.announcements (title, body, category, pinned, expires_at, mess_ids, is_public, created_by)
  values (trim(p_title), trim(p_body), p_cat, p_pinned, p_exp, p_mess, p_public, p_by) returning id into v_id;
  for r in
    select id from public.profiles where role = 'student' and assigned_mess_id = any(p_mess)
    union
    select id from public.profiles where role = 'parent' and linked_student_id in
      (select id from public.profiles where role = 'student' and assigned_mess_id = any(p_mess))
  loop
    perform public._notify(r.id, p_cat, trim(p_title), trim(p_body), '/dashboard/notifications', v_id, p_pinned, p_exp);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ── staff: post an announcement ──
create or replace function public.post_announcement(p_title text, p_body text, p_category text, p_pinned boolean default false,
  p_expires timestamptz default null, p_mess_ids text[] default null, p_public boolean default false) returns integer
language plpgsql security definer set search_path = public as $$
declare v_role user_role := public.get_my_role(); v_own text := public.get_my_assigned_mess_id(); v_mess text[]; v_known text[];
begin
  if v_role not in ('mess_admin','warden') then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_category not in ('menu_change','timings','closure','special_meal','addon','admin_message','general') then raise exception 'bad category'; end if;
  if length(trim(coalesce(p_title, ''))) < 3 or length(trim(coalesce(p_body, ''))) < 3 then raise exception 'title and text are required'; end if;
  if p_expires is not null and p_expires <= now() then raise exception 'expiry must be in the future'; end if;
  if (select count(*) from public.announcements where created_by = auth.uid() and created_at > now() - interval '1 hour') >= 30 then raise exception 'rate_limited'; end if;
  select array_agg(distinct mess_id order by mess_id) into v_known from public.mess_slots;
  if v_role = 'mess_admin' then
    if v_own is null then raise exception 'no mess assigned' using errcode = '42501'; end if;
    if p_mess_ids is not null and cardinality(p_mess_ids) > 0 and p_mess_ids <> array[v_own] then raise exception 'wrong_mess' using errcode = '42501'; end if;
    v_mess := array[v_own];
  else
    v_mess := case when p_mess_ids is null or cardinality(p_mess_ids) = 0 then v_known else p_mess_ids end;
    if exists (select 1 from unnest(v_mess) m where m <> all (v_known)) then raise exception 'unknown mess'; end if;
  end if;
  return public._publish_announcement(auth.uid(), p_title, p_body, p_category, coalesce(p_pinned, false), p_expires, v_mess,
    coalesce(p_public, false) and p_category in ('closure','special_meal','timings'));
end $$;

-- poster (or warden) withdraws an announcement: it expires now, for the recipients too
create or replace function public.end_announcement(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_a public.announcements;
begin
  select * into v_a from public.announcements where id = p_id;
  if v_a.id is null or not (v_a.created_by = auth.uid() or public.get_my_role() = 'warden') then raise exception 'not authorized' using errcode = '42501'; end if;
  update public.announcements set expires_at = now() where id = p_id;
  update public.notifications set expires_at = now() where announcement_id = p_id;
end $$;

create or replace function public.my_announcements() returns table (id uuid, title text, body text, category text, pinned boolean,
  expires_at timestamptz, mess_ids text[], is_public boolean, created_at timestamptz, recipients integer, read_count integer)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.body, a.category, a.pinned, a.expires_at, a.mess_ids, a.is_public, a.created_at,
         (select count(*)::int from public.notifications n where n.announcement_id = a.id),
         (select count(*)::int from public.notifications n where n.announcement_id = a.id and n.read_at is not null)
  from public.announcements a
  where public.get_my_role() in ('mess_admin','warden') and (a.created_by = auth.uid() or public.get_my_role() = 'warden')
  order by a.created_at desc limit 50
$$;

-- ── everyone: inbox ──
create or replace function public.my_notifications(p_limit integer default 100) returns setof public.notifications
language sql stable security definer set search_path = public as $$
  select * from public.notifications
  where user_id = auth.uid() and (expires_at is null or expires_at > now())
  order by pinned desc, created_at desc, id desc limit least(greatest(p_limit, 1), 200)
$$;
create or replace function public.unread_notification_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null and (expires_at is null or expires_at > now())
$$;
create or replace function public.mark_notification_read(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = coalesce(read_at, now()) where id = p_id and user_id = auth.uid()
$$;
create or replace function public.mark_all_notifications_read(p_category text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null and (p_category is null or category = p_category);
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.my_muted_categories() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select muted from public.notification_prefs where user_id = auth.uid()), '{}')
$$;
create or replace function public.set_notification_mute(p_category text, p_muted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_category in ('complaint_update','admin_message') then raise exception 'this category cannot be muted'; end if;
  if p_category not in ('menu_change','timings','closure','special_meal','addon','feedback_request','general') then raise exception 'bad category'; end if;
  insert into public.notification_prefs (user_id, muted) values (auth.uid(), case when p_muted then array[p_category] else '{}' end)
  on conflict (user_id) do update set muted = case when p_muted then (select array(select distinct unnest(notification_prefs.muted || p_category)))
                                                   else array_remove(notification_prefs.muted, p_category) end;
end $$;

-- ── anonymous-safe public updates: closures, special meals, timings only; no author, no recipients, never anything personal ──
create or replace function public.public_announcements() returns table (id uuid, title text, body text, category text, mess_ids text[], pinned boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, title, body, category, mess_ids, pinned, created_at from public.announcements
  where is_public and category in ('closure','special_meal','timings') and (expires_at is null or expires_at > now())
  order by pinned desc, created_at desc limit 30
$$;

-- ── automatic: complaint status changes ──
create or replace function public.notify_complaint_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.complaints;
begin
  select * into c from public.complaints where id = new.complaint_id;
  perform public._notify(c.filer_id, 'complaint_update',
    case new.kind when 'resolved' then 'Your complaint was resolved' when 'in_progress' then 'Your complaint is being worked on' else 'Your complaint cannot be resolved' end,
    left(coalesce(c.reply, ''), 500),
    public._profile_link(c.filer_id, '/dashboard/student/complaints', '/dashboard/parent/complaints'));
  return null;
end $$;
create trigger complaint_events_notify after insert on public.complaint_events
  for each row when (new.kind in ('resolved','in_progress','cannot_resolve')) execute function public.notify_complaint_event();

-- ── automatic: the mess admin replies in a direct-message thread ──
create or replace function public.notify_admin_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._notify(new.student_id, 'admin_message', 'Message from your mess admin', left(new.body, 300), '/dashboard/student');
  return null;
end $$;
create trigger admin_messages_notify after insert on public.admin_messages
  for each row when (new.sender = 'admin') execute function public.notify_admin_message();

-- ── automatic: add-on goes on sale (only edits by a signed-in user, e.g. upsert_addon) ──
create or replace function public.notify_addon() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if auth.uid() is null or not new.active or new.stock_total <= new.sold then return null; end if;
  if tg_op = 'UPDATE' and old.active and old.stock_total > old.sold then return null; end if;   -- only the moment it goes on sale
  for r in select id from public.profiles where role = 'student' and assigned_mess_id = new.mess_id loop
    perform public._notify(r.id, 'addon', 'New add-on on sale: ' || new.name, 'Rs ' || (new.price_paise / 100.0)::numeric(10,2)::text || ' while stock lasts.', '/dashboard/student/extras');
  end loop;
  return null;
end $$;
create trigger addons_notify after insert or update on public.addons for each row execute function public.notify_addon();

-- ── automatic: meal timings edited by a mess admin / warden ──
create or replace function public.notify_slot_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if auth.uid() is null or (new.starts = old.starts and new.ends = old.ends) then return null; end if;
  for r in select id from public.profiles where role = 'student' and assigned_mess_id = new.mess_id loop
    perform public._notify(r.id, 'timings', initcap(new.slot) || ' timings changed',
      initcap(new.slot) || ' is now ' || to_char(new.starts, 'HH24:MI') || ' to ' || to_char(new.ends, 'HH24:MI') || '.', '/dashboard/student');
  end loop;
  return null;
end $$;
create trigger mess_slots_notify after update on public.mess_slots for each row execute function public.notify_slot_change();

-- ── automatic: 40-minute feedback prompt (created the first time it is due) ──
alter table public.feedback_prompts add column notified boolean not null default false;

create or replace function public.my_feedback_prompts()
returns table (redemption_id uuid, mess_id text, slot text, meal_date date, due_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if public.get_my_role() <> 'student' then return; end if;
  insert into public.feedback_prompts (redemption_id, student_id, mess_id, slot, meal_date, due_at)
  select m.id, m.student_id, m.mess_id, m.slot, m.meal_date, m.scanned_at + interval '40 minutes'
  from public.meal_redemptions m
  where m.student_id = auth.uid() and m.status = 'accepted' and m.scanned_at > now() - interval '24 hours'
  on conflict do nothing;
  for r in update public.feedback_prompts p set notified = true
            where p.student_id = auth.uid() and p.status = 'pending' and p.due_at <= now() and not p.notified returning p.slot loop
    perform public._notify(auth.uid(), 'feedback_request', 'How was your ' || r.slot || '?', 'Rate it: it takes 20 seconds.', '/dashboard/student/feedback');
  end loop;
  return query
  select p.redemption_id, p.mess_id, p.slot, p.meal_date, p.due_at from public.feedback_prompts p
  where p.student_id = auth.uid() and p.status = 'pending' and p.due_at <= now() and (p.snooze_until is null or p.snooze_until <= now())
  order by p.due_at;
end $$;

create or replace function public.simulate_feedback_due() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform count(*) from public.my_feedback_prompts();
  update public.feedback_prompts set due_at = now(), snooze_until = null
   where redemption_id = (select redemption_id from public.feedback_prompts where student_id = auth.uid() and status = 'pending' order by due_at desc limit 1);
  get diagnostics n = row_count;
  perform count(*) from public.my_feedback_prompts();   -- fires the notification right away
  return n;
end $$;

revoke execute on function public._notify(uuid, text, text, text, text, uuid, boolean, timestamptz), public._profile_link(uuid, text, text),
  public._publish_announcement(uuid, text, text, text, boolean, timestamptz, text[], boolean), public.post_announcement(text, text, text, boolean, timestamptz, text[], boolean),
  public.end_announcement(uuid), public.my_announcements(), public.my_notifications(integer), public.unread_notification_count(), public.mark_notification_read(bigint),
  public.mark_all_notifications_read(text), public.my_muted_categories(), public.set_notification_mute(text, boolean), public.public_announcements(),
  public.notify_complaint_event(), public.notify_admin_message(), public.notify_addon(), public.notify_slot_change() from public, anon, authenticated;
grant execute on function public.post_announcement(text, text, text, boolean, timestamptz, text[], boolean), public.end_announcement(uuid), public.my_announcements(),
  public.my_notifications(integer), public.unread_notification_count(), public.mark_notification_read(bigint), public.mark_all_notifications_read(text),
  public.my_muted_categories(), public.set_notification_mute(text, boolean) to authenticated;
grant execute on function public.public_announcements() to anon, authenticated, service_role;
