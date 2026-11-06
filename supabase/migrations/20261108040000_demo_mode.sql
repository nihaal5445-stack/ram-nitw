-- DEMO MODE: when on, "now" always counts as inside an open meal slot for every mess (the slot containing the time, else the
-- nearest one). Set by `npm run demo:prep` / scripts/demo-mode.mjs from DEMO_MODE in .env.local. Default OFF = real slot rules.
create table public.app_settings (key text primary key, value text not null);
insert into public.app_settings values ('demo_mode', 'off');
alter table public.app_settings enable row level security;
revoke all on public.app_settings from public, anon, authenticated;   -- service role / security-definer functions only

create or replace function public.demo_mode() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'on' from public.app_settings where key = 'demo_mode'), false)
$$;

-- Slot for a mess at an instant. Real rules: window +/- 15 min. Demo: containing window, else the nearest window.
-- (src/lib/access/slots.ts slotAt() implements the same rule for the offline scanner: keep them in step.)
create or replace function public.effective_slot(p_mess text, p_ts timestamptz) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_min numeric := extract(epoch from ((p_ts at time zone 'Asia/Kolkata')::time)) / 60; v_slot text;
begin
  if public.demo_mode() then
    select slot into v_slot from public.mess_slots where mess_id = p_mess
     order by case when v_min >= extract(epoch from starts) / 60 and v_min < extract(epoch from ends) / 60 then 0
                   else 1 + least(abs(v_min - extract(epoch from starts) / 60), abs(v_min - extract(epoch from ends) / 60)) end, starts
     limit 1;
  else
    select slot into v_slot from public.mess_slots where mess_id = p_mess
       and v_min >= extract(epoch from starts) / 60 - 15 and v_min < extract(epoch from ends) / 60 + 15 limit 1;
  end if;
  return v_slot;
end $$;

revoke execute on function public.demo_mode(), public.effective_slot(text, timestamptz) from public, anon, authenticated;
grant execute on function public.demo_mode() to anon, authenticated, service_role;   -- the header badge reads it
