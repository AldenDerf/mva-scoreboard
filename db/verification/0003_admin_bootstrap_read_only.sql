-- READ ONLY. Proposal for post-bootstrap verification after separate approval.
-- Do not print Auth UUIDs or audit JSON in routine output.
BEGIN READ ONLY;
SELECT current_database() AS database_name, inet_server_addr() AS address,
       inet_server_port() AS port,
       (SELECT system_identifier FROM pg_control_system()) AS cluster_id;
SELECT count(*) AS active_admin_grants FROM scoreboard.role_grants
WHERE role='ADMIN' AND revoked_at IS NULL;
SELECT count(*) AS initial_admin_audit_events FROM scoreboard.admin_audit_events
WHERE action='INITIAL_ADMIN_GRANTED';
SELECT count(*) AS bootstrap_audit_grant_mismatches
FROM scoreboard.admin_audit_events a
LEFT JOIN scoreboard.role_grants g ON g.id=a.target_id
WHERE a.action='INITIAL_ADMIN_GRANTED'
  AND (a.target_type <> 'role_grant' OR g.id IS NULL OR g.role <> 'ADMIN'
       OR g.user_id <> a.actor_user_id);
SELECT to_regprocedure('scoreboard.bootstrap_initial_admin(uuid,text)')
  AS bootstrap_function_still_present;
COMMIT;
