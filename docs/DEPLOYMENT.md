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
| `PARCEL_BBOX_LIMIT` | Yes | Vercel + local `.env.local` | Server-side cap for bbox parcel results. |
| `NEXT_PUBLIC_APP_NAME` | Optional | Vercel + local `.env.local` | Public app display name for future UI use. |

4. Redeploy after environment variable changes.

Only variables prefixed with `NEXT_PUBLIC_` are sent to the browser. Database variables must remain server-side only.

## Neon

1. Create Neon project.
2. Enable PostGIS by running `db/schema.sql` or `npm run db:schema`.
3. Use pooled connection string for Vercel runtime.
4. Keep direct connection string private for local import scripts if needed.

## Database migration

For MVP, `db/schema.sql` is enough. Later, move to a migration tool such as Drizzle, Prisma migrations, or node-pg-migrate.

## Production warnings

Before adding external users:

- Add authentication.
- Add user ownership to projects/saved parcels.
- Add rate limiting.
- Add import job logs.
- Add privacy policy / terms if shared beyond internal use.
