-- Demo announcements, 4 per mess (3 public: closure / special meal / timings; 1 private menu change). Placeholder text, TODO: verify.
-- Appended to seed.sql; also safe to run alone (it replaces earlier seeded ones, i.e. those with no author).
delete from public.announcements where created_by is null;
select public._publish_announcement(null, a.title, a.body, a.cat, a.pinned, null, array[m.id], a.pub)
from (values ('ifc-a'), ('ifc-b'), ('krishna'), ('priyadarshini')) as m(id)
cross join (values
  ('Dinner closed on Sunday for deep cleaning', 'The mess will not serve dinner this Sunday while the kitchen is deep-cleaned. Breakfast and lunch run as usual. (Demo text, TODO: verify.)', 'closure', true, true),
  ('Special meal: festive lunch', 'A festive special lunch with sweets is planned this week. Regular lunch items are also available. (Demo text, TODO: verify.)', 'special_meal', false, true),
  ('Snacks window moved by 15 minutes', 'Snacks will be served from 16:45 instead of 16:30 for the rest of this week. (Demo text, TODO: verify.)', 'timings', false, true),
  ('Menu change: new dal on Wednesday', 'The Wednesday dinner dal is replaced by a different one after student feedback. (Demo text, TODO: verify.)', 'menu_change', false, false)
) as a(title, body, cat, pinned, pub);
