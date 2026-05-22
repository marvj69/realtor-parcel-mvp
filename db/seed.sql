BEGIN;

INSERT INTO app_users (id, display_name, auth_provider)
VALUES ('private-app-user', 'Private app user', 'private_env')
ON CONFLICT (id) DO NOTHING;

DELETE FROM parcel_sources
WHERE source_key = 'demo-houghton-mi';

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
