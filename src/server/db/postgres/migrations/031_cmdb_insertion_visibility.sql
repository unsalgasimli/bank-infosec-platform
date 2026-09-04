-- Source timestamps are not insertion timestamps. A persisted top-level xid8
-- lets cursor queries exclude both backdated inserts and in-flight inserts
-- that commit after the first page, without holding a long-lived transaction.
-- Constant missing-value default is metadata-only for existing rows (PG 16).
-- Those rows predate rollout and are visible to every newly issued cursor.
ALTER TABLE configuration_items
  ADD COLUMN inventory_insert_xid xid8 NOT NULL DEFAULT '0'::xid8;
ALTER TABLE configuration_items
  ALTER COLUMN inventory_insert_xid SET DEFAULT pg_current_xact_id();

CREATE FUNCTION cmdb_inventory_insert_xid_v1() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- pg_current_xact_id returns the top-level ID even inside a savepoint.
    -- Do not accept an application-supplied marker, including the legacy zero.
    NEW.inventory_insert_xid := pg_current_xact_id();
  ELSIF NEW.inventory_insert_xid IS DISTINCT FROM OLD.inventory_insert_xid THEN
    RAISE EXCEPTION 'CMDB inventory insertion identity is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cmdb_inventory_insert_xid_guard
  BEFORE INSERT OR UPDATE OF inventory_insert_xid ON configuration_items
  FOR EACH ROW EXECUTE FUNCTION cmdb_inventory_insert_xid_v1();

COMMENT ON COLUMN configuration_items.inventory_insert_xid IS
  'Internal original top-level transaction identity for cursor insertion visibility. Zero denotes pre-rollout rows. Not a canonical ID, source timestamp or API field. Rebase after logical restore to a different cluster before serving cursors.';
