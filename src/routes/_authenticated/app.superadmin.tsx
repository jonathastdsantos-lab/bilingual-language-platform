import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Code2,
  Coins,
  Cpu,
  Database,
  ExternalLink,
  Layers,
  Lock,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calculatePlatformStats,
  checkIsSuperadmin,
  fetchPlatformClinics,
  fetchSaasPlans,
  isMasterDeveloperEmail,
  MASTER_DEVELOPER_EMAIL,
  updateClinicSubscription,
} from "@/modules/superadmin";
import type { PlatformClinicOverview, SubscriptionStatus } from "@/types";
import { formatCurrencyBRL } from "@/utils/timezone";

export const Route = createFileRoute("/_authenticated/app/superadmin")({
  head: () => ({
    meta: [
      { title: "SuperAdmin & Desenvolvedor — SondaPro" },
      { name: "description", content: "Área exclusiva de desenvolvedor e gestão SaaS da plataforma." },
    ],
  }),
  component: SuperAdminPage,
});

function SuperAdminPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: isSuperadmin, isLoading: authLoading } = useQuery({
    queryKey: ["isSuperadmin"],
    queryFn: checkIsSuperadmin,
  });

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ["saasPlans"],
    enabled: !!isSuperadmin,
    queryFn: fetchSaasPlans,
  });

  const {
    data: clinics = [],
    isLoading: clinicsLoading,
    refetch,
  } = useQuery({
    queryKey: ["platformClinics"],
    enabled: !!isSuperadmin,
    queryFn: fetchPlatformClinics,
  });

  const stats = useMemo(() => calculatePlatformStats(clinics, plans), [clinics, plans]);

  const updateSubMutation = useMutation({
    mutationFn: async (params: {
      clinicId: string;
      planId?: string;
      subscriptionStatus?: SubscriptionStatus;
    }) => {
      await updateClinicSubscription(params);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platformClinics"] });
      toast.success("Assinatura da clínica atualizada com sucesso.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar assinatura.");
    },
  });

  const filteredClinics = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return clinics;
    return clinics.filter((c) => c.name.toLowerCase().includes(q) || c.id.includes(q));
  }, [clinics, searchTerm]);

  if (authLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-sm text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin text-teal" />
        Autenticando permissões de Desenvolvedor Master...
      </div>
    );
  }

  if (!isSuperadmin) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center shadow-card">
        <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-destructive" />
        <h2 className="text-lg font-extrabold text-destructive">Área Restrita — Desenvolvedor Master</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta área é de acesso estritamente reservado ao desenvolvedor master da plataforma SondaPro (
          <code className="font-mono font-bold text-foreground">{MASTER_DEVELOPER_EMAIL}</code>).
        </p>
        <div className="mt-6">
          <Button variant="outline" onClick={() => navigate({ to: "/app" })}>
            Voltar ao Painel da Clínica
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Desenvolvedor Master */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-gradient-to-r from-navy via-navy/95 to-slate-900 p-6 text-white shadow-card">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal/20 text-teal">
              <Code2 className="h-4 w-4" />
            </span>
            <span className="rounded-lg bg-teal/20 px-2.5 py-0.5 text-xs font-bold text-teal">
              DEVELOPER ROOT CONSOLE
            </span>
          </div>
          <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
            Console de Engenharia & Gestão SaaS SondaPro
          </h1>
          <p className="text-xs text-slate-300">
            Acesso root autenticado como desenvolvedor master (<b>{MASTER_DEVELOPER_EMAIL}</b>).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Recarregar Dados
          </Button>
        </div>
      </div>

      {/* Métricas Globais da Plataforma */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Total de Clínicas SaaS</span>
            <Building2 className="h-4 w-4 text-teal" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-navy">{stats.totalClinics}</p>
          <p className="text-[11px] text-muted-foreground">
            {stats.activeClinics} ativa(s) · {stats.trialClinics} em período de teste
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>MRR Estimado (Receita Recorrente)</span>
            <Coins className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-emerald-700">
            {formatCurrencyBRL(stats.mrrEstimated)}
            <span className="text-xs font-normal text-muted-foreground">/mês</span>
          </p>
          <p className="text-[11px] text-muted-foreground">Baseado nos planos ativos vigentes</p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Ambiente & Infraestrutura</span>
            <Server className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-1.5 text-base font-extrabold text-navy">Supabase Cloud + RLS</p>
          <p className="text-[11px] text-muted-foreground">Multi-Tenant por clinic_id com isolamento criptográfico</p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Status da Plataforma</span>
            <Activity className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-base font-extrabold text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Todos os Sistemas Operacionais
          </p>
          <p className="text-[11px] text-muted-foreground">Postgres 15+, Storage RLS, Edge APIs</p>
        </div>
      </div>

      {/* Planos SaaS Oficiais */}
      <div className="space-y-3 rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-navy">Planos Comerciais SondaPro SaaS</h3>
            <p className="text-xs text-muted-foreground">
              Limites de capacidade, dentistas por clínica, storage e valores configurados.
            </p>
          </div>
          <Badge variant="outline" className="text-xs font-bold text-teal">
            3 Planos Ativos
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className="relative rounded-2xl border bg-muted/20 p-4 transition hover:border-teal">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold text-navy">{p.name}</span>
                <span className="text-xs font-bold text-teal">{formatCurrencyBRL(p.monthly_price)}/mês</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
              <div className="mt-3 space-y-1 text-xs font-medium text-slate-700">
                <p>• Máx. {p.max_professionals === 999 ? "Ilimitados" : p.max_professionals} Dentistas</p>
                <p>• Máx. {p.max_units} Unidade(s) / Consultório(s)</p>
                <p>• Armazenamento: {p.storage_limit_mb / 1000} GB</p>
                <p>• WhatsApp Integrado: {p.whatsapp_included ? "Sim (Automático)" : "Opcional"}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gestão Global de Clínicas Cadastradas */}
      <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-navy">Clínicas Cadastradas na Plataforma</h3>
            <p className="text-xs text-muted-foreground">
              Supervisão de assinaturas, alteração manual de plano e suporte a proprietários.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>
        </div>

        {clinicsLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Carregando clínicas...</div>
        ) : filteredClinics.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Nenhuma clínica encontrada.</div>
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border">
            {filteredClinics.map((c) => {
              const currentPlan = plans.find((p) => p.id === c.plan_id) ?? plans.find((p) => p.id === "pro");
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 transition hover:bg-muted/10">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-navy">{c.name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {c.id.slice(0, 8)}...
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Criada em: {c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "—"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Seletor de Plano */}
                    <div className="space-y-1 text-right">
                      <select
                        aria-label="Plano da Clínica"
                        value={c.plan_id ?? "pro"}
                        onChange={(e) =>
                          updateSubMutation.mutate({
                            clinicId: c.id,
                            planId: e.target.value,
                          })
                        }
                        className="h-8 rounded-lg border border-input bg-background px-2 text-xs font-semibold text-navy"
                      >
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({formatCurrencyBRL(p.monthly_price)}/mês)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Seletor de Status da Assinatura */}
                    <div>
                      <select
                        aria-label="Status da Assinatura"
                        value={c.subscription_status ?? "active"}
                        onChange={(e) =>
                          updateSubMutation.mutate({
                            clinicId: c.id,
                            subscriptionStatus: e.target.value as SubscriptionStatus,
                          })
                        }
                        className={`h-8 rounded-lg border px-2.5 text-xs font-bold ${
                          c.subscription_status === "active"
                            ? "border-emerald-300 bg-emerald-500/10 text-emerald-800"
                            : c.subscription_status === "trialing"
                              ? "border-sky-300 bg-sky-500/10 text-sky-800"
                              : "border-destructive/30 bg-destructive/10 text-destructive"
                        }`}
                      >
                        <option value="active">Ativo (Adimplente)</option>
                        <option value="trialing">Em Teste (Trial)</option>
                        <option value="past_due">Atrasado (Inadimplente)</option>
                        <option value="cancelled">Cancelado</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Informações Técnicas da Plataforma e Credenciais de Deploy */}
      <div className="rounded-2xl border bg-muted/30 p-5">
        <h4 className="flex items-center gap-2 text-xs font-extrabold uppercase text-navy">
          <Cpu className="h-4 w-4 text-teal" />
          Notas de Engenharia & Controles do Desenvolvedor
        </h4>
        <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <p>
            • <b>Desenvolvedor Master:</b> jonathastdsantos@gmail.com (Privilégios ilimitados em qualquer tenant).
          </p>
          <p>
            • <b>Isolamento Multi-Tenant:</b> Cada clínica possui criptografia lógica de dados isolados por <code className="font-mono">clinic_id</code>.
          </p>
          <p>
            • <b>Storage RLS:</b> Bucket privado <code className="font-mono">clinical-exams</code> com checagem de assinatura JWT.
          </p>
          <p>
            • <b>Sincronização Lovable/Git:</b> Branch <code className="font-mono">main</code> com histórico linear preservado.
          </p>
        </div>
      </div>
    </div>
  );
}

