# RAM: Random Access Meals (NIT Warangal)

> A production-grade, full-stack digital mess management platform for the National Institute of Technology Warangal (NITW).

RAM replaces paper-based mess tokens and manual registers with an offline-capable, role-gated digital system covering meal issuance, QR token redemption, attendance tracking, billing, menus, and warden oversight.

---

## Documentation

- **[Product Specification (docs/SPEC.md)](./docs/SPEC.md)**: Master architecture, role requirements, database models, and 8-phase implementation roadmap.
- **[Developer Handoff Guide (docs/HANDOFF.md)](./docs/HANDOFF.md)**: Current phase status, codebase folder guide, local setup instructions, database RLS summary, key technical decisions, and rules for contributors.

---

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS v4 + Base UI / shadcn/ui
- **Database & Auth**: Supabase (PostgreSQL + Auth + RLS)
- **Localization**: next-intl (English, Telugu, Hindi)
- **Theming**: next-themes (NITW Maroon & Navy tokens, dark/light mode)
- **Deployment & Mobile**: PWA (`next-pwa`), later wrapped with Capacitor

---

## Quick Start

### 1. Prerequisites
- Node.js 20+
- Docker Desktop (for local Supabase stack)

### 2. Setup & Installation
```bash
# Clone and install dependencies
npm install

# Start local Supabase services (requires Docker)
npx supabase start

# Check Supabase status and configure .env.local
npx supabase status
cp .env.example .env.local

# Run database migrations and seed default test data
npm run db:reset

# Launch development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the portal. Local emails and OTP codes are captured by the Inbucket SMTP mail tester at [http://localhost:54324](http://localhost:54324).

---

## Seed Accounts (Local Development)

| Role | Email | Password | Assigned Mess |
|---|---|---|---|
| **Student** | `student@student.nitw.ac.in` | `password123` | IFC-A |
| **Parent** | `parent@example.com` | `password123` | Linked to Demo Student |
| **Counter Staff** | `counter@nitw.ac.in` | `password123` | IFC-A |
| **Mess Rep** | `rep@student.nitw.ac.in` | `password123` | IFC-A |
| **Mess Admin** | `admin@nitw.ac.in` | `password123` | IFC-A |
| **Warden** | `warden@nitw.ac.in` | `password123` | All Messes |
