-- Reuse the same retained binary across revisions without reusing an old verification.
-- Preserve all existing links; only new links opt into the revision-aware uniqueness contract.
ALTER TABLE threat_model_evidence DROP CONSTRAINT threat_model_evidence_attachment_id_linked_entity_type_link_key;
ALTER TABLE threat_model_evidence ADD COLUMN link_contract_version smallint NOT NULL DEFAULT 1 CHECK(link_contract_version IN (1,2));
CREATE UNIQUE INDEX threat_evidence_revision_target_unique ON threat_model_evidence(
  attachment_id,threat_model_id,revision_id,COALESCE(control_id,''),COALESCE(threat_id,'')) WHERE link_contract_version=2;
