# Pasteable Codex / Coding Agent Prompt

You are taking over a starter repository called `realtor-parcel-mvp`.

Goal: build a low-cost MVP for a realtor parcel intelligence map using Next.js, Vercel, Neon/PostGIS, and MapLibre. It should behave like a lightweight realtor-oriented Regrid/onX-style map, but without paid parcel APIs. Use public county/state GIS data and store normalized parcel data in PostGIS.

Read these files first:

```txt
AGENTS.md
TODO.md
README.md
docs/MVP_SPEC.md
docs/DATA_SOURCE_PLAYBOOK.md
db/schema.sql
```

Then do the following in order:

1. Install dependencies and run typecheck.
2. Verify the Next.js app boots locally.
3. Verify the database schema can be applied to Neon/Postgres.
4. Seed the demo parcel and confirm map click lookup works.
5. Make any fixes needed to get the scaffold functional.
6. Improve the parcel map UI enough for a realtor to understand it.
7. Add a reliable workflow for importing the first real county parcel dataset.
8. Keep all parcel-boundary disclaimers visible.
9. Do not add paid APIs.
10. Do not fabricate parcel data.

Acceptance criteria for your first completed pass:

- `npm run typecheck` passes.
- `npm run db:schema` works.
- `npm run db:seed` works.
- `npm run dev` loads the app.
- MapLibre renders.
- `/api/health` returns OK.
- `/api/parcels/bbox` returns GeoJSON.
- `/api/parcels/lookup?lat=&lng=` finds the seeded parcel.
- UI can save a parcel to a project.
- Code is committed with a clear summary of what changed.
