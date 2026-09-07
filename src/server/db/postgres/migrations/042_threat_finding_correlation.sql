-- References existing inventory findings / security tickets; never duplicate their content.
CREATE TABLE threat_finding_links (
  id varchar(64) PRIMARY KEY, revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id),
  threat_id varchar(64) NOT NULL REFERENCES threats(id), control_id varchar(64) NOT NULL REFERENCES threat_controls(id),
  cmdb_finding_id varchar(64) REFERENCES cmdb_security_findings(id) ON DELETE RESTRICT,
  finding_ticket_id varchar(64) REFERENCES tickets(id) ON DELETE RESTRICT,
  assumption varchar(4000) NOT NULL CHECK(length(trim(assumption))>0),
  source_fingerprint varchar(64) NOT NULL, created_by varchar(64) NOT NULL REFERENCES bank_users(id), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(num_nonnulls(cmdb_finding_id,finding_ticket_id)=1)
);
CREATE UNIQUE INDEX threat_finding_cmdb_unique ON threat_finding_links(revision_id,control_id,cmdb_finding_id) WHERE cmdb_finding_id IS NOT NULL;
CREATE UNIQUE INDEX threat_finding_ticket_unique ON threat_finding_links(revision_id,control_id,finding_ticket_id) WHERE finding_ticket_id IS NOT NULL;
CREATE INDEX threat_finding_revision ON threat_finding_links(revision_id);
CREATE FUNCTION threat_finding_state(cmdb_id varchar,ticket_id varchar)
RETURNS TABLE(fingerprint text,current_state text,current_severity text,asset_id varchar,application_id varchar) LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to(jsonb_build_object('state',f.state,'severity',f.severity,'type',f.finding_type,'details',f.details,'assetId',f.asset_id)::text,'UTF8')),'hex'),
    f.state::text,f.severity::text,f.asset_id,NULL::varchar FROM cmdb_security_findings f WHERE f.id=cmdb_id
  UNION ALL
  SELECT encode(sha256(convert_to(jsonb_build_object('status',t.status_category,'severity',t.technical_severity,'finding',t.finding_details,'assetId',t.asset_id,'applicationId',t.application_id)::text,'UTF8')),'hex'),
    CASE WHEN t.status_category='DONE' THEN 'RESOLVED' ELSE 'OPEN' END,t.technical_severity::text,t.asset_id,t.application_id
  FROM tickets t WHERE t.id=ticket_id AND t.category IN ('VULNERABILITY','AUDIT_FINDING','SECURITY_REVIEW');
$$;
CREATE TABLE threat_finding_assessments (
  id varchar(64) PRIMARY KEY, link_id varchar(64) NOT NULL REFERENCES threat_finding_links(id),
  assessed_fingerprint varchar(64) NOT NULL, reason varchar(4000) NOT NULL CHECK(length(trim(reason))>0),
  assessed_by varchar(64) NOT NULL REFERENCES bank_users(id), assessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX threat_finding_assessment_latest ON threat_finding_assessments(link_id,assessed_at DESC,id DESC);
CREATE VIEW threat_finding_link_state AS SELECT l.*,s.fingerprint AS current_fingerprint,s.current_state,s.current_severity,a.assessed_fingerprint
  FROM threat_finding_links l LEFT JOIN LATERAL threat_finding_state(l.cmdb_finding_id,l.finding_ticket_id) s ON TRUE
  LEFT JOIN LATERAL (SELECT assessed_fingerprint FROM threat_finding_assessments WHERE link_id=l.id ORDER BY assessed_at DESC,id DESC LIMIT 1) a ON TRUE;
CREATE FUNCTION guard_threat_finding_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE model threat_models; source_row record;
BEGIN
  SELECT m.* INTO model FROM threat_models m JOIN threat_model_revisions r ON r.threat_model_id=m.id WHERE r.id=NEW.revision_id AND r.status IN ('DRAFT','CHANGES_REQUIRED');
  IF model.id IS NULL OR NOT EXISTS(SELECT 1 FROM threats t JOIN threat_control_threats ct ON ct.threat_id=t.id WHERE t.id=NEW.threat_id AND t.revision_id=NEW.revision_id AND ct.control_id=NEW.control_id) THEN
    RAISE EXCEPTION 'Finding correlation requires a mutable revision and a mapped threat/control' USING ERRCODE='23514';
  END IF;
  SELECT * INTO source_row FROM threat_finding_state(NEW.cmdb_finding_id,NEW.finding_ticket_id);
  IF source_row.fingerprint IS NULL THEN RAISE EXCEPTION 'Canonical security finding not found' USING ERRCODE='23514'; END IF;
  IF NOT (COALESCE(source_row.asset_id IN (model.asset_id,model.service_id),false) OR COALESCE(source_row.application_id=model.service_id,false)
    OR EXISTS(SELECT 1 FROM threat_model_components WHERE revision_id=NEW.revision_id AND asset_id=source_row.asset_id)) THEN
    RAISE EXCEPTION 'Finding asset/application must be explicitly in the model architecture scope' USING ERRCODE='23514';
  END IF;
  NEW.source_fingerprint:=source_row.fingerprint;
  RETURN NEW;
END $$;
CREATE TRIGGER finding_link_guard BEFORE INSERT ON threat_finding_links FOR EACH ROW EXECUTE FUNCTION guard_threat_finding_link();
CREATE TRIGGER finding_link_immutable BEFORE UPDATE OR DELETE ON threat_finding_links FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
CREATE FUNCTION invalidate_finding_assumption() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE threats SET analysis_version=analysis_version+1 WHERE id=NEW.threat_id; RETURN NEW; END $$;
CREATE TRIGGER finding_link_invalidates AFTER INSERT ON threat_finding_links FOR EACH ROW EXECUTE FUNCTION invalidate_finding_assumption();
CREATE FUNCTION guard_finding_assessment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE link threat_finding_links; actor_roles jsonb; current_hash text;
BEGIN
  SELECT * INTO link FROM threat_finding_links WHERE id=NEW.link_id;
  SELECT roles INTO actor_roles FROM bank_users WHERE id=NEW.assessed_by AND is_active;
  IF actor_roles IS NULL OR NOT(actor_roles ?| ARRAY['CISO','INFOSEC_ADMIN','INFOSEC_MANAGER','APPSEC_ANALYST']) OR actor_roles ? 'AUDITOR' THEN RAISE EXCEPTION 'Security authority required for finding assessment' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM threat_model_revisions WHERE id=link.revision_id AND status IN ('DRAFT','CHANGES_REQUIRED')) THEN RAISE EXCEPTION 'Finding assessment requires a mutable revision' USING ERRCODE='55000'; END IF;
  SELECT fingerprint INTO current_hash FROM threat_finding_state(link.cmdb_finding_id,link.finding_ticket_id);
  IF current_hash IS NULL OR NEW.assessed_fingerprint<>current_hash THEN RAISE EXCEPTION 'Finding changed; fresh assessment is required' USING ERRCODE='23514'; END IF;
  UPDATE threats SET analysis_version=analysis_version+1 WHERE id=link.threat_id;
  RETURN NEW;
END $$;
CREATE TRIGGER finding_assessment_guard BEFORE INSERT ON threat_finding_assessments FOR EACH ROW EXECUTE FUNCTION guard_finding_assessment();
CREATE TRIGGER finding_assessment_immutable BEFORE UPDATE OR DELETE ON threat_finding_assessments FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
