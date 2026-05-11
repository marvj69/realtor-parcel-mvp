# Deployment Notes

## Vercel

1. Push repository to GitHub.
2. Import GitHub repo into Vercel.
3. Set environment variables:

```txt
DATABASE_URL
NEXT_PUBLIC_MAP_STYLE_URL
NEXT_PUBLIC_DEFAULT_CENTER
NEXT_PUBLIC_DEFAULT_ZOOM
PARCEL_BBOX_LIMIT
NEXT_PUBLIC_PARCEL_MIN_ZOOM
```

4. Redeploy after environment variable changes.

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
