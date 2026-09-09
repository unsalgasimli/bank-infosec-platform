CREATE TABLE threat_finding_correlation_rules (
 id varchar(64) PRIMARY KEY,organization_id varchar(64) NOT NULL,code varchar(128) NOT NULL,version integer NOT NULL CHECK(version>0),
 finding_type varchar(64) NOT NULL,catalog_version_id varchar(64) NOT NULL REFERENCES threat_control_catalog_versions(id),
 minimum_severity varchar(16) NOT NULL CHECK(minimum_severity IN ('HIGH','CRITICAL')),
 minimum_confidence numeric NOT NULL CHECK(minimum_confidence BETWEEN 0.8 AND 1),require_exploitable boolean NOT NULL DEFAULT true,
 effect varchar(16) NOT NULL CHECK(effect IN ('DEGRADED','FAILED')),reason text NOT NULL CHECK(length(trim(reason))>=20),
 created_by varchar(64) NOT NULL REFERENCES bank_users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,code,version)
);
CREATE TABLE threat_finding_correlation_reviews (
 rule_id varchar(64) PRIMARY KEY REFERENCES threat_finding_correlation_rules(id),reviewed_by varchar(64) NOT NULL REFERENCES bank_users(id),
 decision varchar(16) NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),reason text NOT NULL CHECK(length(trim(reason))>=20),reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION guard_threat_correlation_authority() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aid varchar; author varchar; BEGIN
 aid:=COALESCE(to_jsonb(NEW)->>'reviewed_by',to_jsonb(NEW)->>'created_by');
 IF NOT EXISTS(SELECT 1 FROM bank_users WHERE id=aid AND is_active AND roles ?| ARRAY['APPSEC_ANALYST','INFOSEC_ADMIN','INFOSEC_MANAGER','CISO'] AND NOT roles ? 'AUDITOR') THEN RAISE EXCEPTION 'Security correlation policy authority required'; END IF;
 IF TG_TABLE_NAME='threat_finding_correlation_reviews' THEN
  SELECT created_by INTO author FROM threat_finding_correlation_rules WHERE id=NEW.rule_id;
  IF aid=author THEN RAISE EXCEPTION 'Independent correlation policy review required'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE VIEW threat_automatic_finding_impacts AS
WITH policy AS (
 SELECT DISTINCT ON(r.organization_id,r.code) r.* FROM threat_finding_correlation_rules r JOIN threat_finding_correlation_reviews v ON v.rule_id=r.id AND v.decision='APPROVED' ORDER BY r.organization_id,r.code,r.version DESC
)
SELECT DISTINCT m.id AS model_id,t.revision_id,t.id AS threat_id,c.id AS control_id,f.id AS finding_id,p.id AS policy_id,p.effect,p.reason,
 encode(sha256(convert_to(jsonb_build_object('id',f.id,'type',f.finding_type,'severity',f.severity,'state',f.state,'confidence',f.details->'confidence','exploitable',f.details->'exploitable','policy',p.id)::text,'UTF8')),'hex') AS fingerprint
FROM policy p JOIN threat_models m ON m.organization_id=p.organization_id
JOIN threats t ON t.revision_id=m.current_revision_id JOIN threat_control_threats ct ON ct.threat_id=t.id JOIN threat_controls c ON c.id=ct.control_id AND c.catalog_version_id=p.catalog_version_id
LEFT JOIN threat_model_components component ON component.id=t.affected_component_id AND component.revision_id=t.revision_id
JOIN cmdb_security_findings f ON f.asset_id IN(t.affected_asset_id,component.asset_id) AND f.finding_type=p.finding_type
WHERE m.status NOT IN ('RETIRED','ARCHIVED') AND f.state='OPEN'
 AND (f.severity='CRITICAL' OR (p.minimum_severity='HIGH' AND f.severity='HIGH'))
 AND CASE WHEN jsonb_typeof(f.details->'confidence')='number' THEN (f.details->>'confidence')::numeric>=p.minimum_confidence ELSE false END
 AND (NOT p.require_exploitable OR f.details->'exploitable'='true'::jsonb);
CREATE TABLE threat_finding_impact_events (
 id varchar(64) PRIMARY KEY,model_id varchar(64) NOT NULL REFERENCES threat_models(id),revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id),
 threat_id varchar(64) NOT NULL REFERENCES threats(id),control_id varchar(64) NOT NULL REFERENCES threat_controls(id),finding_id varchar(64) NOT NULL REFERENCES cmdb_security_findings(id),
 policy_id varchar(64) NOT NULL REFERENCES threat_finding_correlation_rules(id),fingerprint varchar(64) NOT NULL,effect varchar(16) NOT NULL CHECK(effect IN ('DEGRADED','FAILED')),
 reason text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),UNIQUE(revision_id,threat_id,control_id,finding_id,policy_id,fingerprint)
);
DO $$ DECLARE tbl text; BEGIN FOREACH tbl IN ARRAY ARRAY['threat_finding_correlation_rules','threat_finding_correlation_reviews','threat_finding_impact_events'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation()',tbl);
END LOOP;
FOREACH tbl IN ARRAY ARRAY['threat_finding_correlation_rules','threat_finding_correlation_reviews'] LOOP
 EXECUTE format('CREATE TRIGGER authority_guard BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION guard_threat_correlation_authority()',tbl);
END LOOP;END $$;
