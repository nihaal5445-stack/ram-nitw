# RAM (Random Access Meals) — Engineering Handoff

## 1. Project Summary
RAM is a full-stack digital mess management platform built for the administration of National Institute of Technology Warangal (NITW).
It replaces paper meal tokens and physical attendance with offline-capable, role-gated meal issuance, attendance verification, and billing.
The platform serves students, guardians, counter operators, mess student reps, mess administrators, and institute wardens.
It is built as an offline-first PWA using Next.js App Router, Supabase (PostgreSQL + Auth + RLS), Tailwind CSS, shadcn/ui, next-intl, and next-themes.
For the complete technical specification, architectural blueprint, and future phase roadmaps, refer to [SPEC.md](file:///Users/nihal/.gemini/antigravity-ide/scratch/ram-nitw/docs/SPEC.md).

---

## 2. Phase Status & Roadmap Checklist

- [x] **Phase 1: Foundation (Current - COMPLETE & VERIFIED)**
  - Auth with email OTP/magic links + institute email domain restriction (`@student.nitw.ac.in`)
  - Database schema (`profiles` table, `user_role` enum, automatic profile creation trigger)
  - Row Level Security (RLS) policies for all 6 roles with recursive RLS fix
  - Security Definer helpers: `get_my_role()`, `get_my_assigned_mess_id()`, `get_my_linked_student_id()`
  - Single shared server profile helper (`getCurrentProfile()`) preventing role drift or redirect loops
  - Critical Security Trigger (`protect_profile_fields`): blocks non-wardens from modifying protected columns (`role`, `linked_student_id`, `assigned_mess_id`, `email`, `id`)
  - Automated SQL security test suite ([`supabase/tests/security_test.sql`](file:///Users/nihal/.gemini/antigravity-ide/scratch/ram-nitw/supabase/tests/security_test.sql))
  - Automated RLS isolation test suite ([`supabase/tests/rls_isolation_test.sql`](file:///Users/nihal/.gemini/antigravity-ide/scratch/ram-nitw/supabase/tests/rls_isolation_test.sql))
  - 6-Role programmatic login & profile verification ([`scripts/verify-seed-users.mjs`](file:///Users/nihal/.gemini/antigravity-ide/scratch/ram-nitw/scripts/verify-seed-users.mjs))
  - Next-intl i18n support across English (`en`), Telugu (`te`), and Hindi (`hi`)
  - Self-hosted fonts via `@fontsource-variable/inter` and `@fontsource-variable/playfair-display` (no network calls)
  - Next.js 16 proxy convention migration (`src/proxy.ts` replacing `middleware.ts`)
  - Dark / light theming with NITW brand design tokens (`--primary`: Maroon `#7B1E1E`, `--secondary`: Navy `#1F3A68`)
  - Per-user preference persistence for language and theme
  - Server-side role verification and redirection on every `/dashboard/<role>` page
  - Mess configuration (`messes.ts`) with confirmed and placeholder messes
  - Seed database setup with permanent `auth.identities` and non-null token defaults via `npm run db:reset`
- [x] **Phase 2: Public Website (COMPLETE, see 'Phase 2 progress' below)**
  - Public landing page with NITW branding and features
  - Interactive Leaflet campus map showing all 9 mess locations (4 operational, 3 placeholder operational, 2 under construction)
  - Click-to-scroll navigation between map markers and mess detail cards (timings, menus, eligibility)
  - Real-time operational status badges
- [x] **Phase 3: Access + Scanner (SPEC Section 8.1; COMPLETE in code and automated tests, see section 9; NOT yet tried on a physical phone)**
  - Signed rotating QR (ECDSA P-256, non-extractable device key; scanners hold public keys only). Replaced the earlier shared-secret TOTP idea.
  - Offline counter scanner with cached secret keys and local one-entry-per-slot verification
  - Cross-platform camera scanner via `@zxing/browser` or `qr-scanner` (iOS Safari & Android compatible)
  - Reconnection sync queue
- [ ] **Phase 4: Menu & Attendance**
  - Weekly menu CRUD by mess reps, approval by mess admin
  - Attendance analytics and meal slot headcount tracking
  - Migration of mess configuration from static file to database tables
- [ ] **Phase 5: Balances & Billing**
  - Student mess wallet ledger and automated per-meal deductions
  - Parent top-up flow and monthly mess billing generation
- [ ] **Phase 6: Complaints & Notices**
  - Mess complaint filing with category and image attachment
  - Resolution lifecycle tracking and mess-specific digital notice boards
- [ ] **Phase 7: Reports & Analytics**
  - Live per-mess headcount charts, consumption patterns, waste estimation
  - Warden cross-mess analytics and user role management UI
- [ ] **Phase 8: Offline / PWA Support & Native Packaging (Capacitor)**
  - Service worker caching, offline token queue in IndexedDB
  - Capacitor iOS & Android builds, push notifications, and NFC card tap scanning

---

## 3. Key Architectural & Bug Fix History

### A. RLS Recursion Bug & Root Cause
- **Symptom**: When navigating to `/dashboard`, users entered an infinite redirect loop (`/dashboard` -> `/dashboard/student` -> `/dashboard` -> ...).
- **Root Cause**:
  1. The RLS policies `profiles: mess_admin sees their mess` and `profiles: parent sees linked student` contained subqueries selecting directly from `public.profiles`.
  2. Because RLS was enabled on `public.profiles`, evaluating these subqueries recursively invoked RLS on `public.profiles`, causing PostgreSQL to abort the query with:
     `ERROR 42P17: infinite recursion detected in policy for relation "profiles"`.
  3. When the profile query failed, `/dashboard` previously had a fallback default role (`'student'`), redirecting the user to `/dashboard/student`. On `/dashboard/student`, the server check re-queried `public.profiles`, which failed again with the same 42P17 error and redirected back to `/dashboard`.
- **Resolution**:
  1. Replaced recursive subqueries in `supabase/migrations/20261009000000_initial_schema.sql` with `security definer` helper functions:
     - `public.get_my_role() returns user_role`
     - `public.get_my_assigned_mess_id() returns text`
     - `public.get_my_linked_student_id() returns uuid`
     These functions run with elevated definer privileges and explicit `search_path = public`, reading `profiles` without triggering RLS recursion.
  2. Implemented a single, shared server helper [`src/utils/supabase/get-current-profile.ts`](file:///Users/nihal/.gemini/antigravity-ide/scratch/ram-nitw/src/utils/supabase/get-current-profile.ts) (`getCurrentProfile()`) used uniformly across `/dashboard`, `/dashboard/layout.tsx`, and all 6 role dashboards.
  3. Eliminated all default role fallbacks: if a profile is missing or errors, the app renders a dedicated `ProfileError` component ("Profile Not Found, contact the warden") rather than redirecting in a loop.

### B. Seed Auth Identities & GoTrue Scan Fix
- **Symptom**: Direct inserts into `auth.users` in `supabase/seed.sql` caused GoTrue / Supabase Auth login failures (`Scan error on column index 8`).
- **Root Cause**: GoTrue requires:
  1. A corresponding row in `auth.identities` for each user with `provider = 'email'`, `provider_id = user_id`, and `identity_data = {"sub": id, "email": email}`.
  2. Non-NULL string values (empty string `''`) for token and change columns: `confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`, `email_change_token_current`, `reauthentication_token`, `phone_change`, `phone_change_token`.
- **Resolution**:
  - Permanently incorporated these columns with `''` and an `auth.identities` `insert ... select ... on conflict do nothing` statement in [`supabase/seed.sql`](file:///Users/nihal/.gemini/antigravity-ide/scratch/ram-nitw/supabase/seed.sql). Running `npm run db:reset` creates fully functional, authenticated seed users out-of-the-box.

### C. Self-Hosted Fonts & Next.js 16 Proxy Convention
- **Self-Hosted Fonts**: Google Fonts network requests (`next/font/google`) were removed and replaced with self-hosted `@fontsource-variable/inter` and `@fontsource-variable/playfair-display` in [`src/app/layout.tsx`](file:///Users/nihal/.gemini/antigravity-ide/scratch/ram-nitw/src/app/layout.tsx) and [`src/app/globals.css`](file:///Users/nihal/.gemini/antigravity-ide/scratch/ram-nitw/src/app/globals.css).
- **Proxy Convention**: Next.js 16 deprecated `middleware.ts` in favor of `proxy.ts`. Created [`src/proxy.ts`](file:///Users/nihal/.gemini/antigravity-ide/scratch/ram-nitw/src/proxy.ts) exporting `proxy` function and config. Builds run with zero warnings.

### D. Next.js 16.4.5 Security Upgrade (2026-11-06)
- Upgraded `next` and `eslint-config-next` from 16.4.0 to **16.4.5** to patch published advisories (RCE in Image Optimization with SVGs, RCE in `use cache` typed-array returns, Server Actions DoS). Set `experimental.agentUpgrade: "security"` in `next.config.ts`.
- **Build gotcha**: if your shell exports `NODE_ENV=development`, `next build` fails prerendering `/_global-error` (`Cannot read properties of null (reading 'useContext')`). Run `NODE_ENV=production npm run build` or unset it. This also happens on 16.4.0 and was not caused by the upgrade.
- Known pre-existing lint issues: unescaped `'` in `src/app/page.tsx`, unused `authConfig` in `src/app/login/page.tsx`.

---

## 4. How to Run Locally

### Prerequisites
- **Node.js**: v20 or higher
- **npm**: v10 or higher
- **Docker Desktop**: Running locally

### Step-by-Step Setup
1. **Start Supabase Services**:
   Run Supabase without heavy optional containers (`logflare`, `vector`, `imgproxy`, `edge-runtime`, `studio`) for instant local boot:
   ```bash
   npx supabase start -x logflare,vector,imgproxy,edge-runtime,studio
   ```

2. **Verify Supabase Status & Environment Variables**:
   ```bash
   npx supabase status
   ```
   Ensure `.env.local` matches:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<actual_anon_key_from_status>
   ```

3. **Apply Database Migrations & Seed Data**:
   ```bash
   npm run db:reset
   ```
   *This applies the complete migration with security definer functions, RLS policies, update triggers, and seeds all 6 demo accounts with valid auth identities.*

4. **Run Verification & Security Suites**:
   - **6-User Auth & Profile Check**:
     ```bash
     node scripts/verify-seed-users.mjs
     ```
   - **SQL Field Protection Security Tests**:
     ```bash
     npx supabase db execute -f supabase/tests/security_test.sql
     ```
   - **Parent & Mess Admin RLS Isolation Tests**:
     ```bash
     npx supabase db execute -f supabase/tests/rls_isolation_test.sql
     ```

5. **Start the Next.js Development Server**:
   ```bash
   npm run dev
   ```
   Access the web application at [http://localhost:3000](http://localhost:3000).

6. **Local Email / OTP Viewer (Mailpit / Inbucket)**:
   - The UI supports **Email OTP / Magic Link ONLY**. There is NO password field in the UI.
   - All login emails and magic links sent locally are intercepted by Mailpit/Inbucket:
     👉 **Mailpit Web UI**: [http://127.0.0.1:54324](http://127.0.0.1:54324)
   - When signing in at `http://localhost:3000/login`, enter any seeded email (e.g. `student@student.nitw.ac.in`), open [http://127.0.0.1:54324](http://127.0.0.1:54324), view the message, and click the magic link or copy the token.

---

## 5. Seed Accounts Reference

| Role | Email | Assigned Mess / Details | Seed Password (test scripts only) |
| :--- | :--- | :--- | :--- |
| **Student** | `student@student.nitw.ac.in` | `ifc-a` | `password123` |
| **Parent** | `parent@example.com` | Linked to Demo Student | `password123` |
| **Counter Staff** | `counter@nitw.ac.in` | `ifc-a` | `password123` |
| **Mess Rep** | `rep@student.nitw.ac.in` | `ifc-a` | `password123` |
| **Mess Admin** | `admin@nitw.ac.in` | `ifc-a` | `password123` |
| **Warden** | `warden@nitw.ac.in` | Institute-wide | `password123` |

---

## 6. Rules for the Next Agent

1. **Read `docs/SPEC.md` and `docs/HANDOFF.md` first**: Always review requirements before touching code.
2. **NEVER run blocking or long-running commands in the foreground**:
   - Dev servers (`npm run dev`), Supabase start (`supabase start`), and file watchers must never be run as synchronous blocking commands.
   - If a dev server or supabase start is needed, ask the user to start it or run as background daemon.
3. **NEVER re-initialize or reset existing codebases**:
   - Do not re-run `create-next-app` or `supabase init`. Work with the existing codebase and build additively.
4. **Follow SPEC Phase Order**:
   - Phase 2 is the **Public Website** (full SPEC Section 6 plan: hero section, interactive Leaflet campus map, 9 messes with operational status badges, click-to-scroll navigation, and menu previews), NOT meal tokens.
   - Phase 3 is **Access + Scanner** (signed rotating QR + offline counter scanner with `qr-scanner`, not BarcodeDetector; see SPEC 8.1). It is done; the next phase is **Phase 4: Menu & Attendance**.
5. **Update `docs/HANDOFF.md` at the end of every work session**.

---

## 7. Phase 2: public website (COMPLETE)

Plan file: `/Users/nihal/.claude/plans/mutable-watching-wren.md`. One commit per section. Components in `src/components/site/`, page composed in `src/app/(public)/page.tsx`, layout (header/footer) in `src/app/(public)/layout.tsx`. All strings under `Public.*` (and `Login.*`) in `messages/{en,te,hi}.json`.

- [x] **Setup:** CLAUDE.md; deps leaflet, @types/leaflet, motion (now unused), playwright; `src/config/messes.ts` corrected (4 confirmed: IFC-A, IFC-B, Krishna, Priyadarshini; Mess 5-7 "(TODO)" unconfirmed; Mess 8-9 "under construction (TODO)"; status `confirmed|unconfirmed|under_construction`); tokens in globals.css (`--surface`, `--brand`, `--gold`, `--gold-on-dark`, `--navy-deep`); `lang` follows locale; `/`, `/credits`, `/robots.txt` public in `src/proxy.ts`. Fixed a circular `--font-heading` token so Playfair renders.
- [x] **1. Header:** utility bar + sticky mega-menu (7 groups, hover/click/keyboard, Escape returns focus) + mobile drawer (base-ui Dialog). Nav data in `src/config/site.ts`.
- [x] **2. Hero:** full-bleed photo, Today's Menu card, Crowd pill (IST, time-aware). Images in `public/images`, all registered in `src/config/images.ts`; `/credits` page. Demo data in `src/config/demo-data.ts`; slot logic in `src/lib/meal-time.ts`.
- [x] **3. Audience rows** (`audience-tiles.tsx`) link to `/login?role=students|parents|staff`.
- [x] **4. Welcome card** (`welcome-card.tsx`, `warden-portrait.tsx`): fictional "Dr. Raghavendra Iyer", abstract SVG portrait, labelled placeholder.
- [x] **5. Initiatives** (`initiatives.tsx`): 2 large image-overlay + 3 image-top cards; copy has no invented figures.
- [x] **6. Campus map** (`mess-map-section.tsx` + `campus-map.tsx`): plain Leaflet, `ssr:false`, mounted only near the viewport (`LazyMap`), pins coloured and shaped by status, card click flies to pin (verified), pin click scrolls to `#mess-<id>` and flashes `.mess-highlight` (verified). Dark mode inverts OSM tiles via CSS.
- [x] **7. Mess sections** (`mess-sections.tsx` server + `mess-live.tsx` client): 4 confirmed messes with photo, menu style, eligibility, timings, today's menu (pure-veg filtered), crowd meter, rating, add-ons, latest update; Mess 5-9 as plain TODO rows. Per-mess demo values in `messDemo`.
- [x] **8. Meal timings** (`meal-timings.tsx`): timeline with live Now serving / Next up / Finished; verified with a faked clock.
- [x] **9. Stat counters** (`stat-counters.tsx`): IntersectionObserver count-up, final value by default (SSR / no-JS / reduced motion). Only the mess count is real; others labelled demo.
- [x] **10. Daily progress board** (`progress-board.tsx`): improvements only, demo entries.
- [x] **11. Calendar** (`calendar-section.tsx`): server-rendered month grid (`<table>`) + upcoming list; special = solid, closure = dashed.
- [x] **12. Footer** (`site-footer.tsx`, `id="footer"`).
- [x] **Login restyle** (`src/app/login/page.tsx`): split layout, ARIA tablist (Students / Parents / Mess Staff & Administration), preselected from `?role=`, arrow-key navigation, same `signInWithOtp` email flow (see section 8 for sign-up rules).
- [x] **Housekeeping:** merged `upgrade/next-16.4.5` (Next 16.4.5 security patch); worktree and branch removed; lint clean.

### Final checks (all pass)
`npx tsc --noEmit`, `npm run lint`, `NODE_ENV=production npm run build`.

**Lighthouse (mobile, production build `next start`, run twice, same result):** Performance **91**, Accessibility **100**, Best practices **100**, SEO **100**. FCP 0.9 s, LCP 3.5 s (simulated slow 4G; observed about 0.1 s), TBT 10-20 ms, CLS 0.01-0.03.

What took performance from 85 to 91: the Supabase client is imported lazily inside the theme/language toggle handlers (it was in the public bundle, about 118 KB gzipped); the Leaflet map and OSM tiles mount only when the map nears the viewport; the hero image uses `loading="eager" fetchPriority="high"` (`priority` is deprecated in Next 16); added `public/manifest.json` (was a 404 console error) and `src/app/robots.ts`; map pin hit areas enlarged to 36 px and unconfirmed placeholder pins spread apart (tap-target audit). Further options: pass only the needed i18n namespaces to `NextIntlClientProvider`; remove the unused `motion` dependency.

### Needs human review (all placeholders until confirmed)
1. **Telugu and Hindi translations** (all `Public.*` and `Login.*` strings, dish names, "time remaining" phrasing, fictional-name transliterations) were written by the AI agent; need a native-speaker review.
2. **Demo stats** (`stats` in `src/config/demo-data.ts`: 6,200 meals/day, 18,500 paper tokens/month, 4.1 rating) and per-mess ratings, crowd bias, add-ons.
3. **Progress board entries** (`progress`) and per-mess "latest update" texts: invented, labelled demo.
4. **Calendar events and dates** (`calendarEvents`; 8 Nov 2026 festival lunch assumes Diwali). Verify all four.
5. **Photos:** generic Unsplash food/interior photos, none show real NITW messes; photographer credits are TODO on `/credits`, and the Unsplash page URLs in `src/config/images.ts` are unverified. Replace with real campus photography.
6. **Chief Warden:** name "Dr. Raghavendra Iyer", the message text and the abstract SVG portrait are fictional placeholders.
7. **Mess data** in `src/config/messes.ts`: all coordinates (map pins are NOT real locations), capacities, eligibility, menu styles; Mess 5-9 names unconfirmed.
8. **Meal timings** (`mealSlots` in demo-data.ts) and the base menu.
9. **Contact details:** helpline, phone, email are "to be announced"; footer address is the institute name only.
10. Sign-up rules: resolved, see section 8.

Tooling: `BASE=http://localhost:3100 node scripts/shoot.mjs <name> [path] [selector]` writes `screenshots/` (git-ignored) at 1440/390, light/dark (set `FULL=1` for full page; it scrolls first so lazy images load). The dev server was NOT running on :3000 during Phase 2; screenshots and Lighthouse used `NODE_ENV=production npm run build && npx next start -p 3100`.

---

## 8. Sign-up rules (added after Phase 2)

- **Students** may self-register, but only with `@student.nitw.ac.in` (login Students tab: `shouldCreateUser: true`).
- **Parents and Staff tabs** use `shouldCreateUser: false`: only existing accounts can sign in. GoTrue answers an unknown email with `otp_disabled` (422) and the UI shows "Ask your student / the warden's office to add you".
- **Enforced in the DB** (`supabase/migrations/20261106000000_restrict_signups.sql`): `handle_new_user()` rejects any new auth user whose email is not `@student.nitw.ac.in` unless the email is on the **allow-list** `public.provisioned_accounts` (role, mess, linked student). The row is consumed on use. Only wardens can read/write the table (RLS; `provisioned_by` must equal the caller), or code with the service role / direct SQL (seed).
- **Why an allow-list and not an auth-metadata flag:** GoTrue's admin `createUser` INSERTs the row first and writes `app_metadata` afterwards, so an INSERT trigger can never see it, and `user_metadata` is attacker-controlled. (A first attempt used a flag and failed against real GoTrue even though direct-SQL tests passed.)
- **Warden path:** `src/app/actions/provision-user.ts` (server action, checks caller is warden) -> `src/lib/provision-user.ts` (inserts the allow-list row with the warden's own session, then `admin.auth.admin.createUser`). Needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (server only; `.env*` is git-ignored, so `.env.example` is local only: add the key name there by hand). No UI yet: that is the Phase 7 user-management screen. Parent -> student linking is `linked_student_id` in the allow-list row.
- **Seed:** `supabase/seed.sql` allow-lists the four non-student seed emails before inserting them. `npm run db:reset` re-verified from scratch; `node scripts/verify-seed-users.mjs` passes.
- **Tests:** `npm run test:db` runs every `supabase/tests/*.sql` via `docker exec` (new `signup_rules_test.sql`: 16 cases incl. lookalike domains, forged metadata, no-email, single-use, RLS on the allow-list). `npm run test:signup` runs 13 end-to-end cases through GoTrue (needs Supabase running). Both pass.
- **Known trade-off:** the "not registered" message reveals whether a parent/staff email has an account (email enumeration). Accepted for a clear instruction; GoTrue's own `otp_disabled` already exposes it. Auth rate limits in `supabase/config.toml` apply.

---

## 9. Phase 3 progress (Access + Scanner)

Plan: `/Users/nihal/.claude/plans/mutable-watching-wren.md`; spec: `docs/SPEC.md` 8.1. Decisions (2026-11-06, user): **signed QR** instead of shared-secret TOTP; install `qr-scanner`, `qrcode-generator`, `cloudflared` (for the demo tunnel only).

Deviation from the plan, forced by the signed-QR choice: Postgres cannot verify ECDSA, so scan sync goes through a Next.js route (`/api/scanner/sync`, Node crypto verifies signatures against stored public keys) which calls a **service-role-only** SQL function. The Vault/pgcrypto secret encryption in the plan is no longer needed (public keys are not secret).

- [x] M0: SPEC 8.1 written and phase table fixed; deps installed; browser spike passed in Chromium and WebKit (non-extractable ECDSA key survives IndexedDB, 64-byte signature, 112-char payload = 45x45 QR decoded by qr-scanner). **Not yet tried on a real iPhone/Android.**
- [x] M1: `src/lib/access/` (pure, no deps, same code on phone / scanner / server): `token.ts` (ECDSA P-256 sign/verify, payload `ram1.<device_key>.<step>.<sig>`, +/-1 step window, countdown helper), `slots.ts` (IST date, slot lookup with 15 min grace, ledger key), `pin-vault.ts` (PBKDF2-600k -> AES-GCM wrap), `base64url.ts`. 14 unit tests: `npm run test:unit` (Node's built-in runner; `tsconfig` now has `allowImportingTsExtensions`, so imports inside `src/lib/access` use `.ts` suffixes). Covers the 60 s boundary exactly (valid at 59.999 s, stale at 60 s), tampering, wrong key, malformed payloads, IST rollover, PIN wrong/tamper.
- [x] M2: database + sync route. Migration `20261107000000_phase3_access.sql`: `profiles.roll_number`, `mess_slots` (seeded for the 4 confirmed messes, TODO: verify times), `student_devices` (public keys, one active per student), `scanner_devices`, `bundle_issues`, `meal_redemptions` (partial unique index `(student_id, meal_date, slot) where status='accepted'`), `fraud_flags`. RLS: read-only for clients, no direct writes anywhere. Functions: `enroll_device(label, public_key_b64u)` (student, sign-in < 10 min, 3/day, replaces old device), `revoke_device`, `register_scanner`, `issue_scanner_bundle` (staff of that mess only, 12 h expiry, audited), `resolve_fraud_flag` (warden), and `record_scans` (**service role only**; applies mess, revocation, step-window (>60 s = stale), slot, duplicate-earliest-wins, manual reason + rate limits (10/h per staff, 3/week per student), writes `fraud_flags`). All other functions' EXECUTE was revoked from public/anon/authenticated and re-granted explicitly (the three `get_my_*` helpers stay callable; they are used inside RLS policies).
  - Route `POST /api/scanner/sync` (`src/app/api/scanner/sync/route.ts`, helpers in `src/lib/access/verify-scans.ts`): cookie or Bearer auth, role check, verifies every ECDSA signature with the stored public key (client-supplied `sig_ok` is ignored), then calls `record_scans` with the service role. It is on the proxy's public list because it authenticates itself (401/403). Needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (git-ignored; added locally from `supabase status`).
  - Tests: `npm run test:db` now includes `phase3_access_test.sql` (59 cases: enrolment, RLS, bundle scoping, all four required fraud cases, stale boundary, cross-scanner out-of-order duplicate, manual rules and rate limits). `npm run test:unit` 17 cases. `npm run test:access` 25 end-to-end cases against the running app (needs `next start -p 3100`): real keys and sessions, forged and tampered signatures, a counter trying to call `record_scans` directly, injected `sig_ok`.
- [x] M3: student side. `/dashboard/student/token` (`src/components/access/token-view.tsx`): enrol (browser generates a non-extractable ECDSA key, sends only the public key via `enroll_device`; private `CryptoKey` kept in IndexedDB `ram-access`/`kv`, `navigator.storage.persist()` requested), live QR (SVG, always black on white) re-signed every 30 s offline, countdown ring (`role=timer`, 1 s ticks under reduced motion), clock check against public `GET /api/time` (signs with server-corrected time, warns above 10 s skew), offline banner, wake lock, revoke, and "another phone is active / this phone was replaced" states. Student dashboard now shows real today / this-month meals and recent history (RLS-scoped), plus the "Show my meal QR" link; balance is still a placeholder (Phase 5). `src/lib/access/idb.ts` is the shared IndexedDB helper (stores `kv`, `outbox`, `ledger`) that the scanner will use. Strings under `Access.token.*` and `Student.*`.
  - Test: `npm run test:student-token` (needs `next start -p 3100`): 14 browser checks incl. QR verifies against the DB public key, rotation while the browser is offline, second phone displaces the first, revoke. Sign-in for Playwright uses `scripts/lib/session.mjs` (builds the `@supabase/ssr` cookie from a password sign-in). The QR container exposes `data-testid="qr-token"` / `data-token` (same data as the QR) for tests.
  - Gotcha: tests that delete `student_devices` must delete `meal_redemptions` first (FK).
- [x] M4: offline scanner at `/dashboard/counter/scan` (counter_staff and mess_admin). Logic is pure and unit-tested in `src/lib/access/scanner-core.ts` (bundle index, QR evaluation: expiry, unknown device = also the wrong-mess case, revoked, lockout after 5 bad codes/min per device, +/-1 step window, slot with 15 min grace, local one-per-slot ledger, manual entry rules and local rate limits 10/h and 3/student/week). Persistence in `scanner-store.ts` (IndexedDB: roster wrapped with the shift PIN via PBKDF2-600k + AES-GCM; wiped after 10 wrong PINs but the outbox and ledger are kept; outbox sync with batches). UI `src/components/access/scanner-app.tsx`: shift setup (needs internet; registers the scanner and downloads the 12 h roster), PIN lock (auto-lock after 10 idle minutes), `qr-scanner` camera loop (dynamic import), big colour+icon+text result panel (`role=status`), manual entry dialog (reason + note + PIN re-entry), outbox auto-sync (on `online`, every 30 s, manual button), roster refresh every 10 min when online (picks up revocations), clock check vs `/api/time`, sync report with a red alert when the server says a locally-admitted scan was a cross-scanner duplicate. Rejected scans that matter (stale, future, bad signature, unknown device, revoked, duplicate) are also queued so the server can flag them. `?debug=1` adds a "paste a code" box that goes through the same code path as the camera (used by tests; the live camera loop itself is NOT automated, only started against Chromium's fake device).
  - Found by the e2e test: the SQL slot lookup used `time - interval`, which wraps at midnight, so server and scanner disagreed for windows touching 00:00/24:00. Now minutes arithmetic (migration edited in place; regression test added; SQL suite is 60 cases).
  - Tests: `npm run test:scanner` (needs `next start -p 3100`; ~90 s because it waits out the 60 s screenshot window): 33 browser checks across a phone context and two laptop contexts: offline admit, duplicate, tamper, other-mess, manual entry, lock/unlock, screenshot > 60 s, roster is ciphertext at rest, sync drain, cross-scanner flag. It temporarily widens ifc-a's lunch window to the whole day and restores it in `finally`. `test:db` clears Phase 3 tables at its start (inside its rolled-back transaction) so it does not depend on earlier e2e data.
- [x] M5: real dashboards. Counter dashboard (`/dashboard/counter`) now shows current slot (from `mess_slots`), meals served today, manual entries today, last sync, an enabled "Open scanner" link and recent scans, all RLS-scoped; the fake "342 / 1.2s / 21BCS001" content is gone (counter staff cannot read student names by design, so recent scans show slot/time/status only). Warden fraud page `/dashboard/warden/fraud` (+ link card with the open count on the warden dashboard): flags with severity, plain-language explanation, student, mess, evidence, required note to resolve (`resolve_fraud_flag` RPC via a server action), `?all=1` shows resolved. `currentSlot()` in `src/lib/access/slots.ts` keeps `Date.now()` out of server components (react-hooks/purity).
  - Test: `npm run test:dashboards` (needs `next start -p 3100`; run `npm run test:access` first so there are genuine flags): 18 checks incl. role access (counter/student redirected, anonymous to login), resolve flow, real numbers on counter and student dashboards.
- [x] M6: demo support and wrap-up. Login accepts the **6-digit email code** as well as the link (`verifyOtp`, works when the email is read on another device; tested via GoTrue `generateLink` because the email template only changes after a Supabase restart). Explicit auth cookie name `sb-ram-auth-token` (`src/utils/supabase/config.ts`, used by browser, server and proxy clients; existing dev sessions were signed out once). Opt-in two-device demo plumbing: `NEXT_PUBLIC_SUPABASE_PROXY=1` makes the browser use `<origin>/sb`, which `next.config.ts` rewrites to local Supabase (`npm run build:demo` / `start:demo`; verified in a browser: zero direct calls to :54321, all suites pass through it). `supabase/config.toml` now allows `https://*.trycloudflare.com/auth/callback` and has email templates carrying the code (`supabase/templates/`); **a Supabase restart is needed for those two config changes** (not done: told not to). `cloudflared` is installed (brew) but **no tunnel was opened** (it would expose the local app and Supabase API; `npm run demo:lock-seed` randomises the public seed passwords first). `?debug=1` on the token page shows the code as text. Guide: `docs/DEMO-PHASE3.md`. `npm run test:all` runs every suite in the required order (~2 min).

### Phase 3 final state
- Checks: `npx tsc --noEmit`, `npm run lint`, `NODE_ENV=production npm run build` pass; `npm run test:all` passes: 26 unit, SQL suites (60 Phase 3 + 16 sign-up + older), 13 sign-up e2e, login code, student token page, 25 access flow, 18 dashboards, 33 scanner flow.
- Lighthouse mobile re-run after the auth changes: `/` performance 92, accessibility 100, best practices 100, SEO 100; `/login` 100 / 100 / 100 / 100.
- Design deviation from the original plan: signed QR (user decision) instead of shared-secret TOTP; signature verification happens in `POST /api/scanner/sync` (Postgres cannot verify ECDSA) and `record_scans` is service-role only.

### Phase 3: honest limits
1. **Not tested on a real iPhone or Android phone.** The camera loop was only started against Chromium's fake camera; decoding was verified on a rendered QR in Chromium and WebKit, not through a live camera. iOS Safari quirks (camera permission, standalone PWA mode, storage eviction after about 7 idle days) are unverified.
2. **Offline duplicates across two scanners are detected, not prevented** (the meal is already eaten when sync flags it).
3. **Revocation lag:** an offline scanner honours a replaced/revoked phone until its roster refreshes (every 10 min while online) or the 12 h bundle expires.
4. **Relay/buddy use:** a live QR sent to a friend works for up to 60 s; the first scan wins. Names are shown to counter staff, but there are no student photos.
5. **Clock dependence:** phones and scanners correct by `/api/time` while online; fully offline clock drift still shifts the 60 s window.
6. **Scanner PIN at rest** (PBKDF2 over a 6-12 digit PIN) stops casual access, not a determined offline brute force of a copied IndexedDB. A dishonest counter staffer sees names and rolls of their mess for up to 12 h but, thanks to signed QR, cannot forge a QR.
7. **Manual fallback is the soft spot:** reason + PIN + local and server rate limits and flags, but social engineering remains.
8. **Not fully zero-internet:** enrolling, starting a shift and the first sync need connectivity.
9. **Seed data:** only one student (`DEMO0001`) is in IFC-A; demos of manual entry need care (see the demo guide).
10. `.env.example` is git-ignored here; the `SUPABASE_SERVICE_ROLE_KEY` entry is local only (set it in `.env.local`; needed by `/api/scanner/sync`, the warden provisioning action and the test scripts).

### Phase 3: needs human review / decisions
- Real **meal windows** (`mess_slots` seeded from placeholder `mealSlots`), the 15 min grace, the 12 h roster expiry, 10-min idle lock, manual limits (10/h per staff, 3/student/week), and the 30 s step.
- Real **roll-number format** (placeholder `DEMO0001`) and how rolls get into `profiles.roll_number` for real students.
- Telugu/Hindi strings for `Access.*`, `Warden.fraud.*`, `CounterStaff.*`, `Login` code step (AI-written).
- **Data protection:** scanners cache student names and roll numbers for up to 12 h; retention and consent need a policy (Indian DPDP Act review).
- Whether the "not registered" login message (email enumeration) and the 6-digit code option are acceptable.
- A backup/restore story for device public keys is not needed (public keys only), but a procedure for lost phones (warden revoke + re-enrol) should be documented for students.

---

## 10. Submission sprint (2026-11-06/07): six demo features

Built on top of Phase 3, in this order, one commit each, app working at every commit. Demo walkthrough: [`docs/DEMO_SCRIPT.md`](./DEMO_SCRIPT.md). **Not done on purpose (user decision):** SPEC/HANDOFF phase-order reconciliation (SPEC's phase table still lists Phase 4 as Menu & Attendance; these features are outside that table) and the roll-number-from-email change (seed keeps `DEMO0001`). New screens are English only: `src/i18n/request.ts` now merges `en.json` under the chosen locale, so missing te/hi keys fall back to English.

- **1. Surge heatmap.** Migration `20261108000000_crowd.sql`: `mess_capacity` (TODO verify), `demo_crowd_scans`, and the anon-safe `mess_crowd()` (aggregates only; raw tables denied to anon, tested). `pct = scans in last 10 min / (seats/4)`, i.e. "full" when a quarter of the seats arrive within 10 min (assumption, adjustable in the function). Real accepted scans count plus demo rows. Public `GET /api/crowd`, `useCrowd()` polls every 15 s. Map pins go green/amber/red, "Crowd now" meter + "Try after HH:MM" hint per mess, `CrowdPanel` on admin and warden dashboards. `npm run demo:crowd` re-seeds today's history and the last 10 minutes (`-- --keep` tops up every 15 s). The older fake `crowdFor` pill in the hero is still time-of-day demo logic.
- **2. Add-on tokens.** `20261108010000_addons.sql`: `addons`, `addon_purchases`, `addon_keys`; `upsert_addon` (mess admin), `buy_addon` (student, reserves stock at purchase, mock `TEST-XXXXXXXX` reference, one purchase per add-on per slot), `redeem_addon` (service role). The server signs a ticket `ramA.<b64url json>.<sig>` (ECDSA P-256, key in `addon_keys`, created on first use) valid for one mess/date/slot; scanners fetch only the public key from `/api/addons/key` at shift start (kept when offline), verify offline, keep a local once-only ledger and sync as method `addon` through `/api/scanner/sync` -> `redeem_addon`. Student `/dashboard/student/addons` (mock "Test payment" dialog, ticket QR, history), admin `/dashboard/admin/addons` (live stock via 5 s refresh). Stock is decremented **at purchase** (no overselling); "served" counts redemptions. IFC-A is pure veg, so non-veg names are refused there and the seeded demo add-ons are veg (Chicken Curry is seeded for IFC-B). No Razorpay.
- **3. Grievance redressal.** `20261108020000_complaints.sql`: `complaints`, `complaint_events`; filers read only their own rows; admins use `admin_complaints()` (hides the filer when anonymous); `respond_complaint` (decline needs a reason), `post_complaint_progress`, anon-safe `public_progress()` (only the admin's own public sentence). SLA = meal window end + 30 min (`complaint_sla_due`). Grouping/summary/draft replies are deterministic keyword rules (`src/lib/complaints/group.ts`); `llm.ts` polishes with the Claude API **only if `ANTHROPIC_API_KEY` is set** (none was available, so that path is **untested**; it falls back silently). Pages: student and parent `/dashboard/<role>/complaints`, admin `/dashboard/admin/complaints`; posted items appear on the public Daily Progress board.
- **4. Post-meal feedback.** `20261108030000_feedback.sql`: `feedback_prompts` created lazily from the student's accepted scans (due scan + 40 min), `feedback_prefs` (skippable, remind once = one 30 min snooze), `submit_feedback`, `skip_feedback`, `simulate_feedback_due()` (demo tool), aggregate-only `mess_feedback_summary()` (no UI yet). Banner in the student layout + bell in the navbar (polls every 30 s, no push); page `/dashboard/student/feedback` with settings and the "Simulate 40 min passed" button.
- **5. Fee transparency.** `recharts` added. Public `/fees` (in the proxy's public list and the Transparency menu) and `/dashboard/student/fees`: donut + stacked monthly trend, accessible tables, demo banner. Data in `src/config/fee-demo.ts` (placeholders, TODO verify).
- **6. Demo polish.** `docs/DEMO_SCRIPT.md`; `?debug=1` on the add-ons page prints the ticket text for the paste box.

New tests (all in `npm run test:all`, which now also runs `test:addons`, `test:complaints`, `test:feedback`): add-ons 26 checks, complaints 32, feedback 21. Last run: unit 26/26, SQL, sign-up, login code, student token, access, add-ons all pass; complaints, feedback, dashboards and scanner pass when run individually after a fix to a time-of-day assumption in the complaints test (it now files for yesterday). `tsc`, `lint` and `NODE_ENV=production npm run build` are clean. The heatmap and fee screens were checked by screenshot; there is no automated test for the heatmap UI beyond the SQL/API behaviour checked by hand.

### Sprint: honest limits and things to know
1. Everything is demo-grade and local; none of it was tried on a real phone. The add-on QR is dense (about 330 characters); camera decoding of it is unverified (the paste box uses the same code path).
2. Add-on tickets are bearer tickets: anyone holding a valid unused QR can redeem it once; the first scan wins. The server does not re-verify the signature at sync (it looks up the purchase id, which is an unguessable UUID inside an offline-verified ticket).
3. Mock payment only: no money moves; `payment_ref` is random. Replace `buy_addon` with a real gateway flow before any real use.
4. Complaint grouping is keyword-based and English-only; the LLM path needs a key and was not run. Filer identity is still stored for anonymous complaints (needed for rate limits and showing the filer their reply); only the admin view hides it.
5. Capacities, slot windows, add-on prices/stock and all fee figures are placeholders (`// TODO: verify`).
6. `npm audit` reports vulnerabilities in the dependency tree (20 at last count, existing before this sprint; `recharts` was added). Not triaged.
7. Tests wipe tables (`meal_redemptions`, complaints, add-on purchases, feedback). Run `npm run demo:crowd` again before a demo; the add-on test also resets `addons.sold`.
