-- Additive vocabulary/context extension. Existing approvals and snapshot payloads are not rewritten.
-- Unknown defaults deliberately make no claim of effective security controls.
ALTER TABLE threat_model_components DROP CONSTRAINT threat_model_components_type_check;
ALTER TABLE threat_model_components ADD CONSTRAINT threat_model_components_type_check CHECK(type IN (
  'PROCESS','SERVICE','API','DATABASE','DATASTORE','QUEUE','EXTERNAL_SYSTEM','USER','ADMIN','THIRD_PARTY','NETWORK_ZONE','CLOUD_SERVICE','DEVICE','OTHER',
  'CLIENT','MOBILE_APP','WEB_APP','MICROSERVICE','API_GATEWAY','CACHE','FILE_STORE','OBJECT_STORAGE','HSM_KMS','IDENTITY_PROVIDER'));
ALTER TABLE threat_model_components
  ADD COLUMN exposure varchar(32) NOT NULL DEFAULT 'UNKNOWN' CHECK(exposure IN ('UNKNOWN','INTERNAL','INTERNET','THIRD_PARTY')),
  ADD COLUMN authentication_method varchar(255),
  ADD COLUMN privileges varchar(32) NOT NULL DEFAULT 'UNKNOWN' CHECK(privileges IN ('UNKNOWN','NONE','STANDARD','PRIVILEGED')),
  ADD COLUMN hosting varchar(32) NOT NULL DEFAULT 'UNKNOWN' CHECK(hosting IN ('UNKNOWN','ON_PREMISES','PRIVATE_CLOUD','PUBLIC_CLOUD','HYBRID','THIRD_PARTY')),
  ADD COLUMN environment varchar(32) NOT NULL DEFAULT 'UNKNOWN' CHECK(environment IN ('UNKNOWN','DEVELOPMENT','TEST','STAGING','PRODUCTION','MIXED'));
ALTER TABLE threat_model_data_flows
  ADD COLUMN authorization_context varchar(4000),
  ADD COLUMN encryption_mechanism varchar(255),
  ADD COLUMN encryption_version varchar(64),
  ADD COLUMN integrity_protection varchar(32) NOT NULL DEFAULT 'UNKNOWN' CHECK(integrity_protection IN ('UNKNOWN','NONE','TRANSPORT','MESSAGE','BOTH')),
  ADD COLUMN internet_exposure boolean,
  ADD COLUMN third_party_involvement boolean,
  ADD COLUMN logging varchar(32) NOT NULL DEFAULT 'UNKNOWN' CHECK(logging IN ('UNKNOWN','NONE','METADATA','SECURITY_EVENTS','FULL')),
  ADD COLUMN purpose varchar(4000),
  ADD CONSTRAINT threat_flow_encryption_context CHECK (
    encryption_in_transit IS DISTINCT FROM false OR (encryption_mechanism IS NULL AND encryption_version IS NULL));
-- The 038 guard compares all security columns, so these additions participate in
-- content/architecture versioning, invalidation, exception binding and immutability.
