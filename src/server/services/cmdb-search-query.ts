import { isIP } from 'node:net';

export type AssetSearchMode = 'auto' | 'exact' | 'contains';
export const escapeSearchLike = (value: string): string => `%${value.normalize('NFKC').replace(/[\\%_]/g, '\\$&')}%`;
export function isExactAssetIdentifier(value: string): boolean {
  return Boolean(isIP(value)) || /^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(value)
    || /^[0-9a-f]{4}(?:\.[0-9a-f]{4}){2}$/i.test(value)
    || /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
    || /^ci[-_]/i.test(value);
}

function ownerAssetIds(parameter: string): string {
  const matchingUser = `(lower(u.full_name) LIKE lower(${parameter}) OR lower(u.username) LIKE lower(${parameter}))`;
  // Separate role joins use each actual FK access path; no asset-wide OR scan.
  return ['owner_user_id', 'technical_owner_user_id', 'business_owner_user_id'].map((column) =>
    `SELECT owned.id FROM bank_users u JOIN configuration_items owned ON owned.${column}=u.id WHERE ${matchingUser}`).join(' UNION ');
}

/** Return asset IDs using independent indexable branches, not per-asset subqueries. */
export function assetSearchPredicate(search: string, mode: AssetSearchMode, params: unknown[]): string {
  const exact = mode === 'exact' || (mode === 'auto' && isExactAssetIdentifier(search));
  params.push(exact ? search : escapeSearchLike(search));
  const p = `$${params.length}`;
  const term = `ARRAY[cmdb_search_normalize_term_v1(${p})]`;
  const assetMatch = exact ? `s.search_terms @> ${term}` : `s.search_text LIKE lower(${p})`;
  const sourceMatch = exact ? `sr.search_terms @> ${term}` : `sr.search_text LIKE lower(${p})`;
  const assetFallback = exact ? `cmdb_search_terms_v1(cmdb_asset_terms_payload_v1(s)) @> ${term}` : `cmdb_search_text_v1(cmdb_asset_search_payload_v1(s)) LIKE lower(${p})`;
  const sourceFallback = exact
    ? `cmdb_search_terms_v1(jsonb_build_array(sr.external_object_id,cmdb_source_terms_payload_v1(sr.normalized_payload))) @> ${term}`
    : `cmdb_search_text_v1(jsonb_build_array(sr.source_name,sr.external_object_id,cmdb_source_search_payload_v1(sr.normalized_payload))) LIKE lower(${p})`;
  const branches = [
    `SELECT s.id FROM configuration_items s WHERE s.search_document_version=1 AND ${assetMatch}`,
    `SELECT s.id FROM configuration_items s WHERE s.search_document_version<1 AND ${assetFallback}`,
    `SELECT sr.asset_id FROM cmdb_source_records sr WHERE sr.search_document_version=1 AND sr.asset_id IS NOT NULL AND ${sourceMatch}`,
    `SELECT sr.asset_id FROM cmdb_source_records sr WHERE sr.search_document_version<1 AND sr.asset_id IS NOT NULL AND ${sourceFallback}`,
  ];
  if (exact && isIP(search)) branches.push(`SELECT ip.asset_id FROM cmdb_ip_addresses ip WHERE ip.retired_at IS NULL AND ip.ip_address=${p}::inet`);
  if (!exact) branches.push(ownerAssetIds(p));
  if (!exact) branches.push(`SELECT ai.asset_id FROM cmdb_asset_identifiers ai WHERE ai.retired_at IS NULL AND lower(ai.normalized_value) LIKE lower(${p})`);
  // Source-less manually managed identifiers retain their existing authority.
  // The type-leading index is used with explicit known types for exact lookup.
  if (exact) branches.push(`SELECT ai.asset_id FROM cmdb_asset_identifiers ai WHERE ai.retired_at IS NULL
    AND ai.identifier_type_id IN ('HOSTNAME','FQDN','SERIAL_NUMBER','BIOS_UUID','VMWARE_INSTANCE_UUID','CLOUD_INSTANCE_ID','MAC_ADDRESS','AGENT_ID','EDR_DEVICE_ID','CORTEX_ASSET_ID','SCCM_RESOURCE_ID','AD_OBJECT_GUID','OTHER')
    AND ai.normalized_value IN (${p},cmdb_search_normalize_term_v1(${p}))`);
  return `a.id IN (${branches.join(' UNION ')})`;
}

export function assetOwnerPredicate(owner: string, params: unknown[]): string {
  params.push(escapeSearchLike(owner));
  const p = `$${params.length}`;
  return `a.id IN (${ownerAssetIds(p)}
    UNION SELECT s.id FROM configuration_items s WHERE s.type_id='directory_user' AND (lower(s.name) LIKE lower(${p}) OR lower(s.display_name) LIKE lower(${p}))
    UNION SELECT sr.asset_id FROM cmdb_source_records sr WHERE sr.search_document_version=1 AND sr.asset_id IS NOT NULL AND sr.search_owner_text LIKE lower(${p})
    UNION SELECT sr.asset_id FROM cmdb_source_records sr WHERE sr.search_document_version<1 AND sr.asset_id IS NOT NULL AND cmdb_search_text_v1(cmdb_source_owner_payload_v1(sr.normalized_payload)) LIKE lower(${p}))`;
}

export function assetOsPredicate(input: string | string[], params: unknown[]): string {
  const exact = Array.isArray(input);
  params.push(exact ? input.map((value) => value.trim().toLowerCase().replace(/\s+/g, ' ')) : escapeSearchLike(input));
  const p = `$${params.length}`;
  const match = (names: string) => exact ? `${names} && ${p}::text[]` : `EXISTS (SELECT 1 FROM unnest(${names}) os(name) WHERE os.name LIKE lower(${p}))`;
  const prefilter = (alias: string) => exact ? '' : `${alias}.search_text LIKE lower(${p}) AND `;
  return `a.id IN (
    SELECT s.id FROM configuration_items s WHERE s.search_document_version=1 AND ${prefilter('s')}${match('s.search_os_names')}
    UNION SELECT sr.asset_id FROM cmdb_source_records sr WHERE sr.search_document_version=1 AND sr.asset_id IS NOT NULL AND ${prefilter('sr')}${match('sr.search_os_names')}
    UNION SELECT s.id FROM configuration_items s WHERE s.search_document_version<1 AND ${match("cmdb_search_os_names_v1(jsonb_build_array(s.operating_system,s.os_version,s.source_payload #> '{operatingSystem}'))")}
    UNION SELECT sr.asset_id FROM cmdb_source_records sr WHERE sr.search_document_version<1 AND sr.asset_id IS NOT NULL AND ${match("cmdb_search_os_names_v1(sr.normalized_payload->'operatingSystem')")}
  )`;
}
