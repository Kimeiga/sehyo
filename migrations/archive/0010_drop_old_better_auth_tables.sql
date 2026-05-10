-- Drop old better_auth_* tables that are no longer used
-- We're now using the non-prefixed tables (user, session, account, verification)

DROP TABLE IF EXISTS better_auth_user;
DROP TABLE IF EXISTS better_auth_session;
DROP TABLE IF EXISTS better_auth_account;
DROP TABLE IF EXISTS better_auth_verification;

