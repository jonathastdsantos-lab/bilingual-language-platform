import type { Database } from "@/integrations/supabase/types";

export type ClinicRole = Database["public"]["Enums"]["clinic_role"];
export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

export type PermissionKey =
  | "dashboard.view"
  | "financial.view"
  | "patients.read"
  | "patients.write"
  | "records.read"
  | "records.write"
  | "appointments.read"
  | "appointments.write"
  | "team.manage"
  | "settings.manage"
  | "units.manage"
  | "audit.view";

export type ToothSurface = "W" | "O" | "M" | "D" | "V" | "L";

export type ToothConditionStatus =
  | "healthy"
  | "caries"
  | "restoration"
  | "planned"
  | "completed"
  | "endodontics"
  | "crown"
  | "implant"
  | "missing";

export type ClinicalRecordType =
  | "evolution"
  | "anamnesis"
  | "prescription"
  | "certificate"
  | "exam";

export type TreatmentPlanStatus =
  | "draft"
  | "approved"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface OdontogramEntry {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_id: string | null;
  tooth_number: number;
  surface: ToothSurface;
  condition: ToothConditionStatus;
  procedure: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  professionals?: { name: string | null; color?: string | null } | null;
}

export interface ClinicalRecord {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_id: string | null;
  appointment_id: string | null;
  tooth_number: number | null;
  record_type: ClinicalRecordType;
  title: string;
  content: string;
  created_by: string | null;
  created_at: string;
  professionals?: { name: string | null } | null;
}

export interface TreatmentPlan {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_id: string | null;
  title: string;
  status: TreatmentPlanStatus;
  discount_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  professionals?: { name: string | null } | null;
}

export interface TreatmentPlanItem {
  id: string;
  clinic_id: string;
  plan_id: string;
  tooth_number: number | null;
  surface: ToothSurface;
  procedure_name: string;
  price: number;
  status: "planned" | "completed" | "cancelled";
  completed_at: string | null;
  created_at: string;
}

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
