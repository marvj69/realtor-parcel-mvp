BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS parcel_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text UNIQUE NOT NULL,
  provider text NOT NULL,
  county text,
  state text,
  source_url text,
  source_type text,
  source_updated_at timestamptz,
  imported_at timestamptz DEFAULT now(),
  notes text,
  raw_config jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS parcels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL REFERENCES parcel_sources(source_key) ON DELETE CASCADE,
  source_feature_id text NOT NULL,
  provider text NOT NULL DEFAULT 'public_gis',
  source_county text,
  state text,
  parcel_id text,
  apn text,
  owner_name text,
  site_address text,
  mailing_address text,
  acreage numeric,
  assessed_value numeric,
  land_use text,
  legal_description text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key, source_feature_id)
);

CREATE INDEX IF NOT EXISTS parcels_geom_gist_idx ON parcels USING gist (geom);
CREATE INDEX IF NOT EXISTS parcels_source_key_idx ON parcels (source_key);
CREATE INDEX IF NOT EXISTS parcels_apn_idx ON parcels (apn);
CREATE INDEX IF NOT EXISTS parcels_parcel_id_idx ON parcels (parcel_id);
CREATE INDEX IF NOT EXISTS parcels_owner_name_idx ON parcels (owner_name);
CREATE INDEX IF NOT EXISTS parcels_site_address_idx ON parcels (site_address);
CREATE INDEX IF NOT EXISTS parcels_parcel_id_trgm_idx ON parcels USING gin (parcel_id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS parcels_apn_trgm_idx ON parcels USING gin (apn gin_trgm_ops);
CREATE INDEX IF NOT EXISTS parcels_owner_name_trgm_idx ON parcels USING gin (owner_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS parcels_site_address_trgm_idx ON parcels USING gin (site_address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS parcels_mailing_address_trgm_idx ON parcels USING gin (mailing_address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS parcels_text_search_idx ON parcels USING gin (
  to_tsvector(
    'simple',
    coalesce(parcel_id, '') || ' ' ||
    coalesce(apn, '') || ' ' ||
    coalesce(owner_name, '') || ' ' ||
    coalesce(site_address, '') || ' ' ||
    coalesce(mailing_address, '') || ' ' ||
    coalesce(land_use, '')
  )
);

CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY,
  email text,
  display_name text,
  auth_provider text NOT NULL DEFAULT 'private_env',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_users (id, display_name, auth_provider)
VALUES ('private-app-user', 'Private app user', 'private_env')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id text NOT NULL DEFAULT 'private-app-user' REFERENCES app_users(id) ON DELETE CASCADE,
  user_label text NOT NULL DEFAULT 'private-app-user',
  name text NOT NULL,
  client_name text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_parcels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id text NOT NULL DEFAULT 'private-app-user' REFERENCES app_users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parcel_id uuid NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  label text,
  tag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, parcel_id)
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_user_id text;
UPDATE projects
SET owner_user_id = CASE
  WHEN user_label IS NULL OR user_label = '' OR user_label = 'default' THEN 'private-app-user'
  ELSE user_label
END
WHERE owner_user_id IS NULL;

INSERT INTO app_users (id, display_name, auth_provider)
SELECT DISTINCT owner_user_id, owner_user_id, 'private_env'
FROM projects
WHERE owner_user_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE projects ALTER COLUMN owner_user_id SET DEFAULT 'private-app-user';
ALTER TABLE projects ALTER COLUMN owner_user_id SET NOT NULL;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_user_label_name_key;
UPDATE projects SET user_label = owner_user_id WHERE user_label = 'default';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_owner_user_id_fkey'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES app_users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS projects_owner_user_name_idx ON projects (owner_user_id, name);
CREATE INDEX IF NOT EXISTS projects_owner_user_id_idx ON projects (owner_user_id);

ALTER TABLE saved_parcels ADD COLUMN IF NOT EXISTS owner_user_id text;
UPDATE saved_parcels sp
SET owner_user_id = p.owner_user_id
FROM projects p
WHERE sp.project_id = p.id AND sp.owner_user_id IS NULL;
UPDATE saved_parcels SET owner_user_id = 'private-app-user' WHERE owner_user_id IS NULL;

INSERT INTO app_users (id, display_name, auth_provider)
SELECT DISTINCT owner_user_id, owner_user_id, 'private_env'
FROM saved_parcels
WHERE owner_user_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE saved_parcels ALTER COLUMN owner_user_id SET DEFAULT 'private-app-user';
ALTER TABLE saved_parcels ALTER COLUMN owner_user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saved_parcels_owner_user_id_fkey'
  ) THEN
    ALTER TABLE saved_parcels
      ADD CONSTRAINT saved_parcels_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES app_users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS saved_parcels_owner_user_id_idx ON saved_parcels (owner_user_id);
CREATE INDEX IF NOT EXISTS saved_parcels_owner_project_idx ON saved_parcels (owner_user_id, project_id);
CREATE INDEX IF NOT EXISTS saved_parcels_project_created_idx ON saved_parcels (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS parcel_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_parcel_id uuid NOT NULL REFERENCES saved_parcels(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parcel_notes_saved_parcel_created_idx ON parcel_notes (saved_parcel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS parcel_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_parcel_id uuid NOT NULL REFERENCES saved_parcels(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  latitude numeric,
  longitude numeric,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS parcels_set_updated_at ON parcels;
CREATE TRIGGER parcels_set_updated_at
BEFORE UPDATE ON parcels
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS projects_set_updated_at ON projects;
CREATE TRIGGER projects_set_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS app_users_set_updated_at ON app_users;
CREATE TRIGGER app_users_set_updated_at
BEFORE UPDATE ON app_users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
