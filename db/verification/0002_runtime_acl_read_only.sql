-- READ ONLY. Safe catalog verification before/after a separately approved change.
-- No role creation, writes, or privilege changes.
BEGIN READ ONLY;
SELECT current_database() AS database_name, inet_server_addr() AS address,
       inet_server_port() AS port,
       (SELECT system_identifier FROM pg_control_system()) AS cluster_id;
SELECT c.relname AS scoreboard_table, c.relrowsecurity AS rls,
       c.relforcerowsecurity AS force_rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'scoreboard' AND c.relkind = 'r' ORDER BY c.relname;
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
       rolbypassrls, rolinherit
FROM pg_roles WHERE rolname LIKE 'scoreboard%' ORDER BY rolname;
SELECT count(*) AS active_admin_count FROM scoreboard.role_grants
WHERE role = 'ADMIN' AND revoked_at IS NULL;
SELECT datacl, has_database_privilege('scoreboard_server','mva_dev','CONNECT') AS server_connect,
       has_database_privilege('scoreboard_server','mva_dev','CREATE') AS server_create,
       has_database_privilege('scoreboard_server','mva_dev','TEMP') AS server_temp
FROM pg_database WHERE datname = 'mva_dev';
SELECT nspname, nspacl,
       has_schema_privilege('scoreboard_server',oid,'USAGE') AS server_usage,
       has_schema_privilege('scoreboard_server',oid,'CREATE') AS server_create
FROM pg_namespace WHERE nspname IN ('public','private_app','scoreboard') ORDER BY nspname;
SELECT n.nspname, c.relname, c.relkind, c.relacl,
       has_table_privilege('scoreboard_server',c.oid,'SELECT') AS server_select,
       has_table_privilege('scoreboard_server',c.oid,'INSERT') AS server_insert,
       has_table_privilege('scoreboard_server',c.oid,'UPDATE') AS server_update,
       has_table_privilege('scoreboard_server',c.oid,'DELETE') AS server_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','private_app','scoreboard') AND c.relkind IN ('r','v')
ORDER BY n.nspname,c.relname;
SELECT n.nspname,c.relname,
       has_sequence_privilege('scoreboard_server',c.oid,'USAGE') AS server_usage,
       has_sequence_privilege('scoreboard_server',c.oid,'SELECT') AS server_select,
       has_sequence_privilege('scoreboard_server',c.oid,'UPDATE') AS server_update
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S';
SELECT n.nspname,p.proname,p.prosecdef AS security_definer,p.proacl,
       has_function_privilege('scoreboard_server',p.oid,'EXECUTE') AS server_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','private_app','scoreboard') ORDER BY n.nspname,p.proname;
SELECT d.defaclobjtype,n.nspname,r.rolname,d.defaclacl FROM pg_default_acl d
JOIN pg_namespace n ON n.oid=d.defaclnamespace JOIN pg_roles r ON r.oid=d.defaclrole
WHERE n.nspname IN ('public','private_app','scoreboard');
SELECT roleid::regrole,member::regrole,admin_option,inherit_option,set_option
FROM pg_auth_members WHERE roleid IN (SELECT oid FROM pg_roles WHERE rolname LIKE 'scoreboard%')
OR member IN (SELECT oid FROM pg_roles WHERE rolname LIKE 'scoreboard%');
COMMIT;
