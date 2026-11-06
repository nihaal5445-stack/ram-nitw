-- Add-on tokens (e.g. non-veg curry): mess admin defines items, students pay (MOCK, "Test payment"), a signed
-- one-slot QR is issued by the server, the existing offline scanner accepts it once and the server marks it redeemed.

create table public.addons (
  id          uuid primary key default gen_random_uuid(),
  mess_id     text not null,
  name        text not null check (length(name) between 2 and 60),
  price_paise integer not null check (price_paise >= 0 and price_paise <= 100000),
  stock_total integer not null check (stock_total >= 0),
  sold        integer not null default 0 check (sold >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (sold <= stock_total)
);

create table public.addon_purchases (
  id           uuid primary key default gen_random_uuid(),
  addon_id     uuid not null references public.addons(id),
  student_id   uuid not null references public.profiles(id),
  mess_id      text not null,
  meal_date    date not null,
  slot         text not null check (slot in ('breakfast','lunch','snacks','dinner')),
  amount_paise integer not null,
  payment_ref  text not null,                   -- MOCK transaction id, "TEST-XXXXXXXX"; no real money moves
  status       text not null default 'paid' check (status in ('paid','redeemed')),
  created_at   timestamptz not null default now(),
  redeemed_at  timestamptz,
  scanner_id   uuid references public.scanner_devices(id)
);
create index addon_purchases_student on public.addon_purchases (student_id, created_at desc);
create index addon_purchases_mess on public.addon_purchases (mess_id, meal_date);

-- Server ECDSA key that signs add-on tickets. Only the PUBLIC key ever leaves the server (scanners verify offline).
create table public.addon_keys (
  id          integer primary key default 1 check (id = 1),
  public_key  text not null,
  private_jwk text not null
);

alter table public.addons enable row level security;
alter table public.addon_purchases enable row level security;
alter table public.addon_keys enable row level security;
revoke all on public.addons, public.addon_purchases, public.addon_keys from public, anon, authenticated;
grant select on public.addons, public.addon_purchases to authenticated;

create policy "addons: read own mess or warden" on public.addons for select to authenticated
  using (mess_id = public.get_my_assigned_mess_id() or public.get_my_role() = 'warden');
create policy "addon_purchases: own" on public.addon_purchases for select to authenticated using (student_id = auth.uid());
create policy "addon_purchases: staff of the mess, warden" on public.addon_purchases for select to authenticated
  using ((public.get_my_role() in ('counter_staff','mess_admin') and mess_id = public.get_my_assigned_mess_id()) or public.get_my_role() = 'warden');
-- addon_keys: no policy, no grant: service role only.

create or replace function public.upsert_addon(p_id uuid, p_name text, p_price_paise integer, p_stock integer, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_mess text := public.get_my_assigned_mess_id(); v_id uuid;
begin
  if public.get_my_role() <> 'mess_admin' or v_mess is null then raise exception 'only a mess admin can manage add-ons' using errcode = '42501'; end if;
  -- IFC-A is pure vegetarian (docs/SPEC): refuse obviously non-veg item names there. TODO: verify the rule with the warden's office.
  if v_mess = 'ifc-a' and lower(p_name) ~ '(chicken|mutton|egg|fish|prawn|meat|beef|pork|biryani)' then
    raise exception 'IFC-A is pure vegetarian: non-veg add-ons are not allowed' using errcode = '23514';
  end if;
  if p_id is null then
    insert into public.addons (mess_id, name, price_paise, stock_total, active) values (v_mess, trim(p_name), p_price_paise, p_stock, p_active) returning id into v_id;
  else
    update public.addons set name = trim(p_name), price_paise = p_price_paise, stock_total = p_stock, active = p_active
     where id = p_id and mess_id = v_mess returning id into v_id;
    if v_id is null then raise exception 'add-on not found in your mess' using errcode = '42501'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.buy_addon(p_addon uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_mess text := public.get_my_assigned_mess_id(); v_addon public.addons;
  v_local time := (now() at time zone 'Asia/Kolkata')::time; v_date date := (now() at time zone 'Asia/Kolkata')::date;
  v_slot text; v_ref text; v_id uuid;
begin
  if public.get_my_role() <> 'student' then raise exception 'only students can buy add-ons' using errcode = '42501'; end if;
  select * into v_addon from public.addons where id = p_addon for update;
  if v_addon.id is null or not v_addon.active or v_addon.mess_id is distinct from v_mess then raise exception 'add-on not available' using errcode = '42501'; end if;
  -- the slot being served now, else the next one today (a ticket is valid for that slot only)
  if public.demo_mode() then v_slot := public.effective_slot(v_mess, now());
  else select slot into v_slot from public.mess_slots where mess_id = v_mess and v_local < ends order by starts limit 1; end if;
  if v_slot is null then raise exception 'no_slot_left_today'; end if;
  if v_addon.sold >= v_addon.stock_total then raise exception 'sold_out'; end if;
  if exists (select 1 from public.addon_purchases where student_id = v_uid and addon_id = p_addon and meal_date = v_date and slot = v_slot) then
    raise exception 'already_bought_for_this_slot';
  end if;
  v_ref := 'TEST-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  insert into public.addon_purchases (addon_id, student_id, mess_id, meal_date, slot, amount_paise, payment_ref)
  values (p_addon, v_uid, v_mess, v_date, v_slot, v_addon.price_paise, v_ref) returning id into v_id;
  update public.addons set sold = sold + 1 where id = p_addon;
  return jsonb_build_object('id', v_id, 'slot', v_slot, 'meal_date', v_date, 'payment_ref', v_ref);
end $$;

-- Service role only: called by /api/scanner/sync after the scanner (offline) accepted a ticket.
create or replace function public.redeem_addon(p_staff_id uuid, p_scanner_id uuid, p_purchase_id uuid, p_scanned_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_scanner public.scanner_devices; v_p public.addon_purchases; v_local time; v_start time; v_end time;
begin
  select * into v_scanner from public.scanner_devices where id = p_scanner_id and revoked_at is null;
  if v_scanner.id is null or v_scanner.staff_id <> p_staff_id then raise exception 'not authorized for this scanner' using errcode = '42501'; end if;
  select * into v_p from public.addon_purchases where id = p_purchase_id for update;
  if v_p.id is null then return jsonb_build_object('status','rejected','reason','unknown_ticket'); end if;
  if v_p.mess_id <> v_scanner.mess_id then return jsonb_build_object('status','rejected','reason','wrong_mess'); end if;
  select starts, ends into v_start, v_end from public.mess_slots where mess_id = v_p.mess_id and slot = v_p.slot;
  v_local := (p_scanned_at at time zone 'Asia/Kolkata')::time;
  -- real rules: inside the ticket's slot window +/- 15 min. DEMO MODE: any time that day.
  if (p_scanned_at at time zone 'Asia/Kolkata')::date <> v_p.meal_date
     or (not public.demo_mode() and (
          (extract(epoch from v_local)/60) < (extract(epoch from v_start)/60 - 15)
       or (extract(epoch from v_local)/60) >= (extract(epoch from v_end)/60 + 15))) then
    return jsonb_build_object('status','rejected','reason','outside_meal_time');
  end if;
  if v_p.status = 'redeemed' then return jsonb_build_object('status','duplicate','reason','already_redeemed'); end if;
  update public.addon_purchases set status = 'redeemed', redeemed_at = p_scanned_at, scanner_id = p_scanner_id where id = v_p.id;
  return jsonb_build_object('status','accepted');
end $$;

revoke execute on function public.upsert_addon(uuid, text, integer, integer, boolean), public.buy_addon(uuid),
  public.redeem_addon(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_addon(uuid, text, integer, integer, boolean), public.buy_addon(uuid) to authenticated;
grant execute on function public.redeem_addon(uuid, uuid, uuid, timestamptz) to service_role;

-- demo add-on so the feature is visible after a reset (stock is TODO: verify)
insert into public.addons (mess_id, name, price_paise, stock_total) values
  ('ifc-a', 'Paneer Butter Masala', 4000, 30), ('ifc-a', 'Gulab Jamun (2 pc)', 2000, 60), ('ifc-b', 'Chicken Curry', 5000, 40);
