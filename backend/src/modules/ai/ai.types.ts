export enum AiIntent {
  REGISTRAR_INGRESO = 'registrar_ingreso',
  REGISTRAR_GASTO = 'registrar_gasto',
  VER_RESUMEN = 'ver_resumen',
  AGENDAR_CITA = 'agendar_cita',
  CONFIRMAR_CLIENTE = 'confirmar_cliente',
  VER_AGENDA = 'ver_agenda',
  AYUDA = 'ayuda',
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

export interface AppointmentData {
  date?: string;
  time?: string;
  clientName?: string;
  clientPhone?: string;
  address?: string;
  description?: string;
}

export type WorkspaceConfigAction =
  | 'add_service'
  | 'remove_service'
  | 'set_schedule'
  | 'set_auto_reply'
  | 'add_note';

export interface WorkspaceConfigData {
  action: WorkspaceConfigAction;
  serviceName?: string;
  servicePrice?: number;
  serviceUnit?: 'visita' | 'hora' | 'm2' | 'otro';
  days?: string[];
  timeStart?: string;
  timeEnd?: string;
  autoReplyEnabled?: boolean;
  autoReplyMessage?: string;
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

export interface WorkspaceContextDto {
  services: WorkspaceService[];
  schedule: WorkspaceSchedule;
  autoReply: WorkspaceAutoReply;
  notes?: string | null;
  learnedFacts?: string[];
}
