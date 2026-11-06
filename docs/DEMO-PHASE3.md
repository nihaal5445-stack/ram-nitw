# Phase 3 demo: laptop = counter scanner, phone = student

What is verified and what is not: the behaviours in **Mode A** (enrol, rotating QR, offline admit, duplicate, expiry, manual entry, sync, fraud flags, warden page) are covered by automated browser tests against the production build, using the paste box instead of the camera.
**Mode B** (a real phone over an HTTPS tunnel) has been wired up and its pieces tested in a desktop browser
(login code through the `/sb` proxy, enrolment, rotating QR), but it has **not been run on a physical iPhone or
Android phone, and the live camera loop has only been started against Chromium's fake camera**. Treat the first real
run as the final test, and expect to tweak camera/permissions on iOS.

## Mode A: two browser windows on one laptop (no tunnel, no phone)

Use your normal dev server (`npm run dev`, port **3000**). Sign-in links in emails only redirect to `localhost:3000`
(the allow-list in `supabase/config.toml`); the `:3100` server used by the automated tests is for tests only.

1. **Student window** (normal browser window): sign in as `student@student.nitw.ac.in` on the Students tab. Read the
   email in Mailpit (http://127.0.0.1:54324) and click the link (or type the 6-digit code once Supabase has been
   restarted with the new email templates, see Mode B). Open `/dashboard/student/token?debug=1` and press
   **Enroll this phone**: a QR and the same code as text appear. (Enrolling needs a sign-in from the last 10 minutes.)
2. **Scanner window** (a *different* browser profile or private window, so it has its own IndexedDB): sign in as
   `counter@nitw.ac.in` (Mess Staff & Administration tab), open `/dashboard/counter/scan?debug=1`, choose a 6-digit PIN, **Start shift**.
3. In DevTools set the scanner window **Offline**. Paste the student's code text into "Paste a code to test" and press
   Check: green "Demo Student: welcome". Paste it again after 3 s: red "already served".
4. Wait over 60 s and paste an old code: red "Code expired" (the screenshot test). Edit one character of the code:
   "Invalid code".
5. Press **Manual entry**: roll number, a reason and your PIN. Wrong PIN and a missing reason are refused. It only admits a
   student who has not yet eaten in this slot, and the seed has just one student in IFC-A (`DEMO0001`): so do this step
   *before* step 3 (the QR is then refused as already served), or use a student you created.
6. Set the scanner window back **Online**: the outbox syncs by itself. As `warden@nitw.ac.in` open
   `/dashboard/warden/fraud` to see the flags (same-scanner duplicate, stale code, forged code).
7. Cross-scanner fraud: open a **second** scanner window (third profile), start a shift, go offline, admit the same
   student, go online: the first laptop's admission stands; the second shows "Already admitted elsewhere" and the warden
   gets a `duplicate_cross_scanner` flag.

Time of day matters: scans outside a meal window ("No meal is being served right now") are refused. Meal windows are
placeholders in `mess_slots` (seeded from `src/config/demo-data.ts`). For a demo outside meal hours, widen one:
`docker exec supabase_db_ram-nitw psql -U postgres -c "update mess_slots set starts='00:00', ends='23:59' where mess_id='ifc-a' and slot='lunch'"`
(and `npm run db:reset` afterwards to restore).

## Mode B: real phone (student) + laptop webcam (scanner)

A phone cannot reach `127.0.0.1`, and WebCrypto/camera need **HTTPS**, so the phone talks to the app through a
Cloudflare quick tunnel, and the app proxies Supabase under `/sb`.

**One-time (you do this; I was told not to restart Supabase):** `supabase/config.toml` now allows
`https://*.trycloudflare.com/auth/callback` and carries email templates with the 6-digit code. Restart so they apply:
```bash
npx supabase stop && npx supabase start -x logflare,vector,imgproxy,edge-runtime,studio
npm run db:reset
```

**Each demo:**
```bash
npm run demo:lock-seed        # IMPORTANT: random passwords for the seed accounts (see warning below)
npm run build:demo && npm run start:demo        # serves on :3100 with the /sb proxy enabled
cloudflared tunnel --url http://localhost:3100  # prints https://<random>.trycloudflare.com
```
1. On the **phone**, open the printed `https://…trycloudflare.com/login`, Students tab, enter
   `student@student.nitw.ac.in`, press Send. Read the email in Mailpit **on the laptop** (http://127.0.0.1:54324) and
   type the 6-digit code on the phone. (If the email shows only a link, Supabase was not restarted yet.)
2. On the phone open **Show my meal QR** and **Enroll this phone**. Raise the brightness.
3. On the **laptop** (normal `http://localhost:3100`, or the tunnel URL), sign in as the counter, `/dashboard/counter/scan`,
   PIN, **Start shift**, allow the camera. Turn Wi-Fi off (or DevTools Offline). Hold the phone in front of the webcam.
4. Continue from step 3 of Mode A (duplicate, screenshot older than 60 s, manual entry, sync, warden page).

**Warning:** the tunnel makes your local app and local Supabase API reachable by anyone who has the URL. The seed
accounts have public passwords, which is why `demo:lock-seed` exists. Use the tunnel only for the demo, stop it when
done (`Ctrl-C`), and run `npm run db:reset` afterwards (it restores dev data and the passwords the test scripts need).

## Tests
`npm run test:all` runs everything in the right order (needs Supabase running and the app on :3100 via
`npx next start -p 3100`; `test:scanner` takes about 90 s because it waits out the 60 s screenshot window).
Individual suites: `test:unit`, `test:db`, `test:signup`, `test:login-code`, `test:student-token`, `test:access`,
`test:dashboards` (run `test:access` right before it), `test:scanner`.
