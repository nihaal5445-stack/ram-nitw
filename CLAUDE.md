# RAM (Random Access Meals), NIT Warangal

Read these before touching code:

- @docs/SPEC.md: product spec, roles, messes, design tokens
- @docs/HANDOFF.md: phase status, history, how to run, current work
- @AGENTS.md: Next.js 16 has breaking changes; read `node_modules/next/dist/docs/` before writing code
- @README.md

## Rules for the next agent

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

## Project facts rules

- Only 4 messes are confirmed: IFC-A (pure veg), IFC-B, Krishna, Priyadarshini. Show "4 confirmed messes"; never "7 active".
- Other messes are labelled plainly as TODO placeholders; never invent names.
- Timings, capacities, coordinates, menus are placeholders marked `// TODO: verify`.
- Use design tokens from `src/app/globals.css`; no hard-coded colours. Icons: lucide-react only.
- All user-visible text goes in `messages/{en,te,hi}.json`.
