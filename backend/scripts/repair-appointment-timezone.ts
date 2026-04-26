/**
 * Repair appointment timezone — one-off data fix.
 *
 * Use case (initial): a provider lives outside Mexico but their
 * WorkspaceProfile was created with the default timezone America/Mexico_City.
 * Appointments captured through the WhatsApp assistant ended up stored with
 * UTC values that match the wall-clock the user said, but interpreted in
 * the wrong timezone. The result is appointments offset by N hours when
 * rendered in the provider's real timezone.
 *
 * The script preserves wall-clock time: whatever the user said ("10:00") is
 * preserved as 10:00 in the new timezone, by recomputing the UTC value.
 *
 * Steps:
 *   1. Validate the current state of provider, workspace and target
 *      appointments (hardcoded below — review the constants before running).
 *   2. In a Prisma transaction: update appointments (scheduledAt and, where
 *      requested, estimatedPrice) and the workspace timezone.
 *   3. Invalidate the workspace Redis cache.
 *   4. Cancel stale BullMQ followup/reminder jobs for the affected
 *      appointments.
 *   5. Re-enqueue followup/reminder jobs with the corrected scheduledAt.
 *   6. Verify all changes post-apply.
 *
 * Order rationale: DB is the source of truth. We update the DB first inside
 * a transaction. If the DB transaction fails, no jobs are touched. If a
 * later step (cache, jobs) fails, the DB is still correct and the script can
 * be re-run idempotently to fix the queue.
 *
 * Idempotency: every appointment.update uses a guard
 * `WHERE id = ? AND scheduledAt = <oldUtc>`. If the row already has the new
 * scheduledAt (script was run before, manual fix, etc.), the update is a
 * no-op for that row and the script logs "already migrated".
 *
 * Default mode is dry-run. To actually mutate state:
 *
 *   npx ts-node scripts/repair-appointment-timezone.ts \
 *     --apply --confirm-provider <providerId>
 *
 * The providerId passed to --confirm-provider must match the PROVIDER_ID
 * constant below — otherwise the script aborts. This guards against running
 * the script after copy-pasting --apply for a different provider.
 *
 * No WhatsApp message is sent to the provider from this script.
 */

import 'dotenv/config';
import { PrismaClient, AppointmentStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';

// ─── Constants (one-off, hardcoded by design) ───────────────────
// Review these before running. They scope the script to a specific
// provider and a specific set of appointments. Any drift from the
// expected current state aborts the script before mutating anything.

const PROVIDER_ID = 'ba504be5-5384-4aac-acd3-467e16d0bcd2';
const EXPECTED_USER_PHONE = '+15755716627';
const EXPECTED_OLD_TZ = 'America/Mexico_City';
const NEW_TZ = 'Europe/Amsterdam';

interface AppointmentSpec {
  id: string;
  oldUtc: string; // ISO string we expect to find currently
  newUtc: string; // ISO string we want to set
  estimatedPriceOld: number | null; // expected current value, used for diagnostics + sanity
  estimatedPriceNew: number | null; // value after the fix
  estimatedPriceShouldChange: boolean;
  expectedClient: string;
  expectedDescription: string;
}

const APPOINTMENTS: AppointmentSpec[] = [
  {
    // Friday May 1, 08:00 wall-clock intended in NEW_TZ
    id: 'd7651761-ddc3-4619-aea1-3ffd37bc460c',
    oldUtc: '2026-05-01T14:00:00.000Z',
    newUtc: '2026-05-01T06:00:00.000Z',
    estimatedPriceOld: 12000,
    estimatedPriceNew: 12000,
    estimatedPriceShouldChange: false,
    expectedClient: 'clienta de la casa azul',
    expectedDescription: 'pintar la casa blanca',
  },
  {
    // Tuesday April 28, 10:00 wall-clock intended in NEW_TZ
    id: 'fac7ec53-d892-469d-a029-3e4355311b12',
    oldUtc: '2026-04-28T16:00:00.000Z',
    newUtc: '2026-04-28T08:00:00.000Z',
    estimatedPriceOld: 1000,
    estimatedPriceNew: 1000,
    estimatedPriceShouldChange: false,
    expectedClient: 'Martín',
    expectedDescription: 'pintar casa',
  },
  {
    // Wednesday April 29, 10:00 wall-clock intended in NEW_TZ.
    // estimatedPrice cleared because the original "mil pesitos" referred
    // to the favor as a whole, not per-day.
    id: '99fed1d4-2a9b-408a-8433-0a12841a569f',
    oldUtc: '2026-04-29T16:00:00.000Z',
    newUtc: '2026-04-29T08:00:00.000Z',
    estimatedPriceOld: 1000,
    estimatedPriceNew: null,
    estimatedPriceShouldChange: true,
    expectedClient: 'Martín',
    expectedDescription: 'pintar casa',
  },
];

// Same defaults the BullMQ queue.module.ts uses, copied so the script does
// not have to import NestJS internals.
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 1000, age: 24 * 3600 },
  removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
};

const FOLLOWUP_DELAY_MS = 30 * 60 * 1000;

// ─── Args (validate before creating any side-effect) ────────────
//
// Usage:
//   dry-run (default):
//     npx ts-node scripts/repair-appointment-timezone.ts
//   apply:
//     npx ts-node scripts/repair-appointment-timezone.ts \
//       --apply --confirm-provider <providerId>

function getFlagValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx === process.argv.length - 1) return undefined;
  const next = process.argv[idx + 1];
  if (next.startsWith('--')) return undefined;
  return next;
}

const APPLY = process.argv.includes('--apply');
const CONFIRM_PROVIDER = getFlagValue('--confirm-provider');
const DRY_RUN = !APPLY;

if (APPLY && !CONFIRM_PROVIDER) {
  console.error(
    '❌ --apply requires --confirm-provider <providerId>.',
  );
  console.error(
    `   Pass: --apply --confirm-provider ${PROVIDER_ID}`,
  );
  process.exit(2);
}

if (APPLY && CONFIRM_PROVIDER !== PROVIDER_ID) {
  console.error(
    `❌ --confirm-provider mismatch: got "${CONFIRM_PROVIDER}", expected "${PROVIDER_ID}".`,
  );
  console.error(
    '   This script is hardcoded for one provider. Aborting.',
  );
  process.exit(2);
}

// ─── Logger: stdout + file (no secrets) ──────────────────────────

const tsForFile = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(__dirname, `repair-appointment-timezone-${tsForFile}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(line = ''): void {
  process.stdout.write(line + '\n');
  logStream.write(line + '\n');
}

// ─── Helpers ─────────────────────────────────────────────────────

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port, 10) || 6379,
    password: parsed.password || undefined,
    username:
      parsed.username && parsed.username !== 'default' ? parsed.username : undefined,
    maxRetriesPerRequest: null as null,
  };
}

/**
 * Extract `host:port` from a connection URL without revealing user or
 * password. Used for the banner so we can audit which environment we're
 * about to touch without leaking secrets to stdout/log.
 */
function extractHostPort(url: string | undefined): string {
  if (!url) return '(unset)';
  try {
    const u = new URL(url);
    const port = u.port ? `:${u.port}` : '';
    return `${u.hostname}${port}`;
  } catch {
    return '(unparseable)';
  }
}

function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0';
}

/**
 * Normalize a free-text field for semantic equality checking. Used to
 * verify that the appointment IDs in APPOINTMENTS still match the
 * client name and description we expect — protects against running the
 * script on an appointment that has been edited or had its row reused.
 *
 * Normalization steps:
 *   - Unicode NFC (so "Martín" composed and decomposed are equal)
 *   - lowercase
 *   - trim outer whitespace
 *   - collapse internal whitespace to a single space
 */
function normalizeForCompare(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function formatTimeIn(d: Date, tz: string): string {
  return d.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  });
}

function formatDateIn(d: Date, tz: string): string {
  return d.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tz,
  });
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

// ─── Main ────────────────────────────────────────────────────────

interface AppointmentSnapshot {
  spec: AppointmentSpec;
  current:
    | {
        id: string;
        providerId: string;
        clientName: string | null;
        description: string | null;
        scheduledAt: Date;
        estimatedPrice: number | null;
        reminderMinutes: number | null;
        status: AppointmentStatus;
      }
    | null;
  // Two independent flags. Separating them is critical for idempotency:
  // if a previous run already updated the DB but failed before refreshing
  // BullMQ jobs, we must still repair the queue even though the DB is
  // already correct. The processors use job.data.scheduledAt for their
  // user-facing message, so a stale job means a wrong-time message.
  needsDbUpdate: boolean;
  needsQueueRepair: boolean;
  reason: string;
}

async function main(): Promise<void> {
  const dbHostPort = extractHostPort(process.env.DATABASE_URL);
  const redisHostPort = extractHostPort(process.env.REDIS_URL);

  log('═══════════════════════════════════════════════════════════════');
  log(
    `  Repair appointment timezone — ${DRY_RUN ? 'DRY RUN (no changes)' : 'APPLY MODE'}`,
  );
  log('═══════════════════════════════════════════════════════════════');
  log(`  Started     : ${new Date().toISOString()}`);
  log(`  Log file    : ${logFile}`);
  log(`  Provider id : ${PROVIDER_ID}`);
  log(`  Old TZ      : ${EXPECTED_OLD_TZ}`);
  log(`  New TZ      : ${NEW_TZ}`);
  log(`  DB host     : ${dbHostPort}`);
  log(`  Redis host  : ${redisHostPort}`);
  log(`  Mode        : ${DRY_RUN ? 'dry-run (default)' : 'apply'}`);
  log('');

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    log('❌ REDIS_URL not set in environment. Aborting.');
    log('   The script needs Redis access to inspect/touch BullMQ jobs and');
    log('   the workspace cache. Configure .env or pass REDIS_URL inline.');
    logStream.end();
    process.exit(2);
  }

  // Apply guards: refuse to mutate state when DB or Redis is local.
  // Why:
  //   - Local Redis + remote DB → state drift between DB scheduledAt
  //     and BullMQ jobs.
  //   - Local DB → almost certainly testing; mutating production-shaped
  //     data with --apply against localhost is a common foot-gun.
  // For dry-run we allow local hosts since the script only reads.
  if (APPLY) {
    const safeHostname = (url: string) => {
      try {
        return new URL(url).hostname;
      } catch {
        return '';
      }
    };

    const redisHostname = safeHostname(redisUrl);
    if (isLocalHost(redisHostname)) {
      log(
        `❌ --apply refused: REDIS_URL points to a local host (${redisHostPort}).`,
      );
      log('   Mutating the DB while talking to a local BullMQ would create');
      log('   state drift between the production DB and production queues.');
      log('   Re-run with REDIS_URL pointing at the same Redis the API uses,');
      log('   or run dry-run only (default mode) to inspect state.');
      logStream.end();
      process.exit(2);
    }

    const dbUrl = process.env.DATABASE_URL || '';
    const dbHostname = safeHostname(dbUrl);
    if (!dbHostname || isLocalHost(dbHostname)) {
      log(
        `❌ --apply refused: DATABASE_URL points to a local host (${dbHostPort}).`,
      );
      log('   Refusing to mutate a local database with --apply. Use dry-run');
      log('   for local inspection, or point DATABASE_URL at the same DB the');
      log('   API uses in production.');
      logStream.end();
      process.exit(2);
    }
  }

  const prisma = new PrismaClient();
  const connection = parseRedisUrl(redisUrl);
  const followupQueue = new Queue('appointment-followup', { connection });
  const reminderQueue = new Queue('appointment-reminder', { connection });
  const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 3 });

  let exitCode = 0;
  try {
    // ─── STEP 1 — read & validate ─────────────────────────────────
    log('[STEP 1] Read & validate state');
    log('');

    const user = await prisma.user.findFirst({
      where: { providerProfile: { id: PROVIDER_ID } },
      include: { providerProfile: true },
    });
    if (!user) {
      throw new Error(`No user found whose providerProfile.id = ${PROVIDER_ID}`);
    }

    log('  Provider lookup');
    log(`    providerId : ${PROVIDER_ID}`);
    log(`    user.id    : ${user.id}`);
    log(`    user.phone : ${user.phone}`);
    log(`    user.name  : ${user.name ?? '(null)'}`);
    log(`    user.role  : ${user.role}`);
    if (user.phone !== EXPECTED_USER_PHONE) {
      throw new Error(
        `Phone mismatch: expected ${EXPECTED_USER_PHONE}, got ${user.phone}. Refusing.`,
      );
    }
    if (user.role !== 'PROVIDER') {
      throw new Error(`Role mismatch: expected PROVIDER, got ${user.role}. Refusing.`);
    }
    log(`    ✓ phone and role match expected`);
    log('');

    const workspace = await prisma.workspaceProfile.findUnique({
      where: { providerId: PROVIDER_ID },
    });
    if (!workspace) {
      throw new Error(`No WorkspaceProfile for providerId ${PROVIDER_ID}`);
    }
    log('  Workspace');
    log(`    workspace.id            : ${workspace.id}`);
    log(`    workspace.timezone (cur): ${workspace.timezone}`);
    log(`    target timezone         : ${NEW_TZ}`);
    if (workspace.timezone === NEW_TZ) {
      log(`    ⚠️  workspace.timezone is already ${NEW_TZ}. Will skip workspace update.`);
    } else if (workspace.timezone !== EXPECTED_OLD_TZ) {
      log(
        `    ⚠️  workspace.timezone is "${workspace.timezone}", not the expected "${EXPECTED_OLD_TZ}". ` +
          `Continuing — appointment-level guards will catch any drift.`,
      );
    } else {
      log(`    ✓ workspace.timezone matches expected (${EXPECTED_OLD_TZ})`);
    }
    log('');

    // Validate each appointment exists with expected oldUtc
    const snapshots: AppointmentSnapshot[] = [];
    for (let i = 0; i < APPOINTMENTS.length; i++) {
      const spec = APPOINTMENTS[i];
      const a = await prisma.appointment.findUnique({ where: { id: spec.id } });

      log(`  ──── Appointment ${i + 1} of ${APPOINTMENTS.length} ─────────────────────────`);
      log(`    id              : ${spec.id}`);

      if (!a) {
        log(`    ❌ NOT FOUND in DB`);
        snapshots.push({
          spec,
          current: null,
          needsDbUpdate: false,
          needsQueueRepair: false,
          reason: 'not_found',
        });
        log('');
        continue;
      }

      log(`    providerId      : ${a.providerId}`);
      log(`    clientName      : ${a.clientName ?? '(null)'}`);
      log(`    description     : ${a.description ?? '(null)'}`);
      log(`    status          : ${a.status}`);
      log(`    reminderMinutes : ${a.reminderMinutes ?? '(null)'}`);

      if (a.providerId !== PROVIDER_ID) {
        throw new Error(
          `Appointment ${spec.id} belongs to providerId ${a.providerId}, not ${PROVIDER_ID}. Refusing.`,
        );
      }

      // Semantic guards: protect against running the script on an
      // appointment whose row was reused or whose content was edited
      // since this spec was authored. We compare normalized strings so
      // small whitespace/casing/unicode-form differences don't fail.
      const gotClient = normalizeForCompare(a.clientName);
      const wantClient = normalizeForCompare(spec.expectedClient);
      if (gotClient !== wantClient) {
        throw new Error(
          `Appointment ${spec.id} clientName mismatch: ` +
            `expected "${spec.expectedClient}", got "${a.clientName ?? '(null)'}". Refusing.`,
        );
      }
      const gotDesc = normalizeForCompare(a.description);
      const wantDesc = normalizeForCompare(spec.expectedDescription);
      if (gotDesc !== wantDesc) {
        throw new Error(
          `Appointment ${spec.id} description mismatch: ` +
            `expected "${spec.expectedDescription}", got "${a.description ?? '(null)'}". Refusing.`,
        );
      }
      log(`    ✓ clientName + description match expected`);

      const currentScheduledIso = a.scheduledAt.toISOString();
      log(`    scheduledAt CUR : ${currentScheduledIso}`);
      log(
        `                      → renders ${formatDateIn(a.scheduledAt, EXPECTED_OLD_TZ)}, ${formatTimeIn(a.scheduledAt, EXPECTED_OLD_TZ)} ${EXPECTED_OLD_TZ}`,
      );
      log(
        `                      → renders ${formatDateIn(a.scheduledAt, NEW_TZ)}, ${formatTimeIn(a.scheduledAt, NEW_TZ)} ${NEW_TZ}`,
      );
      log(`    scheduledAt NEW : ${spec.newUtc}`);
      log(
        `                      → renders ${formatDateIn(new Date(spec.newUtc), NEW_TZ)}, ${formatTimeIn(new Date(spec.newUtc), NEW_TZ)} ${NEW_TZ} (intended)`,
      );

      const currentPrice = a.estimatedPrice === null ? null : Number(a.estimatedPrice);
      log(`    estimatedPrice CUR : ${currentPrice ?? '(null)'}`);
      log(
        `    estimatedPrice NEW : ${spec.estimatedPriceNew ?? '(null)'}${
          spec.estimatedPriceShouldChange ? '  ← changes' : ''
        }`,
      );

      // Decide independently:
      //   needsDbUpdate    → only when DB still has OLD values
      //   needsQueueRepair → whenever the appointment is part of this fix
      //                       and currently sits in OLD or NEW state. Stale
      //                       jobs carry oldUtc in job.data and would send
      //                       a wrong-time message even if the DB is right.
      const expectedNewPrice = spec.estimatedPriceShouldChange
        ? spec.estimatedPriceNew
        : spec.estimatedPriceOld;

      let needsDbUpdate = false;
      let needsQueueRepair = false;
      let reason = '';
      if (currentScheduledIso === spec.oldUtc && currentPrice === spec.estimatedPriceOld) {
        needsDbUpdate = true;
        needsQueueRepair = true;
        reason = 'guard_match';
        log(`    → planned action: UPDATE DB + REPAIR jobs`);
      } else if (
        currentScheduledIso === spec.newUtc &&
        currentPrice === expectedNewPrice
      ) {
        needsDbUpdate = false;
        needsQueueRepair = true;
        reason = 'already_migrated_db';
        log(
          `    → planned action: SKIP DB (already migrated), REPAIR jobs (idempotent)`,
        );
      } else if (currentScheduledIso === spec.newUtc) {
        reason = 'partial_migration';
        log(
          `    ⚠️  scheduledAt matches NEW but estimatedPrice does not. Manual review recommended. Skipping both DB and jobs.`,
        );
      } else {
        reason = 'unknown_state';
        log(
          `    ⚠️  scheduledAt is neither OLD nor NEW. Unknown state. Skipping both DB and jobs.`,
        );
      }
      log('');

      snapshots.push({
        spec,
        current: a as any,
        needsDbUpdate,
        needsQueueRepair,
        reason,
      });
    }

    // BullMQ jobs current state
    log(`  ──── BullMQ jobs (current state) ──────────────────────────`);
    for (const s of snapshots) {
      if (!s.current) continue;
      const followupId = `followup-${s.spec.id}`;
      const reminderId = `reminder-${s.spec.id}`;
      const f = await followupQueue.getJob(followupId);
      const r = await reminderQueue.getJob(reminderId);
      const fState = f ? await f.getState().catch(() => 'unknown') : 'absent';
      const rState = r ? await r.getState().catch(() => 'unknown') : 'absent';
      log(`    ${followupId}`);
      log(`      state: ${fState}${f && f.timestamp && f.delay ? `, eta: ${new Date(f.timestamp + (f.delay || 0)).toISOString()}` : ''}`);
      log(`    ${reminderId}`);
      log(`      state: ${rState}${r && r.timestamp && r.delay ? `, eta: ${new Date(r.timestamp + (r.delay || 0)).toISOString()}` : ''}`);
    }
    log('');

    // Plan summary
    const toDbUpdate = snapshots.filter((s) => s.needsDbUpdate);
    const toQueueRepair = snapshots.filter((s) => s.needsQueueRepair);
    log('══════════════ Plan summary ═════════════════════════════════');
    log(`  Appointments to update in DB     : ${toDbUpdate.length} of ${APPOINTMENTS.length}`);
    log(`  Appointments whose jobs repaired : ${toQueueRepair.length} of ${APPOINTMENTS.length}`);
    log(
      `  Workspace tz update              : ${
        workspace.timezone === NEW_TZ ? '0 (already set)' : '1'
      }`,
    );
    log(`  Redis cache invalidate           : 1`);
    log(`  Followup jobs to remove + re-enqueue : ${toQueueRepair.length}`);
    log(
      `  Reminder jobs to remove + re-enqueue : ${
        toQueueRepair.filter((s) => s.current?.reminderMinutes).length
      }`,
    );
    log('');
    log(
      '  Idempotency : every appointment.update uses WHERE id = ? AND scheduledAt = <oldUtc>.',
    );
    log(
      '                Re-running this script after a successful apply is a no-op.',
    );
    log('  Side effect : NO WhatsApp message is sent to the provider from this script.');
    log('');

    if (DRY_RUN) {
      log('═══════════════════════════════════════════════════════════════');
      log('  DRY-RUN complete. No changes applied.');
      log('  To apply, re-run with:');
      log(`    --apply --confirm-provider ${PROVIDER_ID}`);
      log('═══════════════════════════════════════════════════════════════');
      return;
    }

    // ─── STEP 2 — Prisma transaction ──────────────────────────────
    log('[STEP 2] Prisma transaction (appointments + workspace)');
    log('');
    await prisma.$transaction(async (tx) => {
      for (const s of snapshots) {
        if (!s.needsDbUpdate) {
          if (s.needsQueueRepair) {
            log(
              `  [SKIP-DB] appointment ${s.spec.id}: already migrated, jobs will be repaired in step 4-5`,
            );
          }
          continue;
        }
        const data: { scheduledAt: Date; estimatedPrice?: number | null } = {
          scheduledAt: new Date(s.spec.newUtc),
        };
        if (s.spec.estimatedPriceShouldChange) {
          data.estimatedPrice = s.spec.estimatedPriceNew;
        }
        const u = await tx.appointment.updateMany({
          where: { id: s.spec.id, scheduledAt: new Date(s.spec.oldUtc) },
          data,
        });
        if (u.count !== 1) {
          throw new Error(
            `Guard failed for appointment ${s.spec.id}: expected 1 row updated, got ${u.count}. Aborting transaction.`,
          );
        }
        log(
          `  [APPLIED] appointment ${s.spec.id}: scheduledAt → ${s.spec.newUtc}` +
            (s.spec.estimatedPriceShouldChange
              ? `, estimatedPrice → ${s.spec.estimatedPriceNew}`
              : ''),
        );
      }

      if (workspace.timezone !== NEW_TZ) {
        const wu = await tx.workspaceProfile.updateMany({
          where: { providerId: PROVIDER_ID, timezone: workspace.timezone },
          data: { timezone: NEW_TZ },
        });
        if (wu.count !== 1) {
          throw new Error(
            `Workspace tz guard failed: expected 1 row updated, got ${wu.count}. Aborting transaction.`,
          );
        }
        log(`  [APPLIED] workspace.timezone: ${workspace.timezone} → ${NEW_TZ}`);
      } else {
        log(`  [SKIP]    workspace.timezone already ${NEW_TZ}`);
      }
    });
    log('  ✓ transaction committed');
    log('');

    // ─── STEP 3 — invalidate Redis workspace cache ────────────────
    log('[STEP 3] Invalidate Redis workspace cache');
    const cacheKey = `workspace:${PROVIDER_ID}`;
    const delCount = await redis.del(cacheKey);
    log(`  [APPLIED] DEL ${cacheKey} (deleted=${delCount})`);
    log('');

    // ─── STEP 4 — cancel old jobs ─────────────────────────────────
    log('[STEP 4] Cancel old BullMQ jobs');
    for (const s of snapshots) {
      if (!s.needsQueueRepair) continue;
      const followupId = `followup-${s.spec.id}`;
      const reminderId = `reminder-${s.spec.id}`;

      const f = await followupQueue.getJob(followupId);
      if (f) {
        const state = await f.getState().catch(() => 'unknown');
        try {
          await f.remove();
          log(`  [APPLIED] removed ${followupId} (was: ${state})`);
        } catch (err: any) {
          log(`  [WARN]    could not remove ${followupId} (state: ${state}): ${err.message}`);
        }
      } else {
        log(`  [SKIP]    ${followupId} not found`);
      }

      const r = await reminderQueue.getJob(reminderId);
      if (r) {
        const state = await r.getState().catch(() => 'unknown');
        try {
          await r.remove();
          log(`  [APPLIED] removed ${reminderId} (was: ${state})`);
        } catch (err: any) {
          log(`  [WARN]    could not remove ${reminderId} (state: ${state}): ${err.message}`);
        }
      } else {
        log(`  [SKIP]    ${reminderId} not found`);
      }
    }
    log('');

    // ─── STEP 5 — re-enqueue with new scheduledAt ─────────────────
    log('[STEP 5] Re-enqueue BullMQ jobs with corrected scheduledAt');
    for (const s of snapshots) {
      if (!s.needsQueueRepair || !s.current) continue;
      const newScheduledAt = new Date(s.spec.newUtc);
      const followupId = `followup-${s.spec.id}`;
      const followupDelay = newScheduledAt.getTime() - Date.now() + FOLLOWUP_DELAY_MS;

      if (followupDelay > 0) {
        await followupQueue.add(
          'followup',
          {
            appointmentId: s.spec.id,
            providerPhone: user.phone,
            clientName: s.current.clientName ?? undefined,
            scheduledAt: newScheduledAt.toISOString(),
            timezone: NEW_TZ,
          },
          { ...DEFAULT_JOB_OPTIONS, delay: followupDelay, jobId: followupId },
        );
        log(
          `  [APPLIED] enqueued ${followupId} delay=${followupDelay}ms ` +
            `(fires ${new Date(Date.now() + followupDelay).toISOString()})`,
        );
      } else {
        log(`  [SKIP]    ${followupId} would fire in the past (delay=${followupDelay}ms). Not enqueued.`);
      }

      if (s.current.reminderMinutes) {
        const reminderId = `reminder-${s.spec.id}`;
        const reminderDelay =
          newScheduledAt.getTime() - Date.now() - s.current.reminderMinutes * 60 * 1000;

        if (reminderDelay > 0) {
          await reminderQueue.add(
            'reminder',
            {
              appointmentId: s.spec.id,
              providerPhone: user.phone,
              clientName: s.current.clientName ?? undefined,
              scheduledAt: newScheduledAt.toISOString(),
              reminderMinutes: s.current.reminderMinutes,
              timezone: NEW_TZ,
            },
            { ...DEFAULT_JOB_OPTIONS, delay: reminderDelay, jobId: reminderId },
          );
          log(
            `  [APPLIED] enqueued ${reminderId} delay=${reminderDelay}ms ` +
              `(fires ${new Date(Date.now() + reminderDelay).toISOString()})`,
          );
        } else {
          log(`  [SKIP]    ${reminderId} would fire in the past (delay=${reminderDelay}ms). Not enqueued.`);
        }
      }
    }
    log('');

    // ─── STEP 6 — post-apply verification ─────────────────────────
    log('[STEP 6] Post-apply verification');

    const wsCheck = await prisma.workspaceProfile.findUnique({
      where: { providerId: PROVIDER_ID },
    });
    const tzOk = wsCheck?.timezone === NEW_TZ;
    log(`  ${tzOk ? '✓' : '❌'} workspace.timezone == ${NEW_TZ} (got ${wsCheck?.timezone})`);
    if (!tzOk) exitCode = 1;

    const cacheExists = await redis.exists(cacheKey);
    const cacheOk = cacheExists === 0;
    log(`  ${cacheOk ? '✓' : '❌'} redis cache key absent (exists=${cacheExists})`);
    if (!cacheOk) exitCode = 1;

    for (const s of snapshots) {
      if (!s.needsDbUpdate && !s.needsQueueRepair) continue;
      const a = await prisma.appointment.findUnique({ where: { id: s.spec.id } });
      const scheduledOk = a?.scheduledAt.toISOString() === s.spec.newUtc;
      log(
        `  ${scheduledOk ? '✓' : '❌'} appointment ${s.spec.id} scheduledAt == ${s.spec.newUtc} ` +
          `(got ${a?.scheduledAt.toISOString()})`,
      );
      if (a) {
        log(
          `         renders ${formatTimeIn(a.scheduledAt, NEW_TZ)} ${NEW_TZ} on ${formatDateIn(a.scheduledAt, NEW_TZ)}`,
        );
      }
      if (!scheduledOk) exitCode = 1;

      const expectedPrice = s.spec.estimatedPriceShouldChange
        ? s.spec.estimatedPriceNew
        : s.spec.estimatedPriceOld;
      const gotPrice = a?.estimatedPrice === null ? null : Number(a?.estimatedPrice);
      const priceOk = gotPrice === expectedPrice;
      log(
        `  ${priceOk ? '✓' : '❌'} appointment ${s.spec.id} estimatedPrice == ${expectedPrice} (got ${gotPrice})`,
      );
      if (!priceOk) exitCode = 1;

      // Job verification: only if we attempted queue repair AND the
      // expected fire time is still in the future (otherwise step 5
      // legitimately skipped enqueue).
      if (s.needsQueueRepair && s.current) {
        const newScheduledAt = new Date(s.spec.newUtc);
        const followupFireMs =
          newScheduledAt.getTime() + FOLLOWUP_DELAY_MS;
        const expectFollowup = followupFireMs > Date.now();
        const f = await followupQueue.getJob(`followup-${s.spec.id}`);
        if (expectFollowup) {
          const ok = !!f;
          log(`  ${ok ? '✓' : '❌'} followup-${s.spec.id} enqueued`);
          if (!ok) exitCode = 1;
        } else {
          log(`  ⏭ followup-${s.spec.id} skipped (would fire in the past)`);
        }

        if (s.current.reminderMinutes) {
          const reminderFireMs =
            newScheduledAt.getTime() - s.current.reminderMinutes * 60 * 1000;
          const expectReminder = reminderFireMs > Date.now();
          const r = await reminderQueue.getJob(`reminder-${s.spec.id}`);
          if (expectReminder) {
            const ok = !!r;
            log(`  ${ok ? '✓' : '❌'} reminder-${s.spec.id} enqueued`);
            if (!ok) exitCode = 1;
          } else {
            log(`  ⏭ reminder-${s.spec.id} skipped (would fire in the past)`);
          }
        }
      }
    }
    log('');

    log('═══════════════════════════════════════════════════════════════');
    if (exitCode === 0) {
      log(`  ✅ All checks passed. Provider ${PROVIDER_ID} now in ${NEW_TZ}.`);
      log('  No WhatsApp message was sent to the provider from this script.');
    } else {
      log('  ❌ Some checks FAILED. See log above. Manual review required.');
    }
    log('═══════════════════════════════════════════════════════════════');
  } catch (err: any) {
    log('');
    log(`❌ Fatal error: ${err.message}`);
    if (err.stack) log(err.stack);
    log('');
    log('  No further steps were executed after the failure.');
    log('  If the failure was inside the Prisma transaction, no DB changes were committed.');
    log('  If the failure was after the transaction, the DB is the source of truth — re-run');
    log('  this script (idempotent) after fixing the cause to repair cache and queues.');
    exitCode = 2;
  } finally {
    try {
      await prisma.$disconnect();
    } catch {}
    try {
      await followupQueue.close();
    } catch {}
    try {
      await reminderQueue.close();
    } catch {}
    try {
      await redis.quit();
    } catch {}
    logStream.end();
    process.exit(exitCode);
  }
}

main().catch((err) => {
  console.error('Unhandled error in main:', err);
  process.exit(2);
});

// Suppress unused warning (kept for clarity; helper is local-only).
void pad;
