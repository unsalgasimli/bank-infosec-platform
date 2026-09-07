-- Coverage is derived from canonical revision content; old decisions are retained.
CREATE TABLE threat_analysis_policy_versions (
  id varchar(64) PRIMARY KEY, version integer UNIQUE NOT NULL, effective_at timestamptz NOT NULL DEFAULT now(),
  rules jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO threat_analysis_policy_versions(id,version,rules) VALUES('analysis-bank-v1',1,'{
 "PROCESS":["SPOOFING","TAMPERING","REPUDIATION","INFORMATION_DISCLOSURE","DENIAL_OF_SERVICE","ELEVATION_OF_PRIVILEGE"],
 "STORE":["TAMPERING","REPUDIATION","INFORMATION_DISCLOSURE","DENIAL_OF_SERVICE","ELEVATION_OF_PRIVILEGE"],
 "ACTOR":["SPOOFING","REPUDIATION"],
 "FLOW":["TAMPERING","INFORMATION_DISCLOSURE","DENIAL_OF_SERVICE"],
 "BOUNDARY":["SPOOFING","TAMPERING","ELEVATION_OF_PRIVILEGE"],
 "DATA":["TAMPERING","INFORMATION_DISCLOSURE"],
 "EXTERNAL_INTEGRATION":["SPOOFING","TAMPERING","INFORMATION_DISCLOSURE"],
 "PRIVILEGED_INTERFACE":["SPOOFING","REPUDIATION","ELEVATION_OF_PRIVILEGE"],
 "BUSINESS":["UNAUTHORIZED_ACTION","REPLAY","APPROVAL_BYPASS","ACCOUNT_TAKEOVER","REPUDIATION","RACE_CONDITION","LIMIT_BYPASS","PRIVILEGE_ABUSE"],
 "PAYMENT":["UNAUTHORIZED_TRANSACTION","TRANSACTION_MANIPULATION","REPLAY","BENEFICIARY_SUBSTITUTION","AMOUNT_MANIPULATION","APPROVAL_BYPASS","ACCOUNT_TAKEOVER","REPUDIATION","RACE_CONDITION","LIMIT_BYPASS","PRIVILEGE_ABUSE"]
}');
CREATE TABLE threat_business_capabilities (
 id varchar(64) PRIMARY KEY, revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id),
 component_id varchar(64) NOT NULL REFERENCES threat_model_components(id),
 kind varchar(64) NOT NULL CHECK(kind IN ('LOGIN','ACCOUNT_RECOVERY','PAYMENT_INITIATION','BENEFICIARY_MANAGEMENT','TRANSACTION_AUTHORIZATION','PRIVILEGE_CHANGE','ADMINISTRATION','SENSITIVE_EXPORT','ACCOUNT_LIFECYCLE','CRITICAL_CONFIGURATION','OTHER')),
 name varchar(255) NOT NULL, created_by varchar(64) NOT NULL REFERENCES bank_users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(revision_id,component_id,kind)
);
CREATE VIEW threat_analysis_expected_targets AS
 SELECT c.revision_id,'COMPONENT'::text AS target_type,c.id::text AS target_id,c.name::text AS label,
 CASE WHEN c.type IN ('DATABASE','DATASTORE','CACHE','FILE_STORE','OBJECT_STORAGE','QUEUE') THEN 'STORE' WHEN c.type IN ('USER','CLIENT','DEVICE','EXTERNAL_SYSTEM','THIRD_PARTY') THEN 'ACTOR' ELSE 'PROCESS' END AS rule,
 architecture_security_content(to_jsonb(c)) AS facts,c.id AS component_id,NULL::varchar AS flow_id,NULL::varchar AS boundary_id
 FROM threat_model_components c
 UNION ALL SELECT f.revision_id,'FLOW',f.id,f.name,'FLOW',architecture_security_content(to_jsonb(f)) || jsonb_build_object('source',architecture_security_content(to_jsonb(s)),'destination',architecture_security_content(to_jsonb(d))),NULL,f.id,NULL
 FROM threat_model_data_flows f JOIN threat_model_components s ON s.id=f.source_component_id JOIN threat_model_components d ON d.id=f.destination_component_id
 UNION ALL SELECT f.revision_id,'BOUNDARY_CROSSING',f.id,b.name||': '||f.name,'BOUNDARY',architecture_security_content(to_jsonb(f))||jsonb_build_object('boundary',architecture_security_content(to_jsonb(b))),NULL,f.id,b.id
 FROM threat_model_data_flows f JOIN threat_model_trust_boundaries b ON b.id=f.trust_boundary_id WHERE f.crosses_trust_boundary
 UNION ALL SELECT b.revision_id,'BOUNDARY',b.id,b.name,'BOUNDARY',architecture_security_content(to_jsonb(b)),NULL,NULL,b.id FROM threat_model_trust_boundaries b
 UNION ALL SELECT l.revision_id,'DATA_CONTEXT',l.id,d.name,'DATA',to_jsonb(d)||jsonb_build_object('component',architecture_security_content(to_jsonb(c)),'flow',architecture_security_content(to_jsonb(f))),l.component_id,l.flow_id,NULL
 FROM threat_data_object_links l JOIN threat_data_objects d ON d.id=l.data_object_id LEFT JOIN threat_model_components c ON c.id=l.component_id LEFT JOIN threat_model_data_flows f ON f.id=l.flow_id
 WHERE d.classification NOT IN ('PUBLIC','INTERNAL') OR d.personal_data OR d.credential_data OR d.payment_data
 UNION ALL SELECT c.revision_id,'EXTERNAL_INTEGRATION',c.id,c.name,'EXTERNAL_INTEGRATION',architecture_security_content(to_jsonb(c)),c.id,NULL,NULL FROM threat_model_components c WHERE c.exposure='THIRD_PARTY' OR c.hosting='THIRD_PARTY' OR c.type IN ('THIRD_PARTY','EXTERNAL_SYSTEM')
 UNION ALL SELECT c.revision_id,'PRIVILEGED_INTERFACE',c.id,c.name,'PRIVILEGED_INTERFACE',architecture_security_content(to_jsonb(c)),c.id,NULL,NULL FROM threat_model_components c WHERE c.privileges='PRIVILEGED' OR c.type='ADMIN'
 UNION ALL SELECT b.revision_id,'BUSINESS_CAPABILITY',b.id,b.name,CASE WHEN b.kind IN ('PAYMENT_INITIATION','BENEFICIARY_MANAGEMENT','TRANSACTION_AUTHORIZATION') THEN 'PAYMENT' ELSE 'BUSINESS' END,to_jsonb(b)||jsonb_build_object('component',architecture_security_content(to_jsonb(c))),c.id,NULL,NULL FROM threat_business_capabilities b JOIN threat_model_components c ON c.id=b.component_id;
CREATE VIEW threat_analysis_expected_units AS
 SELECT t.*,p.id AS policy_id,category.value AS category,
 encode(sha256(convert_to((t.facts||jsonb_build_object('policy',p.id,'category',category.value))::text,'UTF8')),'hex') AS fingerprint,
 md5(t.revision_id||':'||t.target_type||':'||t.target_id||':'||category.value||':'||p.id) AS id
 FROM threat_analysis_expected_targets t JOIN threat_model_revisions r ON r.id=t.revision_id
 CROSS JOIN LATERAL (SELECT * FROM threat_analysis_policy_versions WHERE effective_at<=now() ORDER BY version DESC LIMIT 1) p
 CROSS JOIN LATERAL jsonb_array_elements_text(p.rules->t.rule) category
 WHERE r.tier>=2 AND (t.target_type<>'BUSINESS_CAPABILITY' OR r.tier=3);
CREATE TABLE threat_analysis_units (
 id varchar(64) PRIMARY KEY, revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id),
 target_type varchar(64) NOT NULL,target_id varchar(64) NOT NULL, category varchar(64) NOT NULL,
 policy_id varchar(64) NOT NULL REFERENCES threat_analysis_policy_versions(id), fingerprint varchar(64) NOT NULL,
 architecture_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(revision_id,target_type,target_id,category,policy_id,fingerprint)
);
CREATE TABLE threat_analysis_dispositions (
 id varchar(64) PRIMARY KEY, unit_id varchar(64) NOT NULL REFERENCES threat_analysis_units(id),
 disposition varchar(32) NOT NULL CHECK(disposition IN ('THREAT_IDENTIFIED','REVIEWED_NO_THREAT','NOT_APPLICABLE')),
 threat_id varchar(64) REFERENCES threats(id), threat_version integer, reason text NOT NULL CHECK(length(trim(reason))>=20),
 analyst_id varchar(64) NOT NULL REFERENCES bank_users(id),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((disposition='THREAT_IDENTIFIED')=(threat_id IS NOT NULL))
);
CREATE TABLE threat_analysis_reviews (
 disposition_id varchar(64) PRIMARY KEY REFERENCES threat_analysis_dispositions(id),
 reviewer_id varchar(64) NOT NULL REFERENCES bank_users(id), decision varchar(16) NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),
 reason text NOT NULL CHECK(length(trim(reason))>=20), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX threat_analysis_disposition_latest ON threat_analysis_dispositions(unit_id,created_at DESC,id);
CREATE FUNCTION guard_threat_analysis_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u threat_analysis_units; e record; d threat_analysis_dispositions; t threats; roles jsonb;
BEGIN
 IF TG_TABLE_NAME='threat_analysis_reviews' THEN
   SELECT * INTO d FROM threat_analysis_dispositions WHERE id=NEW.disposition_id;
   SELECT * INTO u FROM threat_analysis_units WHERE id=d.unit_id;
   SELECT bank_users.roles INTO roles FROM bank_users WHERE id=NEW.reviewer_id AND is_active;
   IF NEW.reviewer_id=d.analyst_id OR roles IS NULL OR roles ? 'AUDITOR' OR NOT(roles ?| ARRAY['APPSEC_ANALYST','INFOSEC_ADMIN','INFOSEC_MANAGER','CISO']) THEN RAISE EXCEPTION 'Independent AppSec authority required for coverage review'; END IF;
 ELSE
   SELECT * INTO u FROM threat_analysis_units WHERE id=NEW.unit_id;
   IF NEW.threat_id IS NOT NULL THEN
     SELECT * INTO t FROM threats WHERE id=NEW.threat_id AND revision_id=u.revision_id;
     SELECT * INTO e FROM threat_analysis_expected_units WHERE revision_id=u.revision_id AND target_type=u.target_type AND target_id=u.target_id AND category=u.category AND fingerprint=u.fingerprint;
     IF t.id IS NULL OR NEW.threat_version IS DISTINCT FROM t.content_version OR NOT(COALESCE(t.affected_component_id=e.component_id,false) OR COALESCE(t.affected_data_flow_id=e.flow_id,false) OR COALESCE(t.affected_trust_boundary_id=e.boundary_id,false)) THEN RAISE EXCEPTION 'Coverage threat must match current target and content version'; END IF;
     IF e.target_type='BUSINESS_CAPABILITY' THEN
       IF NOT EXISTS(SELECT 1 FROM threat_attack_cases WHERE threat_id=t.id AND revision_id=u.revision_id) THEN RAISE EXCEPTION 'Business coverage requires a structured abuse case'; END IF;
     ELSIF NOT(t.categories ? u.category) THEN RAISE EXCEPTION 'Threat category does not cover analysis unit'; END IF;
   END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM threat_model_revisions r JOIN threat_models m ON m.current_revision_id=r.id WHERE r.id=u.revision_id AND r.status IN ('DRAFT','CHANGES_REQUIRED') AND m.status NOT IN ('RETIRED','ARCHIVED')) THEN RAISE EXCEPTION 'Coverage decisions require current mutable revision'; END IF;
 IF NOT EXISTS(SELECT 1 FROM threat_analysis_expected_units e WHERE e.revision_id=u.revision_id AND e.target_type=u.target_type AND e.target_id=u.target_id AND e.category=u.category AND e.policy_id=u.policy_id AND e.fingerprint=u.fingerprint) THEN RAISE EXCEPTION 'Coverage target changed; reassessment required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER analysis_disposition_guard BEFORE INSERT ON threat_analysis_dispositions FOR EACH ROW EXECUTE FUNCTION guard_threat_analysis_decision();
CREATE TRIGGER analysis_review_guard BEFORE INSERT ON threat_analysis_reviews FOR EACH ROW EXECUTE FUNCTION guard_threat_analysis_decision();
CREATE VIEW threat_analysis_coverage AS
 SELECT e.*,u.id AS unit_id,d.id AS disposition_id,d.disposition,d.analyst_id,d.reason,v.decision AS review_decision,
 (d.id IS NOT NULL AND v.decision='APPROVED' AND (d.threat_id IS NULL OR EXISTS(SELECT 1 FROM threats t WHERE t.id=d.threat_id AND t.content_version=d.threat_version))) IS TRUE AS completed
 FROM threat_analysis_expected_units e
 LEFT JOIN threat_analysis_units u ON u.revision_id=e.revision_id AND u.target_type=e.target_type AND u.target_id=e.target_id AND u.category=e.category AND u.policy_id=e.policy_id AND u.fingerprint=e.fingerprint
 LEFT JOIN LATERAL (SELECT * FROM threat_analysis_dispositions WHERE unit_id=u.id ORDER BY created_at DESC,id DESC LIMIT 1) d ON true
 LEFT JOIN threat_analysis_reviews v ON v.disposition_id=d.id;
CREATE FUNCTION assert_threat_analysis_coverage(rid varchar) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM threat_analysis_coverage WHERE revision_id=rid AND NOT completed) THEN RAISE EXCEPTION 'TM_COVERAGE_INCOMPLETE: mandatory analysis decisions require independent review'; END IF;
 IF EXISTS(SELECT 1 FROM threat_model_revisions WHERE id=rid AND tier=3) AND NOT EXISTS(SELECT 1 FROM threat_business_capabilities WHERE revision_id=rid) THEN RAISE EXCEPTION 'ABUSE_ANALYSIS_INCOMPLETE: identify critical business capabilities'; END IF;
END $$;
CREATE FUNCTION guard_threat_coverage_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status IN ('IN_REVIEW','APPROVED') AND OLD.status IS DISTINCT FROM NEW.status THEN PERFORM assert_threat_analysis_coverage(NEW.id); END IF; RETURN NEW;
END $$;
CREATE TRIGGER threat_coverage_transition BEFORE UPDATE ON threat_model_revisions FOR EACH ROW EXECUTE FUNCTION guard_threat_coverage_transition();
CREATE TRIGGER business_capability_mutable BEFORE INSERT OR UPDATE OR DELETE ON threat_business_capabilities FOR EACH ROW EXECUTE FUNCTION protect_threat_revision_content();
DO $$ DECLARE tbl text; BEGIN FOREACH tbl IN ARRAY ARRAY['threat_analysis_policy_versions','threat_analysis_units','threat_analysis_dispositions','threat_analysis_reviews'] LOOP
 EXECUTE format('CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation()',tbl);
END LOOP; END $$;
