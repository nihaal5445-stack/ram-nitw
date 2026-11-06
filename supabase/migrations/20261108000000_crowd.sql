-- Surge heatmap: live crowd per mess from accepted scans in the last 10 minutes vs capacity.
-- The only anonymous-readable surface is mess_crowd(); it returns aggregates, never rows or people.

create table public.mess_capacity (
  mess_id text primary key,
  seats   integer not null check (seats > 0)   -- TODO: verify with the Chief Warden's office (mirrors src/config/messes.ts)
);
insert into public.mess_capacity values ('ifc-a', 800), ('ifc-b', 800), ('krishna', 1000), ('priyadarshini', 600);

-- Demo-only arrivals (written by `npm run demo:crowd` with the service role). Real accepted scans count too.
create table public.demo_crowd_scans (
  id         bigserial primary key,
  mess_id    text not null,
  scanned_at timestamptz not null
);
create index demo_crowd_scans_idx on public.demo_crowd_scans (mess_id, scanned_at);

alter table public.mess_capacity enable row level security;
alter table public.demo_crowd_scans enable row level security;
revoke all on public.mess_capacity, public.demo_crowd_scans from public, anon, authenticated;
-- no policies: only security-definer functions and the service role touch these tables

-- Assumption (documented, adjustable): a mess is "full" (100%) when a quarter of its seats arrive within 10 minutes,
-- i.e. roughly a 40-minute stay. pct = scans_10m / (seats / 4).
create or replace function public.mess_crowd()
returns table (mess_id text, scans_10m integer, seats integer, pct integer, level text,
               slot text, slot_ends time, try_after time, includes_demo boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_local time := (now() at time zone 'Asia/Kolkata')::time;
begin
  return query
  with s as (
    select c.mess_id, c.seats,
      (select count(*) from public.meal_redemptions r
        where r.mess_id = c.mess_id and r.status = 'accepted' and r.scanned_at > now() - interval '10 minutes')::int as real_n,
      (select count(*) from public.demo_crowd_scans d
        where d.mess_id = c.mess_id and d.scanned_at > now() - interval '10 minutes')::int as demo_n,
      (select ms.slot from public.mess_slots ms where ms.mess_id = c.mess_id
         and v_local >= ms.starts and v_local < ms.ends limit 1) as cur_slot,
      (select ms.ends from public.mess_slots ms where ms.mess_id = c.mess_id
         and v_local >= ms.starts and v_local < ms.ends limit 1) as cur_end
    from public.mess_capacity c
  ), p as (
    select s.*, (s.real_n + s.demo_n) as n,
           least(999, round(100.0 * (s.real_n + s.demo_n) / (s.seats / 4.0)))::int as pct
    from s
  )
  select p.mess_id, p.n, p.seats, p.pct,
         case when p.n = 0 and p.cur_slot is null then 'closed'
              when p.pct < 50 then 'low' when p.pct < 80 then 'moderate' else 'busy' end,
         p.cur_slot, p.cur_end,
         case when p.pct >= 70 and (p.cur_end is null or (date_trunc('minute', v_local) + interval '20 minutes') < p.cur_end)
              then (ceil(extract(epoch from (v_local + interval '15 minutes')) / 300) * 300 * interval '1 second' + time '00:00')::time
              end,
         p.demo_n > 0
  from p order by p.mess_id;
end $$;

revoke execute on function public.mess_crowd() from public;
grant execute on function public.mess_crowd() to anon, authenticated, service_role;
