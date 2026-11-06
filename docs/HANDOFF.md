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
- [ ] **Phase 2: Public Website (IN PROGRESS, see 'Phase 2 progress' below)**
  - Public landing page with NITW branding and features
  - Interactive Leaflet campus map showing all 9 mess locations (4 operational, 3 placeholder operational, 2 under construction)
  - Click-to-scroll navigation between map markers and mess detail cards (timings, menus, eligibility)
  - Real-time operational status badges
- [ ] **Phase 3: Meal Token System (SPEC Section 8.1)**
  - Device-bound TOTP generation offline on student phone (no server issuance table)
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
   - Phase 3 is the **Meal Token System** (device-bound offline TOTP + cross-platform scanner library like `@zxing/browser` or `qr-scanner`, not BarcodeDetector).
5. **Update `docs/HANDOFF.md` at the end of every work session**.

---

## 7. Phase 2 progress (public website)

Plan: `/Users/nihal/.claude/plans/mutable-watching-wren.md` (12 sections in order, then /login restyle). One commit per section.

- [x] Setup: CLAUDE.md, deps (leaflet, motion, playwright), `messes.ts` corrected (4 confirmed + Mess 5-7 TODO + Mess 8-9 under construction TODO; status `confirmed|unconfirmed|under_construction`), tokens in globals.css (`--surface`, `--brand`, `--gold`, `--navy-deep`), `lang` follows locale, `(public)` route group, `/` and `/credits` made public in `src/proxy.ts`.
- [x] 1. Utility bar + sticky mega-menu + mobile drawer (`src/components/site/`, nav data in `src/config/site.ts`, strings in `messages/*.json` under `Public.*`).
- [x] 2. Hero + Today's Menu card + Crowd pill. Images in `public/images` (Unsplash), all registered in `src/config/images.ts`; `/credits` page. Photographer names are TODO: verify. `src/config/demo-data.ts` (slots, base menu), `src/lib/meal-time.ts` (IST slot logic, reused by section 8). Fixed circular `--font-heading` token so Playfair now renders (`font-display` / `font-heading`).
- [ ] 3-12, then login restyle.

Tooling: `BASE=http://localhost:3100 node scripts/shoot.mjs <name> [path] [selector]` writes `screenshots/` (git-ignored) at 1440/390, light/dark. Dev server was NOT running on :3000 in this session; screenshots used `npm run build && npx next start -p 3100`. The first `npm run build` after a change may print a Next security notice and fail; rerun it. Next 16.4.0 has a published advisory; upgrade is the user's call.
