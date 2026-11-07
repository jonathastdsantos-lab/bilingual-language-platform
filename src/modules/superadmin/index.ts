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

export interface MonthlyGrowthPoint {
  monthKey: string; // Ex: '2026-05'
  monthLabel: string; // Ex: 'Mai/26'
  newClinics: number;
  cumulativeClinics: number;
  estimatedMrr: number;
}

export interface PlanDistributionItem {
  name: string;
  count: number;
  revenue: number;
  color: string;
}

export interface ConversionFunnelStats {
  totalEverCreated: number;
  activePaying: number;
  inTrial: number;
  pastDue: number;
  cancelled: number;
  conversionRatePct: number;
  churnRatePct: number;
}

/**
 * Agrupa a evolução histórica das clínicas por mês para gráficos de linha/área.
 */
export function calculateSaaSGrowthTimeline(
  clinics: DetailedPlatformClinic[],
  plans: SaasPlan[],
  monthsToGoBack: number = 6,
): MonthlyGrowthPoint[] {
  const planMap = new Map<string, number>();
  for (const p of plans) planMap.set(p.id, Number(p.monthly_price) || 0);

  const monthsMap = new Map<string, { newClinics: number; mrr: number }>();
  const now = new Date();

  // Inicializa os últimos N meses
  for (let i = monthsToGoBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthsMap.set(key, { newClinics: 0, mrr: 0 });
  }

  // Ordena clínicas por data de criação
  const sorted = [...clinics].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  for (const c of sorted) {
    const d = new Date(c.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const price = planMap.get(c.plan_id) ?? (Number(c.monthly_price) || 299);

    if (monthsMap.has(key)) {
      const cur = monthsMap.get(key)!;
      cur.newClinics += 1;
      if (c.subscription_status === "active") {
        cur.mrr += price;
      }
    }
  }

  const result: MonthlyGrowthPoint[] = [];
  let runningCount = 0;
  let runningMrr = 0;

  for (const [key, val] of monthsMap.entries()) {
    runningCount += val.newClinics;
    runningMrr += val.mrr;
    const [year, month] = key.split("-");
    const dateObj = new Date(Number(year), Number(month) - 1, 1);
    const monthLabel = dateObj.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

    result.push({
      monthKey: key,
      monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
      newClinics: val.newClinics,
      cumulativeClinics: runningCount,
      estimatedMrr: Number(runningMrr.toFixed(2)),
    });
  }

  return result;
}

/**
 * Agrupa clínicas por plano comercial para o gráfico de pizza.
 */
export function calculatePlanDistributionData(
  clinics: DetailedPlatformClinic[],
  plans: SaasPlan[],
): PlanDistributionItem[] {
  const colors: Record<string, string> = {
    starter: "#0ea5e9", // Sky
    pro: "#0d9488", // Teal
    corporate: "#6366f1", // Indigo
  };

  return plans.map((p) => {
    const matching = clinics.filter((c) => c.plan_id === p.id);
    const payingCount = matching.filter((c) => c.subscription_status === "active").length;
    const revenue = payingCount * Number(p.monthly_price);

    return {
      name: p.name,
      count: matching.length,
      revenue: Number(revenue.toFixed(2)),
      color: colors[p.id] || "#64748b",
    };
  });
}

/**
 * Calcula taxa de conversão de trial e churn do SaaS.
 */
export function calculateConversionFunnel(
  clinics: DetailedPlatformClinic[],
): ConversionFunnelStats {
  const total = clinics.length;
  let activePaying = 0;
  let inTrial = 0;
  let pastDue = 0;
  let cancelled = 0;

  for (const c of clinics) {
    if (c.subscription_status === "active") activePaying += 1;
    else if (c.subscription_status === "trialing") inTrial += 1;
    else if (c.subscription_status === "past_due") pastDue += 1;
    else if (c.subscription_status === "cancelled") cancelled += 1;
  }

  const finishedTrialPool = activePaying + pastDue + cancelled;
  const conversionRatePct =
    finishedTrialPool > 0 ? Number(((activePaying / finishedTrialPool) * 100).toFixed(1)) : 100;
  const churnRatePct =
    total > 0 ? Number(((cancelled / total) * 100).toFixed(1)) : 0;

  return {
    totalEverCreated: total,
    activePaying,
    inTrial,
    pastDue,
    cancelled,
    conversionRatePct,
    churnRatePct,
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

const LOCAL_SUPERADMIN_AUDIT_KEY = "sondapro.platform.audit_logs";

function getLocalAuditLogs(): PlatformAuditLog[] {
  try {
    const raw = localStorage.getItem(LOCAL_SUPERADMIN_AUDIT_KEY);
    return raw ? (JSON.parse(raw) as PlatformAuditLog[]) : [];
  } catch {
    return [];
  }
}

function saveLocalAuditLog(log: PlatformAuditLog): void {
  try {
    const list = getLocalAuditLogs();
    list.unshift(log);
    localStorage.setItem(LOCAL_SUPERADMIN_AUDIT_KEY, JSON.stringify(list.slice(0, 500)));
  } catch {
    // ignore
  }
}

export async function logSuperadminAction(params: {
  action: string;
  category?: "access" | "plan" | "subscription" | "system" | string | undefined;
  targetClinicId?: string | null | undefined;
  targetClinicName?: string | null | undefined;
  targetUserEmail?: string | null | undefined;
  oldValues?: Record<string, unknown> | null | undefined;
  newValues?: Record<string, unknown> | null | undefined;
  details?: Record<string, unknown> | undefined;
  ipAddress?: string | null | undefined;
}): Promise<PlatformAuditLog> {
  const { data: userRes } = await db.auth.getUser();
  const user = userRes?.user;
  const adminEmail = user?.email || MASTER_DEVELOPER_EMAIL;
  const adminName = (user?.user_metadata?.full_name as string) || "Desenvolvedor Master";
  const now = new Date().toISOString();

  // Inferência automática de categoria se não informada
  let cat = params.category || "system";
  if (!params.category) {
    if (params.action.includes("plan")) cat = "plan";
    else if (params.action.includes("sub") || params.action.includes("trial") || params.action.includes("invoice")) cat = "subscription";
    else if (params.action.includes("access") || params.action.includes("superadmin") || params.action.includes("role") || params.action.includes("suspend")) cat = "access";
  }

  const newLog: PlatformAuditLog = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `log-${Date.now()}`,
    admin_email: adminEmail,
    admin_name: adminName,
    action: params.action,
    category: cat,
    target_clinic_id: params.targetClinicId ?? null,
    target_clinic_name: params.targetClinicName ?? null,
    target_user_email: params.targetUserEmail ?? null,
    old_values: params.oldValues ?? null,
    new_values: params.newValues ?? null,
    details: params.details ?? null,
    ip_address: params.ipAddress ?? "127.0.0.1",
    created_at: now,
  };

  try {
    await db.from("platform_superadmin_audit_logs").insert({
      id: newLog.id,
      admin_email: newLog.admin_email,
      admin_name: newLog.admin_name,
      action: newLog.action,
      category: newLog.category,
      target_clinic_id: newLog.target_clinic_id,
      target_clinic_name: newLog.target_clinic_name,
      target_user_email: newLog.target_user_email,
      old_values: newLog.old_values,
      new_values: newLog.new_values,
      details: newLog.details,
      ip_address: newLog.ip_address,
      created_at: newLog.created_at,
    });
  } catch (err) {
    console.warn("Audit superadmin: fallback para cache local:", err);
  }

  saveLocalAuditLog(newLog);
  return newLog;
}

export async function fetchSuperadminAuditLogs(filters?: {
  category?: string | undefined;
  searchQuery?: string | undefined;
}): Promise<PlatformAuditLog[]> {
  let list: PlatformAuditLog[] = [];

  try {
    let query = db
      .from("platform_superadmin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false });

    if (filters?.category && filters.category !== "all") {
      query = (query as any).eq("category", filters.category);
    }

    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      list = (data as any[]).map((d) => ({
        id: String(d.id || ""),
        admin_email: String(d.admin_email || ""),
        admin_name: d.admin_name || null,
        action: String(d.action || ""),
        category: d.category || "system",
        target_clinic_id: d.target_clinic_id || null,
        target_clinic_name: d.target_clinic_name || d.details?.clinic_name || null,
        target_user_email: d.target_user_email || d.details?.user_email || null,
        old_values: d.old_values || null,
        new_values: d.new_values || null,
        details: d.details || null,
        ip_address: d.ip_address || null,
        created_at: String(d.created_at || new Date().toISOString()),
      }));
    }
  } catch (err) {
    console.warn("Erro ao buscar logs do banco, usando cache local:", err);
  }

  // Combina com o cache local para não perder nenhum registro
  const local = getLocalAuditLogs();
  for (const loc of local) {
    if (!list.some((l) => l.id === loc.id)) {
      list.push(loc);
    }
  }

  if (filters?.category && filters.category !== "all") {
    list = list.filter((l) => l.category === filters.category);
  }

  if (filters?.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    list = list.filter(
      (l) =>
        l.admin_email.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.target_clinic_name && l.target_clinic_name.toLowerCase().includes(q)) ||
        (l.target_user_email && l.target_user_email.toLowerCase().includes(q)) ||
        (l.admin_name && l.admin_name.toLowerCase().includes(q)) ||
        JSON.stringify(l.details || {}).toLowerCase().includes(q)
    );
  }

  return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function updateClinicSubscriptionWithAudit(params: {
  clinicId: string;
  clinicName: string;
  planId?: string | undefined;
  subscriptionStatus?: SubscriptionStatus | undefined;
  trialEndsAt?: string | null | undefined;
  reason?: string | undefined;
  oldPlanId?: string | undefined;
  oldSubscriptionStatus?: SubscriptionStatus | undefined;
  oldTrialEndsAt?: string | null | undefined;
}): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (params.planId) payload["plan_id"] = params.planId;
  if (params.subscriptionStatus) payload["subscription_status"] = params.subscriptionStatus;
  if (params.trialEndsAt !== undefined) payload["trial_ends_at"] = params.trialEndsAt;

  try {
    const { error } = await db.from("clinics").update(payload).eq("id", params.clinicId);
    if (error) {
      console.warn("Aviso ao atualizar clínica no Supabase:", error.message);
    }
  } catch (err) {
    console.warn("Falha de rede ou conexão ao atualizar clínica:", err);
  }

  const isPlanChanged = params.planId && params.oldPlanId && params.planId !== params.oldPlanId;
  const isStatusChanged = params.subscriptionStatus && params.oldSubscriptionStatus && params.subscriptionStatus !== params.oldSubscriptionStatus;
  const isTrialExtended = params.trialEndsAt && params.trialEndsAt !== params.oldTrialEndsAt;

  let action = "update_subscription";
  let category: "plan" | "subscription" = "subscription";

  if (isPlanChanged && !isStatusChanged) {
    action = "alteracao_plano";
    category = "plan";
  } else if (isStatusChanged && !isPlanChanged) {
    action = "alteracao_status_assinatura";
    category = "subscription";
  } else if (isTrialExtended && !isPlanChanged && !isStatusChanged) {
    action = "prorrogacao_trial";
    category = "subscription";
  }

  await logSuperadminAction({
    action,
    category,
    targetClinicId: params.clinicId,
    targetClinicName: params.clinicName,
    oldValues: {
      plan_id: params.oldPlanId || null,
      subscription_status: params.oldSubscriptionStatus || null,
      trial_ends_at: params.oldTrialEndsAt || null,
    },
    newValues: {
      plan_id: params.planId || params.oldPlanId || null,
      subscription_status: params.subscriptionStatus || params.oldSubscriptionStatus || null,
      trial_ends_at: params.trialEndsAt || params.oldTrialEndsAt || null,
    },
    details: {
      clinic_name: params.clinicName,
      reason: params.reason || "Alteração realizada pelo Desenvolvedor Master",
      new_plan: params.planId,
      new_status: params.subscriptionStatus,
      trial_ends_at: params.trialEndsAt,
    },
  });
}

export async function logAccessChangeWithAudit(params: {
  action: string;
  targetClinicId?: string | null | undefined;
  targetClinicName?: string | null | undefined;
  targetUserEmail?: string | null | undefined;
  oldRole?: string | null | undefined;
  newRole?: string | null | undefined;
  reason?: string | undefined;
  details?: Record<string, unknown> | undefined;
}): Promise<void> {
  await logSuperadminAction({
    action: params.action,
    category: "access",
    targetClinicId: params.targetClinicId,
    targetClinicName: params.targetClinicName,
    targetUserEmail: params.targetUserEmail,
    oldValues: params.oldRole ? { role: params.oldRole } : null,
    newValues: params.newRole ? { role: params.newRole } : null,
    details: {
      ...params.details,
      reason: params.reason || "Alteração de acesso pelo desenvolvedor",
      target_user_email: params.targetUserEmail,
      clinic_name: params.targetClinicName,
    },
  });
}

export function exportAuditLogsToCsv(logs: PlatformAuditLog[]): string {
  const headers = [
    "ID",
    "Data/Hora",
    "Categoria",
    "Ação",
    "Responsável (Quem Fez)",
    "Clínica Afetada",
    "Usuário Afetado",
    "Valores Anteriores",
    "Novos Valores",
    "Motivo / Detalhes",
    "IP de Origem",
  ];

  const rows = logs.map((l) => [
    l.id,
    new Date(l.created_at).toLocaleString("pt-BR"),
    l.category || "system",
    `"${l.action.replace(/"/g, '""')}"`,
    `"${l.admin_email} ${l.admin_name ? `(${l.admin_name})` : ""}"`,
    `"${(l.target_clinic_name || l.target_clinic_id || "").replace(/"/g, '""')}"`,
    `"${(l.target_user_email || "").replace(/"/g, '""')}"`,
    `"${JSON.stringify(l.old_values || {}).replace(/"/g, '""')}"`,
    `"${JSON.stringify(l.new_values || {}).replace(/"/g, '""')}"`,
    `"${JSON.stringify(l.details || {}).replace(/"/g, '""')}"`,
    l.ip_address || "127.0.0.1",
  ]);

  return [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
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
