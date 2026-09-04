-- Additive governance migration. Legacy approvals are preserved, not certified.
CREATE TABLE threat_governance_policy_versions (
  id varchar(64) PRIMARY KEY,
  organization_id varchar(64) NOT NULL,
  version integer NOT NULL CHECK(version > 0),
  effective_at timestamptz NOT NULL DEFAULT now(),
  config jsonb NOT NULL,
  created_by varchar(64) REFERENCES bank_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, version)
);
INSERT INTO threat_governance_policy_versions(id,organization_id,version,config) VALUES
('tmgp-bank-1','org-bank',1,'{"reviewMonths":{"0":24,"1":12,"2":12,"3":6},"exceptionDays":{"CRITICAL":7,"HIGH":30,"MEDIUM":90,"LOW":180},"retentionYearsAfterDecommission":7,"postEmergencyReviewBusinessDays":2,"postEmergencyModelBusinessDays":5,"scoreThresholds":{"1":1,"2":5,"3":20}}');
CREATE TABLE threat_screening_rules (
  policy_version_id varchar(64) NOT NULL REFERENCES threat_governance_policy_versions(id) ON DELETE RESTRICT,
  signal varchar(64) NOT NULL,
  reason text NOT NULL,
  weight integer NOT NULL CHECK(weight BETWEEN 0 AND 100),
  minimum_tier smallint NOT NULL CHECK(minimum_tier BETWEEN 0 AND 3),
  PRIMARY KEY(policy_version_id,signal)
);
INSERT INTO threat_screening_rules SELECT 'tmgp-bank-1', signal, 'Critical security capability: ' || signal,10,3
FROM unnest(ARRAY['paymentRelated','financialTransactions','authenticationChange','iamPamRelated','cryptography','bankSecrecy','sensitivePersonalData','privilegedCapability','criticalInfrastructure','coreBankingRelated','criticalThirdParty','highValueBusinessLogic']) signal;
INSERT INTO threat_screening_rules SELECT 'tmgp-bank-1', signal, 'Security impact: ' || signal,5,2
FROM unnest(ARRAY['internetExposed','customerData','confidentialData','authorizationChange','externalApi','trustBoundary','thirdPartyIntegration','cloudDeployment','newDataStore','secretsHandling','materialArchitectureChange','highCriticalAsset','securityIncidentDriven','criticalVulnerability','aiIntegration','newMobileFunctionality','newMessageBroker']) signal;
INSERT INTO threat_screening_rules VALUES('tmgp-bank-1','internalChange','Internal application/change requires lite analysis',1,1);

ALTER TABLE threat_model_revisions ADD COLUMN policy_version_id varchar(64) REFERENCES threat_governance_policy_versions(id) ON DELETE RESTRICT;
ALTER TABLE threat_model_revisions ADD COLUMN tier smallint CHECK(tier BETWEEN 0 AND 3);
ALTER TABLE threat_model_revisions ADD COLUMN review_cycle integer NOT NULL DEFAULT 0;
ALTER TABLE threat_model_approvals ADD COLUMN review_cycle integer NOT NULL DEFAULT 0;
ALTER TABLE threat_model_applicability ADD COLUMN revision_id varchar(64) REFERENCES threat_model_revisions(id) ON DELETE RESTRICT;
ALTER TABLE threat_model_applicability ADD COLUMN policy_version_id varchar(64) REFERENCES threat_governance_policy_versions(id) ON DELETE RESTRICT;
ALTER TABLE threat_model_applicability ADD COLUMN calculated_tier smallint CHECK(calculated_tier BETWEEN 0 AND 3);
ALTER TABLE threat_model_applicability ADD COLUMN score integer;
ALTER TABLE threat_model_applicability ADD COLUMN triggered_conditions jsonb;
ALTER TABLE threat_models ADD COLUMN stale_reason text;
ALTER TABLE threat_models ADD COLUMN retention_class varchar(64) NOT NULL DEFAULT 'LIFECYCLE_PLUS_7_YEARS';
ALTER TABLE threat_models ADD COLUMN legal_hold boolean NOT NULL DEFAULT false;
ALTER TABLE threat_models ADD COLUMN decommissioned_at timestamptz;
ALTER TABLE threat_models ADD COLUMN retain_until timestamptz;
ALTER TABLE threat_model_components ADD COLUMN security_zone varchar(128);
ALTER TABLE threat_model_exceptions ADD COLUMN remediation_owner_id varchar(64) REFERENCES bank_users(id) ON DELETE RESTRICT;
ALTER TABLE threat_model_exceptions ADD COLUMN remediation_plan text;
ALTER TABLE threat_model_exceptions ADD COLUMN remediation_deadline timestamptz;
ALTER TABLE threat_model_exceptions ADD COLUMN emergency boolean NOT NULL DEFAULT false;
ALTER TABLE threat_model_exceptions ADD COLUMN policy_version_id varchar(64) REFERENCES threat_governance_policy_versions(id) ON DELETE RESTRICT;
ALTER TABLE threat_model_audit_events ADD COLUMN event_sequence bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE threat_model_audit_events ADD COLUMN previous_hash varchar(64);
ALTER TABLE threat_model_audit_events ADD COLUMN event_hash varchar(64);
CREATE INDEX threat_audit_chain ON threat_model_audit_events(threat_model_id,event_sequence DESC);

CREATE TABLE threat_compliance_requirements (
  id varchar(64) PRIMARY KEY,
  framework varchar(128) NOT NULL,
  framework_version varchar(64) NOT NULL,
  code varchar(128) NOT NULL,
  title text NOT NULL,
  requirement_kind varchar(32) NOT NULL CHECK(requirement_kind IN ('REGULATORY_MINIMUM','BANK_POLICY','APPLICATION_REQUIREMENT')),
  source_url text,
  validation_status varchar(32) NOT NULL DEFAULT 'PENDING_VALIDATION' CHECK(validation_status IN ('PENDING_VALIDATION','VALIDATED')),
  created_by varchar(64) REFERENCES bank_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(framework,framework_version,code)
);
CREATE TABLE threat_security_requirements (
  id varchar(64) PRIMARY KEY,
  revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id) ON DELETE RESTRICT,
  title varchar(255) NOT NULL,
  description text NOT NULL,
  mandatory boolean NOT NULL DEFAULT true,
  owner_id varchar(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
  verification_method varchar(64) NOT NULL,
  created_by varchar(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(revision_id,title)
);
CREATE TABLE threat_requirement_threats (
  requirement_id varchar(64) NOT NULL REFERENCES threat_security_requirements(id) ON DELETE RESTRICT,
  threat_id varchar(64) NOT NULL REFERENCES threats(id) ON DELETE RESTRICT,
  PRIMARY KEY(requirement_id,threat_id)
);
CREATE TABLE threat_requirement_controls (
  requirement_id varchar(64) NOT NULL REFERENCES threat_security_requirements(id) ON DELETE RESTRICT,
  control_id varchar(64) NOT NULL REFERENCES threat_controls(id) ON DELETE RESTRICT,
  PRIMARY KEY(requirement_id,control_id)
);
CREATE TABLE threat_requirement_compliance (
  requirement_id varchar(64) NOT NULL REFERENCES threat_security_requirements(id) ON DELETE RESTRICT,
  compliance_id varchar(64) NOT NULL REFERENCES threat_compliance_requirements(id) ON DELETE RESTRICT,
  PRIMARY KEY(requirement_id,compliance_id)
);
CREATE TABLE threat_data_objects (
  id varchar(64) PRIMARY KEY,
  threat_model_id varchar(64) NOT NULL REFERENCES threat_models(id) ON DELETE RESTRICT,
  name varchar(255) NOT NULL,
  classification varchar(64) NOT NULL,
  personal_data boolean NOT NULL DEFAULT false,
  sensitive_personal_data boolean NOT NULL DEFAULT false,
  bank_secrecy boolean NOT NULL DEFAULT false,
  credential_data boolean NOT NULL DEFAULT false,
  payment_data boolean NOT NULL DEFAULT false,
  owner_id varchar(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
  retention text NOT NULL,
  allowed_locations text NOT NULL,
  encryption_requirements text NOT NULL,
  created_by varchar(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(threat_model_id,name)
);
CREATE TABLE threat_data_object_links (
  id varchar(64) PRIMARY KEY,
  data_object_id varchar(64) NOT NULL REFERENCES threat_data_objects(id) ON DELETE RESTRICT,
  revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id) ON DELETE RESTRICT,
  component_id varchar(64) REFERENCES threat_model_components(id) ON DELETE RESTRICT,
  flow_id varchar(64) REFERENCES threat_model_data_flows(id) ON DELETE RESTRICT,
  CHECK((component_id IS NOT NULL)::int + (flow_id IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX threat_data_component_unique ON threat_data_object_links(data_object_id,component_id) WHERE component_id IS NOT NULL;
CREATE UNIQUE INDEX threat_data_flow_unique ON threat_data_object_links(data_object_id,flow_id) WHERE flow_id IS NOT NULL;
CREATE TABLE threat_model_approval_snapshots (
  revision_id varchar(64) PRIMARY KEY REFERENCES threat_model_revisions(id) ON DELETE RESTRICT,
  snapshot jsonb NOT NULL,
  sha256 varchar(64) NOT NULL CHECK(length(sha256)=64),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX threat_models_review_due ON threat_models(next_review_at) WHERE status='APPROVED';
CREATE INDEX threat_models_owner ON threat_models(technical_owner_id,updated_at DESC);
CREATE INDEX threat_exceptions_expiry ON threat_model_exceptions(expires_at,status);
CREATE INDEX threat_verification_latest ON control_verifications(control_id,executed_at DESC,id);
CREATE INDEX threat_screening_revision ON threat_model_applicability(revision_id,assessed_at DESC);

-- Finalized versions cannot be rewritten even by another application write path.
CREATE FUNCTION protect_threat_revision_content() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid varchar(64); oldrid varchar(64); state varchar(32);
BEGIN
  IF TG_TABLE_NAME='threat_model_revisions' THEN
    IF TG_OP='DELETE' OR OLD.status IN ('APPROVED','SUPERSEDED') THEN
      RAISE EXCEPTION 'Approved security revision is immutable' USING ERRCODE='55000';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF to_jsonb(OLD)->>'revision_id' IS DISTINCT FROM to_jsonb(NEW)->>'revision_id'
       OR to_jsonb(OLD)->>'threat_id' IS DISTINCT FROM to_jsonb(NEW)->>'threat_id'
       OR to_jsonb(OLD)->>'control_id' IS DISTINCT FROM to_jsonb(NEW)->>'control_id'
       OR to_jsonb(OLD)->>'requirement_id' IS DISTINCT FROM to_jsonb(NEW)->>'requirement_id' THEN
      RAISE EXCEPTION 'Security record parent cannot change' USING ERRCODE='55000';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN oldrid := to_jsonb(OLD)->>'revision_id'; ELSE oldrid := to_jsonb(NEW)->>'revision_id'; END IF;
  rid := oldrid;
  IF TG_TABLE_NAME='threat_controls' THEN SELECT revision_id INTO rid FROM threats WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.threat_id ELSE NEW.threat_id END;
  ELSIF TG_TABLE_NAME='control_verifications' THEN SELECT t.revision_id INTO rid FROM threats t JOIN threat_controls c ON c.threat_id=t.id WHERE c.id=CASE WHEN TG_OP='DELETE' THEN OLD.control_id ELSE NEW.control_id END;
  ELSIF TG_TABLE_NAME IN ('threat_requirement_threats','threat_requirement_controls','threat_requirement_compliance') THEN SELECT revision_id INTO rid FROM threat_security_requirements WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.requirement_id ELSE NEW.requirement_id END;
  END IF;
  SELECT status INTO state FROM threat_model_revisions WHERE id=rid FOR UPDATE;
  IF state IS NULL OR state NOT IN ('DRAFT','CHANGES_REQUIRED') THEN RAISE EXCEPTION 'Security revision content is immutable; create a draft' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER threat_revision_immutable BEFORE UPDATE OR DELETE ON threat_model_revisions FOR EACH ROW EXECUTE FUNCTION protect_threat_revision_content();
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['threat_model_components','threat_model_trust_boundaries','threat_model_data_flows','threats','threat_controls','control_verifications','threat_model_evidence','threat_security_requirements','threat_requirement_threats','threat_requirement_controls','threat_requirement_compliance','threat_data_object_links'] LOOP
    EXECUTE format('CREATE TRIGGER protect_revision_content BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_threat_revision_content()',tbl);
  END LOOP;
  FOREACH tbl IN ARRAY ARRAY['threat_governance_policy_versions','threat_screening_rules','threat_compliance_requirements','threat_model_applicability','threat_model_approval_snapshots','threat_data_objects','control_verifications'] LOOP
    EXECUTE format('CREATE TRIGGER append_only_security_record BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation()',tbl);
  END LOOP;
END $$;
