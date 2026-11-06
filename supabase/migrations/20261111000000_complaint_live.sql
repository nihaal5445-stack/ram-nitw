-- Live complaints for the mess admin: a tiny Realtime broadcast on every new complaint (mess id only, no text, no filer),
-- plus "unseen" tracking for the unread badge.
alter table public.complaints add column seen_by_admin boolean not null default false;

create or replace function public.broadcast_complaint() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform realtime.send(jsonb_build_object('mess_id', new.mess_id), 'complaint', 'complaints', false);
  return null;
end $$;
revoke execute on function public.broadcast_complaint() from public, anon, authenticated;
create trigger complaints_broadcast after insert on public.complaints for each row execute function public.broadcast_complaint();

create or replace function public.admin_unseen_complaints() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.complaints
  where public.get_my_role() = 'mess_admin' and mess_id = public.get_my_assigned_mess_id() and not seen_by_admin and status in ('open','in_progress')
$$;
create or replace function public.mark_complaints_seen() returns void
language sql security definer set search_path = public as $$
  update public.complaints set seen_by_admin = true
  where public.get_my_role() = 'mess_admin' and mess_id = public.get_my_assigned_mess_id() and not seen_by_admin
$$;
revoke execute on function public.admin_unseen_complaints(), public.mark_complaints_seen() from public, anon, authenticated;
grant execute on function public.admin_unseen_complaints(), public.mark_complaints_seen() to authenticated;
