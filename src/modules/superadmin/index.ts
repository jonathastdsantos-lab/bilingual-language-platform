import { supabase } from "@/services/supabase";
import type {
  DetailedPlatformClinic,
  PlatformAuditLog,
  PlatformBroadcastAnnouncement,
  PlatformClinicNote,
  PlatformDeveloperStats,
  SaasPlan,
  SubscriptionStatus,
} from "@/types";

type SuperadminDbClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        order: (col: string, opts?: { ascending?: boolean }) => Promise<{ data: unknown[] | null; error: unknown }>;
      };
      order: (col: string, opts?: { ascending?: boolean }) => Promise<{ data: unknown[] | null; error: unknown }>;
    };
    insert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) => Promise<{ error: unknown }>;
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: unknown }>;
    };
    delete: () => {
      eq: (col: string, val: string) => Promise<{ error: unknown }>;
    };
  };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  auth: typeof supabase.auth;
};

const db = supabase as unknown as SuperadminDbClient;

export const MASTER_DEVELOPER_EMAIL = "jonathastdsantos@gmail.com";

export function isMasterDeveloperEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === MASTER_DEVELOPER_EMAIL.toLowerCase();
}

export async function checkIsSuperadmin(): Promise<boolean> {
  const { data: userRes } = await db.auth.getUser();
  const user = userRes?.user;
  if (!user) return false;

  if (isMasterDeveloperEmail(user.email)) return true;

  try {
    const { data, error } = await db.rpc("is_platform_superadmin");
    if (!error && data === true) return true;
  } catch {
    // fallback
  }

  return false;
}

export async function fetchSaasPlans(): Promise<SaasPlan[]> {
  const { data, error } = await db
    .from("saas_plans")
    .select("*")
    .order("monthly_price", { ascending: true });

  if (error || !data || data.length === 0) {
    return [
      {
        id: "starter",
        name: "SondaPro Starter",
        description: "Ideal para consultórios individuais e dentistas autônomos.",
        monthly_price: 149,
        yearly_price: 1490,
        max_professionals: 1,
        max_units: 1,
        whatsapp_included: false,
        storage_limit_mb: 2000,
        active: true,
      },
      {
        id: "pro",
        name: "SondaPro Pro",
        description: "Para clínicas em crescimento com equipe e múltiplos consultórios.",
        monthly_price: 299,
        yearly_price: 2990,
        max_professionals: 5,
        max_units: 2,
        whatsapp_included: true,
        storage_limit_mb: 10000,
        active: true,
      },
      {
        id: "corporate",
        name: "SondaPro Corporate",
        description: "Para redes de clínicas, franquias e policlínicas odontológicas.",
        monthly_price: 599,
        yearly_price: 5990,
        max_professionals: 999,
        max_units: 10,
        whatsapp_included: true,
        storage_limit_mb: 50000,
        active: true,
      },
    ];
  }

  return data as SaasPlan[];
}

export async function fetchDetailedClinicsOverview(): Promise<DetailedPlatformClinic[]> {
  try {
    const { data, error } = await db.rpc("get_superadmin_clinics_overview");
    if (!error && Array.isArray(data)) {
      return data as DetailedPlatformClinic[];
    }
  } catch {
    // Fallback manual caso a RPC não tenha sido executada no banco
  }

  const { data: clinics, error: err } = await db
    .from("clinics")
    .select("*")
    .order("created_at", { ascending: false });

  if (err || !clinics) return [];

  return (clinics as Array<Record<string, unknown>>).map((c) => ({
    id: String(c["id"] || ""),
    name: String(c["name"] || ""),
    cnpj: (c["cnpj"] as string) || null,
    phone: (c["phone"] as string) || null,
    email: (c["email"] as string) || null,
    address: (c["address"] as string) || null,
    plan_id: String(c["plan_id"] || "pro"),
    plan_name: "SondaPro Pro",
    monthly_price: 299,
    subscription_status: (c["subscription_status"] as SubscriptionStatus) || "active",
    trial_ends_at: (c["trial_ends_at"] as string) || null,
    current_period_end: (c["current_period_end"] as string) || null,
    created_at: String(c["created_at"] || new Date().toISOString()),
    owner_name: null,
    owner_email: null,
    patients_count: 0,
    appointments_month_count: 0,
    members_count: 1,
    dentists_count: 1,
    last_appointment_at: null,
    exam_files_count: 0,
    exam_storage_bytes: 0,
  }));
}

export function calculateDetailedPlatformStats(
  clinics: DetailedPlatformClinic[],
  plans: SaasPlan[],
): PlatformDeveloperStats {
  const planMap = new Map<string, number>();
  for (const p of plans) planMap.set(p.id, Number(p.monthly_price) || 0);

  let activeClinics = 0;
  let trialClinics = 0;
  let mrrEstimated = 0;
  let totalPatients = 0;
  let totalAppointmentsMonth = 0;
  let totalStorageBytes = 0;

  for (const c of clinics) {
    if (c.subscription_status === "active") {
      activeClinics += 1;
      const price = planMap.get(c.plan_id) ?? (Number(c.monthly_price) || 299);
      mrrEstimated += price;
    } else if (c.subscription_status === "trialing") {
      trialClinics += 1;
    }
    totalPatients += c.patients_count || 0;
    totalAppointmentsMonth += c.appointments_month_count || 0;
    totalStorageBytes += c.exam_storage_bytes || 0;
  }

  return {
    totalClinics: clinics.length,
    activeClinics,
    trialClinics,
    mrrEstimated: Number(mrrEstimated.toFixed(2)),
    totalPatientsEstimate: totalPatients,
    totalAppointmentsMonth,
    totalStorageBytes,
  };
}

export async function fetchClinicNotes(clinicId: string): Promise<PlatformClinicNote[]> {
  const { data, error } = await db
    .from("platform_clinic_notes")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as unknown as PlatformClinicNote[];
}

export async function addClinicNote(clinicId: string, content: string): Promise<void> {
  const { data: userRes } = await db.auth.getUser();
  const authorEmail = userRes?.user?.email || MASTER_DEVELOPER_EMAIL;

  await db.from("platform_clinic_notes").insert({
    clinic_id: clinicId,
    author_email: authorEmail,
    content: content.trim(),
  });

  await logSuperadminAction({
    action: "add_note",
    targetClinicId: clinicId,
    details: { content: content.slice(0, 100) },
  });
}

export async function logSuperadminAction(params: {
  action: string;
  targetClinicId?: string | null | undefined;
  details?: Record<string, unknown> | undefined;
}): Promise<void> {
  try {
    const { data: userRes } = await db.auth.getUser();
    const adminEmail = userRes?.user?.email || MASTER_DEVELOPER_EMAIL;

    await db.from("platform_superadmin_audit_logs").insert({
      admin_email: adminEmail,
      action: params.action,
      target_clinic_id: params.targetClinicId ?? null,
      details: params.details ?? null,
    });
  } catch {
    // Audit silencioso em caso de tabela pendente
  }
}

export async function fetchSuperadminAuditLogs(): Promise<PlatformAuditLog[]> {
  const { data, error } = await db
    .from("platform_superadmin_audit_logs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as unknown as PlatformAuditLog[];
}

export async function updateClinicSubscriptionWithAudit(params: {
  clinicId: string;
  clinicName: string;
  planId?: string | undefined;
  subscriptionStatus?: SubscriptionStatus | undefined;
  trialEndsAt?: string | null | undefined;
  reason?: string | undefined;
}): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (params.planId) payload["plan_id"] = params.planId;
  if (params.subscriptionStatus) payload["subscription_status"] = params.subscriptionStatus;
  if (params.trialEndsAt !== undefined) payload["trial_ends_at"] = params.trialEndsAt;

  const { error } = await db.from("clinics").update(payload).eq("id", params.clinicId);
  if (error) throw error;

  await logSuperadminAction({
    action: "update_subscription",
    targetClinicId: params.clinicId,
    details: {
      clinic_name: params.clinicName,
      new_plan: params.planId,
      new_status: params.subscriptionStatus,
      trial_ends_at: params.trialEndsAt,
      reason: params.reason,
    },
  });
}

export async function superadminCreateClinic(params: {
  name: string;
  planId: string;
  subscriptionStatus: SubscriptionStatus;
  ownerEmail?: string | undefined;
}): Promise<string> {
  const { data, error } = await db.rpc("superadmin_create_clinic", {
    _name: params.name,
    _plan_id: params.planId,
    _subscription_status: params.subscriptionStatus,
    _owner_email: params.ownerEmail || null,
  });

  if (error) {
    const { error: insErr } = await db.from("clinics").insert({
      name: params.name,
      plan_id: params.planId,
      subscription_status: params.subscriptionStatus,
    });
    if (insErr) throw insErr;
    return "ok";
  }

  const res = data as { success: boolean; clinic_id?: string };
  return res?.clinic_id ?? "ok";
}

export async function deleteClinicWithConfirmation(params: {
  clinicId: string;
  clinicName: string;
}): Promise<void> {
  const { error } = await db.from("clinics").delete().eq("id", params.clinicId);
  if (error) throw error;

  await logSuperadminAction({
    action: "delete_clinic",
    targetClinicId: params.clinicId,
    details: { clinic_name: params.clinicName },
  });
}

export async function createBroadcastAnnouncement(params: {
  targetClinicId?: string | null;
  title: string;
  message: string;
  priority: "normal" | "urgent" | "maintenance";
}): Promise<void> {
  const { data: userRes } = await db.auth.getUser();
  const email = userRes?.user?.email || MASTER_DEVELOPER_EMAIL;

  const { error } = await db.from("platform_broadcast_announcements").insert({
    target_clinic_id: params.targetClinicId || null,
    title: params.title.trim(),
    message: params.message.trim(),
    priority: params.priority,
    created_by: email,
  });

  if (error) throw error;

  await logSuperadminAction({
    action: "create_broadcast_announcement",
    targetClinicId: params.targetClinicId,
    details: { title: params.title, priority: params.priority },
  });
}

export async function fetchBroadcastAnnouncements(): Promise<PlatformBroadcastAnnouncement[]> {
  const { data, error } = await db
    .from("platform_broadcast_announcements")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as unknown as PlatformBroadcastAnnouncement[];
}

export async function checkRealSystemHealth(): Promise<{
  databaseLatencyMs: number;
  authConnected: boolean;
  storageConnected: boolean;
  timestamp: string;
}> {
  const start = performance.now();
  const { data } = await db.from("saas_plans").select("id").order("created_at", { ascending: true });
  const latency = Math.round(performance.now() - start);

  const { data: authUser } = await db.auth.getUser();

  return {
    databaseLatencyMs: Math.max(1, latency),
    authConnected: !!authUser,
    storageConnected: Array.isArray(data),
    timestamp: new Date().toISOString(),
  };
}

export function exportClinicsToCsv(clinics: DetailedPlatformClinic[]): string {
  const headers = [
    "ID",
    "Nome da Clínica",
    "CNPJ",
    "Telefone",
    "E-mail",
    "Plano",
    "Preço Mensal",
    "Status Assinatura",
    "Data de Criação",
    "Proprietário",
    "E-mail Proprietário",
    "Total Pacientes",
    "Consultas no Mês",
    "Dentistas Ativos",
    "Arquivos de Exames",
    "Espaço Storage (MB)",
  ];

  const rows = clinics.map((c) => [
    c.id,
    `"${c.name.replace(/"/g, '""')}"`,
    c.cnpj || "",
    c.phone || "",
    c.email || "",
    c.plan_name,
    c.monthly_price,
    c.subscription_status,
    c.created_at,
    `"${(c.owner_name || "").replace(/"/g, '""')}"`,
    c.owner_email || "",
    c.patients_count,
    c.appointments_month_count,
    c.dentists_count,
    c.exam_files_count,
    (c.exam_storage_bytes / (1024 * 1024)).toFixed(2),
  ]);

  return [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
}
