-- Likes only after eating: a student may like a dish / meal of today's slot only if they have an ACCEPTED redemption for that slot today
-- (a scan, or a redeemed mess-switch pass, which also lands in meal_redemptions) AND the slot has ended or 40 minutes passed since the scan
-- (the feedback rule; "Simulate 40 min passed" sets the prompt due now, which unlocks too). In DEMO MODE the "slot ended" clause is ignored,
-- because demo scans happen at any hour and would unlock instantly; the 40-minute rule and the simulate button still apply.
-- Removing an existing like is always allowed.

create or replace function public.my_like_status() returns table (slot text, mess_id text, unlocked boolean, unlock_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.slot, r.mess_id, u.at <= now(), u.at
  from (select distinct on (slot) slot, mess_id, id, scanned_at, meal_date from public.meal_redemptions
         where student_id = auth.uid() and status = 'accepted' and meal_date = (now() at time zone 'Asia/Kolkata')::date and slot is not null
         order by slot, scanned_at) r
  cross join lateral (
    select least(
      r.scanned_at + interval '40 minutes',
      coalesce((select p.due_at from public.feedback_prompts p where p.redemption_id = r.id), 'infinity'::timestamptz),
      case when public.demo_mode() then 'infinity'::timestamptz
           else coalesce((select ((r.meal_date + s.ends) at time zone 'Asia/Kolkata') from public.mess_slots s where s.mess_id = r.mess_id and s.slot = r.slot), 'infinity'::timestamptz) end
    ) as at
  ) u
$$;

create or replace function public.toggle_dish_like(p_slot text, p_dish text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_mess text; v_unlocked boolean; v_date date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if public.get_my_role() <> 'student' or public.get_my_assigned_mess_id() is null then raise exception 'students only' using errcode = '42501'; end if;
  if p_slot not in ('breakfast','lunch','snacks','dinner') then raise exception 'bad slot'; end if;
  delete from public.dish_likes where student_id = auth.uid() and meal_date = v_date and slot = p_slot and dish_key = p_dish;
  if found then return false; end if;
  select s.mess_id, s.unlocked into v_mess, v_unlocked from public.my_like_status() s where s.slot = p_slot;
  if v_mess is null then raise exception 'like_locked: no accepted scan for this meal today' using errcode = '42501'; end if;
  if not v_unlocked then raise exception 'like_locked: you can rate this after your meal' using errcode = '42501'; end if;
  insert into public.dish_likes (student_id, mess_id, meal_date, slot, dish_key) values (auth.uid(), v_mess, v_date, p_slot, p_dish);
  return true;
end $$;

revoke execute on function public.my_like_status() from public, anon, authenticated;
grant execute on function public.my_like_status() to authenticated;
