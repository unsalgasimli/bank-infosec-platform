ALTER TABLE threats
  ADD COLUMN methodology varchar(32) NOT NULL DEFAULT 'STRIDE' CHECK(methodology IN ('STRIDE','ABUSE_CASE','ATTACK_TREE','OTHER')),
  ADD COLUMN source varchar(32) NOT NULL DEFAULT 'LEGACY_UNSPECIFIED' CHECK(source IN ('MANUAL','AI_ASSISTED','RULE','IMPORT','LEGACY_UNSPECIFIED')),
  ADD COLUMN assumptions varchar(10000),
  ADD COLUMN confidentiality_impact smallint CHECK(confidentiality_impact BETWEEN 1 AND 5),
  ADD COLUMN integrity_impact smallint CHECK(integrity_impact BETWEEN 1 AND 5),
  ADD COLUMN availability_impact smallint CHECK(availability_impact BETWEEN 1 AND 5),
  ADD COLUMN security_properties jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(security_properties)='array' AND jsonb_array_length(security_properties)<=6 AND security_properties <@ '["CONFIDENTIALITY","INTEGRITY","AVAILABILITY","AUTHENTICITY","ACCOUNTABILITY","NON_REPUDIATION"]'::jsonb),
  ADD COLUMN analysis_version integer NOT NULL DEFAULT 1 CHECK(analysis_version>0);
CREATE OR REPLACE FUNCTION threat_authored_content(value threats) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb($1))
  WHERE key=ANY(ARRAY['title','description','categories','attack_scenario','attacker_type','attacker_capability','preconditions','attack_path',
    'affected_component_id','affected_data_flow_id','affected_trust_boundary_id','affected_asset_id','cwe_ids','capec_ids','inherent_likelihood','inherent_impact','owner_id','due_date',
    'methodology','source','assumptions','confidentiality_impact','integrity_impact','availability_impact','security_properties','analysis_version']);
$$;
DROP VIEW threat_details;
CREATE VIEW threat_details AS SELECT t.*,m.lineage_id,m.origin AS lineage_origin FROM threats t JOIN threat_lineage_members m ON m.threat_id=t.id;

CREATE TABLE threat_analysis_suggestions (
  id varchar(64) PRIMARY KEY,
  revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id),
  architecture_version integer NOT NULL CHECK(architecture_version>0),
  source varchar(32) NOT NULL CHECK(source IN ('RULE','AI_ASSISTED','IMPORT')),
  provider varchar(128), model_version varchar(128), rule_version varchar(128),
  provenance_kind varchar(32) NOT NULL CHECK(provenance_kind IN ('SERVER_RULE','USER_SUPPLIED')),
  provenance_reference varchar(2000),
  proposed_content jsonb NOT NULL CHECK(jsonb_typeof(proposed_content)='object' AND octet_length(proposed_content::text)<=100000),
  fingerprint varchar(64) NOT NULL,
  created_by varchar(64) NOT NULL REFERENCES bank_users(id), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(source<>'AI_ASSISTED' OR (provider IS NOT NULL AND model_version IS NOT NULL)),
  CHECK(source<>'RULE' OR rule_version IS NOT NULL),
  UNIQUE(revision_id,architecture_version,fingerprint)
);
CREATE TABLE threat_suggestion_dispositions (
  id varchar(64) PRIMARY KEY,
  suggestion_id varchar(64) NOT NULL UNIQUE REFERENCES threat_analysis_suggestions(id),
  decision varchar(32) NOT NULL CHECK(decision IN ('ACCEPTED','MODIFIED','REJECTED','DUPLICATE')),
  reason varchar(4000) NOT NULL CHECK(length(trim(reason))>0),
  threat_id varchar(64) REFERENCES threats(id),
  decided_by varchar(64) NOT NULL REFERENCES bank_users(id), decided_at timestamptz NOT NULL DEFAULT now(),
  CHECK((decision='REJECTED' AND threat_id IS NULL) OR (decision<>'REJECTED' AND threat_id IS NOT NULL))
);
CREATE TABLE threat_attack_cases (
  id varchar(64) PRIMARY KEY, revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id),
  threat_id varchar(64) NOT NULL REFERENCES threats(id),
  title varchar(255) NOT NULL, objective varchar(10000) NOT NULL,
  assumptions varchar(10000) NOT NULL, methodology varchar(32) NOT NULL CHECK(methodology IN ('ABUSE_CASE','ATTACK_TREE')),
  created_by varchar(64) NOT NULL REFERENCES bank_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE threat_attack_nodes (
  id varchar(64) PRIMARY KEY, case_id varchar(64) NOT NULL REFERENCES threat_attack_cases(id),
  parent_id varchar(64), node_kind varchar(16) NOT NULL CHECK(node_kind IN ('AND','OR','STEP')),
  label varchar(2000) NOT NULL, ordinal integer NOT NULL CHECK(ordinal>=0),
  UNIQUE(case_id,id), UNIQUE(case_id,ordinal),
  FOREIGN KEY(case_id,parent_id) REFERENCES threat_attack_nodes(case_id,id) DEFERRABLE INITIALLY DEFERRED,
  CHECK(parent_id IS DISTINCT FROM id)
);
CREATE FUNCTION guard_threat_analysis() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid varchar(64); actor_roles jsonb; suggestion threat_analysis_suggestions;
BEGIN
  IF TG_TABLE_NAME='threat_suggestion_dispositions' THEN
    SELECT * INTO suggestion FROM threat_analysis_suggestions WHERE id=NEW.suggestion_id;
    rid:=suggestion.revision_id;
    SELECT roles INTO actor_roles FROM bank_users WHERE id=NEW.decided_by AND is_active;
    IF actor_roles IS NULL OR NOT (actor_roles ?| ARRAY['CISO','INFOSEC_ADMIN','INFOSEC_MANAGER','APPSEC_ANALYST']) OR actor_roles ? 'AUDITOR' THEN
      RAISE EXCEPTION 'Security authority required for analyst disposition' USING ERRCODE='23514';
    END IF;
    IF NEW.threat_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM threats WHERE id=NEW.threat_id AND revision_id=rid) THEN
      RAISE EXCEPTION 'Disposition threat must belong to the suggestion revision' USING ERRCODE='23514';
    END IF;
    IF NEW.decision IN ('ACCEPTED','MODIFIED') AND suggestion.architecture_version<>(SELECT architecture_version FROM threat_model_revisions WHERE id=rid) THEN
      RAISE EXCEPTION 'Stale suggestion requires fresh architecture analysis' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='threat_attack_nodes' THEN SELECT revision_id INTO rid FROM threat_attack_cases WHERE id=NEW.case_id;
  ELSE rid:=NEW.revision_id;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM threat_model_revisions WHERE id=rid AND status IN ('DRAFT','CHANGES_REQUIRED')) THEN
    RAISE EXCEPTION 'Security revision content is immutable; create a draft' USING ERRCODE='55000';
  END IF;
  IF TG_TABLE_NAME='threat_attack_cases' THEN
    IF NOT EXISTS(SELECT 1 FROM threats WHERE id=NEW.threat_id AND revision_id=rid) THEN RAISE EXCEPTION 'Case threat must belong to the current revision' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['threat_analysis_suggestions','threat_suggestion_dispositions','threat_attack_cases','threat_attack_nodes'] LOOP
    EXECUTE format('CREATE TRIGGER analysis_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation()',tbl);
    EXECUTE format('CREATE TRIGGER analysis_guard BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION guard_threat_analysis()',tbl);
  END LOOP;
END $$;
CREATE INDEX threat_suggestions_revision ON threat_analysis_suggestions(revision_id,created_at,id);
CREATE INDEX threat_cases_revision ON threat_attack_cases(revision_id,threat_id);
CREATE FUNCTION invalidate_attack_analysis() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid varchar(64);
BEGIN
  IF TG_TABLE_NAME='threat_attack_cases' THEN tid:=NEW.threat_id;
  ELSE SELECT threat_id INTO tid FROM threat_attack_cases WHERE id=NEW.case_id; END IF;
  UPDATE threats SET analysis_version=analysis_version+1 WHERE id=tid;
  RETURN NEW;
END $$;
CREATE TRIGGER attack_case_invalidates AFTER INSERT ON threat_attack_cases FOR EACH ROW EXECUTE FUNCTION invalidate_attack_analysis();
CREATE TRIGGER attack_node_invalidates AFTER INSERT ON threat_attack_nodes FOR EACH ROW EXECUTE FUNCTION invalidate_attack_analysis();
CREATE FUNCTION validate_attack_tree() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid varchar(64); total integer; reachable integer;
BEGIN
  IF TG_TABLE_NAME='threat_attack_cases' THEN cid:=NEW.id; ELSE cid:=NEW.case_id; END IF;
  SELECT count(*) INTO total FROM threat_attack_nodes WHERE case_id=cid;
  IF total<1 OR total>100 OR (SELECT count(*) FROM threat_attack_nodes WHERE case_id=cid AND parent_id IS NULL)<>1 THEN
    RAISE EXCEPTION 'Attack analysis requires one rooted tree with 1 to 100 nodes' USING ERRCODE='23514';
  END IF;
  WITH RECURSIVE tree AS (
    SELECT id,ARRAY[id] AS path FROM threat_attack_nodes WHERE case_id=cid AND parent_id IS NULL
    UNION ALL SELECT n.id,t.path||n.id FROM threat_attack_nodes n JOIN tree t ON n.parent_id=t.id WHERE n.case_id=cid AND NOT n.id=ANY(t.path)
  ) SELECT count(*) INTO reachable FROM tree;
  IF reachable<>total OR EXISTS(SELECT 1 FROM threat_attack_nodes n WHERE n.case_id=cid AND
    ((n.node_kind='STEP' AND EXISTS(SELECT 1 FROM threat_attack_nodes c WHERE c.parent_id=n.id)) OR
    (n.node_kind IN ('AND','OR') AND (SELECT count(*) FROM threat_attack_nodes c WHERE c.parent_id=n.id)<2))) THEN
    RAISE EXCEPTION 'Invalid attack tree connectivity or AND/OR children' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER validate_attack_case AFTER INSERT ON threat_attack_cases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_attack_tree();
CREATE CONSTRAINT TRIGGER validate_attack_nodes AFTER INSERT ON threat_attack_nodes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_attack_tree();
