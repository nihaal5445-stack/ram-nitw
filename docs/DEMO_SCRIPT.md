# RAM: 5-minute demo script

Setup, once (about 3 minutes, before the audience arrives). Supabase must be running (`npx supabase start -x logflare,vector,imgproxy,edge-runtime,studio` if not).

```bash
npm run db:reset                      # applies every migration and the seed (only if the DB is in a doubtful state)
NODE_ENV=production npm run build && NODE_ENV=production npx next start -p 3100   # in its own terminal
npm run demo:crowd -- --keep          # in another terminal: fills today's scans and keeps the crowd steady
```

Use **three browser windows**: *Student* (phone-size, e.g. 390 px wide), *Counter* (a different browser profile or a private window, because the scanner stores its roster in IndexedDB), *Admin*.
Sign in with the email code: enter the email on the right tab at `/login`, then read the 6-digit code at <http://127.0.0.1:54324> (Mailpit).

| Role | Email | Tab |
|---|---|---|
| Student | `student@student.nitw.ac.in` | Students |
| Counter | `counter@nitw.ac.in` | Mess Staff & Administration |
| Mess admin | `admin@nitw.ac.in` | Mess Staff & Administration |
| Parent | `parent@example.com` | Parents |

**Meal windows matter.** Scans only work inside a slot (+/- 15 min): breakfast 07:30-09:30, lunch 12:00-14:00, snacks 16:30-17:30, dinner 19:30-21:30 (placeholders). Outside them, widen one window for the demo:
`docker exec -i supabase_db_ram-nitw psql -U postgres -c "update mess_slots set starts='00:00', ends='23:59' where mess_id='ifc-a' and slot='lunch'"` and restore afterwards with `starts='12:00', ends='14:00'`. The add-on and scan steps below assume the slot is open.

## 0:00 Heatmap (public site, 40 s)
1. Open `http://localhost:3100/`, scroll to **Messes on campus**. Pins are green / amber / red by crowd. IFC-B is red (about 85%), Krishna amber, IFC-A and Priyadarshini green.
2. Click the IFC-B pin: it scrolls to the IFC-B section. **Crowd now** shows "Very busy 85%", "N students admitted in the last 10 min" and a hint: *"IFC-B is at 85%. Try after HH:MM."*
3. Sign in as the mess admin later: the same live bars are on their dashboard.
Say: "demo data" is labelled; real accepted scans also count.

## 0:40 Student QR, scan, duplicate (90 s)
4. **Student window**: `/dashboard/student/token`, **Enroll this phone**, a QR appears with a countdown, it re-signs every 30 s.
5. **Counter window**: `/dashboard/counter/scan?debug=1`, **Start shift** (choose a PIN, e.g. `482913`). Switch the browser to **Offline** in DevTools to show it works without internet.
6. Copy the code text from the student page (`?debug=1` on the token page shows it as text), paste it into **Paste a code to test**: big green "welcome". Paste again: red **already served** (duplicate rejected). Change one character: **Invalid code**.
7. Go back online: the queue syncs by itself.

## 2:10 Add-on (60 s)
8. **Student window**: open `/dashboard/student/addons?debug=1` (or Dashboard -> **Buy an add-on**) -> *Paneer Butter Masala* **Pay Rs 40**. A screen labelled **Test payment** (no real money, no Razorpay) appears; confirm. A signed one-slot **ticket QR** is shown.
9. **Counter window**: paste the ticket text (shown under the QR with `?debug=1`, or scan the QR with the camera): green "Add-on OK: Paneer Butter Masala". Paste again: **Add-on already used**.
10. **Admin window**: `/dashboard/admin/addons`: stock left, sold and served update live (refreshes every 5 s). The student's history shows the ticket as **Used**.
(IFC-A is pure vegetarian, so the demo item is veg; defining Chicken Curry there is refused by design. Mess admins of IFC-B could add it.)

## 3:10 Complaint -> summary -> reply (60 s)
11. **Student window**: **File or follow a complaint**: category *Food quality*, meal *Dinner*, text "The dal was cold and the rice was stale". Tick **File anonymously** on a second one from the parent account (`/dashboard/parent/complaints`), e.g. "Cold stale food at dinner". File 2 to 3 similar ones.
12. **Admin window**: `/dashboard/admin/complaints`: they are grouped into one issue with a count ("3 reports"), a short summary labelled *Auto summary (keyword rules)* (it says *AI summary* only when `ANTHROPIC_API_KEY` is set on the server), each with an **SLA timer** (30 min after the meal window closes; "overdue" if the meal closed long ago) and a **draft reply** per complainant. Anonymous complaints show "Anonymous".
13. Edit a reply, **Send reply and mark resolved**. Try **Cannot be resolved** with no reason: refused; add a reason: accepted.
14. The student's page shows the status timeline and the reply. Back on admin, **Answered** -> **Post** puts the fix on the public **Daily progress** board (no names, no complaint text).

## 4:10 Feedback prompt (30 s)
15. **Student window**: after a scan, `/dashboard/student/feedback` -> **Simulate 40 min passed** (demo tool). The banner and the bell (count 1) appear on every student page; rate with stars, write a review and "How can we make it better?", **Send feedback**. Settings below: *Allow me to skip*, *Remind me once*.

## 4:40 Fees (20 s)
16. Open `/fees` (public, also under Transparency -> Where your fee goes; students also have it on their dashboard): donut of where the fee goes and the six-month trend. A banner says it is demo data.

## If something goes wrong
- Scan says "No meal is being served right now": widen the slot (see above).
- Heatmap shows "Not serving right now": run `npm run demo:crowd` again (the last-10-minutes window decays; `-- --keep` prevents that).
- Add-on says "no meal slot left today": same, widen a slot.
- Camera scanning has only been tried against a fake camera, not a real phone. The paste box (`?debug=1`) uses the same code path.
- After the demo: restore the lunch window (command above).
