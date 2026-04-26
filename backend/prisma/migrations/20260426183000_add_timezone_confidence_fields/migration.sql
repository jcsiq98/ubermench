-- Cap. 46 — Timezone Confidence System
--
-- Adds two fields to workspace_profiles so we can distinguish:
--   * a workspace whose timezone is the default because we never asked
--   * a workspace whose timezone is the default because the provider
--     really works in CDMX
--
-- Without this distinction the bug that hit Roberto (provider in
-- Amsterdam, workspace stuck on America/Mexico_City, appointments stored
-- 8h off) is invisible to the system. The flag is the load-bearing
-- signal for the runtime gate and the wall-clock migration logic that
-- arrive in later commits of this series.
--
-- Backfill is intentionally generic: any workspace whose timezone is
-- already different from America/Mexico_City must have been changed by
-- an admin or by an explicit user mention, so we treat it as confirmed.
-- Workspaces sitting on the default stay unconfirmed and the rest of the
-- system will close that gap (onboarding for non-Mexican phones in M3,
-- runtime gate in M4).

-- AlterTable
ALTER TABLE "workspace_profiles"
  ADD COLUMN "timezone_confirmed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "timezone_source" TEXT;

-- Backfill — generic, no per-provider hardcoding
UPDATE "workspace_profiles"
  SET "timezone_confirmed" = true,
      "timezone_source" = 'existing_non_default'
  WHERE "timezone" <> 'America/Mexico_City';
