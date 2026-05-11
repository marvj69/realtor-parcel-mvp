BEGIN;

INSERT INTO app_users (id, display_name, auth_provider)
VALUES ('private-app-user', 'Private app user', 'private_env')
ON CONFLICT (id) DO NOTHING;

INSERT INTO parcel_sources (
  source_key,
  provider,
  county,
  state,
  source_url,
  source_type,
  notes,
  raw_config
)
VALUES (
  'demo-houghton-mi',
  'Demo / fictional seed data',
  'Houghton',
  'MI',
  'local seed file',
  'seed',
  'Fictional parcel for local MVP testing only. Do not use as real property data.',
  '{"demo": true}'::jsonb
)
ON CONFLICT (source_key) DO UPDATE SET
  imported_at = now(),
  notes = EXCLUDED.notes;

INSERT INTO parcels (
  source_key,
  source_feature_id,
  provider,
  source_county,
  state,
  parcel_id,
  apn,
  owner_name,
  site_address,
  mailing_address,
  acreage,
  assessed_value,
  land_use,
  legal_description,
  raw,
  geom
)
VALUES (
  'demo-houghton-mi',
  'demo-001',
  'Demo / fictional seed data',
  'Houghton',
  'MI',
  'DEMO-001',
  '00-00-000-001',
  'Demo Owner LLC',
  '100 Demo Parcel Rd, Houghton, MI',
  'PO Box 100, Houghton, MI',
  2.65,
  85000,
  'Residential vacant',
  'Fictional legal description for app testing.',
  '{"demo": true}'::jsonb,
  ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[-88.5740,47.1240],[-88.5680,47.1240],[-88.5680,47.1200],[-88.5740,47.1200],[-88.5740,47.1240]]]}'), 4326))
)
ON CONFLICT (source_key, source_feature_id) DO UPDATE SET
  owner_name = EXCLUDED.owner_name,
  site_address = EXCLUDED.site_address,
  mailing_address = EXCLUDED.mailing_address,
  acreage = EXCLUDED.acreage,
  assessed_value = EXCLUDED.assessed_value,
  land_use = EXCLUDED.land_use,
  raw = EXCLUDED.raw,
  geom = EXCLUDED.geom;

INSERT INTO projects (owner_user_id, user_label, name, client_name, description)
VALUES (
  'private-app-user',
  'private-app-user',
  'Demo Project',
  'Demo Client',
  'Default project for testing saved parcels.'
)
ON CONFLICT (owner_user_id, name) DO NOTHING;

COMMIT;
