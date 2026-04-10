export interface FinancialPatterns {
  avgWeeklyIncome: number | null;
  avgTicket: number | null;
  bestDayOfWeek: string | null;
  thisWeekIncome: number;
  lastWeekIncome: number;
  thisMonthIncome: number;
  totalExpensesThisMonth: number;
  netThisMonth: number;
}

export interface ClientInsight {
  name: string;
  totalJobs: number;
  totalAmount: number;
}

export interface ClientPatterns {
  topClients: ClientInsight[];
  uniqueClientsLast30Days: number;
  repeatClientRate: number | null;
}

export interface SchedulePatterns {
  busiestDay: string | null;
  appointmentsThisWeek: number;
  appointmentsNextWeek: number;
}

export interface ProviderModel {
  financial: FinancialPatterns;
  clients: ClientPatterns;
  schedule: SchedulePatterns;
}
