# RAM: Random Access Meals — Product Specification

**Version:** 1.0 (2026-10-09)  
**Status:** Phase 1 in progress  
**Owner:** NITW Administration

---

## 1. Project Overview

RAM is a production-grade, full-stack mess management platform for NIT Warangal (NITW). It replaces paper-based mess tokens and manual attendance with a digital, offline-capable, role-gated system. The platform must operate reliably on campus with intermittent internet ("zero-internet mode").

**Goals:**
- Digital meal token issuance and QR scanning at the counter
- Real-time attendance and headcount per meal slot
- Parent dashboard with child's meal history and balances
- Mess representative complaint and menu management
- Warden-level oversight across all messes
- Offline PWA, later wrapped with Capacitor for native iOS/Android

---

## 2. Stack (Fixed — do not change without written approval)

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| i18n | next-intl (en, te, hi) |
| Theming | next-themes (light / dark) |
| Mobile | PWA via `next-pwa`, later Capacitor |
| Hosting | Supabase (DB), Vercel or self-hosted (app) |

---

## 3. Roles

| Role | Description |
|---|---|
| `student` | Enrolled student with a mess account. Must use `@student.nitw.ac.in` email. |
| `parent` | Guardian linked to a specific student. Can view the student's balance and meal history. |
| `counter_staff` | Mess counter worker. Scans tokens, marks attendance. Assigned to one mess. |
| `mess_rep` | Student representative of a mess. Submits complaints and weekly menus. |
| `mess_admin` | Administrative head of one mess. Manages staff, menu, and reports. |
| `warden` | Oversight across all messes. Can change any user's role. |

**All roles are enforced at the database layer via Supabase RLS.** UI hiding alone is not sufficient.

---

## 4. Auth

- **Method:** Email OTP / magic link only. No passwords.
- **Student domain check:** Sign-up page validates that students use `@student.nitw.ac.in` (configurable in `src/config/auth.ts`). Other roles are created by wardens.
- **Session:** JWT stored in cookie via `@supabase/ssr`. SSR-safe.
- **Post-login redirect:** Based on `profiles.role` — each role lands on its own dashboard.

---

## 5. Database Tables (Phase 1)

### `profiles`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | FK → `auth.users.id` |
| `role` | `user_role` enum | student, parent, counter_staff, mess_rep, mess_admin, warden |
| `full_name` | `text` | nullable |
| `email` | `text` | mirror of auth email |
| `linked_student_id` | `uuid` | FK → `profiles.id`; used for parent→student link |
| `assigned_mess_id` | `text` | FK-like reference to `messes.id` (string from config) |
| `preferred_locale` | `text` | 'en', 'te', or 'hi'; default 'en' |
| `preferred_theme` | `text` | 'light', 'dark', or 'system'; default 'system' |
| `created_at` | `timestamptz` | auto |

### RLS Policies — `profiles`
| Policy | Who | Operation |
|---|---|---|
| Users can view own profile | `auth.uid() = id` | SELECT |
| Wardens can view all profiles | role = 'warden' | SELECT |
| Parents can view linked student | linked_student_id matches | SELECT |
| Users can update own profile | `auth.uid() = id` | UPDATE |
| Wardens can update any profile | role = 'warden' | UPDATE |

---

## 6. Messes (Phase 1 config)

Stored in `src/config/messes.ts` (read-only static config for Phase 1; moves to DB in Phase 3).

| ID | Name | Type | Status |
|---|---|---|---|
| `ifc-a` | IFC-A | Pure Veg | Operational |
| `ifc-b` | IFC-B | Mixed | Operational |
| `krishna` | Krishna Mess | North Indian | Operational |
| `priyadarshini` | Priyadarshini Mess | Mixed | Operational |
| `op-5` | Operational Mess 5 | Mixed | Operational — TODO: confirm name |
| `op-6` | Operational Mess 6 | Mixed | Operational — TODO: confirm name |
| `op-7` | Operational Mess 7 | Mixed | Operational — TODO: confirm name |
| `uc-1` | New Mega Mess | Mixed | Under Construction |
| `uc-2` | New Block Mess | Mixed | Under Construction |

All coordinates are marked `// TODO: verify`.

---

## 7. i18n

- Languages: English (`en`), Telugu (`te`), Hindi (`hi`)
- Locale saved in `profiles.preferred_locale` (server-side) and `NEXT_LOCALE` cookie (client-side)
- Language toggle visible in top navbar for all authenticated users
- Dark/light toggle beside it; preference saved in `profiles.preferred_theme`

---

## 8. Eight Phases

| # | Phase | Key Deliverables |
|---|---|---|
| 1 | Foundation | Auth, roles, DB schema, RLS, per-role dashboards, i18n, theming |
| 2 | Meal Token System | QR token generation, token issuance flow, counter scan UI |
| 3 | Menu & Attendance | Weekly menu CRUD, meal slot management, attendance tracking |
| 4 | Balances & Billing | Student wallet, deduction per meal, parent top-up flow |
| 5 | Complaints & Notices | Complaint submission (mess_rep), resolution tracking, notice board |
| 6 | Reports & Analytics | Per-mess headcount charts, warden oversight dashboard |
| 7 | Offline / PWA | Service worker, offline token queue, sync on reconnect |
| 8 | Native App (Capacitor) | iOS + Android packaging, push notifications, NFC scan |

---

## 9. Design Tokens

| Token | Light | Dark |
|---|---|---|
| `--primary` (NITW Maroon) | `#7B1E1E` | `#7B1E1E` |
| `--secondary` (NITW Navy) | `#1F3A68` | `#1F3A68` |
| `--background` | `#ffffff` | `#09090b` |
| `--foreground` | `#09090b` | `#fafafa` |
| `--card` | `#ffffff` | `#09090b` |
| `--muted` | `#f4f4f5` | `#27272a` |
| `--border` | `#e4e4e7` | `#27272a` |

Font: Inter (body), Playfair Display (headings)

---

## 10. Seed Users (dev only)

| Role | Email | Password |
|---|---|---|
| student | student@student.nitw.ac.in | password123 |
| parent | parent@example.com | password123 |
| counter_staff | counter@nitw.ac.in | password123 |
| mess_rep | rep@student.nitw.ac.in | password123 |
| mess_admin | admin@nitw.ac.in | password123 |
| warden | warden@nitw.ac.in | password123 |

---

## 11. Local Dev Setup

### Prerequisites
- Node.js 20+
- Docker Desktop (for Supabase local stack)
- npm

### Commands
```bash
# Install dependencies
npm install

# Start Supabase (requires Docker)
npx supabase start

# Get URL + anon key
npx supabase status

# Write to .env.local (copy from .env.example and fill in values)
cp .env.example .env.local

# Apply migrations + seed data
npm run db:reset   # alias for: npx supabase db reset

# Start dev server (run yourself — do not run in foreground via agent)
npm run dev
```

### Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase status>
```

---

## 12. Key Decisions

| Decision | Rationale |
|---|---|
| Email OTP only (no passwords) | Reduces phishing risk on shared campus computers |
| Student domain enforced in DB trigger | UI-only check is bypassable; DB is source of truth |
| Supabase RLS on every table | Defense in depth; even a compromised API key can't bypass |
| Static config for messes in Phase 1 | Fast to build; moves to DB in Phase 3 when menu CRUD is needed |
| Cookie-based locale | Works SSR; user preference synced to DB for authenticated users |
| Capacitor deferred to Phase 8 | PWA first validates the product before native investment |
