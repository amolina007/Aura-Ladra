-- Keep every schema already exposed by PostgREST and add only AuraLadra's schema.
alter role authenticator
  set pgrst.db_schemas = 'public, graphql_public, codex, ladra';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
