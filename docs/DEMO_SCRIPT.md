# RAM: 5-minute demo script

Setup, once (about 3 minutes, before the audience arrives). Supabase must be running (`npx supabase start -x logflare,vector,imgproxy,edge-runtime,studio` if not).

```bash
NODE_ENV=production npm run build && NODE_ENV=production npx next start -p 3100   # terminal 1 (start it AFTER demo:prep finishes its reset)
npm run demo:prep                     # terminal 2: db:reset, applies DEMO_MODE, prints the logins, then keeps the crowd alive (Ctrl+C to stop)
```

`demo:prep` runs `db:reset` (wipes local data, re-seeds), applies `DEMO_MODE` from `.env.local` to the database (`on` by default), prints the logins below and then runs `demo:crowd -- --keep`.

**DEMO_MODE** (`DEMO_MODE=on|off` in `.env.local`, applied by `demo:prep`; switch later with `npm run demo:mode -- on|off|env`):
- **on**: the current time always counts as inside an open meal slot for every mess (the slot containing the time, else the nearest one), for scans, add-on purchase and redemption, and the counter dashboard. A small **Demo mode** badge shows in the header (public utility bar and dashboard header). So no slot editing is needed, at any hour.
- **off**: real slot rules (breakfast 07:30-09:30, lunch 12:00-14:00, snacks 16:30-17:30, dinner 19:30-21:30, plus 15 min grace; placeholders). `npm run test:all` switches it off for the run and restores your setting afterwards.
- A running scanner picks the change up at its next roster refresh (10 min) or when you start a new shift.

Use **three browser windows**: *Student* (phone-size, e.g. 390 px wide), *Counter* (a different browser profile or a private window, because the scanner stores its roster in IndexedDB), *Admin*.
Sign in with the email code: enter the email on the right tab at `/login`, then read the 6-digit code at <http://127.0.0.1:54324> (Mailpit).

| Role | Email | Tab | Mess |
|---|---|---|---|
| Student | `student@student.nitw.ac.in` | Students | IFC-A (pure veg), roll DEMO0001 |
| Student 2 | `student2@student.nitw.ac.in` | Students | IFC-B, roll DEMO0002 |
| Counter | `counter@nitw.ac.in` | Mess Staff & Administration | IFC-A |
| Mess admin IFC-A | `admin@nitw.ac.in` | Mess Staff & Administration | IFC-A |
| Mess admin IFC-B | `admin-ifcb@nitw.ac.in` | Mess Staff & Administration | IFC-B (can also open the scanner) |
| Parent | `parent@example.com` | Parents | linked to Student |
| Warden | `warden@nitw.ac.in` | Mess Staff & Administration | all |

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

## 2:10 Add-on: Rs 50 Chicken Curry (60 s)
8. **Admin window**: sign in as `admin-ifcb@nitw.ac.in`, Dashboard -> **Add-ons: stock and prices**: *Chicken Curry, Rs 50, stock 40* (edit or add items here; stock updates live, refreshing every 5 s).
9. **Student window**: sign in as `student2@student.nitw.ac.in`, open `/dashboard/student/addons?debug=1` (or Dashboard -> **Buy an add-on**), *Chicken Curry* **Pay Rs 50**. A screen labelled **Test payment** (no real money, no Razorpay) appears; confirm. A signed one-slot **ticket QR** is shown (with `?debug=1` its text too).
10. **Counter window**: the IFC-B admin can open the scanner too: `/dashboard/counter/scan?debug=1` as `admin-ifcb@nitw.ac.in`, **Start shift**, go **Offline**, paste the ticket text (or scan the QR): green **Add-on OK: Chicken Curry** with "Demo Student Two". Paste again: **Add-on already used**. Go online: it syncs.
11. **Admin window**: stock shows 39 / 40, sold 1, served 1. The student's history shows the ticket as **Used**.
(IFC-A is pure vegetarian, so there the demo items are veg, e.g. *Paneer Butter Masala* for `student@student.nitw.ac.in` with `admin@nitw.ac.in`; defining Chicken Curry in IFC-A is refused by design.)

## 3:10 Complaint -> summary -> reply (60 s)
12. **Student window**: **File or follow a complaint**: category *Food quality*, meal *Dinner*, text "The dal was cold and the rice was stale". Tick **File anonymously** on a second one from the parent account (`/dashboard/parent/complaints`), e.g. "Cold stale food at dinner". File 2 to 3 similar ones.
13. **Admin window**: `/dashboard/admin/complaints`: they are grouped into one issue with a count ("3 reports"), a short summary labelled *Auto summary (keyword rules)* (it says *AI summary* only when `ANTHROPIC_API_KEY` is set on the server), each with an **SLA timer** (30 min after the meal window closes; "overdue" if the meal closed long ago) and a **draft reply** per complainant. Anonymous complaints show "Anonymous".
14. Edit a reply, **Send reply and mark resolved**. Try **Cannot be resolved** with no reason: refused; add a reason: accepted.
15. The student's page shows the status timeline and the reply. Back on admin, **Answered** -> **Post** puts the fix on the public **Daily progress** board (no names, no complaint text).

## 4:10 Feedback prompt (30 s)
16. **Student window**: after a scan, `/dashboard/student/feedback` -> **Simulate 40 min passed** (demo tool). The banner and the bell (count 1) appear on every student page; rate with stars, write a review and "How can we make it better?", **Send feedback**. Settings below: *Allow me to skip*, *Remind me once*.

## 4:40 Fees (20 s)
17. Open `/fees` (public, also under Transparency -> Where your fee goes; students also have it on their dashboard): donut of where the fee goes and the six-month trend. A banner says it is demo data.

## If something goes wrong
- Scan or add-on says "No meal is being served right now" / "no meal slot left today": DEMO_MODE is off. Run `npm run demo:mode -- on`, then start a new shift on the scanner.
- Heatmap shows "Not serving right now": run `npm run demo:crowd` again (the last-10-minutes window decays; `demo:prep` and `-- --keep` prevent that).
- Camera scanning has only been tried against a fake camera, not a real phone. The paste box (`?debug=1`) uses the same code path.
- To show real slot rules to an audience: `npm run demo:mode -- off` (the badge disappears).
