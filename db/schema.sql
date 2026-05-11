BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_label text NOT NULL DEFAULT 'default',
  name text NOT NULL,
  client_name text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_label, name)
);

CREATE TABLE IF NOT EXISTS saved_parcels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parcel_id uuid NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  label text,
  tag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, parcel_id)
);

CREATE TABLE IF NOT EXISTS parcel_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_parcel_id uuid NOT NULL REFERENCES saved_parcels(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

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

COMMIT;
