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
  CONFIGURAR_PERFIL = 'configurar_perfil',
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

export interface WorkspaceContextDto {
  services: WorkspaceService[];
  schedule: WorkspaceSchedule;
  autoReply: WorkspaceAutoReply;
  notes?: string | null;
  learnedFacts?: string[];
  recentExpenses?: RecentExpenseContext[];
  activeRecurringExpenses?: ActiveRecurringContext[];
  providerModel?: import('../provider-model/provider-model.types').ProviderModel | null;
  todayAppointments?: TodayAppointmentContext[];
}
