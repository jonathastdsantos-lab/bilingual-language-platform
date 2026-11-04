import type { Database } from "@/integrations/supabase/types";

export type ClinicRole = Database["public"]["Enums"]["clinic_role"];
export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

export type PermissionKey =
  | "dashboard.view"
  | "financial.view"
  | "patients.read"
  | "patients.write"
  | "appointments.read"
  | "appointments.write"
  | "team.manage"
  | "settings.manage"
  | "units.manage"
  | "audit.view";

export interface ClinicUnit {
  id: string;
  clinic_id: string;
  name: string;
  cnpj: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  is_main: boolean;
  active: boolean;
  created_at: string;
}

export interface ClinicMemberPermission {
  id: string;
  clinic_id: string;
  member_id: string;
  permission: PermissionKey;
  granted: boolean;
  updated_at: string;
  updated_by: string | null;
}

export type DashboardPeriod = "today" | "7d" | "month" | "30d" | "90d";

export interface FinancialIndicators {
  revenueToday: number;
  revenuePeriod: number;
  projectedRevenuePeriod: number;
  averageTicket: number;
  estimatedCommissions: number;
  completedCount: number;
}

export interface AttendanceIndicators {
  scheduledCount: number;
  confirmedCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  totalAppointments: number;
  completionRatePct: number;
  noShowRatePct: number;
  newPatientsCount: number;
}

export type AlertSeverity = "info" | "warning" | "critical";

export interface AdministrativeAlert {
  id: string;
  severity: AlertSeverity;
  titleKey: string;
  descriptionKey: string;
  count?: number;
  actionRoute?: "/app/agenda" | "/app/patients" | "/app/settings" | "/app/team";
  actionLabelKey?: string;
}

