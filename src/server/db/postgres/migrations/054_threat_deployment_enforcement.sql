CREATE TABLE threat_delivery_mappings (
 id varchar(64) PRIMARY KEY,provider varchar(32) NOT NULL CHECK(provider='GITLAB'),issuer text NOT NULL,audience text NOT NULL,
 project_id varchar(64) NOT NULL, environment varchar(128) NOT NULL,ref varchar(255) NOT NULL,
 application_id varchar(64) NOT NULL REFERENCES configuration_items(id),
 model_id varchar(64) NOT NULL REFERENCES threat_models(id),release_id varchar(64) NOT NULL REFERENCES tickets(id),
 api_credential jsonb NOT NULL,enabled boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,
 updated_by varchar(64) NOT NULL REFERENCES bank_users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(issuer,project_id,environment)
);
CREATE TABLE threat_deployment_authorizations (
 id varchar(64) PRIMARY KEY,mapping_id varchar(64) NOT NULL REFERENCES threat_delivery_mappings(id),mapping_version integer NOT NULL,
 revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id), release_id varchar(64) NOT NULL REFERENCES tickets(id),
 application_id varchar(64) NOT NULL REFERENCES configuration_items(id),commit_sha varchar(64) NOT NULL,
 environment varchar(128) NOT NULL,project_id varchar(64) NOT NULL,artifact_digest varchar(71),
 provider_job_id varchar(64) NOT NULL,provider_pipeline_id varchar(64) NOT NULL,provider_actor varchar(128) NOT NULL,identity_jti varchar(255) NOT NULL,
 token_hash varchar(64) UNIQUE NOT NULL,gate_evaluation_id varchar(64) UNIQUE NOT NULL,gate_snapshot jsonb NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,UNIQUE(mapping_id,provider_job_id),CHECK(expires_at>issued_at)
);
CREATE TABLE threat_deployment_events (
 id varchar(64) PRIMARY KEY,authorization_id varchar(64) NOT NULL REFERENCES threat_deployment_authorizations(id),
 state varchar(32) NOT NULL CHECK(state IN ('AUTHORIZED','CONSUMED','DEPLOYMENT_STARTED','SUCCEEDED','FAILED','EXPIRED_UNUSED','RECONCILIATION_REQUIRED')),
 provider_deployment_id varchar(64),provider_payload jsonb NOT NULL DEFAULT '{}',correlation_id varchar(128),
 occurred_at timestamptz NOT NULL DEFAULT now(),UNIQUE(authorization_id,state)
);
CREATE UNIQUE INDEX threat_deployment_provider_receipt ON threat_deployment_events(authorization_id,provider_deployment_id,state) WHERE provider_deployment_id IS NOT NULL;
CREATE INDEX threat_deployment_event_latest ON threat_deployment_events(authorization_id,occurred_at DESC);
CREATE TRIGGER deployment_auth_immutable BEFORE UPDATE OR DELETE ON threat_deployment_authorizations FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
CREATE TRIGGER deployment_event_immutable BEFORE UPDATE OR DELETE ON threat_deployment_events FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
CREATE FUNCTION guard_threat_deployment_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous text; BEGIN
 PERFORM 1 FROM threat_deployment_authorizations WHERE id=NEW.authorization_id FOR UPDATE;
 SELECT state INTO previous FROM threat_deployment_events WHERE authorization_id=NEW.authorization_id ORDER BY occurred_at DESC,id DESC LIMIT 1;
 IF NOT((previous IS NULL AND NEW.state='AUTHORIZED') OR (previous='AUTHORIZED' AND NEW.state IN ('CONSUMED','EXPIRED_UNUSED','RECONCILIATION_REQUIRED')) OR (previous='CONSUMED' AND NEW.state IN ('DEPLOYMENT_STARTED','FAILED','RECONCILIATION_REQUIRED')) OR (previous IN ('DEPLOYMENT_STARTED','RECONCILIATION_REQUIRED') AND NEW.state IN ('DEPLOYMENT_STARTED','SUCCEEDED','FAILED','RECONCILIATION_REQUIRED'))) THEN RAISE EXCEPTION 'Invalid deployment lifecycle transition'; END IF;
 IF NEW.state IN ('DEPLOYMENT_STARTED','SUCCEEDED','FAILED') AND NEW.provider_deployment_id IS NULL THEN RAISE EXCEPTION 'Provider execution receipt required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER deployment_event_guard BEFORE INSERT ON threat_deployment_events FOR EACH ROW EXECUTE FUNCTION guard_threat_deployment_event();
