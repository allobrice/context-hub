-- Migration custom (drizzle-kit generate --custom) : SQL propre à SQLite, isolé ici.
-- Portage Postgres : remplacer chaque trigger par un trigger plpgsql qui lève une exception.

-- Défense en profondeur : le journal du cycle de vie des missions est append-only (SPEC §8.1).
CREATE TRIGGER `mission_events_no_update`
BEFORE UPDATE ON `mission_events`
BEGIN
	SELECT RAISE(ABORT, 'mission_events est append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `mission_events_no_delete`
BEFORE DELETE ON `mission_events`
BEGIN
	SELECT RAISE(ABORT, 'mission_events est append-only');
END;
