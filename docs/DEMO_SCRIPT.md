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

## Extras (about 3 more minutes, pick what you need)

**Crowd on every dashboard + "Eat here this meal"**
- Every dashboard (student, parent, rep, counter, admin, warden) has the live crowd card with colour bars and "Try after HH:MM".
- Warden (`warden@nitw.ac.in`): the **Allow students to eat at another mess** switch shows "On (demo mode)"; outside demo mode flip it. It also lists passes issued/redeemed today.
- Student (`student@student.nitw.ac.in`, IFC-A): the **Eat here this meal** card offers messes less crowded than IFC-A (IFC-B is the hot spot in the seeded data, so run `demo:crowd` after changing it, or swap the numbers in `scripts/demo-crowd.mjs`: IFC-A needs a higher % than the target). Tap **Eat here this meal** -> a signed single-meal pass QR appears.
- Counter at the other mess (`admin-ifcb@nitw.ac.in` -> `/dashboard/counter/scan?debug=1`, or a counter there): paste the pass text (`data-ticket`, or scan the QR): green **Meal pass OK ... Visiting from IFC-A**; again: **Add-on already used**. After sync the meal is recorded at the other mess (the billing log). Priyadarshini (ladies' mess) is never offered.

**Like the food**
- Student dashboard: **Like today's <meal>** with a heart per dish and one for the whole meal; one like per dish per day (tap again to undo). The public mess sections show the live counts (read-only). Admin and warden dashboards show **Most-liked dishes (last 7 days)**.

**Assistant (admin / warden dashboard)**
- Click a chip such as *What should we fix first?* or type a question. Without `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` in `.env.local` the answer is labelled **Offline summary** (rule-based, same data); with a key it says **AI answer**. It only ever receives counts: no complaint text, no names, so anonymous complainants cannot leak. File a few complaints first (the complaint step above) so there is something to summarise.

**Admin explains, AI replies** (replaces the per-complaint typing in the complaint step)
- `/dashboard/admin/complaints`: in a group, write a short **note** (why it can or cannot be fixed), pick **Resolved / In progress / Cannot be resolved**, press **Write a reply for each student**. Each complainant gets their own reply (quoting their own complaint; anonymous ones are greeted without a name) labelled *Written by AI* or *Written from a template*. Edit any reply, then **Send all**. "Cannot be resolved" needs the note (min 10 characters) because it is shared as the reason. Students see **In progress** with the reply on their complaints page.

**Contact admin**
- Students: a floating **Contact admin** button on mobile (bottom right) and a **Contact admin** button in the nav on desktop open a chat with the admin of their mess. The admin sees it in **Messages inbox** (`/dashboard/admin/messages`, with an unread count on the admin dashboard) and replies there.

**Backgrounds**
- Light: warm off-white, faint paper grain, a soft maroon-gold glow. Dark (moon icon): navy-to-maroon wash with a slow aurora. It pauses with "reduce motion" and when the tab is hidden.

## Phone as the scanner, live head count (about 2 minutes, needs the tunnel)

Set up (once, about 2 minutes): `npm run demo:phone`. It locks the seed passwords (the tunnel URL is public), builds the app with the Supabase proxy, serves it on :3100, opens a `cloudflared` quick tunnel and prints the **phone URL** (and a QR of it). Stop everything with `npm run demo:phone:stop` (it restores the seed passwords). After stopping, rebuild normally (`NODE_ENV=production npm run build && NODE_ENV=production npx next start -p 3100`) before running tests: the build is baked with the proxy flag. `npm run test:phone` runs this whole scenario automatically while the tunnel is up.

1. **Phone** (browser, not an app): open the printed URL, tab **Mess Staff & Administration**, email `admin-ifcb@nitw.ac.in` -> **Send magic link**. With passwords locked you sign in with the **6-digit code**: read it on the **laptop** at <http://127.0.0.1:54324> (Mailpit) and type it on the phone.
2. **Phone**: open `/dashboard/counter/scan` (Dashboard -> Open scanner), choose a PIN (e.g. `482913`), **Start shift**. Allow the camera when asked. Big camera view, and the result appears ABOVE it as a big solid green (admitted) or red (refused) block.
3. **Laptop A** (normal window, `http://localhost:3100`): sign in as `student2@student.nitw.ac.in` (email code from Mailpit), **Show my meal QR**, **Enroll this phone**; keep the QR on screen (raise the brightness).
4. **Laptop B** (a different browser profile or private window): sign in as `admin-ifcb@nitw.ac.in` and open `/dashboard/admin`. Note **Today's headcount** and the **Live crowd** bars.
5. **Phone**: point the camera at the QR on laptop A. Phone: big **green "Demo Student Two: welcome"**. The scan is sent to the server immediately; on laptop B the **head count goes up by one and the IFC-B crowd bar moves by itself** (no refresh).
6. Scan the same QR again: big **red "already served"**. (DEMO_MODE must be on, or it has to be a real meal time.)
Fallback if the camera will not focus: on the phone add `?debug=1` to the scanner URL and paste the text shown under the student's QR (`?debug=1` on the token page).

## Latest additions (check each in 1 minute)

| What | URL | Login |
|---|---|---|
| **Admin sees complaints live** (toast + unread badge, no refresh) | admin window: `/dashboard/admin/complaints` (or any admin page); student window: `/dashboard/student/complaints` | admin `admin-ifcb@nitw.ac.in` + student `student2@student.nitw.ac.in` (IFC-B); or `admin@nitw.ac.in` + `student@student.nitw.ac.in` (IFC-A). The student's form says which mess admin receives it; an admin only sees their own mess. |
| **Full menu at the top** of the student dashboard (4 meals, all dishes, "This week" tab) | `/dashboard/student` | `student@student.nitw.ac.in` (veg only) and `student2@student.nitw.ac.in` |
| **Extras shop**: cards, quantity, cart, test payment, one QR per item | student `/dashboard/student/extras` (`?debug=1` prints ticket text); admin `/dashboard/admin/addons` (add / edit / price / **Restock +10** / orders) | student2 + `admin-ifcb@nitw.ac.in` (Chicken Curry Rs 50); IFC-A: `student@student.nitw.ac.in` + `admin@nitw.ac.in` (veg items) |
| **Admin adds / removes students** | admin dashboard (form at the top) and `/dashboard/admin/students` (search, Remove from mess) | `admin-ifcb@nitw.ac.in` (own mess only); **warden** `/dashboard/warden/students`: any mess, move between messes |
| **Public mess sections** (balanced columns, full menu, most liked, at a glance) | `/` then scroll to "Messes" | none (public) |

## Likes after eating, and notifications (about 3 minutes)
Logins as in the table (or the password `password123` locally).
1. **Locked hearts.** Student -> dashboard -> *Today's menu*: every heart shows its count but is greyed; hover (or tap) shows "You can rate this after your meal".
2. **Scan, then still locked.** Scan the student at the counter (QR page + scanner as above). Hearts of that meal stay locked: a scan is not enough until the slot has ended or 40 minutes passed. (In DEMO MODE the "slot ended" clause is ignored on purpose, only the 40 minutes count, so scans at odd hours do not unlock instantly.)
3. **Unlock.** Student -> bell -> or `/dashboard/student/feedback` -> **Simulate 40 min passed**. Back on the dashboard the hearts of that meal are live (other meals stay locked); like a dish and watch the count change. A feedback-request notification appears in the bell at the same moment.
4. **Live announcement.** Two windows: Student on `/dashboard/student`, Mess admin IFC-A on `/dashboard/notifications`. Admin: title "Dinner closed on Sunday", category *Closure*, tick *pin* and *Also show on the public Updates page*, **Send**. The student window shows a toast and the bell count goes up with no reload. The admin sees "Sent to N people" and a read counter.
5. **Warden** (`/dashboard/notifications`): tick one, several or no messes (none = all) and send; a student of IFC-B only gets it if IFC-B was ticked. Parent (`parent@example.com`) receives everything addressed to the linked student.
6. **Inbox:** filter chips by category, *Mark read*, *Mark all read*, and the settings box to mute categories (Complaint update and Message from admin are always on).
7. **Automatic ones:** admin replies to a complaint -> the filer gets "Your complaint was resolved/being worked on"; admin replies in a message thread -> "Message from your mess admin"; admin adds an extra on the Extras page -> every student of the mess gets "New add-on on sale".
8. **Public:** open `http://localhost:3000/` (signed out): the **Updates** section, and `/updates` for all of them. Only closures, special meals and timings marked public appear; menu changes, complaints and personal items never do.

## If something goes wrong
- Scan or add-on says "No meal is being served right now" / "no meal slot left today": DEMO_MODE is off. Run `npm run demo:mode -- on`, then start a new shift on the scanner.
- Heatmap shows "Not serving right now": run `npm run demo:crowd` again (the last-10-minutes window decays; `demo:prep` and `-- --keep` prevent that).
- Camera scanning has only been tried against a fake camera, not a real phone. The paste box (`?debug=1`) uses the same code path.
- Phone: the tunnel URL changes every time you run `demo:phone`. If the phone shows an old URL, re-scan the new QR. If the phone cannot sign in, check you used the 6-digit code (passwords are locked) and that Mailpit shows the newest email.
- The AI parts (assistant, drafted replies) have deterministic fallbacks, so they work with no key; they were not run against a live Gemini/Anthropic API.
- To show real slot rules to an audience: `npm run demo:mode -- off` (the badge disappears).
