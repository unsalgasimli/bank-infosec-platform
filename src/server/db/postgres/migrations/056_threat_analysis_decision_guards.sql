CREATE OR REPLACE FUNCTION guard_threat_analysis_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u threat_analysis_units; expected_target record; d threat_analysis_dispositions; t threats; actor_roles jsonb;
BEGIN
 IF TG_TABLE_NAME='threat_analysis_reviews' THEN
   SELECT * INTO d FROM threat_analysis_dispositions WHERE id=NEW.disposition_id;
   SELECT * INTO u FROM threat_analysis_units WHERE id=d.unit_id;
   SELECT roles INTO actor_roles FROM bank_users WHERE id=NEW.reviewer_id AND is_active;
   IF NEW.reviewer_id=d.analyst_id OR actor_roles IS NULL OR actor_roles ? 'AUDITOR' OR NOT(actor_roles ?| ARRAY['APPSEC_ANALYST','INFOSEC_ADMIN','INFOSEC_MANAGER','CISO']) THEN RAISE EXCEPTION 'Independent AppSec authority required for coverage review'; END IF;
 ELSE
   SELECT * INTO u FROM threat_analysis_units WHERE id=NEW.unit_id;
   SELECT roles INTO actor_roles FROM bank_users WHERE id=NEW.analyst_id AND is_active;
   IF actor_roles IS NULL OR actor_roles ? 'AUDITOR' THEN RAISE EXCEPTION 'Active analyst authority required'; END IF;
   IF NEW.threat_id IS NOT NULL THEN
     SELECT * INTO t FROM threats WHERE id=NEW.threat_id AND revision_id=u.revision_id;
     SELECT * INTO expected_target FROM threat_analysis_expected_units WHERE revision_id=u.revision_id AND target_type=u.target_type AND target_id=u.target_id AND category=u.category AND fingerprint=u.fingerprint;
     IF t.id IS NULL OR NEW.threat_version IS DISTINCT FROM t.content_version OR NOT(COALESCE(t.affected_component_id=expected_target.component_id,false) OR COALESCE(t.affected_data_flow_id=expected_target.flow_id,false) OR COALESCE(t.affected_trust_boundary_id=expected_target.boundary_id,false)) THEN RAISE EXCEPTION 'Coverage threat must match current target and content version'; END IF;
     IF expected_target.target_type='BUSINESS_CAPABILITY' THEN
       IF NOT EXISTS(SELECT 1 FROM threat_attack_cases WHERE threat_id=t.id AND revision_id=u.revision_id) THEN RAISE EXCEPTION 'Business coverage requires a structured abuse case'; END IF;
     ELSIF NOT(t.categories ? u.category) THEN RAISE EXCEPTION 'Threat category does not cover analysis unit'; END IF;
   END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM threat_model_revisions r JOIN threat_models m ON m.current_revision_id=r.id WHERE r.id=u.revision_id AND r.status IN ('DRAFT','CHANGES_REQUIRED') AND m.status NOT IN ('RETIRED','ARCHIVED')) THEN RAISE EXCEPTION 'Coverage decisions require current mutable revision'; END IF;
 IF NOT EXISTS(SELECT 1 FROM threat_analysis_expected_units e WHERE e.revision_id=u.revision_id AND e.target_type=u.target_type AND e.target_id=u.target_id AND e.category=u.category AND e.policy_id=u.policy_id AND e.fingerprint=u.fingerprint) THEN RAISE EXCEPTION 'Coverage target changed; reassessment required'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION guard_threat_business_capability_scope() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM threat_model_components WHERE id=NEW.component_id AND revision_id=NEW.revision_id) THEN RAISE EXCEPTION 'Capability component must belong to this revision'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER business_capability_scope BEFORE INSERT OR UPDATE ON threat_business_capabilities FOR EACH ROW EXECUTE FUNCTION guard_threat_business_capability_scope();
