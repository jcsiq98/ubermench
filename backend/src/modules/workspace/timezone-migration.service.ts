import { Injectable, Logger } from '@nestjs/common';
import { AppointmentStatus, ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../common/queues/queue.service';
import { QUEUE_NAMES } from '../../common/queues/queue.constants';
import { toLocalTime, wallClockToUtc } from '../../common/utils/timezone.utils';

const FOLLOWUP_DELAY_MS = 30 * 60 * 1000;

export interface WallClockMigrationResult {
  appointmentsMigrated: number;
  remindersMigrated: number;
  /** Ids whose DB scheduledAt update threw — agenda for these rows is
   *  unchanged and the caller MUST surface the failure to the user. */
  failedAppointments: string[];
  /** Ids whose DB remindAt update threw — agenda for these rows is
   *  unchanged and the caller MUST surface the failure to the user. */
  failedReminders: string[];
}

/**
 * Cap. 46 — wall-clock migration when a workspace timezone changes
 * from "default & unconfirmed" to a real one.
 *
 * Re-anchors every future Appointment + Reminder so the wall-clock the
 * provider originally said is preserved in the new timezone. Previously
 * scheduled BullMQ jobs (followup, reminder, personal-reminder) are
 * cancelled and re-enqueued with the corrected delay.
 *
 * Lifted from the one-off `repair-appointment-timezone.ts` script that
 * fixed the Roberto incident on 26-abr-2026, generalized for runtime
 * use. Intended call site: WhatsAppProviderHandler when it runs the
 * runtime gate or the `configurar_zona_horaria` flow on a workspace
 * whose previous state was the seed default and never confirmed.
 */
@Injectable()
export class TimezoneMigrationService {
  private readonly logger = new Logger(TimezoneMigrationService.name);

  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
  ) {}

  async migrateFutureWallClock(
    providerId: string,
    oldTz: string,
    newTz: string,
    providerPhone: string,
  ): Promise<WallClockMigrationResult> {
    const empty: WallClockMigrationResult = {
      appointmentsMigrated: 0,
      remindersMigrated: 0,
      failedAppointments: [],
      failedReminders: [],
    };
    if (oldTz === newTz) return empty;

    const now = new Date();
    let appointmentsMigrated = 0;
    let remindersMigrated = 0;
    const failedAppointments: string[] = [];
    const failedReminders: string[] = [];

    const appointments = await this.prisma.appointment.findMany({
      where: {
        providerId,
        scheduledAt: { gt: now },
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      },
    });

    for (const a of appointments) {
      const newScheduledAt = this.reanchor(a.scheduledAt, oldTz, newTz);
      if (newScheduledAt.getTime() === a.scheduledAt.getTime()) continue;

      // The DB update is the source-of-truth half. If it fails the
      // user's agenda still reads the old (wrong) UTC, so we surface it
      // through the result. The queue rescheduling that follows is
      // operational machinery the user does not see directly — its
      // failures are logged but not surfaced (the cron safety nets
      // — Cap. 38 — pick up stale jobs).
      try {
        await this.prisma.appointment.update({
          where: { id: a.id },
          data: { scheduledAt: newScheduledAt },
        });
      } catch (err: any) {
        this.logger.error(
          `DB update failed for appointment ${a.id}: ${err.message}`,
        );
        failedAppointments.push(a.id);
        continue;
      }

      appointmentsMigrated++;

      try {
        await this.rescheduleAppointmentJobs(
          {
            id: a.id,
            providerPhone,
            clientName: a.clientName ?? undefined,
            reminderMinutes: a.reminderMinutes,
            scheduledAt: newScheduledAt,
          },
          newTz,
        );
      } catch (err: any) {
        this.logger.warn(
          `Queue reschedule failed for appointment ${a.id} ` +
            `(DB is correct, cron safety net will recover): ${err.message}`,
        );
      }
    }

    const reminders = await this.prisma.reminder.findMany({
      where: {
        providerId,
        remindAt: { gt: now },
        status: ReminderStatus.PENDING,
      },
    });

    for (const r of reminders) {
      const newRemindAt = this.reanchor(r.remindAt, oldTz, newTz);
      if (newRemindAt.getTime() === r.remindAt.getTime()) continue;

      try {
        await this.prisma.reminder.update({
          where: { id: r.id },
          data: { remindAt: newRemindAt },
        });
      } catch (err: any) {
        this.logger.error(
          `DB update failed for reminder ${r.id}: ${err.message}`,
        );
        failedReminders.push(r.id);
        continue;
      }

      remindersMigrated++;

      try {
        await this.queueService.removeJob(
          QUEUE_NAMES.PERSONAL_REMINDER,
          `personal-reminder-${r.id}`,
        );
        const delay = newRemindAt.getTime() - Date.now();
        if (delay > 0) {
          await this.queueService.addJob(
            QUEUE_NAMES.PERSONAL_REMINDER,
            'personal-reminder',
            {
              reminderId: r.id,
              providerPhone,
              description: r.description,
              remindAt: newRemindAt.toISOString(),
            },
            { delay, jobId: `personal-reminder-${r.id}` },
          );
        }
      } catch (err: any) {
        this.logger.warn(
          `Queue reschedule failed for reminder ${r.id} ` +
            `(DB is correct): ${err.message}`,
        );
      }
    }

    const failureCount = failedAppointments.length + failedReminders.length;
    if (
      appointmentsMigrated > 0 ||
      remindersMigrated > 0 ||
      failureCount > 0
    ) {
      this.logger.log(
        `Wall-clock migration ${oldTz} -> ${newTz} for ${providerId}: ` +
          `${appointmentsMigrated} appointment(s), ${remindersMigrated} reminder(s) re-anchored; ` +
          `${failedAppointments.length} appointment(s), ${failedReminders.length} reminder(s) FAILED`,
      );
    }

    return {
      appointmentsMigrated,
      remindersMigrated,
      failedAppointments,
      failedReminders,
    };
  }

  private async rescheduleAppointmentJobs(
    appt: {
      id: string;
      providerPhone: string;
      clientName?: string;
      reminderMinutes: number | null;
      scheduledAt: Date;
    },
    newTz: string,
  ): Promise<void> {
    await this.queueService.removeJob(
      QUEUE_NAMES.APPOINTMENT_FOLLOWUP,
      `followup-${appt.id}`,
    );
    const followupDelay =
      appt.scheduledAt.getTime() - Date.now() + FOLLOWUP_DELAY_MS;
    if (followupDelay > 0) {
      await this.queueService.addJob(
        QUEUE_NAMES.APPOINTMENT_FOLLOWUP,
        'followup',
        {
          appointmentId: appt.id,
          providerPhone: appt.providerPhone,
          clientName: appt.clientName,
          scheduledAt: appt.scheduledAt.toISOString(),
          timezone: newTz,
        },
        { delay: followupDelay, jobId: `followup-${appt.id}` },
      );
    }

    if (appt.reminderMinutes != null) {
      await this.queueService.removeJob(
        QUEUE_NAMES.APPOINTMENT_REMINDER,
        `reminder-${appt.id}`,
      );
      const reminderDelay =
        appt.scheduledAt.getTime() - Date.now() - appt.reminderMinutes * 60_000;
      if (reminderDelay > 0) {
        await this.queueService.addJob(
          QUEUE_NAMES.APPOINTMENT_REMINDER,
          'reminder',
          {
            appointmentId: appt.id,
            providerPhone: appt.providerPhone,
            clientName: appt.clientName,
            scheduledAt: appt.scheduledAt.toISOString(),
            reminderMinutes: appt.reminderMinutes,
            timezone: newTz,
          },
          { delay: reminderDelay, jobId: `reminder-${appt.id}` },
        );
      }
    }
  }

  /**
   * Re-anchor a UTC instant so its wall-clock representation in the new
   * timezone equals its wall-clock representation in the old one.
   */
  private reanchor(utc: Date, oldTz: string, newTz: string): Date {
    const local = toLocalTime(utc, oldTz);
    return wallClockToUtc(
      local.getFullYear(),
      local.getMonth(),
      local.getDate(),
      local.getHours(),
      local.getMinutes(),
      newTz,
    );
  }
}
