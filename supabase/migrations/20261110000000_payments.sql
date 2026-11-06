-- Payments for add-ons: receipts, Razorpay orders, and a payment_mode switch.
-- mock mode (default): students may call buy_addon directly (the "Test payment" sheet). razorpay mode: the server verifies the
-- Razorpay signature and then calls record_paid_addon (service role); buy_addon refuses direct calls.
alter table public.addon_purchases add column order_id text, add column payment_method text not null default 'test'
  check (payment_method in ('test','upi','card','wallet','razorpay'));

create table public.addon_orders (
  order_id     text primary key,
  student_id   uuid not null references public.profiles(id),
  addon_id     uuid not null references public.addons(id),
  amount_paise integer not null,
  status       text not null default 'created' check (status in ('created','paid')),
  created_at   timestamptz not null default now()
);
alter table public.addon_orders enable row level security;
revoke all on public.addon_orders from public, anon, authenticated;   -- service role only

insert into public.app_settings values ('payment_mode', 'mock') on conflict do nothing;

-- shared purchase logic (no auth.uid(): the caller authenticates the student)
create or replace function public._buy_addon(p_student uuid, p_addon uuid, p_ref text, p_order text, p_method text, p_dry boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_mess text; v_role user_role; v_addon public.addons;
  v_local time := (now() at time zone 'Asia/Kolkata')::time; v_date date := (now() at time zone 'Asia/Kolkata')::date;
  v_slot text; v_id uuid; v_at timestamptz;
begin
  select role, assigned_mess_id into v_role, v_mess from public.profiles where id = p_student;
  if v_role is distinct from 'student' then raise exception 'only students can buy add-ons' using errcode = '42501'; end if;
  select * into v_addon from public.addons where id = p_addon for update;
  if v_addon.id is null or not v_addon.active or v_addon.mess_id is distinct from v_mess then raise exception 'add-on not available' using errcode = '42501'; end if;
  if public.demo_mode() then v_slot := public.effective_slot(v_mess, now());
  else select slot into v_slot from public.mess_slots where mess_id = v_mess and v_local < ends order by starts limit 1; end if;
  if v_slot is null then raise exception 'no_slot_left_today'; end if;
  if v_addon.sold >= v_addon.stock_total then raise exception 'sold_out'; end if;
  if exists (select 1 from public.addon_purchases where student_id = p_student and addon_id = p_addon and meal_date = v_date and slot = v_slot) then
    raise exception 'already_bought_for_this_slot';
  end if;
  if p_dry then return jsonb_build_object('slot', v_slot, 'amount_paise', v_addon.price_paise, 'name', v_addon.name); end if;
  insert into public.addon_purchases (addon_id, student_id, mess_id, meal_date, slot, amount_paise, payment_ref, order_id, payment_method)
  values (p_addon, p_student, v_mess, v_date, v_slot, v_addon.price_paise, p_ref, p_order, p_method) returning id, created_at into v_id, v_at;
  update public.addons set sold = sold + 1 where id = p_addon;
  return jsonb_build_object('id', v_id, 'slot', v_slot, 'meal_date', v_date, 'payment_ref', p_ref, 'order_id', p_order, 'method', p_method,
                            'amount_paise', v_addon.price_paise, 'created_at', v_at, 'name', v_addon.name);
end $$;

drop function public.buy_addon(uuid);
create or replace function public.buy_addon(p_addon uuid, p_method text default 'test') returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() <> 'student' then raise exception 'only students can buy add-ons' using errcode = '42501'; end if;
  if coalesce((select value from public.app_settings where key = 'payment_mode'), 'mock') <> 'mock' then raise exception 'payment_required'; end if;
  if p_method not in ('test','upi','card','wallet') then raise exception 'bad method'; end if;
  return public._buy_addon(auth.uid(), p_addon, 'TEST-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
                           'order_TEST_' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)), p_method);
end $$;

-- service role only: checks (no side effects) / records a purchase after the server verified a Razorpay payment
create or replace function public.addon_precheck(p_student uuid, p_addon uuid) returns jsonb
language sql security definer set search_path = public as $$ select public._buy_addon(p_student, p_addon, null, null, 'razorpay', true) $$;
create or replace function public.record_paid_addon(p_student uuid, p_addon uuid, p_payment_id text, p_order_id text) returns jsonb
language sql security definer set search_path = public as $$ select public._buy_addon(p_student, p_addon, p_payment_id, p_order_id, 'razorpay') $$;

revoke execute on function public._buy_addon(uuid, uuid, text, text, text, boolean), public.buy_addon(uuid, text),
  public.addon_precheck(uuid, uuid), public.record_paid_addon(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.buy_addon(uuid, text) to authenticated;
grant execute on function public.addon_precheck(uuid, uuid), public.record_paid_addon(uuid, uuid, text, text) to service_role;
