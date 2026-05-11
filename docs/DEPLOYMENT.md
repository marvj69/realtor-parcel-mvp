# Deployment Notes

## Vercel

1. Push repository to GitHub.
2. Import GitHub repo into Vercel.
3. Set environment variables:

| Variable | Required | Environment | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes for production | Vercel + local `.env.local` | Neon pooled Postgres connection string for server-side API routes. Never expose this in client code. |
| `DATABASE_DIRECT_URL` | Optional | Local/import only | Direct Neon connection string for migrations/import scripts when needed. Do not set as a public var. |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Yes | Vercel + local `.env.local` | Public MapLibre style URL. Defaults to OpenFreeMap. |
| `NEXT_PUBLIC_DEFAULT_CENTER` | Yes | Vercel + local `.env.local` | `longitude,latitude` default map center. |
| `NEXT_PUBLIC_DEFAULT_ZOOM` | Yes | Vercel + local `.env.local` | Default map zoom. |
| `NEXT_PUBLIC_PARCEL_MIN_ZOOM` | Yes | Vercel + local `.env.local` | Client-side threshold before loading parcel outlines. |
| `NEXT_PUBLIC_PARCEL_VECTOR_TILES` | Optional | Vercel + local `.env.local` | Enables PostGIS MVT parcel outlines. Defaults to enabled; set `false` to use bbox GeoJSON only. |
| `PARCEL_TILE_MIN_ZOOM` | Optional | Vercel + local `.env.local` | Server-side minimum zoom for parcel vector tiles. Defaults to `NEXT_PUBLIC_PARCEL_MIN_ZOOM` or `13`. |
| `PARCEL_BBOX_LIMIT` | Yes | Vercel + local `.env.local` | Server-side cap for bbox parcel results. |
| `API_RATE_LIMIT_PER_MINUTE` | Optional | Vercel + local `.env.local` | Default per-route in-memory rate-limit fallback. Route-specific limits live in `src/lib/api-guard.ts`. |
| `API_RATE_LIMIT_DISABLED` | Optional | Local only | Set to `true` only for local debugging. Keep `false` in production. |
| `APP_AUTH_PASSWORD` | Recommended for production | Vercel + private local `.env.local` | Enables private-app password auth and acts as the workspace invite password for account creation. Leave empty only for local/demo open mode. Never use a `NEXT_PUBLIC_` prefix. |
| `APP_AUTH_SESSION_SECRET` | Recommended for production | Vercel + private local `.env.local` | Secret used to sign HTTP-only session cookies. Use a long random value. |
| `APP_AUTH_USERNAME` | Optional | Vercel + private local `.env.local` | Optional username gate for the legacy shared-password sign-in path. Email/password accounts sign in with their email. |
| `APP_AUTH_USER_ID` | Optional | Vercel + private local `.env.local` | Stable owner key for saved projects/parcels. Defaults to `private-app-user`. Do not change after saving data unless you intentionally want a new owner scope. |
| `APP_AUTH_USER_EMAIL` | Optional | Vercel + private local `.env.local` | Server-side owner metadata. |
| `APP_AUTH_USER_NAME` | Optional | Vercel + private local `.env.local` | Server-side owner display name. |
| `APP_AUTH_SESSION_TTL_SECONDS` | Optional | Vercel + private local `.env.local` | Session duration. Defaults to 7 days. |
| `NEXT_PUBLIC_APP_NAME` | Optional | Vercel + local `.env.local` | Public app display name for future UI use. |

4. Redeploy after environment variable changes.

Only variables prefixed with `NEXT_PUBLIC_` are sent to the browser. Database and auth variables must remain server-side only.

## Neon

1. Create Neon project.
2. Enable PostGIS by running `db/schema.sql` or `npm run db:schema`.
3. Use pooled connection string for Vercel runtime.
4. Keep direct connection string private for local import scripts if needed.

## Database migration

For MVP, `db/schema.sql` is enough. Later, move to a migration tool such as Drizzle, Prisma migrations, or node-pg-migrate.

## Production warnings

Before adding external users:

- Confirm `APP_AUTH_PASSWORD` and `APP_AUTH_SESSION_SECRET` are set in Vercel.
- Run `npm run db:schema` so the `app_users` account columns and unique email index exist.
- Add import job logs.
- Add privacy policy / terms if shared beyond internal use.
