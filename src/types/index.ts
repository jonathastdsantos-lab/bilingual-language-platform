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

export type DentitionStage = "deciduous" | "mixed" | "permanent";
export type ToothpasteAmount = "rice_grain" | "pea_size" | "standard";
export type PediatricCariesRiskLevel = "low" | "moderate" | "high";

export interface HabitDetails {
  active: boolean;
  frequency: "none" | "occasional" | "frequent" | "continuous";
  duration_years: number;
}

export interface BottleFeedingDetails {
  active: boolean;
  sleep_bottle: boolean;
  sweetened: boolean;
}

export interface PediatricDentalAssessment {
  id: string;
  clinic_id: string;
  patient_id: string;
  evaluator_id: string | null;
  dentition_stage: DentitionStage;
  pacifier_habit: HabitDetails;
  thumb_sucking_habit: HabitDetails;
  bottle_feeding_habit: BottleFeedingDetails;
  mouth_breathing: boolean;
  bruxism: boolean;
  atypical_swallowing: boolean;
  brushing_frequency_daily: number;
  fluoride_ppm: number;
  toothpaste_amount: ToothpasteAmount;
  floss_frequency: "never" | "rarely" | "weekly" | "daily";
  sugar_intake_frequency: "low" | "moderate" | "high";
  caries_risk_level: PediatricCariesRiskLevel;
  clinical_notes: string | null;
  assessment_date: string;
  created_at: string;
  updated_at: string;
  evaluator?: { name: string | null } | null;
}

export interface PediatricToothEruptionInfo {
  fdiNumber: number;
  namePt: string;
  nameEn: string;
  eruptionAgeMonths: string;
  exfoliationAgeYears: string;
  arch: "upper" | "lower";
  quadrant: number;
}

export type WaitingRoomCallStatus = "called" | "in_attendance" | "completed" | "cancelled";
export type CallPriority = "normal" | "priority" | "urgent";

export type PaymentGateway = "asaas" | "mercadopago" | "stripe";

export interface PaymentWebhookEvent {
  id: string;
  gateway: PaymentGateway;
  event_type: string;
  payload: Record<string, unknown>;
  external_reference: string | null;
  invoice_id: string | null;
  processed: boolean;
  processed_at: string | null;
  processing_error: string | null;
  created_at: string;
}

export interface PlatformGatewaySettings {
  id: string;
  asaas_enabled: boolean;
  asaas_environment: "sandbox" | "production";
  asaas_api_key?: string | null;
  asaas_webhook_token?: string | null;
  mercadopago_enabled: boolean;
  mercadopago_environment: "sandbox" | "production";
  mercadopago_access_token?: string | null;
  mercadopago_webhook_secret?: string | null;
  stripe_enabled: boolean;
  stripe_secret_key?: string | null;
  stripe_webhook_secret?: string | null;
  updated_at: string;
}

export interface WaitingRoomCall {
  id: string;
  clinic_id: string;
  unit_id: string | null;
  patient_id: string | null;
  patient_name: string;
  professional_id: string | null;
  professional_name: string;
  room_id: string | null;
  room_name: string;
  priority: CallPriority;
  status: WaitingRoomCallStatus;
  called_at: string;
  created_at: string;
  updated_at: string;
}

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

export type InvoiceStatus = "pending" | "paid" | "overdue" | "cancelled";
export type BillingCycle = "monthly" | "yearly";

export interface SaasInvoice {
  id: string;
  clinic_id: string;
  plan_id: string;
  billing_cycle: BillingCycle;
  amount: number;
  payment_method: "pix" | "credit_card" | "bank_slip";
  status: InvoiceStatus;
  due_date: string;
  paid_at: string | null;
  pix_code: string | null;
  pix_qr_code_url: string | null;
  gateway_payment_id: string | null;
  card_last4: string | null;
  card_brand: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  saas_plans?: SaasPlan | null;
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

export type ElectronicSignatureDocumentType =
  | "tcle"
  | "contract"
  | "certificate"
  | "treatment_plan"
  | "prescription"
  | "other";

export type SignerRole = "patient" | "legal_guardian" | "representative" | "dentist";

export interface PatientElectronicSignature {
  id: string;
  clinic_id: string;
  patient_id: string;
  document_type: ElectronicSignatureDocumentType;
  document_title: string;
  document_content: string;
  document_hash: string;
  signer_name: string;
  signer_cpf: string;
  signer_role: SignerRole;
  signer_email?: string | null;
  signer_phone?: string | null;
  signature_data_url: string;
  ip_address?: string | null;
  user_agent?: string | null;
  status: "valid" | "revoked";
  revocation_reason?: string | null;
  revoked_at?: string | null;
  signed_at: string;
  metadata?: Record<string, unknown>;
  created_by?: string | null;
  created_at: string;
}

export type DocumentSignatureRequestStatus = "pending" | "signed" | "expired" | "cancelled";

export interface DocumentSignatureRequest {
  id: string;
  clinic_id: string;
  patient_id: string;
  token: string;
  document_type: ElectronicSignatureDocumentType;
  document_title: string;
  document_content: string;
  status: DocumentSignatureRequestStatus;
  expires_at: string;
  signed_signature_id?: string | null;
  signer_name?: string | null;
  signer_cpf?: string | null;
  signer_phone?: string | null;
  metadata?: Record<string, unknown>;
  created_by?: string | null;
  created_at: string;
}

export interface PublicSignatureRequestInfo {
  valid: boolean;
  error?: string;
  already_signed?: boolean;
  token?: string;
  status?: DocumentSignatureRequestStatus;
  expires_at?: string;
  document_type?: ElectronicSignatureDocumentType;
  document_title?: string;
  document_content?: string;
  patient_name?: string;
  patient_cpf?: string | null;
  clinic_name?: string;
  clinic_phone?: string | null;
}

export type DigitalCertificateType =
  | "a1_file"
  | "cloud_birdid"
  | "cloud_safeid"
  | "cloud_vidaas"
  | "cloud_neoid";

export interface ProfessionalDigitalCertificate {
  id: string;
  clinic_id: string;
  professional_id: string;
  certificate_type: DigitalCertificateType;
  issuer: string;
  subject_name: string;
  subject_cpf: string;
  cro_number?: string | null;
  cro_state?: string | null;
  serial_number: string;
  valid_from: string;
  valid_to: string;
  status: "active" | "expired" | "revoked";
  certificate_public_pem?: string | null;
  cloud_account_email?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface QualifiedDocumentSignature {
  id: string;
  clinic_id: string;
  professional_id: string;
  patient_id: string;
  certificate_id?: string | null;
  document_type: string;
  document_title: string;
  document_content: string;
  document_hash: string;
  cryptographic_signature: string;
  validation_code: string;
  validation_url: string;
  signer_name: string;
  signer_cpf: string;
  signer_cro: string;
  authority_chain?: string[];
  timestamp_authority?: string;
  signed_at: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface PublicQualifiedValidationInfo {
  valid: boolean;
  error?: string | undefined;
  validation_code?: string | undefined;
  document_type?: string | undefined;
  document_title?: string | undefined;
  document_content?: string | undefined;
  document_hash?: string | undefined;
  signer_name?: string | undefined;
  signer_cpf?: string | undefined;
  signer_cro?: string | undefined;
  timestamp_authority?: string | undefined;
  signed_at?: string | undefined;
  clinic_name?: string | undefined;
  clinic_phone?: string | null | undefined;
  patient_name?: string | undefined;
  patient_cpf?: string | null | undefined;
}

// ============================================================================
// AGENDAMENTO ONLINE PÚBLICO
// ============================================================================

export interface ClinicBookingSettings {
  clinic_id: string;
  online_booking_enabled: boolean;
  auto_confirm: boolean;
  slot_duration_minutes: number;
  start_hour: string;
  end_hour: string;
  operating_days: number[];
  available_procedures: string[];
  instructions: string | null;
  updated_at: string;
}

export interface PublicClinicUnit {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
}

export interface PublicClinicProfessional {
  id: string;
  name: string;
  cro: string | null;
  specialty: string | null;
}

export interface PublicClinicBookingData {
  valid: boolean;
  error?: string | undefined;
  clinic_id?: string | undefined;
  clinic_name?: string | undefined;
  clinic_slug?: string | null | undefined;
  units?: PublicClinicUnit[] | undefined;
  professionals?: PublicClinicProfessional[] | undefined;
  available_procedures?: string[] | undefined;
  slot_duration_minutes?: number | undefined;
  start_hour?: string | undefined;
  end_hour?: string | undefined;
  operating_days?: number[] | undefined;
  instructions?: string | null | undefined;
}

export interface SubmitBookingParams {
  clinic_id: string;
  unit_id: string;
  professional_id?: string | null | undefined;
  procedure: string;
  starts_at: string;
  patient_name: string;
  patient_cpf?: string | null | undefined;
  patient_phone: string;
  patient_email?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface PublicBookingResult {
  success: boolean;
  appointment_id?: string | undefined;
  token?: string | undefined;
  status?: string | undefined;
  starts_at?: string | undefined;
  ends_at?: string | undefined;
  message?: string | undefined;
  error?: string | undefined;
}

// ============================================================================
// COMISSÕES ODONTOLÓGICAS AVANÇADAS & REPASSES
// ============================================================================

export type CommissionSettlementStatus = "draft" | "approved" | "paid" | "cancelled";
export type CommissionCalculationType = "percentage_gross" | "percentage_net_of_lab" | "fixed_amount";

export interface CommissionRule {
  id: string;
  clinic_id: string;
  professional_id: string;
  procedure_name: string | null;
  calculation_type: CommissionCalculationType;
  percentage: number;
  fixed_amount: number;
  deduct_lab_costs: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommissionSettlement {
  id: string;
  clinic_id: string;
  professional_id: string;
  settlement_code: string;
  period_start: string;
  period_end: string;
  total_gross_amount: number;
  total_lab_deductions: number;
  total_other_deductions: number;
  net_commission_amount: number;
  status: CommissionSettlementStatus;
  payment_method: string | null;
  payment_date: string | null;
  financial_entry_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  professional?: {
    id: string;
    name: string;
    cro: string | null;
    specialty: string | null;
    color?: string | null | undefined;
  } | null | undefined;
}

export interface CommissionSettlementItem {
  id: string;
  settlement_id: string;
  clinic_id: string;
  appointment_id: string | null;
  financial_entry_id: string | null;
  patient_id: string | null;
  patient_name: string;
  procedure_name: string;
  service_date: string;
  gross_amount: number;
  lab_cost: number;
  calculation_basis: number;
  commission_rate: number;
  commission_amount: number;
  created_at: string;
}

export interface CommissionPreviewItem {
  appointment_id: string;
  patient_id: string | null;
  patient_name: string;
  procedure_name: string;
  service_date: string;
  gross_amount: number;
  lab_cost: number;
  calculation_basis: number;
  commission_rate: number;
  commission_amount: number;
}

export interface CommissionPreviewResult {
  professional_id: string;
  period_start: string;
  period_end: string;
  total_gross_amount: number;
  total_lab_deductions: number;
  net_commission_amount: number;
  items_count: number;
  items: CommissionPreviewItem[];
}

// ============================================================================
// LEMBRETES AUTOMÁTICOS DE WHATSAPP (24H & 2H)
// ============================================================================

export interface WhatsAppReminderSettings {
  clinic_id: string;
  enabled_24h: boolean;
  enabled_2h: boolean;
  template_24h: string;
  template_2h: string;
  auto_dispatch_active: boolean;
  updated_at: string;
}

export type ReminderType = "24h" | "2h";
export type ReminderStatus = "pending" | "sent" | "failed" | "cancelled";

export interface UpcomingAppointmentReminder {
  appointment_id: string;
  starts_at: string;
  appointment_status: string;
  procedure_name: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  professional_name: string;
  confirmation_token: string | null;
  reminder_24h: {
    id: string | null;
    status: ReminderStatus;
    sent_at: string | null;
  };
  reminder_2h: {
    id: string | null;
    status: ReminderStatus;
    sent_at: string | null;
  };
}

// ============================================================================
// INTELIGÊNCIA ODONTOLÓGICA & CURVA ABC DE PROCEDIMENTOS
// ============================================================================

export type ProcedureAbcClass = "A" | "B" | "C";

export interface ProcedureAbcItem {
  procedureName: string;
  count: number;
  totalRevenue: number;
  averageTicket: number;
  revenueSharePct: number;
  cumulativeSharePct: number;
  classification: ProcedureAbcClass;
}

export interface ProcedureAbcReport {
  items: ProcedureAbcItem[];
  totalRevenue: number;
  totalProcedures: number;
  countClassA: number;
  countClassB: number;
  countClassC: number;
  revenueClassA: number;
  revenueClassB: number;
  revenueClassC: number;
  shareClassA: number;
  shareClassB: number;
  shareClassC: number;
}

// ============================================================================
// ORTODONTIA AVANÇADA (TRATAMENTOS, FIOS, ELÁSTICOS E MANUTENÇÕES)
// ============================================================================

export type OrthodonticTreatmentStatus = "active" | "retention" | "completed" | "interrupted";
export type HygieneScore = "excellent" | "good" | "regular" | "poor";

export interface OrthodonticTreatment {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_id: string | null;
  diagnosis: string;
  appliance_type: string;
  bracket_prescription: string;
  treatment_goal: string | null;
  start_date: string;
  estimated_duration_months: number;
  monthly_fee: number;
  status: OrthodonticTreatmentStatus;
  upper_current_arch: string | null;
  lower_current_arch: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrthodonticMaintenance {
  id: string;
  treatment_id: string;
  clinic_id: string;
  patient_id: string;
  appointment_id: string | null;
  maintenance_number: number;
  maintenance_date: string;
  upper_archwire: string | null;
  lower_archwire: string | null;
  elastics_used: string | null;
  brackets_replaced: string | null;
  procedures_performed: string;
  patient_hygiene_score: HygieneScore;
  next_step_plan: string | null;
  next_appointment_date: string | null;
  created_by: string | null;
  created_at: string;
}

// ============================================================================
// CONEXÃO WHATSAPP DIRETA (QR CODE), MODO DE ENVIO & ALERTAS PARA O DONO
// ============================================================================

export type WhatsappInstanceStatus = "disconnected" | "connecting" | "qrcode" | "connected";
export type WhatsappProvider = "evolution" | "zapi" | "baileys" | "generic";
export type WhatsappSendMode = "automatic" | "manual_web";
export type WhatsappOwnerAlertType = "new_booking" | "confirmed" | "cancelled" | "daily_summary" | "test";

export interface WhatsappInstance {
  id: string;
  clinic_id: string;
  provider: WhatsappProvider;
  instance_name: string;
  status: WhatsappInstanceStatus;
  qrcode_base64: string | null;
  connected_phone: string | null;
  profile_name: string | null;
  battery_level: number | null;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsappSettings {
  clinic_id: string;
  send_mode: WhatsappSendMode;
  auto_send_on_booking: boolean;
  auto_send_on_cancel: boolean;
  owner_phone: string | null;
  owner_alerts_enabled: boolean;
  alert_on_new_booking: boolean;
  alert_on_patient_confirm: boolean;
  alert_on_cancellation: boolean;
  alert_daily_summary: boolean;
  daily_summary_time: string;
  assistant_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface WhatsappOwnerAlert {
  id: string;
  clinic_id: string;
  alert_type: WhatsappOwnerAlertType;
  recipient_phone: string;
  message: string;
  status: "sent" | "pending" | "failed";
  created_at: string;
}

export interface WhatsappAssistantCommandResult {
  command: string;
  response: string;
  timestamp: string;
  suggestions?: string[];
}





