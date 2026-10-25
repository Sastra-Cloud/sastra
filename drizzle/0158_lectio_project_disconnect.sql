-- Preserve disconnect intent before project FKs and task/unit cascades run.
CREATE FUNCTION lectio_project_deleted() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE lectio_operations SET state='parked', last_error='project_deleted'
  WHERE state='pending' AND direction='out' AND payload->>'linkId' IN
    (SELECT id::text FROM lectio_project_links WHERE project_id=OLD.id);
  INSERT INTO lectio_operations(connection_id, direction, operation_id, kind, fingerprint, payload)
  SELECT connection_id, 'out', 'unlink-' || id::text || '-' || generation::text, 'lifecycle', 'project-deleted',
    jsonb_build_object('path','/api/integrations/sastra/v1/unlink','body',jsonb_build_object(
      'projectId',remote_project_id,'projectKey',project_key,'generation',generation))
  FROM lectio_project_links WHERE project_id=OLD.id AND state IN ('active','linking','removed')
  ON CONFLICT (connection_id,direction,operation_id) DO NOTHING;
  UPDATE lectio_project_links SET state='unlinked' WHERE project_id=OLD.id;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER lectio_disconnect BEFORE DELETE ON projects FOR EACH ROW EXECUTE FUNCTION lectio_project_deleted();
