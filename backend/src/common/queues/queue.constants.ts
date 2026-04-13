export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  TRUST_SCORE: 'trust-score',
  WEBHOOKS: 'webhook-processing',
  VERIFICATION: 'verification',
  PAYMENTS: 'payments',
  APPOINTMENT_FOLLOWUP: 'appointment-followup',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 1000, age: 24 * 3600 },
  removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
};
