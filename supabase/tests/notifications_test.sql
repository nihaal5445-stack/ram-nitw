-- ─────────────────────────────────────────────────────────────────────────────
-- Notifications: targeting (own mess / selected messes / all; parents of targeted students), privacy (RLS), mutes, expiry, public view,
-- automatic notifications (complaint status, admin message, add-on, timings, feedback). Run: npm run test:db. Everything rolls back.
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
  P   uuid := '22222222-2222-2222-2222-222222222222';  -- parent of S1
  n integer; ann uuid; cid uuid;
begin
  delete from public.notifications; delete from public.announcements;   -- rolled back at the end

  -- ── who may post ──
  perform pg_temp.as_user(S1);
  perform pg_temp.t('a student cannot post', pg_temp.err($q$select public.post_announcement('Hello there', 'Some text', 'general')$q$) like '%not authorized%');
  perform pg_temp.as_user(P);
  perform pg_temp.t('a parent cannot post', pg_temp.err($q$select public.post_announcement('Hello there', 'Some text', 'general')$q$) like '%not authorized%');
  perform pg_temp.as_user(C);
  perform pg_temp.t('counter staff cannot post', pg_temp.err($q$select public.post_announcement('Hello there', 'Some text', 'general')$q$) like '%not authorized%');

  -- ── mess admin: own mess only ──
  perform pg_temp.as_user(A_A);
  perform pg_temp.t('IFC-A admin cannot target IFC-B', pg_temp.err($q$select public.post_announcement('Hello there', 'Some text', 'general', false, null, array['ifc-b'])$q$) like 'wrong_mess%');
  perform pg_temp.t('IFC-A admin cannot target [IFC-A, IFC-B]', pg_temp.err($q$select public.post_announcement('Hello there', 'Some text', 'general', false, null, array['ifc-a','ifc-b'])$q$) like 'wrong_mess%');
  perform pg_temp.t('automatic categories cannot be posted by hand', pg_temp.err($q$select public.post_announcement('Hello there', 'Some text', 'complaint_update')$q$) like '%bad category%');
  perform pg_temp.t('past expiry refused', pg_temp.err($q$select public.post_announcement('Hello there', 'Some text', 'general', false, now() - interval '1 hour')$q$) like '%future%');
  perform pg_temp.t('too short a title refused', pg_temp.err($q$select public.post_announcement('Hi', 'Some text', 'general')$q$) like '%required%');
  n := public.post_announcement('Lunch menu changed', 'Today lunch has a new curry.', 'menu_change', true);
  perform pg_temp.as_postgres();
  perform pg_temp.t('IFC-A post reaches IFC-A students and their parents only (S1 + parent P)', n = (select count(*) from public.profiles where (role = 'student' and assigned_mess_id = 'ifc-a') or (role = 'parent' and linked_student_id in (select id from public.profiles where role = 'student' and assigned_mess_id = 'ifc-a')))
    and exists (select 1 from public.notifications where user_id = S1) and exists (select 1 from public.notifications where user_id = P)
    and not exists (select 1 from public.notifications where user_id in (S2, A_A, A_B, W, C)), n::text);

  -- ── warden: one / several / all ──
  perform pg_temp.as_user(W);
  n := public.post_announcement('Krishna only', 'Only for Krishna Mess.', 'general', false, null, array['krishna']);
  perform pg_temp.as_postgres();
  perform pg_temp.t('warden to one mess (Krishna): neither S1 nor S2 gets it', not exists (select 1 from public.notifications where title = 'Krishna only' and user_id in (S1, S2, P)));
  perform pg_temp.as_user(W);
  perform public.post_announcement('Two messes', 'IFC-A and IFC-B.', 'general', false, null, array['ifc-a','ifc-b']);
  perform public.post_announcement('Everyone', 'All messes.', 'general');
  perform pg_temp.t('unknown mess refused', pg_temp.err($q$select public.post_announcement('Bad target', 'Nope nope.', 'general', false, null, array['nowhere'])$q$) like '%unknown mess%');
  perform pg_temp.as_postgres();
  perform pg_temp.t('several messes: S1 and S2 and parent P get it', (select count(*) from public.notifications where title = 'Two messes' and user_id in (S1, S2, P)) = 3);
  perform pg_temp.t('all messes (empty target): S1, S2, P get it', (select count(*) from public.notifications where title = 'Everyone' and user_id in (S1, S2, P)) = 3);

  -- ── privacy (RLS) ──
  perform pg_temp.as_user(S1);
  perform pg_temp.t('a student reads only their own notifications', (select count(*) from public.notifications where user_id <> S1) = 0 and (select count(*) from public.notifications) > 0);
  perform pg_temp.t('a student cannot insert / update others rows directly', pg_temp.err(format($q$insert into public.notifications (user_id, category, title) values (%L, 'general', 'x')$q$, S2)) like '%permission denied%'
    and pg_temp.err($q$update public.notifications set read_at = now()$q$) like '%permission denied%');
  perform pg_temp.t('a student cannot see announcements (only the poster does)', (select count(*) from public.announcements) = 0);
  perform pg_temp.as_user(P);
  perform pg_temp.t('a parent reads only their own', (select count(*) from public.notifications where user_id <> P) = 0);
  perform pg_temp.as_user(S2);
  perform pg_temp.t('S2 never sees the IFC-A-only post', not exists (select 1 from public.notifications where title = 'Lunch menu changed'));
  perform pg_temp.as_user(A_B);
  perform pg_temp.t('another admin cannot list or end IFC-A''s announcements', (select count(*) from public.my_announcements() where title = 'Lunch menu changed') = 0
    and pg_temp.err(format($q$select public.end_announcement(%L)$q$, (select id from public.announcements where title = 'Lunch menu changed'))) like '%not authorized%');
  perform pg_temp.as_postgres();
  perform pg_temp.t('anonymous cannot read notifications or call the inbox functions', pg_temp.err('set local role anon; select * from public.notifications') like '%permission denied%'
    and pg_temp.err('set local role anon; select * from public.my_notifications()') like '%permission denied%');
  perform pg_temp.as_postgres();

  -- ── read state, pin order ──
  perform pg_temp.as_user(S1);
  perform pg_temp.t('pinned notification comes first', (select title from public.my_notifications(1)) = 'Lunch menu changed');
  perform pg_temp.t('unread count counts all', public.unread_notification_count() = 3);
  perform public.mark_notification_read((select id from public.my_notifications(1)));
  perform pg_temp.t('mark one read', public.unread_notification_count() = 2);
  perform pg_temp.as_user(S2);
  perform pg_temp.t('marking someone else''s notification read does nothing', (select count(*) from public.notifications where read_at is not null) = 0);
  perform public.mark_notification_read((select id from public.notifications where title = 'Lunch menu changed' limit 1));
  perform pg_temp.as_postgres();
  perform pg_temp.t('...(S2 cannot touch S1''s row)', (select read_at is not null from public.notifications where user_id = S1 and title = 'Lunch menu changed') is true
    and (select count(*) from public.notifications where user_id = S1 and read_at is not null) = 1);
  perform pg_temp.as_user(S1);
  perform public.mark_all_notifications_read('general');
  perform pg_temp.t('mark all read (by category)', public.unread_notification_count() = 0 or (select count(*) from public.notifications where user_id = S1 and read_at is null and category = 'general') = 0);
  perform pg_temp.as_postgres();

  -- ── mutes ──
  perform pg_temp.as_user(S1);
  perform pg_temp.t('complaint updates cannot be muted', pg_temp.err($q$select public.set_notification_mute('complaint_update', true)$q$) like '%cannot be muted%');
  perform pg_temp.t('messages from admin cannot be muted', pg_temp.err($q$select public.set_notification_mute('admin_message', true)$q$) like '%cannot be muted%');
  perform public.set_notification_mute('special_meal', true); perform public.set_notification_mute('special_meal', true);
  perform pg_temp.t('a muted category is stored once', public.my_muted_categories() = array['special_meal']);
  perform pg_temp.as_user(A_A);
  perform public.post_announcement('Festive lunch', 'Sweets for all.', 'special_meal');
  perform public.post_announcement('Note from admin', 'Please read.', 'admin_message');
  perform pg_temp.as_postgres();
  perform pg_temp.t('muted special meal is not delivered to S1, but still reaches parent P', not exists (select 1 from public.notifications where user_id = S1 and title = 'Festive lunch') and exists (select 1 from public.notifications where user_id = P and title = 'Festive lunch'));
  perform pg_temp.t('admin_message always arrives', exists (select 1 from public.notifications where user_id = S1 and title = 'Note from admin'));
  perform pg_temp.as_user(S1); perform public.set_notification_mute('special_meal', false); perform pg_temp.as_postgres();

  -- ── expiry / ending ──
  perform pg_temp.as_user(A_A);
  perform public.post_announcement('Short lived', 'Gone soon.', 'general', false, now() + interval '1 hour');
  perform pg_temp.as_user(S1);
  perform pg_temp.t('an unexpired announcement is listed', exists (select 1 from public.my_notifications() where title = 'Short lived'));
  perform pg_temp.as_user(A_A);
  perform public.end_announcement((select id from public.announcements where title = 'Short lived'));
  perform pg_temp.as_user(S1);
  perform pg_temp.t('after ending it is hidden and not counted', not exists (select 1 from public.my_notifications() where title = 'Short lived'));
  perform pg_temp.as_postgres();
  update public.notifications set expires_at = now() - interval '1 minute' where title = 'Everyone';
  perform pg_temp.as_user(S1);
  perform pg_temp.t('an expired notification is hidden', not exists (select 1 from public.my_notifications() where title = 'Everyone'));
  perform pg_temp.as_postgres();

  -- ── public view ──
  perform pg_temp.as_user(A_A);
  perform public.post_announcement('Closed Sunday', 'Dinner is closed.', 'closure', false, null, null, true);
  perform public.post_announcement('Private menu tweak', 'Just for students.', 'menu_change', false, null, null, true);   -- public flag is forced off
  perform public.post_announcement('Hidden general', 'Not public.', 'general', false, null, null, true);
  perform pg_temp.as_postgres();
  perform pg_temp.t('public view: only public closure / special meal / timings', (select count(*) from public.public_announcements()) = 1 and (select title from public.public_announcements() limit 1) = 'Closed Sunday');
  perform pg_temp.t('public view exposes no author or recipient columns', (select count(*) from information_schema.columns where table_name = 'public_announcements') >= 0
    and not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where p.proname = 'public_announcements' and pg_get_function_result(p.oid) ~ '(created_by|user_id|recipient)'));
  perform pg_temp.t('the public function runs for anon', has_function_privilege('anon', 'public.public_announcements()', 'execute') and not has_function_privilege('anon', 'public.my_notifications(integer)', 'execute'));

  -- ── automatic: complaint status, admin message ──
  insert into public.complaints (filer_id, mess_id, category, meal_date, slot, body) values (S1, 'ifc-a', 'food_quality', current_date, 'dinner', 'The dal was cold today.') returning id into cid;
  perform pg_temp.as_user(A_A);
  perform public.respond_complaint(cid, 'in_progress', 'We are checking with the kitchen team.');
  perform pg_temp.as_user(S1);
  perform pg_temp.t('complaint status change notifies the filer (unmutable category)', exists (select 1 from public.my_notifications() where category = 'complaint_update' and title like '%worked on%' and body like '%kitchen%'));
  perform pg_temp.as_user(S2);
  perform pg_temp.t('...and nobody else', not exists (select 1 from public.notifications where category = 'complaint_update' and user_id <> S1));
  perform pg_temp.as_user(S1);
  perform public.send_student_message('Is the dosa batter fresh?');
  perform pg_temp.as_user(A_A);
  perform public.admin_reply_message(S1, 'Yes, it is made every morning.');
  perform pg_temp.as_user(S1);
  perform pg_temp.t('admin reply in a thread notifies the student (category: message from admin)', exists (select 1 from public.my_notifications() where category = 'admin_message' and title = 'Message from your mess admin'));
  perform pg_temp.as_postgres();

  -- ── automatic: add-on on sale, timings ──
  insert into public.addons (mess_id, name, price_paise, stock_total) values ('ifc-a', 'Quiet seed add-on', 1000, 5);
  perform pg_temp.t('seeding / service-role inserts stay silent (no signed-in user)', not exists (select 1 from public.notifications where title like '%Quiet seed%'));
  perform pg_temp.as_user(A_A);
  perform public.upsert_addon(null, 'Paneer Roll', 4000, 10, true, true);
  perform pg_temp.as_postgres();
  perform pg_temp.t('new add-on on sale notifies IFC-A students only', exists (select 1 from public.notifications where user_id = S1 and category = 'addon' and title like '%Paneer Roll%') and not exists (select 1 from public.notifications where user_id = S2 and category = 'addon'));
  perform set_config('request.jwt.claims', json_build_object('sub', A_A, 'role', 'authenticated')::text, true);
  update public.mess_slots set ends = ends where mess_id = 'ifc-a';
  perform pg_temp.as_postgres();
  perform pg_temp.t('a slot update that changes nothing sends nothing', not exists (select 1 from public.notifications where category = 'timings' and title like '%timings changed'));
  update public.mess_slots set ends = ends + interval '15 minutes' where mess_id = 'ifc-a' and slot = 'lunch';
  perform pg_temp.t('service-role timing edits stay silent', not exists (select 1 from public.notifications where category = 'timings' and title like '%timings changed'));
  perform set_config('request.jwt.claims', json_build_object('sub', A_A, 'role', 'authenticated')::text, true);
  update public.mess_slots set ends = ends + interval '15 minutes' where mess_id = 'ifc-a' and slot = 'lunch';
  perform pg_temp.as_postgres();
  perform pg_temp.t('a signed-in timing edit notifies that mess''s students only', exists (select 1 from public.notifications where user_id = S1 and title = 'Lunch timings changed' and body like '%14:30%') and not exists (select 1 from public.notifications where user_id = S2 and category = 'timings' and title like '%changed'));

  -- ── automatic: feedback prompt, once ──
  insert into public.meal_redemptions (id, student_id, mess_id, meal_date, slot, method, scanned_at, status)
  values (gen_random_uuid(), S1, 'ifc-a', current_date, 'breakfast', 'qr', now() - interval '50 minutes', 'accepted');
  perform pg_temp.as_user(S1);
  perform count(*) from public.my_feedback_prompts(); perform count(*) from public.my_feedback_prompts();
  perform pg_temp.t('the 40-minute feedback prompt creates exactly one notification', (select count(*) from public.my_notifications() where category = 'feedback_request') = 1);
  perform pg_temp.as_postgres();
end $$;

select n, name, case when ok then 'PASS' else 'FAIL' end as result, coalesce(detail, '') as detail from _r order by n;
do $$ begin
  if exists (select 1 from _r where not ok) then raise exception 'NOTIFICATION TESTS FAILED: %', (select string_agg(name, '; ') from _r where not ok); end if;
  raise notice 'ALL % NOTIFICATION TESTS PASSED', (select count(*) from _r);
end $$;
rollback;
