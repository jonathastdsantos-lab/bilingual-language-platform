import type { Database } from "@/integrations/supabase/types";

export type ClinicRole = Database["public"]["Enums"]["clinic_role"];
export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

export type PermissionKey =
  | "dashboard.view"
  | "financial.view"
  | "financial.write"
  | "patients.read"
  | "patients.write"
  | "records.read"
  | "records.write"
  | "appointments.read"
  | "appointments.write"
  | "stock.read"
  | "stock.write"
  | "reports.view"
  | "whatsapp.manage"
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

export type FinancialEntryType = "income" | "expense";
export type FinancialEntryStatus = "pending" | "paid" | "overdue" | "cancelled";
export type PaymentMethod =
  | "pix"
  | "credit_card"
  | "debit_card"
  | "cash"
  | "bank_slip"
  | "transfer"
  | "insurance";

export interface FinancialEntry {
  id: string;
  clinic_id: string;
  unit_id: string | null;
  patient_id: string | null;
  professional_id: string | null;
  appointment_id: string | null;
  treatment_plan_id: string | null;
  entry_type: FinancialEntryType;
  category: string;
  description: string;
  amount: number;
  payment_method: PaymentMethod;
  status: FinancialEntryStatus;
  due_date: string;
  paid_at: string | null;
  installment_number: number;
  total_installments: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  patients?: { full_name: string | null } | null;
  professionals?: { name: string | null } | null;
}

export interface CashClosing {
  id: string;
  clinic_id: string;
  unit_id: string | null;
  closing_date: string;
  total_income: number;
  total_expense: number;
  net_balance: number;
  notes: string | null;
  closed_by: string | null;
  created_at: string;
}

export interface CashFlowSummary {
  receivedIncome: number;
  paidExpenses: number;
  netCashBalance: number;
  pendingReceivables: number;
  pendingPayables: number;
  overdueReceivables: number;
  overduePayables: number;
  overdueCount: number;
}

export interface ProfessionalCommissionSummary {
  professionalId: string;
  professionalName: string;
  commissionPct: number;
  realizedRevenue: number;
  pendingRevenue: number;
  realizedCommission: number;
  pendingCommission: number;
}

export type StockMovementType = "in" | "out" | "adjustment" | "expired_loss";

export type StockAlertStatus =
  | "ok"
  | "low_stock"
  | "out_of_stock"
  | "expiring_soon"
  | "expired";

export interface StockItem {
  id: string;
  clinic_id: string;
  unit_id: string | null;
  name: string;
  category: string;
  sku: string | null;
  unit_measure: string;
  current_quantity: number;
  min_quantity: number;
  unit_cost: number;
  supplier: string | null;
  batch_number: string | null;
  expiration_date: string | null;
  storage_location: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  clinic_id: string;
  item_id: string;
  unit_id: string | null;
  movement_type: StockMovementType;
  quantity: number;
  previous_quantity: number;
  resulting_quantity: number;
  unit_cost: number;
  batch_number: string | null;
  expiration_date: string | null;
  reason: string;
  professional_id: string | null;
  patient_id: string | null;
  created_by: string | null;
  created_at: string;
  stock_items?: { name: string | null; unit_measure: string | null } | null;
  professionals?: { name: string | null } | null;
  patients?: { full_name: string | null } | null;
}

export interface StockSummaryIndicators {
  totalItemsCount: number;
  totalInventoryValueBRL: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
}

export interface CategoryDreLine {
  category: string;
  amount: number;
  sharePct: number;
}

export interface ClinicalDreReport {
  grossRealizedRevenue: number;
  directClinicalCosts: number;
  professionalCommissions: number;
  contributionMargin: number;
  contributionMarginPct: number;
  administrativeExpenses: number;
  taxesAndFees: number;
  netOperatingResult: number;
  netMarginPct: number;
  incomeByCategory: CategoryDreLine[];
  expenseByCategory: CategoryDreLine[];
}

export type WhatsappTemplateCategory =
  | "confirmation"
  | "reminder"
  | "post_op"
  | "recall"
  | "financial";

export interface WhatsappTemplate {
  id: string;
  clinic_id: string;
  name: string;
  category: WhatsappTemplateCategory;
  body_template: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface WhatsappDispatchLog {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  appointment_id: string | null;
  template_category: WhatsappTemplateCategory;
  phone_number: string;
  rendered_message: string;
  sent_by: string | null;
  created_at: string;
  patients?: { full_name: string | null } | null;
}

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
  actionRoute?:
    | "/app/agenda"
    | "/app/patients"
    | "/app/settings"
    | "/app/team"
    | "/app/stock"
    | "/app/reports"
    | "/app/whatsapp";
  actionLabelKey?: string;
}

export type ExamCategory =
  | "periapical"
  | "panoramic"
  | "bitewing"
  | "tomography"
  | "intraoral_before"
  | "intraoral_after"
  | "document";

export interface PatientExamFile {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_id: string | null;
  tooth_number: number | null;
  exam_category: ExamCategory;
  title: string;
  notes: string | null;
  file_name: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  file_size_bytes: number;
  storage_path: string;
  exam_date: string;
  created_by: string | null;
  created_at: string;
  professionals?: { name: string | null } | null;
}

export interface DentalInsurance {
  id: string;
  clinic_id: string;
  name: string;
  ans_code: string | null;
  cnpj: string | null;
  reimbursement_days: number;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ProcedureCatalogItem {
  id: string;
  clinic_id: string;
  insurance_id: string | null;
  tuss_code: string | null;
  name: string;
  specialty: string;
  base_price: number;
  estimated_material_cost: number;
  default_duration_minutes: number;
  active: boolean;
  created_by: string | null;
  created_at: string;
  dental_insurances?: { name: string | null } | null;
}

export type AsaClassification = "ASA I" | "ASA II" | "ASA III" | "ASA IV";
export type SurgicalRiskLevel = "low" | "moderate" | "high" | "critical";

export interface SurgicalRiskAlert {
  id: string;
  level: SurgicalRiskLevel;
  title: string;
  clinicalRecommendation: string;
}

export interface PatientStructuredAnamnesis {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_id: string | null;
  asa_classification: AsaClassification;
  has_hypertension: boolean;
  has_diabetes: boolean;
  has_heart_disease: boolean;
  uses_anticoagulants: boolean;
  uses_bisphosphonates: boolean;
  has_bleeding_disorder: boolean;
  is_pregnant_or_lactating: boolean;
  allergy_local_anesthetic: boolean;
  allergy_penicillin: boolean;
  allergy_latex: boolean;
  allergy_nsaids: boolean;
  other_allergies: string | null;
  current_medications: string | null;
  has_bruxism: boolean;
  is_smoker: boolean;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  chief_complaint: string | null;
  clinical_observations: string | null;
  updated_by: string | null;
  updated_at: string;
  professionals?: { name: string | null } | null;
}

export type ProstheticLabStage =
  | "sent"
  | "infrastructure_try_in"
  | "teeth_try_in"
  | "glaze_finish"
  | "delivered_to_clinic"
  | "installed_in_patient"
  | "returned_adjustment";

export interface ProstheticLabOrder {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_id: string | null;
  laboratory_name: string;
  prosthesis_type: string;
  tooth_numbers: string | null;
  vita_shade: string | null;
  stage: ProstheticLabStage;
  sent_date: string;
  due_date: string;
  delivered_date: string | null;
  lab_cost: number;
  financial_entry_generated: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  professionals?: { name: string | null } | null;
}

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled";

export interface SaasPlan {
  id: "starter" | "pro" | "corporate" | string;
  name: string;
  description: string;
  monthly_price: number;
  yearly_price: number;
  max_professionals: number;
  max_units: number;
  whatsapp_included: boolean;
  storage_limit_mb: number;
  active: boolean;
  created_at?: string;
}

export interface PlatformClinicOverview {
  id: string;
  name: string;
  created_at: string;
  plan_id: string | null;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
  members_count?: number;
  patients_count?: number;
  saas_plans?: SaasPlan | null;
}

export interface PlatformDeveloperStats {
  totalClinics: number;
  activeClinics: number;
  trialClinics: number;
  mrrEstimated: number;
  totalPatientsEstimate: number;
  totalAppointmentsMonth: number;
  totalStorageBytes: number;
}

export interface DetailedPlatformClinic {
  id: string;
  name: string;
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  plan_id: string;
  plan_name: string;
  monthly_price: number;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string;
  owner_name?: string | null;
  owner_email?: string | null;
  patients_count: number;
  appointments_month_count: number;
  members_count: number;
  dentists_count: number;
  last_appointment_at: string | null;
  exam_files_count: number;
  exam_storage_bytes: number;
}

export interface PlatformClinicNote {
  id: string;
  clinic_id: string;
  author_email: string;
  content: string;
  created_at: string;
}

export interface PlatformAuditLog {
  id: string;
  admin_email: string;
  action: string;
  target_clinic_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface PlatformBroadcastAnnouncement {
  id: string;
  target_clinic_id: string | null;
  title: string;
  message: string;
  priority: "normal" | "urgent" | "maintenance";
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export type TissGuideType = "treatment" | "initial_exam" | "urgency";
export type TissGuideStatus = "draft" | "authorized" | "billed" | "paid" | "glosed" | "cancelled";

export interface TissGuideItem {
  id: string;
  clinic_id: string;
  guide_id: string;
  tuss_code: string;
  description: string;
  tooth_number: number | null;
  tooth_surface: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  glosed: boolean;
  glosa_reason: string | null;
  created_at: string;
}

export interface TissGuide {
  id: string;
  clinic_id: string;
  patient_id: string;
  insurance_id: string | null;
  professional_id: string | null;
  guide_number: string;
  auth_code: string | null;
  guide_type: TissGuideType;
  status: TissGuideStatus;
  card_number: string;
  card_expiration: string | null;
  cns_number: string | null;
  issue_date: string;
  billed_date: string | null;
  paid_date: string | null;
  total_amount: number;
  glosed_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  patients?: { full_name: string; cpf: string | null } | null;
  dental_insurances?: { name: string; ans_code: string | null } | null;
  professionals?: { name: string | null; cro?: string | null } | null;
  items?: TissGuideItem[];
}

export interface PublicAppointmentInfo {
  valid: boolean;
  error?: string;
  token?: string;
  token_status?: "pending" | "confirmed" | "cancelled" | "expired";
  appointment_id?: string;
  starts_at?: string;
  ends_at?: string;
  appointment_status?: string;
  procedure?: string | null;
  patient_name?: string;
  clinic_name?: string;
  clinic_phone?: string | null;
  unit_name?: string | null;
  unit_address?: string | null;
  professional_name?: string | null;
}

export interface PublicConfirmationResponse {
  success: boolean;
  status?: "confirmed" | "cancelled";
  message?: string;
  error?: string;
}
