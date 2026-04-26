export enum AiIntent {
  REGISTRAR_INGRESO = 'registrar_ingreso',
  REGISTRAR_GASTO = 'registrar_gasto',
  GESTIONAR_GASTO = 'gestionar_gasto',
  GESTIONAR_GASTO_RECURRENTE = 'gestionar_gasto_recurrente',
  VER_RESUMEN = 'ver_resumen',
  AGENDAR_CITA = 'agendar_cita',
  CONFIRMAR_CLIENTE = 'confirmar_cliente',
  VER_AGENDA = 'ver_agenda',
  MODIFICAR_CITA = 'modificar_cita',
  CANCELAR_CITA = 'cancelar_cita',
  CONFIRMAR_RESULTADO_CITA = 'confirmar_resultado_cita',
  AYUDA = 'ayuda',
  CREAR_RECORDATORIO = 'crear_recordatorio',
  VER_RECORDATORIOS = 'ver_recordatorios',
  MODIFICAR_RECORDATORIO = 'modificar_recordatorio',
  CANCELAR_RECORDATORIO = 'cancelar_recordatorio',
  COMPLETAR_RECORDATORIO = 'completar_recordatorio',
  CONFIGURAR_PERFIL = 'configurar_perfil',
  CREAR_LINK_COBRO = 'crear_link_cobro',
  ACTIVAR_COBROS = 'activar_cobros',
  CONFIGURAR_ZONA_HORARIA = 'configurar_zona_horaria',
  VER_INGRESOS_PROYECTADOS = 'ver_ingresos_proyectados',
  CONVERSACION_GENERAL = 'conversacion_general',
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AiResponse {
  message: string;
  intent: AiIntent;
  data?: Record<string, any>;
}

export interface HistorySearchData {
  query: string;
  includeAssistant?: boolean;
  limit?: number;
}

export interface HistorySearchSnippet {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface HistorySearchResult {
  query: string;
  includeAssistant: boolean;
  snippets: HistorySearchSnippet[];
  totalResults: number;
}

export interface IncomeData {
  amount?: number;
  description?: string;
  paymentMethod?: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER';
  clientName?: string;
}

export interface ExpenseData {
  amount?: number;
  category?: string;
  description?: string;
}

export interface GestionarGastoData {
  action: 'delete_last' | 'delete_by_description' | 'edit_last';
  description?: string;
  amount?: number;
}

export interface RecurringExpenseData {
  action: 'create' | 'cancel' | 'list' | 'update';
  amount?: number;
  category?: string;
  description?: string;
  frequency?: 'monthly' | 'weekly';
  dayOfMonth?: number;
}

export interface AppointmentData {
  date?: string;
  time?: string;
  clientName?: string;
  clientPhone?: string;
  address?: string;
  description?: string;
}

export interface ReminderData {
  description?: string;
  date?: string;
  time?: string;
  newDate?: string;
  newTime?: string;
  newDescription?: string;
}

export type WorkspaceConfigAction =
  | 'add_service'
  | 'remove_service'
  | 'set_schedule'
  | 'add_note';

export interface WorkspaceConfigData {
  action: WorkspaceConfigAction;
  serviceName?: string;
  servicePrice?: number;
  serviceUnit?: 'visita' | 'hora' | 'm2' | 'otro';
  days?: string[];
  timeStart?: string;
  timeEnd?: string;
  note?: string;
}

export interface WorkspaceService {
  name: string;
  price: number;
  unit: 'visita' | 'hora' | 'm2' | 'otro';
}

export interface WorkspaceSchedule {
  days?: string[];
  timeStart?: string;
  timeEnd?: string;
}

export interface WorkspaceAutoReply {
  enabled: boolean;
  message: string;
}

export interface RecentExpenseContext {
  amount: number;
  category?: string;
  description?: string;
  date: string; // ISO date
}

export interface ActiveRecurringContext {
  amount: number;
  description: string;
  frequency: string;
  dayOfMonth?: number | null;
}

export interface TodayAppointmentContext {
  time: string;
  clientName?: string;
  description?: string;
  address?: string;
}

export type FactCategory = 'personal' | 'negocio' | 'clientes' | 'preferencias' | 'patrones';

export interface StructuredFact {
  fact: string;
  category: FactCategory;
  firstSeen: string; // ISO date YYYY-MM-DD
  lastSeen: string;  // ISO date YYYY-MM-DD
}

/**
 * Source that last set the workspace timezone. Used by the Timezone
 * Confidence System (Cap. 46) to decide whether the value can be
 * trusted, asked again, or migrated wall-clock-style on change.
 *
 * - `default`               — sitting on the seed value, never asked.
 * - `existing_non_default`  — backfill: row had a non-default timezone
 *   before the confidence flag existed, so we treat it as confirmed.
 * - `phone_risk_prompt`     — runtime gate asked and got a resolvable
 *   answer (M4).
 * - `phone_risk_prompt_skipped` — runtime gate asked, user did not
 *   answer or the answer did not resolve (M4).
 * - `user_mention`          — the LLM called configurar_zona_horaria
 *   off an in-conversation mention ("estoy en Holanda").
 * - `user_explicit`         — onboarding flow asked the question
 *   directly (M3).
 * - `admin`                 — set out-of-band by an admin / repair
 *   script.
 */
export type TimezoneSource =
  | 'default'
  | 'existing_non_default'
  | 'phone_risk_prompt'
  | 'phone_risk_prompt_skipped'
  | 'user_mention'
  | 'user_explicit'
  | 'admin';

export interface WorkspaceContextDto {
  services: WorkspaceService[];
  schedule: WorkspaceSchedule;
  autoReply: WorkspaceAutoReply;
  notes?: string | null;
  timezone?: string;
  timezoneConfirmed?: boolean;
  timezoneSource?: TimezoneSource | null;
  learnedFacts?: StructuredFact[];
  recentExpenses?: RecentExpenseContext[];
  activeRecurringExpenses?: ActiveRecurringContext[];
  providerModel?: import('../provider-model/provider-model.types').ProviderModel | null;
  todayAppointments?: TodayAppointmentContext[];
}
