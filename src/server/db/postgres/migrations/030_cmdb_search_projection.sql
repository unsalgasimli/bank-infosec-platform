-- Additive, metadata-only column defaults. No table-wide backfill or blocking
-- index build here. Run db:search:prepare after migration, before rollout.
-- Search remains a disposable projection of canonical/source data, not authority.
ALTER TABLE configuration_items
  ADD COLUMN search_document_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN search_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN search_terms TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN search_os_names TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE cmdb_source_records
  ADD COLUMN search_document_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN search_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN search_owner_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN search_terms TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN search_os_names TEXT[] NOT NULL DEFAULT '{}';

CREATE FUNCTION cmdb_search_normalize_term_v1(value TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE result TEXT := lower(btrim(normalize(COALESCE(value,''), NFKC)));
BEGIN
  IF result ~ '^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$' OR result ~ '^[0-9a-f]{4}(\.[0-9a-f]{4}){2}$' THEN
    RETURN regexp_replace(result, '[:.\-]', '', 'g');
  END IF;
  IF result ~ '^[0-9.]+$' OR result LIKE '%:%' THEN
    BEGIN RETURN host(result::inet); EXCEPTION WHEN invalid_text_representation THEN NULL; END;
  END IF;
  RETURN result;
END $$;

CREATE FUNCTION cmdb_search_values_v1(payload JSONB) RETURNS SETOF TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT value #>> '{}' FROM jsonb_path_query(COALESCE(payload,'null'::jsonb),
    'strict $.** ? (@.type() == "string" || @.type() == "number")') AS value
$$;
CREATE FUNCTION cmdb_search_text_v1(payload JSONB) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(string_agg(value, E'\n' ORDER BY value),'') FROM (
    SELECT DISTINCT lower(normalize(value, NFKC)) AS value FROM cmdb_search_values_v1(payload) value
    WHERE btrim(value)<>''
  ) values_only
$$;
CREATE FUNCTION cmdb_search_terms_v1(payload JSONB) RETURNS TEXT[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(array_agg(value ORDER BY value),'{}'::text[]) FROM (
    SELECT DISTINCT cmdb_search_normalize_term_v1(value) AS value FROM cmdb_search_values_v1(payload) value
    WHERE btrim(value)<>''
  ) identifiers
$$;
CREATE FUNCTION cmdb_search_os_names_v1(payload JSONB) RETURNS TEXT[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(array_agg(value ORDER BY value),'{}'::text[]) FROM (
    SELECT DISTINCT lower(regexp_replace(btrim(value),'\s+',' ','g')) AS value
    FROM cmdb_search_values_v1(payload) value WHERE btrim(value)<>''
  ) names
$$;

-- Deliberate source-field allowlist: metadata keys, raw responses, credential
-- fields and unrelated security telemetry are not searchable owner identities.
CREATE FUNCTION cmdb_source_owner_payload_v1(payload JSONB) RETURNS JSONB
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_build_array(
    payload #> '{sourceSpecificMetadata,samAccountName}', payload #> '{sourceSpecificMetadata,upn}',
    payload #> '{sourceSpecificMetadata,mail}', payload #> '{sourceSpecificMetadata,displayName}',
    payload #> '{sourceSpecificMetadata,cortex,ownerName}', payload #> '{sourceSpecificMetadata,cortex,owner}',
    payload #> '{sourceSpecificMetadata,cortex,ownerCandidates}',
    payload #> '{sourceSpecificMetadata,cortex,securityTelemetry,user_name}',
    payload #> '{sourceSpecificMetadata,cortex,securityTelemetry,username}')
$$;
CREATE FUNCTION cmdb_source_search_payload_v1(payload JSONB) RETURNS JSONB
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_build_array(payload->'source',payload->'identity',payload->'classification',
    payload->'operatingSystem',payload->'network',payload->'storage',payload->'tags',
    payload->'technicalState',cmdb_source_owner_payload_v1(payload),
    payload #> '{sourceSpecificMetadata,distinguishedName}',payload #> '{sourceSpecificMetadata,ouPath}',
    payload #> '{sourceSpecificMetadata,department}',payload #> '{sourceSpecificMetadata,company}',
    payload #> '{sourceSpecificMetadata,cortex,assetId}',payload #> '{sourceSpecificMetadata,cortex,endpointId}',
    payload #> '{sourceSpecificMetadata,cortex,strongId}',payload #> '{sourceSpecificMetadata,cortex,businessApplications}',
    payload #> '{sourceSpecificMetadata,cortex,provider}',payload #> '{sourceSpecificMetadata,cortex,realm}',
    payload #> '{sourceSpecificMetadata,cortex,assetType}',payload #> '{sourceSpecificMetadata,cortex,hierarchyPath}')
$$;
CREATE FUNCTION cmdb_source_terms_payload_v1(payload JSONB) RETURNS JSONB
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_build_array(payload #> '{source,objectId}',payload #> '{source,nativeUuid}',
    payload #> '{identity,hostname}',payload #> '{identity,fqdn}',payload #> '{identity,serialNumber}',
    jsonb_path_query_array(payload,'$.identity.identifiers[*].value'),
    jsonb_path_query_array(payload,'$.network.interfaces[*].macAddresses[*]'),
    jsonb_path_query_array(payload,'$.network.interfaces[*].ipAddresses[*].address'),
    payload #> '{sourceSpecificMetadata,cortex,assetId}',payload #> '{sourceSpecificMetadata,cortex,endpointId}',
    payload #> '{sourceSpecificMetadata,cortex,strongId}')
$$;

CREATE FUNCTION cmdb_asset_search_payload_v1(asset configuration_items) RETURNS JSONB
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_build_array(asset.id,asset.ci_number,asset.asset_key,asset.name,asset.display_name,
    asset.hostname,asset.fqdn,asset.serial_number,asset.asset_tag,asset.ip_address,asset.mac_address,
    asset.operating_system,asset.os_version,asset.vendor,asset.manufacturer,asset.model,asset.description,asset.details)
$$;
CREATE FUNCTION cmdb_asset_terms_payload_v1(asset configuration_items) RETURNS JSONB
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_build_array(asset.id,asset.ci_number,asset.asset_key,asset.hostname,asset.fqdn,
    asset.serial_number,asset.asset_tag,asset.ip_address,asset.mac_address,asset.source_record_id)
$$;
CREATE FUNCTION cmdb_refresh_asset_search_v1() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.search_document_version=1 AND
      (cmdb_asset_search_payload_v1(NEW),NEW.source_record_id,NEW.source_payload #> '{operatingSystem}')
      IS NOT DISTINCT FROM
      (cmdb_asset_search_payload_v1(OLD),OLD.source_record_id,OLD.source_payload #> '{operatingSystem}') THEN RETURN NEW; END IF;
  END IF;
  NEW.search_text := cmdb_search_text_v1(cmdb_asset_search_payload_v1(NEW));
  NEW.search_terms := cmdb_search_terms_v1(cmdb_asset_terms_payload_v1(NEW));
  NEW.search_os_names := cmdb_search_os_names_v1(jsonb_build_array(NEW.operating_system,NEW.os_version,NEW.source_payload #> '{operatingSystem}'));
  NEW.search_document_version := 1;
  RETURN NEW;
END $$;
CREATE TRIGGER cmdb_refresh_asset_search_v1 BEFORE INSERT OR UPDATE OF
  ci_number,asset_key,name,display_name,hostname,fqdn,serial_number,asset_tag,ip_address,mac_address,
  operating_system,os_version,vendor,manufacturer,model,description,details,source_record_id,source_payload,search_document_version
  ON configuration_items FOR EACH ROW EXECUTE FUNCTION cmdb_refresh_asset_search_v1();

CREATE FUNCTION cmdb_refresh_source_search_v1() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.search_document_version=1 AND
      (NEW.normalized_payload,NEW.source_name,NEW.external_object_id) IS NOT DISTINCT FROM
      (OLD.normalized_payload,OLD.source_name,OLD.external_object_id) THEN RETURN NEW; END IF;
  END IF;
  NEW.search_text := cmdb_search_text_v1(jsonb_build_array(NEW.source_name,NEW.external_object_id,cmdb_source_search_payload_v1(NEW.normalized_payload)));
  NEW.search_owner_text := cmdb_search_text_v1(cmdb_source_owner_payload_v1(NEW.normalized_payload));
  NEW.search_terms := cmdb_search_terms_v1(jsonb_build_array(NEW.external_object_id,cmdb_source_terms_payload_v1(NEW.normalized_payload)));
  NEW.search_os_names := cmdb_search_os_names_v1(NEW.normalized_payload->'operatingSystem');
  NEW.search_document_version := 1;
  RETURN NEW;
END $$;
CREATE TRIGGER cmdb_refresh_source_search_v1 BEFORE INSERT OR UPDATE OF
  normalized_payload,source_name,external_object_id,search_document_version
  ON cmdb_source_records FOR EACH ROW EXECUTE FUNCTION cmdb_refresh_source_search_v1();

COMMENT ON COLUMN configuration_items.search_document_version IS 'Disposable search projection. Version 0 rows use bounded rollout fallback until db:search:prepare backfills them.';
COMMENT ON COLUMN cmdb_source_records.search_document_version IS 'Disposable source search projection; freshness-only updates do not recompute it.';
