-- SERVICE may be a canonical bank application or a configuration item. Retain
-- the model's existing canonical scope contract, not a narrower accidental FK.
ALTER TABLE threat_delivery_mappings DROP CONSTRAINT threat_delivery_mappings_application_id_fkey;
ALTER TABLE threat_deployment_authorizations DROP CONSTRAINT threat_deployment_authorizations_application_id_fkey;
CREATE FUNCTION guard_threat_delivery_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m threat_models; a threat_delivery_mappings; BEGIN
 IF TG_TABLE_NAME='threat_delivery_mappings' THEN
  SELECT * INTO m FROM threat_models WHERE id=NEW.model_id;
  IF NOT COALESCE(NEW.application_id IN(m.service_id,m.asset_id),false) OR NOT COALESCE(NEW.release_id IN(m.release_id,m.change_id),false) THEN RAISE EXCEPTION 'Delivery mapping canonical model scope mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM bank_users WHERE id=NEW.updated_by AND is_active AND roles ? 'RELEASE_AUTHORITY' AND roles ?| ARRAY['CISO','INFOSEC_ADMIN'] AND NOT roles ? 'AUDITOR') THEN RAISE EXCEPTION 'Delivery administration and explicit release authority required'; END IF;
 ELSE
  SELECT * INTO a FROM threat_delivery_mappings WHERE id=NEW.mapping_id;
  SELECT * INTO m FROM threat_models WHERE id=a.model_id;
  IF NOT a.enabled OR NEW.mapping_version IS DISTINCT FROM a.version OR NEW.application_id IS DISTINCT FROM a.application_id OR NEW.release_id IS DISTINCT FROM a.release_id OR NEW.project_id IS DISTINCT FROM a.project_id OR NEW.environment IS DISTINCT FROM a.environment OR NEW.revision_id IS DISTINCT FROM m.current_revision_id THEN RAISE EXCEPTION 'Deployment authorization canonical binding mismatch'; END IF;
  IF NEW.commit_sha !~ '^[a-f0-9]{40}([a-f0-9]{24})?$' OR NEW.expires_at>NEW.issued_at+interval '5 minutes' THEN RAISE EXCEPTION 'Invalid deployment commit or lifetime'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER delivery_mapping_scope BEFORE INSERT OR UPDATE ON threat_delivery_mappings FOR EACH ROW EXECUTE FUNCTION guard_threat_delivery_scope();
CREATE TRIGGER deployment_authorization_scope BEFORE INSERT ON threat_deployment_authorizations FOR EACH ROW EXECUTE FUNCTION guard_threat_delivery_scope();
