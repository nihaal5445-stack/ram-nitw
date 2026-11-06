-- Anonymous-safe aggregates for the public mess sections: items on sale (name, price, veg, in stock) and the most-liked dishes (counts only).
create or replace function public.public_addons() returns table (mess_id text, name text, price_paise integer, veg boolean, in_stock boolean)
language sql stable security definer set search_path = public as $$
  select mess_id, name, price_paise, veg, (stock_total - sold) > 0 from public.addons where active order by mess_id, price_paise, name
$$;
create or replace function public.public_top_liked() returns table (mess_id text, dish_key text, n integer)
language sql stable security definer set search_path = public as $$
  select mess_id, dish_key, n from (
    select l.mess_id, l.dish_key, count(*)::int n, row_number() over (partition by l.mess_id order by count(*) desc, l.dish_key) rn
    from public.dish_likes l where l.dish_key <> '_meal' and l.meal_date > (now() at time zone 'Asia/Kolkata')::date - 7
    group by l.mess_id, l.dish_key) x where rn <= 3 order by mess_id, n desc
$$;
revoke execute on function public.public_addons(), public.public_top_liked() from public, anon, authenticated;
grant execute on function public.public_addons(), public.public_top_liked() to anon, authenticated, service_role;
