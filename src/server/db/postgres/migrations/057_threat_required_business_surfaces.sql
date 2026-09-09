-- Conservative analysis prompts, never fabricated threats. Every TM-3 surface
-- must be reviewed even when an author omits it from the capability inventory.
INSERT INTO threat_analysis_policy_versions(id,version,rules)
SELECT 'analysis-bank-v2',2,rules || jsonb_build_object('FLOW_AUTHENTICATED',
 '["SPOOFING","TAMPERING","REPUDIATION","INFORMATION_DISCLOSURE","DENIAL_OF_SERVICE"]'::jsonb)
FROM threat_analysis_policy_versions WHERE id='analysis-bank-v1';
CREATE VIEW threat_analysis_business_surfaces AS
SELECT c.revision_id,'BUSINESS_CAPABILITY'::text AS target_type,
 ('surface:'||c.id)::text AS target_id,(c.name||': critical capability survey')::text AS label,
 CASE WHEN EXISTS(SELECT 1 FROM threat_model_applicability a WHERE a.id=(SELECT id FROM threat_model_applicability WHERE revision_id=c.revision_id ORDER BY assessed_at DESC,id DESC LIMIT 1)
 AND (a.answers->>'paymentRelated'='true' OR a.answers->>'financialTransactions'='true'))
 THEN 'PAYMENT' ELSE 'BUSINESS' END AS rule,
 architecture_security_content(to_jsonb(c)) AS facts,c.id AS component_id,NULL::varchar AS flow_id,NULL::varchar AS boundary_id
FROM threat_model_components c;
CREATE OR REPLACE VIEW threat_analysis_expected_units AS
SELECT t.*,p.id AS policy_id,category.value AS category,
 encode(sha256(convert_to((t.facts||jsonb_build_object('policy',p.id,'category',category.value))::text,'UTF8')),'hex') AS fingerprint,
 md5(t.revision_id||':'||t.target_type||':'||t.target_id||':'||category.value||':'||p.id) AS id
FROM (SELECT * FROM threat_analysis_expected_targets UNION ALL SELECT * FROM threat_analysis_business_surfaces) t
JOIN threat_model_revisions r ON r.id=t.revision_id
CROSS JOIN LATERAL (SELECT * FROM threat_analysis_policy_versions WHERE effective_at<=now() ORDER BY version DESC LIMIT 1) p
CROSS JOIN LATERAL jsonb_array_elements_text(p.rules->CASE WHEN t.rule='FLOW' AND NULLIF(t.facts->>'authentication_method','') IS NOT NULL THEN 'FLOW_AUTHENTICATED' ELSE t.rule END) category
WHERE r.tier>=2 AND (t.target_type<>'BUSINESS_CAPABILITY' OR r.tier=3);
