import { supabase } from "@/services/supabase";
import type {
  PlatformClinicOverview,
  PlatformDeveloperStats,
  SaasPlan,
  SubscriptionStatus,
} from "@/types";

// Client db com escape seguro de tipos para tabelas dinâmicas do Supabase
type SuperadminDbClient = {
  from: (table: string) => {
    select: (cols: string) => {
      order: (col: string, opts?: { ascending?: boolean }) => Promise<{ data: unknown[] | null; error: unknown }>;
    };
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: unknown }>;
    };
  };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  auth: typeof supabase.auth;
};

const db = supabase as unknown as SuperadminDbClient;

export const MASTER_DEVELOPER_EMAIL = "jonathastdsantos@gmail.com";

/**
 * Valida de forma síncrona/rápida ou pelo auth se um dado e-mail é o desenvolvedor master.
 */
export function isMasterDeveloperEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === MASTER_DEVELOPER_EMAIL.toLowerCase();
}

/**
 * Consulta se o usuário autenticado atual possui privilégios de SuperAdmin / Desenvolvedor.
 */
export async function checkIsSuperadmin(): Promise<boolean> {
  const { data: userRes } = await db.auth.getUser();
  const user = userRes?.user;
  if (!user) return false;

  if (isMasterDeveloperEmail(user.email)) return true;

  try {
    const { data, error } = await db.rpc("is_platform_superadmin");
    if (!error && data === true) return true;
  } catch {
    // Ignora se RPC não estiver compilado ainda
  }

  return false;
}

/**
 * Busca a lista de planos SaaS disponíveis.
 */
export async function fetchSaasPlans(): Promise<SaasPlan[]> {
  const { data, error } = await db
    .from("saas_plans")
    .select("*")
    .order("monthly_price", { ascending: true });

  if (error) {
    // Fallback padrão se tabela estiver pendente de execução no SQL editor
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

  return (data ?? []) as SaasPlan[];
}

/**
 * Busca todas as clínicas cadastradas na plataforma (visão do Desenvolvedor SuperAdmin).
 */
export async function fetchPlatformClinics(): Promise<PlatformClinicOverview[]> {
  const { data, error } = await db
    .from("clinics")
    .select("id,name,created_at,plan_id,subscription_status,current_period_end,saas_plans(*)")
    .order("created_at", { ascending: false });

  if (error) {
    // Tenta fallback sem o join caso saas_plans não esteja linkado
    const { data: rawClinics, error: rawErr } = await db
      .from("clinics")
      .select("id,name,created_at")
      .order("created_at", { ascending: false });

    if (rawErr) throw rawErr;
    return (rawClinics ?? []).map((c) => {
      const row = c as { id: string; name: string; created_at: string };
      return {
        id: row.id,
        name: row.name,
        created_at: row.created_at,
        plan_id: "pro",
        subscription_status: "active" as SubscriptionStatus,
        current_period_end: null,
        saas_plans: null,
      };
    });
  }

  return (data ?? []) as unknown as PlatformClinicOverview[];
}

/**
 * Calcula métricas globais para o painel de desenvolvedor (MRR, Clínicas ativas, etc.).
 */
export function calculatePlatformStats(
  clinics: PlatformClinicOverview[],
  plans: SaasPlan[],
): PlatformDeveloperStats {
  const planPriceMap = new Map<string, number>();
  for (const p of plans) {
    planPriceMap.set(p.id, Number(p.monthly_price) || 0);
  }

  let activeClinics = 0;
  let trialClinics = 0;
  let mrrEstimated = 0;

  for (const c of clinics) {
    const status = c.subscription_status ?? "active";
    if (status === "active") {
      activeClinics += 1;
      const planPrice = planPriceMap.get(c.plan_id ?? "pro") ?? 299;
      mrrEstimated += planPrice;
    } else if (status === "trialing") {
      trialClinics += 1;
    }
  }

  return {
    totalClinics: clinics.length,
    activeClinics,
    trialClinics,
    mrrEstimated: Number(mrrEstimated.toFixed(2)),
    totalPatientsEstimate: clinics.length * 120, // estimativa média
  };
}

/**
 * Atualiza o plano ou status de assinatura de uma clínica específica.
 */
export async function updateClinicSubscription(params: {
  clinicId: string;
  planId?: string;
  subscriptionStatus?: SubscriptionStatus;
}): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (params.planId) payload["plan_id"] = params.planId;
  if (params.subscriptionStatus) payload["subscription_status"] = params.subscriptionStatus;

  const { error } = await db
    .from("clinics")
    .update(payload)
    .eq("id", params.clinicId);

  if (error) throw error;
}

