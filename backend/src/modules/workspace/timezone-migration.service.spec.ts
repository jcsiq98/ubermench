/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { TimezoneMigrationService } from './timezone-migration.service';
import { AppointmentStatus, ReminderStatus } from '@prisma/client';
import { wallClockToUtc, toLocalTime } from '../../common/utils/timezone.utils';

// Cap. 46 — wall-clock migration unit tests. We mock prisma + queueService
// directly. The reanchor math is exercised via the public path (input
// scheduledAt -> output scheduledAt) so that any change to the helper
// surfaces here.

function buildService(opts: {
  appointments: any[];
  reminders: any[];
}) {
  const updatedAppointments: Array<{ id: string; scheduledAt: Date }> = [];
  const updatedReminders: Array<{ id: string; remindAt: Date }> = [];

  const prisma = {
    appointment: {
      findMany: jest.fn(async () => opts.appointments),
      update: jest.fn(async ({ where, data }: any) => {
        updatedAppointments.push({ id: where.id, scheduledAt: data.scheduledAt });
        return { id: where.id, ...data };
      }),
    },
    reminder: {
      findMany: jest.fn(async () => opts.reminders),
      update: jest.fn(async ({ where, data }: any) => {
        updatedReminders.push({ id: where.id, remindAt: data.remindAt });
        return { id: where.id, ...data };
      }),
    },
  };

  const queueService = {
    addJob: jest.fn(async () => 'mock-job-id'),
    removeJob: jest.fn(async () => undefined),
  };

  const service = new TimezoneMigrationService(prisma as any, queueService as any);

  return { service, prisma, queueService, updatedAppointments, updatedReminders };
}

describe('TimezoneMigrationService — migrateFutureWallClock (Cap. 46)', () => {
  it('returns no-op when oldTz === newTz', async () => {
    const env = buildService({ appointments: [], reminders: [] });
    const result = await env.service.migrateFutureWallClock(
      'pp-1',
      'Europe/Amsterdam',
      'Europe/Amsterdam',
      '+15755716627',
    );
    expect(result).toEqual({ appointmentsMigrated: 0, remindersMigrated: 0 });
    expect(env.prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it('re-anchors a future appointment so wall-clock matches the new timezone', async () => {
    // Appointment originally captured as "10:00 wall-clock" interpreted in
    // CDMX -> stored as 16:00 UTC. After migration to Europe/Amsterdam,
    // the wall-clock must still read 10:00 (which is 08:00 UTC during CET
    // / 09:00 UTC during CEST — the helper picks the right offset).
    const oldUtc = wallClockToUtc(2026, 5 /* June */, 1, 10, 0, 'America/Mexico_City');

    const env = buildService({
      appointments: [
        {
          id: 'appt-1',
          providerId: 'pp-1',
          scheduledAt: oldUtc,
          status: AppointmentStatus.PENDING,
          clientName: 'Cliente',
          reminderMinutes: null,
        },
      ],
      reminders: [],
    });

    const result = await env.service.migrateFutureWallClock(
      'pp-1',
      'America/Mexico_City',
      'Europe/Amsterdam',
      '+15755716627',
    );

    expect(result.appointmentsMigrated).toBe(1);
    expect(env.updatedAppointments).toHaveLength(1);

    const reanchored = env.updatedAppointments[0].scheduledAt;
    const localInNewTz = toLocalTime(reanchored, 'Europe/Amsterdam');
    expect(localInNewTz.getHours()).toBe(10);
    expect(localInNewTz.getMinutes()).toBe(0);
    expect(localInNewTz.getDate()).toBe(1);
    expect(localInNewTz.getMonth()).toBe(5);
    expect(localInNewTz.getFullYear()).toBe(2026);
  });

  it('cancels and re-enqueues followup + reminder jobs after re-anchoring', async () => {
    const futureBase = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const env = buildService({
      appointments: [
        {
          id: 'appt-1',
          providerId: 'pp-1',
          scheduledAt: wallClockToUtc(
            futureBase.getFullYear(),
            futureBase.getMonth(),
            futureBase.getDate(),
            10, 0, 'America/Mexico_City',
          ),
          status: AppointmentStatus.CONFIRMED,
          clientName: 'Cliente',
          reminderMinutes: 30,
        },
      ],
      reminders: [],
    });

    await env.service.migrateFutureWallClock(
      'pp-1',
      'America/Mexico_City',
      'Europe/Amsterdam',
      '+15755716627',
    );

    expect(env.queueService.removeJob).toHaveBeenCalledWith(
      'appointment-followup',
      'followup-appt-1',
    );
    expect(env.queueService.removeJob).toHaveBeenCalledWith(
      'appointment-reminder',
      'reminder-appt-1',
    );
    expect(env.queueService.addJob).toHaveBeenCalledWith(
      'appointment-followup',
      'followup',
      expect.objectContaining({
        appointmentId: 'appt-1',
        timezone: 'Europe/Amsterdam',
      }),
      expect.objectContaining({ jobId: 'followup-appt-1' }),
    );
    expect(env.queueService.addJob).toHaveBeenCalledWith(
      'appointment-reminder',
      'reminder',
      expect.objectContaining({
        appointmentId: 'appt-1',
        reminderMinutes: 30,
        timezone: 'Europe/Amsterdam',
      }),
      expect.objectContaining({ jobId: 'reminder-appt-1' }),
    );
  });

  it('re-anchors future reminders and re-enqueues personal-reminder jobs', async () => {
    const oldUtc = wallClockToUtc(2026, 5, 10, 9, 30, 'America/Mexico_City');

    const env = buildService({
      appointments: [],
      reminders: [
        {
          id: 'rem-1',
          providerId: 'pp-1',
          description: 'Llamar al maestro',
          remindAt: oldUtc,
          status: ReminderStatus.PENDING,
        },
      ],
    });

    const result = await env.service.migrateFutureWallClock(
      'pp-1',
      'America/Mexico_City',
      'Europe/Amsterdam',
      '+15755716627',
    );

    expect(result.remindersMigrated).toBe(1);
    expect(env.queueService.removeJob).toHaveBeenCalledWith(
      'personal-reminder',
      'personal-reminder-rem-1',
    );

    const reanchored = env.updatedReminders[0].remindAt;
    const local = toLocalTime(reanchored, 'Europe/Amsterdam');
    expect(local.getHours()).toBe(9);
    expect(local.getMinutes()).toBe(30);
  });

  it('skips reminderless appointments (no reminder job to touch)', async () => {
    const env = buildService({
      appointments: [
        {
          id: 'appt-1',
          providerId: 'pp-1',
          scheduledAt: wallClockToUtc(2026, 5, 10, 10, 0, 'America/Mexico_City'),
          status: AppointmentStatus.PENDING,
          clientName: null,
          reminderMinutes: null,
        },
      ],
      reminders: [],
    });

    await env.service.migrateFutureWallClock(
      'pp-1',
      'America/Mexico_City',
      'Europe/Amsterdam',
      '+15755716627',
    );

    const removeCalls = env.queueService.removeJob.mock.calls.map((c) => c[0]);
    expect(removeCalls).toContain('appointment-followup');
    expect(removeCalls).not.toContain('appointment-reminder');
  });
});
