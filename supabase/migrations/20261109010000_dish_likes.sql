-- "Like the food": one like per student per dish per day (dish_key '_meal' = the whole meal).
create table public.dish_likes (
  student_id uuid not null references public.profiles(id) on delete cascade,
  mess_id    text not null,
  meal_date  date not null,
  slot       text not null check (slot in ('breakfast','lunch','snacks','dinner')),
  dish_key   text not null check (dish_key ~ '^[A-Za-z_]{2,30}$'),
  created_at timestamptz not null default now(),
  primary key (student_id, meal_date, slot, dish_key)
);
create index dish_likes_mess_day on public.dish_likes (mess_id, meal_date);
alter table public.dish_likes enable row level security;
revoke all on public.dish_likes from public, anon, authenticated;
grant select on public.dish_likes to authenticated;
create policy "dish_likes: own" on public.dish_likes for select to authenticated using (student_id = auth.uid());

create or replace function public.toggle_dish_like(p_slot text, p_dish text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_mess text := public.get_my_assigned_mess_id(); v_date date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if public.get_my_role() <> 'student' or v_mess is null then raise exception 'students only' using errcode = '42501'; end if;
  if p_slot not in ('breakfast','lunch','snacks','dinner') then raise exception 'bad slot'; end if;
  delete from public.dish_likes where student_id = auth.uid() and meal_date = v_date and slot = p_slot and dish_key = p_dish;
  if found then return false; end if;
  insert into public.dish_likes (student_id, mess_id, meal_date, slot, dish_key) values (auth.uid(), v_mess, v_date, p_slot, p_dish);
  return true;
end $$;

-- Aggregates only (no student ids): anonymous-safe counts for today.
create or replace function public.dish_like_counts(p_mess text) returns table (slot text, dish_key text, n integer)
language sql stable security definer set search_path = public as $$
  select slot, dish_key, count(*)::int from public.dish_likes
  where mess_id = p_mess and meal_date = (now() at time zone 'Asia/Kolkata')::date group by slot, dish_key
$$;

create or replace function public.my_dish_likes() returns table (slot text, dish_key text)
language sql stable security definer set search_path = public as $$
  select slot, dish_key from public.dish_likes where student_id = auth.uid() and meal_date = (now() at time zone 'Asia/Kolkata')::date
$$;

-- Mess admin (own mess) and warden (all): most-liked dishes over the last N days.
create or replace function public.top_liked_dishes(p_days integer default 7) returns table (mess_id text, dish_key text, n integer)
language sql stable security definer set search_path = public as $$
  select l.mess_id, l.dish_key, count(*)::int from public.dish_likes l
  where l.dish_key <> '_meal' and l.meal_date > (now() at time zone 'Asia/Kolkata')::date - p_days
    and (public.get_my_role() = 'warden' or (public.get_my_role() = 'mess_admin' and l.mess_id = public.get_my_assigned_mess_id()))
  group by l.mess_id, l.dish_key order by count(*) desc, l.dish_key limit 10
$$;

revoke execute on function public.toggle_dish_like(text, text), public.dish_like_counts(text), public.my_dish_likes(), public.top_liked_dishes(integer) from public, anon, authenticated;
grant execute on function public.toggle_dish_like(text, text), public.my_dish_likes(), public.top_liked_dishes(integer) to authenticated;
grant execute on function public.dish_like_counts(text) to anon, authenticated, service_role;
