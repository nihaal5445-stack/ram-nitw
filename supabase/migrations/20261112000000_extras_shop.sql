-- "Extras" shop: items with photo / veg flag, a cart checkout (one single-use ticket per unit), orders for the admin.
alter table public.addons add column veg boolean not null default true,
  add column photo text check (photo is null or photo ~ '^[a-z-]{2,30}$');
update public.addons set veg = false where name ilike '%chicken%' or name ilike '%egg%' or name ilike '%fish%';
update public.addons set photo = case when name ilike '%chicken%' then 'biryani' when name ilike '%paneer%' then 'pav-bhaji' else 'grab-go' end where photo is null;

create table public.extras_orders (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id),
  mess_id        text not null,
  amount_paise   integer not null,
  payment_ref    text not null,
  order_id       text not null,
  payment_method text not null,
  created_at     timestamptz not null default now()
);
alter table public.extras_orders enable row level security;
revoke all on public.extras_orders from public, anon, authenticated;
grant select on public.extras_orders to authenticated;
create policy "extras_orders: own" on public.extras_orders for select to authenticated using (student_id = auth.uid());
alter table public.addon_purchases add column extras_order uuid references public.extras_orders(id);
alter table public.addon_orders add column items jsonb;
alter table public.addon_orders alter column addon_id drop not null;

create or replace function public._buy_cart(p_student uuid, p_items jsonb, p_ref text, p_order text, p_method text, p_dry boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_mess text; v_role user_role; v_addon public.addons; v_item jsonb; v_qty int; v_total int := 0; v_count int := 0;
  v_local time := (now() at time zone 'Asia/Kolkata')::time; v_date date := (now() at time zone 'Asia/Kolkata')::date;
  v_slot text; v_order uuid; v_pid uuid; v_tickets jsonb := '[]'::jsonb; i int; v_at timestamptz;
begin
  select role, assigned_mess_id into v_role, v_mess from public.profiles where id = p_student;
  if v_role is distinct from 'student' then raise exception 'only students can buy extras' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 10 then raise exception 'empty_cart'; end if;
  if (select count(distinct value->>'addon_id') from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) then raise exception 'duplicate_items'; end if;
  if public.demo_mode() then v_slot := public.effective_slot(v_mess, now());
  else select slot into v_slot from public.mess_slots where mess_id = v_mess and v_local < ends order by starts limit 1; end if;
  if v_slot is null then raise exception 'no_slot_left_today'; end if;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'addon_id' loop
    v_qty := (v_item->>'qty')::int;
    if v_qty is null or v_qty not between 1 and 5 then raise exception 'bad_quantity'; end if;
    select * into v_addon from public.addons where id = (v_item->>'addon_id')::uuid for update;
    if v_addon.id is null or not v_addon.active or v_addon.mess_id is distinct from v_mess then raise exception 'add-on not available' using errcode = '42501'; end if;
    if v_addon.sold + v_qty > v_addon.stock_total then raise exception 'sold_out: %', v_addon.name; end if;
    v_total := v_total + v_addon.price_paise * v_qty; v_count := v_count + v_qty;
  end loop;
  if v_count > 10 then raise exception 'too_many_items'; end if;
  if p_dry then return jsonb_build_object('slot', v_slot, 'amount_paise', v_total, 'count', v_count); end if;
  insert into public.extras_orders (student_id, mess_id, amount_paise, payment_ref, order_id, payment_method)
  values (p_student, v_mess, v_total, p_ref, p_order, p_method) returning id, created_at into v_order, v_at;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'addon_id' loop
    v_qty := (v_item->>'qty')::int;
    select * into v_addon from public.addons where id = (v_item->>'addon_id')::uuid;
    update public.addons set sold = sold + v_qty where id = v_addon.id;
    for i in 1..v_qty loop
      insert into public.addon_purchases (addon_id, student_id, mess_id, meal_date, slot, amount_paise, payment_ref, order_id, payment_method, extras_order)
      values (v_addon.id, p_student, v_mess, v_date, v_slot, v_addon.price_paise, p_ref, p_order, p_method, v_order) returning id into v_pid;
      v_tickets := v_tickets || jsonb_build_object('id', v_pid, 'name', v_addon.name, 'n', i, 'of', v_qty);
    end loop;
  end loop;
  return jsonb_build_object('id', v_order, 'order_id', p_order, 'payment_ref', p_ref, 'method', p_method, 'amount_paise', v_total,
                            'created_at', v_at, 'slot', v_slot, 'meal_date', v_date, 'count', v_count, 'tickets', v_tickets,
                            'name', v_count || (case when v_count = 1 then ' item' else ' items' end));
end $$;

create or replace function public.buy_cart(p_items jsonb, p_method text default 'test') returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() <> 'student' then raise exception 'only students can buy extras' using errcode = '42501'; end if;
  if coalesce((select value from public.app_settings where key = 'payment_mode'), 'mock') <> 'mock' then raise exception 'payment_required'; end if;
  if p_method not in ('test','upi','card','wallet') then raise exception 'bad method'; end if;
  return public._buy_cart(auth.uid(), p_items, 'TEST-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
                          'order_TEST_' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)), p_method);
end $$;
create or replace function public.cart_precheck(p_student uuid, p_items jsonb) returns jsonb
language sql security definer set search_path = public as $$ select public._buy_cart(p_student, p_items, null, null, 'razorpay', true) $$;
create or replace function public.record_paid_cart(p_student uuid, p_items jsonb, p_payment_id text, p_order_id text) returns jsonb
language sql security definer set search_path = public as $$ select public._buy_cart(p_student, p_items, p_payment_id, p_order_id, 'razorpay') $$;

create or replace function public.admin_extras_orders() returns table (id uuid, created_at timestamptz, student_name text, roll text, amount_paise integer, payment_method text, payment_ref text, items jsonb, tickets integer, used integer)
language sql stable security definer set search_path = public as $$
  select o.id, o.created_at, p.full_name, p.roll_number, o.amount_paise, o.payment_method, o.payment_ref,
         (select jsonb_agg(jsonb_build_object('name', a.name, 'qty', x.c)) from (select addon_id, count(*) c from public.addon_purchases where extras_order = o.id group by addon_id) x join public.addons a on a.id = x.addon_id),
         (select count(*)::int from public.addon_purchases where extras_order = o.id),
         (select count(*)::int from public.addon_purchases where extras_order = o.id and status = 'redeemed')
  from public.extras_orders o join public.profiles p on p.id = o.student_id
  where (public.get_my_role() = 'mess_admin' and o.mess_id = public.get_my_assigned_mess_id()) or public.get_my_role() = 'warden'
  order by o.created_at desc limit 100
$$;

-- admin: create/edit/restock (the new veg + photo fields)
drop function public.upsert_addon(uuid, text, integer, integer, boolean);
create or replace function public.upsert_addon(p_id uuid, p_name text, p_price_paise integer, p_stock integer, p_active boolean default true, p_veg boolean default true, p_photo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_mess text := public.get_my_assigned_mess_id(); v_id uuid;
begin
  if public.get_my_role() <> 'mess_admin' or v_mess is null then raise exception 'only a mess admin can manage add-ons' using errcode = '42501'; end if;
  if v_mess = 'ifc-a' and (not p_veg or lower(p_name) ~ '(chicken|mutton|egg|fish|prawn|meat|beef|pork|biryani)') then
    raise exception 'IFC-A is pure vegetarian: non-veg add-ons are not allowed' using errcode = '23514';
  end if;
  if p_id is null then
    insert into public.addons (mess_id, name, price_paise, stock_total, active, veg, photo) values (v_mess, trim(p_name), p_price_paise, p_stock, p_active, p_veg, p_photo) returning id into v_id;
  else
    update public.addons set name = trim(p_name), price_paise = p_price_paise, stock_total = p_stock, active = p_active, veg = p_veg, photo = coalesce(p_photo, photo)
     where id = p_id and mess_id = v_mess returning id into v_id;
    if v_id is null then raise exception 'add-on not found in your mess' using errcode = '42501'; end if;
  end if;
  return v_id;
end $$;

revoke execute on function public._buy_cart(uuid, jsonb, text, text, text, boolean), public.buy_cart(jsonb, text), public.cart_precheck(uuid, jsonb),
  public.record_paid_cart(uuid, jsonb, text, text), public.admin_extras_orders(), public.upsert_addon(uuid, text, integer, integer, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.buy_cart(jsonb, text), public.admin_extras_orders(), public.upsert_addon(uuid, text, integer, integer, boolean, boolean, text) to authenticated;
grant execute on function public.cart_precheck(uuid, jsonb), public.record_paid_cart(uuid, jsonb, text, text) to service_role;
