-- Live dashboards: when a scan is ACCEPTED (sync from a scanner), broadcast a tiny "scan" event on the public Realtime channel
-- "crowd". The payload is only the mess id (no student, no names). Clients refetch their aggregates; RLS still decides what they can read.
create or replace function public.broadcast_scan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' then
    perform realtime.send(jsonb_build_object('mess_id', new.mess_id), 'scan', 'crowd', false);
  end if;
  return null;
end $$;
revoke execute on function public.broadcast_scan() from public, anon, authenticated;
create trigger meal_redemptions_broadcast after insert on public.meal_redemptions for each row execute function public.broadcast_scan();
