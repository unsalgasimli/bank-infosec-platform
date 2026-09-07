-- PostgreSQL recursive terms must use the same array type/typmod.
CREATE OR REPLACE FUNCTION validate_attack_tree() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid varchar(64); total integer; reachable integer;
BEGIN
  IF TG_TABLE_NAME='threat_attack_cases' THEN cid:=NEW.id; ELSE cid:=NEW.case_id; END IF;
  SELECT count(*) INTO total FROM threat_attack_nodes WHERE case_id=cid;
  IF total<1 OR total>100 OR (SELECT count(*) FROM threat_attack_nodes WHERE case_id=cid AND parent_id IS NULL)<>1 THEN
    RAISE EXCEPTION 'Attack analysis requires one rooted tree with 1 to 100 nodes' USING ERRCODE='23514';
  END IF;
  WITH RECURSIVE tree AS (
    SELECT id,ARRAY[id::text] AS path FROM threat_attack_nodes WHERE case_id=cid AND parent_id IS NULL
    UNION ALL SELECT n.id,t.path||n.id::text FROM threat_attack_nodes n JOIN tree t ON n.parent_id=t.id WHERE n.case_id=cid AND NOT n.id=ANY(t.path)
  ) SELECT count(*) INTO reachable FROM tree;
  IF reachable<>total OR EXISTS(SELECT 1 FROM threat_attack_nodes n WHERE n.case_id=cid AND
    ((n.node_kind='STEP' AND EXISTS(SELECT 1 FROM threat_attack_nodes c WHERE c.parent_id=n.id)) OR
    (n.node_kind IN ('AND','OR') AND (SELECT count(*) FROM threat_attack_nodes c WHERE c.parent_id=n.id)<2))) THEN
    RAISE EXCEPTION 'Invalid attack tree connectivity or AND/OR children' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
