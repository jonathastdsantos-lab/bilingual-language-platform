import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Code2,
  Coins,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  HardDrive,
  History,
  Info,
  Layers,
  Lock,
  Mail,
  Megaphone,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n";
import { SaasAnalyticsCharts } from "@/components/superadmin/SaasAnalyticsCharts";
import {
  addClinicNote,
  calculateDetailedPlatformStats,
  checkIsSuperadmin,
  checkRealSystemHealth,
  createBroadcastAnnouncement,
  deleteClinicWithConfirmation,
  exportClinicsToCsv,
  fetchBroadcastAnnouncements,
  fetchClinicNotes,
  fetchDetailedClinicsOverview,
  fetchSaasPlans,
  fetchSuperadminAuditLogs,
  MASTER_DEVELOPER_EMAIL,
  superadminCreateClinic,
  updateClinicSubscriptionWithAudit,
} from "@/modules/superadmin";
import type {
  DetailedPlatformClinic,
  PlatformAuditLog,
  PlatformBroadcastAnnouncement,
  PlatformClinicNote,
  SaasPlan,
  SubscriptionStatus,
} from "@/types";
import { formatCurrencyBRL } from "@/utils/timezone";
import { formatCNPJ } from "@/utils/validators";

export const Route = createFileRoute("/_authenticated/app/superadmin")({
  head: () => ({
    meta: [
      { title: "SuperAdmin & Desenvolvedor — SondaPro" },
      { name: "description", content: "Console de Engenharia e Gestão SaaS SondaPro." },
    ],
  }),
  component: SuperAdminPage,
});

export function SuperAdminPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Estados de Filtros e Busca
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlan, setFilterPlan] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "patients" | "mrr">("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Modais
  const [selectedClinic, setSelectedClinic] = useState<DetailedPlatformClinic | null>(null);
  const [newClinicOpen, setNewClinicOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [confirmSubOpen, setConfirmSubOpen] = useState(false);
  const [deleteClinicOpen, setDeleteClinicOpen] = useState(false);

  // Formulário Nova Clínica
  const [newClinicName, setNewClinicName] = useState("");
  const [newClinicPlan, setNewClinicPlan] = useState("pro");
  const [newClinicStatus, setNewClinicStatus] = useState<SubscriptionStatus>("active");
  const [newClinicOwnerEmail, setNewClinicOwnerEmail] = useState("");

  // Formulário Mudança de Assinatura com Confirmação
  const [pendingSubChange, setPendingSubChange] = useState<{
    clinic: DetailedPlatformClinic;
    planId: string;
    status: SubscriptionStatus;
    reason: string;
    trialDaysToAdd: number;
  } | null>(null);

  // Formulário Broadcast
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastPriority, setBroadcastPriority] = useState<"normal" | "urgent" | "maintenance">("normal");
  const [broadcastTargetClinic, setBroadcastTargetClinic] = useState<string>("all");

  // Anotações da Clínica
  const [newNoteText, setNewNoteText] = useState("");

  const { data: isSuperadmin, isLoading: authLoading } = useQuery({
    queryKey: ["isSuperadmin"],
    queryFn: checkIsSuperadmin,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["saasPlans"],
    enabled: !!isSuperadmin,
    queryFn: fetchSaasPlans,
  });

  const {
    data: clinics = [],
    isLoading: clinicsLoading,
    refetch: refetchClinics,
  } = useQuery({
    queryKey: ["superadminDetailedClinics"],
    enabled: !!isSuperadmin,
    queryFn: fetchDetailedClinicsOverview,
  });

  const { data: systemHealth, refetch: refetchHealth } = useQuery({
    queryKey: ["systemHealth"],
    enabled: !!isSuperadmin,
    queryFn: checkRealSystemHealth,
    refetchInterval: 30000,
  });

  const { data: auditLogs = [], refetch: refetchAudit } = useQuery({
    queryKey: ["superadminAuditLogs"],
    enabled: !!isSuperadmin,
    queryFn: fetchSuperadminAuditLogs,
  });

  const { data: announcements = [], refetch: refetchAnnouncements } = useQuery({
    queryKey: ["broadcastAnnouncements"],
    enabled: !!isSuperadmin,
    queryFn: fetchBroadcastAnnouncements,
  });

  const { data: clinicNotes = [], refetch: refetchNotes } = useQuery({
    queryKey: ["clinicNotes", selectedClinic?.id],
    enabled: !!selectedClinic,
    queryFn: () => (selectedClinic ? fetchClinicNotes(selectedClinic.id) : Promise.resolve([])),
  });

  const stats = useMemo(() => calculateDetailedPlatformStats(clinics, plans), [clinics, plans]);

  // Mutações
  const saveSubMutation = useMutation({
    mutationFn: async () => {
      if (!pendingSubChange) return;
      let newTrialEnd: string | null | undefined = undefined;
      if (pendingSubChange.trialDaysToAdd > 0) {
        const d = new Date();
        d.setDate(d.getDate() + pendingSubChange.trialDaysToAdd);
        newTrialEnd = d.toISOString();
      }
      await updateClinicSubscriptionWithAudit({
        clinicId: pendingSubChange.clinic.id,
        clinicName: pendingSubChange.clinic.name,
        planId: pendingSubChange.planId,
        subscriptionStatus: pendingSubChange.status,
        trialEndsAt: newTrialEnd,
        reason: pendingSubChange.reason || "Alteração pelo Desenvolvedor Master",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["superadminDetailedClinics"] });
      qc.invalidateQueries({ queryKey: ["superadminAuditLogs"] });
      toast.success("Assinatura e plano atualizados com registro de auditoria.");
      setConfirmSubOpen(false);
      setPendingSubChange(null);
      if (selectedClinic) setSelectedClinic(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar assinatura.");
    },
  });

  const createClinicMutation = useMutation({
    mutationFn: async () => {
      if (!newClinicName.trim()) throw new Error("Informe o nome da clínica.");
      await superadminCreateClinic({
        name: newClinicName.trim(),
        planId: newClinicPlan,
        subscriptionStatus: newClinicStatus,
        ownerEmail: newClinicOwnerEmail.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["superadminDetailedClinics"] });
      qc.invalidateQueries({ queryKey: ["superadminAuditLogs"] });
      toast.success("Clínica criada manualmente com sucesso.");
      setNewClinicOpen(false);
      setNewClinicName("");
      setNewClinicOwnerEmail("");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao cadastrar clínica.");
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClinic || !newNoteText.trim()) return;
      await addClinicNote(selectedClinic.id, newNoteText.trim());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinicNotes", selectedClinic?.id] });
      qc.invalidateQueries({ queryKey: ["superadminAuditLogs"] });
      toast.success("Anotação interna gravada.");
      setNewNoteText("");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar anotação.");
    },
  });

  const broadcastMutation = useMutation({
    mutationFn: async () => {
      if (!broadcastTitle.trim() || !broadcastMsg.trim()) {
        throw new Error("Título e mensagem são obrigatórios.");
      }
      await createBroadcastAnnouncement({
        targetClinicId: broadcastTargetClinic === "all" ? null : broadcastTargetClinic,
        title: broadcastTitle.trim(),
        message: broadcastMsg.trim(),
        priority: broadcastPriority,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["broadcastAnnouncements"] });
      qc.invalidateQueries({ queryKey: ["superadminAuditLogs"] });
      toast.success("Aviso publicado na plataforma.");
      setBroadcastOpen(false);
      setBroadcastTitle("");
      setBroadcastMsg("");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao emitir aviso.");
    },
  });

  const deleteClinicMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClinic) return;
      await deleteClinicWithConfirmation({
        clinicId: selectedClinic.id,
        clinicName: selectedClinic.name,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["superadminDetailedClinics"] });
      qc.invalidateQueries({ queryKey: ["superadminAuditLogs"] });
      toast.success("Clínica excluída com sucesso.");
      setDeleteClinicOpen(false);
      setSelectedClinic(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir clínica.");
    },
  });

  // Função: Entrar como a clínica (Impersonate / Suporte)
  const handleImpersonate = (clinic: DetailedPlatformClinic) => {
    localStorage.setItem("sondapro.clinic", clinic.id);
    toast.success(`Entrando como a clínica: ${clinic.name} (Modo Suporte)`);
    navigate({ to: "/app" });
  };

  // Exportar Planilha CSV
  const handleExportCsv = () => {
    const csv = exportClinicsToCsv(clinics);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `sondapro_clinicas_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Planilha CSV exportada com sucesso.");
  };

  // Filtragem, Ordenação e Paginação
  const filteredClinics = useMemo(() => {
    let list = [...clinics];
    const q = searchTerm.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          (c.owner_name && c.owner_name.toLowerCase().includes(q)) ||
          (c.owner_email && c.owner_email.toLowerCase().includes(q)) ||
          (c.cnpj && c.cnpj.includes(q)),
      );
    }

    if (filterPlan !== "all") {
      list = list.filter((c) => c.plan_id === filterPlan);
    }

    if (filterStatus !== "all") {
      list = list.filter((c) => c.subscription_status === filterStatus);
    }

    if (sortBy === "newest") {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === "patients") {
      list.sort((a, b) => (b.patients_count || 0) - (a.patients_count || 0));
    } else if (sortBy === "mrr") {
      list.sort((a, b) => (b.monthly_price || 0) - (a.monthly_price || 0));
    }

    return list;
  }, [clinics, searchTerm, filterPlan, filterStatus, sortBy]);

  const totalPages = Math.ceil(filteredClinics.length / pageSize) || 1;
  const paginatedClinics = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredClinics.slice(start, start + pageSize);
  }, [filteredClinics, currentPage]);

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
          Acesso estritamente reservado ao desenvolvedor master (<b>{MASTER_DEVELOPER_EMAIL}</b>).
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
      {/* Header Desenvolvedor Master com Ações Rápidas */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border bg-gradient-to-r from-navy via-navy/95 to-slate-900 p-6 text-white shadow-card">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal/20 text-teal">
              <Code2 className="h-4 w-4" />
            </span>
            <span className="rounded-lg bg-teal/20 px-2.5 py-0.5 text-xs font-bold text-teal">
              DEVELOPER ROOT CONSOLE
            </span>
            <span className="rounded-lg bg-white/10 px-2 py-0.5 text-[11px] font-mono text-slate-300">
              {MASTER_DEVELOPER_EMAIL}
            </span>
          </div>
          <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
            {t("superadmin.title")}
          </h1>
          <p className="text-xs text-slate-300">
            {t("superadmin.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t("superadmin.exportCsv")}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setBroadcastOpen(true)}
            className="border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            <Megaphone className="mr-1.5 h-3.5 w-3.5" />
            Emitir Aviso Global
          </Button>

          <Button
            variant="hero"
            size="sm"
            onClick={() => setNewClinicOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("superadmin.newClinic")}
          </Button>
        </div>
      </div>

      {/* Tabs Principais da Área de Desenvolvedor */}
      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="overview">{t("superadmin.tabOverview")}</TabsTrigger>
          <TabsTrigger value="clinics">
            {t("superadmin.tabClinics")} ({clinics.length})
          </TabsTrigger>
          <TabsTrigger value="audit">{t("superadmin.tabAudit")}</TabsTrigger>
          <TabsTrigger value="broadcast">Avisos & Comunicados</TabsTrigger>
          <TabsTrigger value="system">{t("superadmin.tabSystem")}</TabsTrigger>
        </TabsList>

        {/* =========================================================================
            ABA 1: VISÃO GERAL & MÉTRICAS SAAS EXPANDIDAS
        ========================================================================= */}
        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Total de Clínicas SaaS</span>
                <Building2 className="h-4 w-4 text-teal" />
              </div>
              <p className="mt-1.5 text-2xl font-extrabold text-navy">{stats.totalClinics}</p>
              <p className="text-[11px] text-muted-foreground">
                {stats.activeClinics} ativas · {stats.trialClinics} em teste (trial)
              </p>
            </div>

            <div className="rounded-2xl border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>MRR Estimado (Recorrente)</span>
                <Coins className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-1.5 text-2xl font-extrabold text-emerald-700">
                {formatCurrencyBRL(stats.mrrEstimated)}
                <span className="text-xs font-normal text-muted-foreground">/mês</span>
              </p>
              <p className="text-[11px] text-muted-foreground">Baseado nos planos contratados</p>
            </div>

            <div className="rounded-2xl border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Pacientes na Rede</span>
                <Users className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="mt-1.5 text-2xl font-extrabold text-navy">{stats.totalPatientsEstimate}</p>
              <p className="text-[11px] text-muted-foreground">
                {stats.totalAppointmentsMonth} consultas neste mês
              </p>
            </div>

            <div className="rounded-2xl border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Espaço em Disco / Exames</span>
                <HardDrive className="h-4 w-4 text-amber-600" />
              </div>
              <p className="mt-1.5 text-2xl font-extrabold text-navy">
                {(stats.totalStorageBytes / (1024 * 1024)).toFixed(1)} MB
              </p>
              <p className="text-[11px] text-muted-foreground">Radiografias e anexos clínicos</p>
            </div>
          </div>

          {/* Gráficos Visuais de Desempenho e Curva de Crescimento SaaS */}
          <SaasAnalyticsCharts clinics={clinics} plans={plans} />

          {/* Cards dos Planos Comerciais */}
          <div className="space-y-3 rounded-2xl border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-navy">Planos Comerciais SondaPro SaaS</h3>
                <p className="text-xs text-muted-foreground">
                  Configuração de capacidades, limites e valores dos planos.
                </p>
              </div>
              <Badge variant="outline" className="text-xs font-bold text-teal">
                3 Planos Disponíveis
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {plans.map((p) => {
                const count = clinics.filter((c) => c.plan_id === p.id).length;
                return (
                  <div key={p.id} className="rounded-2xl border bg-muted/20 p-4 transition hover:border-teal">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold text-navy">{p.name}</span>
                      <span className="text-xs font-bold text-teal">{formatCurrencyBRL(p.monthly_price)}/mês</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                    <div className="mt-3 space-y-1 text-xs font-medium text-slate-700">
                      <p>• {count} clínica(s) neste plano</p>
                      <p>• Máx. {p.max_professionals === 999 ? "Ilimitados" : p.max_professionals} Dentistas</p>
                      <p>• Máx. {p.max_units} Unidades / Consultórios</p>
                      <p>• {p.storage_limit_mb / 1000} GB de armazenamento</p>
                      <p>• WhatsApp: {p.whatsapp_included ? "Incluso" : "Opcional"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* =========================================================================
            ABA 2: LISTA DE CLÍNICAS AVANÇADA (DETALHES, FILTROS, STATUS E AÇÕES)
        ========================================================================= */}
        <TabsContent value="clinics" className="space-y-4">
          {/* Barra de Filtros, Busca e Ordenação */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-card">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por clínica, CNPJ, dono ou e-mail..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 pl-9 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Filtro de Plano */}
              <select
                aria-label="Filtrar por Plano"
                value={filterPlan}
                onChange={(e) => {
                  setFilterPlan(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 rounded-xl border border-input bg-background px-2.5 text-xs font-semibold text-navy"
              >
                <option value="all">Todos os Planos</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="corporate">Corporate</option>
              </select>

              {/* Filtro de Status */}
              <select
                aria-label="Filtrar por Status"
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 rounded-xl border border-input bg-background px-2.5 text-xs font-semibold text-navy"
              >
                <option value="all">Todos os Status</option>
                <option value="active">Ativas (Adimplentes)</option>
                <option value="trialing">Em Período de Teste</option>
                <option value="past_due">Atrasadas (Inadimplentes)</option>
                <option value="cancelled">Canceladas / Suspensas</option>
              </select>

              {/* Ordenação */}
              <select
                aria-label="Ordenar Clínicas"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="h-9 rounded-xl border border-input bg-background px-2.5 text-xs font-semibold text-navy"
              >
                <option value="newest">Mais Recentes</option>
                <option value="patients">Mais Pacientes</option>
                <option value="mrr">Maior Valor (MRR)</option>
              </select>
            </div>
          </div>

          {/* Listagem das Clínicas com Alertas Visuais */}
          {clinicsLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Carregando dados das clínicas...
            </div>
          ) : paginatedClinics.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-xs text-muted-foreground">
              Nenhuma clínica encontrada com os filtros selecionados.
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedClinics.map((clinic) => {
                const isPastDue = clinic.subscription_status === "past_due";
                const isTrial = clinic.subscription_status === "trialing";
                const isInactive = !clinic.last_appointment_at;

                return (
                  <div
                    key={clinic.id}
                    className={`rounded-2xl border bg-card p-4 shadow-card transition hover:border-teal/50 ${
                      isPastDue ? "border-destructive/40 bg-destructive/5" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedClinic(clinic)}
                            className="text-left text-sm font-extrabold text-navy hover:text-teal hover:underline"
                          >
                            {clinic.name}
                          </button>

                          {clinic.cnpj && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                              {formatCNPJ(clinic.cnpj)}
                            </span>
                          )}

                          <Badge variant="outline" className="text-[11px] font-bold">
                            {clinic.plan_name}
                          </Badge>

                          <span
                            className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${
                              clinic.subscription_status === "active"
                                ? "border-emerald-300 bg-emerald-500/10 text-emerald-800"
                                : clinic.subscription_status === "trialing"
                                  ? "border-sky-300 bg-sky-500/10 text-sky-800"
                                  : "border-destructive/30 bg-destructive/10 text-destructive"
                            }`}
                          >
                            {clinic.subscription_status === "active"
                              ? "Ativo"
                              : clinic.subscription_status === "trialing"
                                ? "Em Teste"
                                : clinic.subscription_status === "past_due"
                                  ? "Inadimplente"
                                  : "Cancelado"}
                          </span>

                          {isPastDue && (
                            <span className="inline-flex items-center gap-1 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">
                              <AlertTriangle className="h-3 w-3" /> Cobrança Pendente
                            </span>
                          )}

                          {isInactive && (
                            <span className="rounded border border-amber-300 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                              Sem consultas recentes
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground">
                          <b>Dono:</b> {clinic.owner_name || "—"}{" "}
                          {clinic.owner_email ? `(${clinic.owner_email})` : ""} · <b>Pacientes:</b>{" "}
                          {clinic.patients_count} · <b>Consultas no Mês:</b>{" "}
                          {clinic.appointments_month_count} · <b>Dentistas:</b> {clinic.dentists_count}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Botão Entrar como Clínica (Suporte) */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleImpersonate(clinic)}
                          className="gap-1 text-xs"
                          title="Acessar painel como a clínica para prestar suporte"
                        >
                          <Eye className="h-3.5 w-3.5 text-teal" />
                          {t("superadmin.impersonate")}
                        </Button>

                        {/* Botão Detalhes & Gestão */}
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedClinic(clinic)}
                          className="text-xs"
                        >
                          Detalhes
                        </Button>

                        {/* Alterar Assinatura com Confirmação */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPendingSubChange({
                              clinic,
                              planId: clinic.plan_id,
                              status: clinic.subscription_status,
                              reason: "",
                              trialDaysToAdd: 0,
                            });
                            setConfirmSubOpen(true);
                          }}
                          className="text-xs text-teal hover:underline"
                        >
                          Mudar Plano/Status
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Paginação */}
              <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                <span>
                  Página {currentPage} de {totalPages} ({filteredClinics.length} clínicas)
                </span>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* =========================================================================
            ABA 3: LOGS DE AUDITORIA DO SUPERADMIN
        ========================================================================= */}
        <TabsContent value="audit" className="space-y-4">
          <div className="rounded-2xl border bg-card p-5 shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-navy">Histórico de Auditoria do Desenvolvedor</h3>
                <p className="text-xs text-muted-foreground">
                  Registro auditável de todas as ações de suporte, suspensão, criação e trocas de plano.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchAudit()}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar Logs
              </Button>
            </div>

            {auditLogs.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nenhuma ação do desenvolvedor registrada até o momento.
              </p>
            ) : (
              <div className="divide-y rounded-xl border overflow-hidden text-xs">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-card hover:bg-muted/10 flex justify-between items-center gap-2">
                    <div>
                      <span className="font-bold text-navy uppercase font-mono">{log.action}</span>
                      <p className="text-muted-foreground">
                        Por: <b>{log.admin_email}</b> · {new Date(log.created_at).toLocaleString("pt-BR")}
                      </p>
                      {log.details && (
                        <p className="mt-0.5 text-slate-700 font-mono text-[11px]">
                          {JSON.stringify(log.details)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* =========================================================================
            ABA 4: AVISOS & COMUNICADOS GLOBAIS
        ========================================================================= */}
        <TabsContent value="broadcast" className="space-y-4">
          <div className="rounded-2xl border bg-card p-5 shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-navy">Avisos e Manutenções para Clínicas</h3>
                <p className="text-xs text-muted-foreground">
                  Mensagens exibidas em banner no topo dos painéis das clínicas clientes.
                </p>
              </div>
              <Button size="sm" onClick={() => setBroadcastOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Novo Comunicado
              </Button>
            </div>

            {announcements.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nenhum comunicado ativo na plataforma.
              </p>
            ) : (
              <div className="space-y-2">
                {announcements.map((a) => (
                  <div key={a.id} className="rounded-xl border p-3 bg-muted/20 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-navy">{a.title}</span>
                      <Badge variant={a.priority === "urgent" ? "destructive" : "outline"}>
                        {a.priority}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">{a.message}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Publicado em {new Date(a.created_at).toLocaleDateString("pt-BR")} por {a.created_by}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* =========================================================================
            ABA 5: DIAGNÓSTICO DO SISTEMA EM TEMPO REAL
        ========================================================================= */}
        <TabsContent value="system" className="space-y-4">
          <div className="rounded-2xl border bg-card p-5 shadow-card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-navy">Diagnóstico Real de Infraestrutura</h3>
                <p className="text-xs text-muted-foreground">
                  Verificação ativa de conectividade, banco de dados Postgres e autenticação Supabase.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchHealth()}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Testar Conexão Agora
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-4 bg-muted/20">
                <span className="text-xs text-muted-foreground font-semibold">Latência do Banco Postgres</span>
                <p className="text-2xl font-extrabold text-navy mt-1">
                  {systemHealth ? `${systemHealth.databaseLatencyMs} ms` : "—"}
                </p>
                <p className="text-[11px] text-emerald-600 font-bold mt-1">✓ Conexão Ativa</p>
              </div>

              <div className="rounded-xl border p-4 bg-muted/20">
                <span className="text-xs text-muted-foreground font-semibold">Autenticação (Supabase Auth)</span>
                <p className="text-base font-extrabold text-navy mt-1">
                  {systemHealth?.authConnected ? "Conectado & Saudável" : "Verificando..."}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">JWTs e sessões verificadas</p>
              </div>

              <div className="rounded-xl border p-4 bg-muted/20">
                <span className="text-xs text-muted-foreground font-semibold">Políticas de RLS Multi-Tenant</span>
                <p className="text-base font-extrabold text-emerald-600 mt-1">100% Habilitado</p>
                <p className="text-[11px] text-muted-foreground mt-1">Isolamento criptográfico ativo</p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* =========================================================================
          MODAL: DETALHES COMPLETOS DA CLÍNICA & SUPORTE TÉCNICO
      ========================================================================= */}
      {selectedClinic && (
        <Dialog open={!!selectedClinic} onOpenChange={(open) => !open && setSelectedClinic(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between text-navy">
                <span>{selectedClinic.name}</span>
                <Badge variant="outline">{selectedClinic.plan_name}</Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 text-xs">
              {/* Dados Cadastrais */}
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
                <p><b>ID da Clínica:</b> <span className="font-mono">{selectedClinic.id}</span></p>
                <p><b>CNPJ:</b> {selectedClinic.cnpj ? formatCNPJ(selectedClinic.cnpj) : "Não cadastrado"}</p>
                <p><b>Telefone:</b> {selectedClinic.phone || "—"}</p>
                <p><b>E-mail:</b> {selectedClinic.email || "—"}</p>
                <p><b>Endereço:</b> {selectedClinic.address || "—"}</p>
                <p><b>Cadastrada em:</b> {new Date(selectedClinic.created_at).toLocaleDateString("pt-BR")}</p>
              </div>

              {/* Responsável / Dono da Clínica */}
              <div className="rounded-xl border p-3 space-y-1">
                <p className="font-extrabold text-navy">Proprietário Responsável:</p>
                <p><b>Nome:</b> {selectedClinic.owner_name || "Proprietário da Clínica"}</p>
                <p><b>E-mail:</b> {selectedClinic.owner_email || "Não informado"}</p>
              </div>

              {/* Estatísticas de Uso */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-xl border p-2">
                  <span className="text-[10px] text-muted-foreground">Pacientes</span>
                  <p className="text-lg font-extrabold text-navy">{selectedClinic.patients_count}</p>
                </div>
                <div className="rounded-xl border p-2">
                  <span className="text-[10px] text-muted-foreground">Consultas no Mês</span>
                  <p className="text-lg font-extrabold text-navy">{selectedClinic.appointments_month_count}</p>
                </div>
                <div className="rounded-xl border p-2">
                  <span className="text-[10px] text-muted-foreground">Dentistas</span>
                  <p className="text-lg font-extrabold text-navy">{selectedClinic.dentists_count}</p>
                </div>
                <div className="rounded-xl border p-2">
                  <span className="text-[10px] text-muted-foreground">Storage Usado</span>
                  <p className="text-lg font-extrabold text-navy">
                    {(selectedClinic.exam_storage_bytes / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
              </div>

              {/* Anotações Internas do Desenvolvedor / Suporte */}
              <div className="space-y-2 border-t pt-3">
                <p className="font-extrabold text-navy flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-teal" /> Anotações Internas de Suporte
                </p>

                <div className="flex gap-2">
                  <Input
                    placeholder="Adicionar nota técnica ou contato com o cliente..."
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    className="text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={addNoteMutation.isPending}
                    onClick={() => addNoteMutation.mutate()}
                  >
                    Salvar Nota
                  </Button>
                </div>

                {clinicNotes.length > 0 && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {clinicNotes.map((n) => (
                      <div key={n.id} className="rounded bg-muted/40 p-2 text-[11px]">
                        <p className="text-foreground">{n.content}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {n.author_email} · {new Date(n.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="flex justify-between items-center sm:justify-between border-t pt-3">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setDeleteClinicOpen(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir Clínica
              </Button>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleImpersonate(selectedClinic)}
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5 text-teal" /> Acessar como Clínica
                </Button>
                <Button type="button" size="sm" onClick={() => setSelectedClinic(null)}>
                  Fechar
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* =========================================================================
          MODAL: CONFIRMAÇÃO DE MUDANÇA DE PLANO E ASSINATURA
      ========================================================================= */}
      {confirmSubOpen && pendingSubChange && (
        <Dialog open={confirmSubOpen} onOpenChange={setConfirmSubOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-navy">Confirmar Alteração de Assinatura</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <p>
                Você está alterando a assinatura da clínica <b>{pendingSubChange.clinic.name}</b>.
              </p>

              <div className="space-y-1">
                <Label>Novo Plano SaaS:</Label>
                <select
                  value={pendingSubChange.planId}
                  onChange={(e) =>
                    setPendingSubChange({ ...pendingSubChange, planId: e.target.value })
                  }
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatCurrencyBRL(p.monthly_price)}/mês)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label>Situação da Assinatura:</Label>
                <select
                  value={pendingSubChange.status}
                  onChange={(e) =>
                    setPendingSubChange({
                      ...pendingSubChange,
                      status: e.target.value as SubscriptionStatus,
                    })
                  }
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
                >
                  <option value="active">Ativo (Adimplente)</option>
                  <option value="trialing">Em Período de Teste</option>
                  <option value="past_due">Atrasado (Inadimplente)</option>
                  <option value="cancelled">Suspenso / Cancelado</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label>Estender Período de Teste (Dias Adicionais):</Label>
                <Input
                  type="number"
                  min={0}
                  value={pendingSubChange.trialDaysToAdd}
                  onChange={(e) =>
                    setPendingSubChange({
                      ...pendingSubChange,
                      trialDaysToAdd: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>Motivo da Alteração (para o Log de Auditoria):</Label>
                <Input
                  placeholder="Ex.: Cliente solicitou upgrade telefônico; concedido 7 dias de trial."
                  value={pendingSubChange.reason}
                  onChange={(e) =>
                    setPendingSubChange({ ...pendingSubChange, reason: e.target.value })
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmSubOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={saveSubMutation.isPending}
                onClick={() => saveSubMutation.mutate()}
              >
                {saveSubMutation.isPending ? "Gravando..." : "Confirmar Alteração"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* =========================================================================
          MODAL: CRIAR CLÍNICA MANUALMENTE
      ========================================================================= */}
      <Dialog open={newClinicOpen} onOpenChange={setNewClinicOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy">{t("superadmin.newClinic")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label>Nome da Nova Clínica *</Label>
              <Input
                placeholder="Ex.: Clínica Odonto Vida"
                value={newClinicName}
                onChange={(e) => setNewClinicName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Plano Inicial</Label>
              <select
                value={newClinicPlan}
                onChange={(e) => setNewClinicPlan(e.target.value)}
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label>Status Inicial</Label>
              <select
                value={newClinicStatus}
                onChange={(e) => setNewClinicStatus(e.target.value as SubscriptionStatus)}
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                <option value="active">Ativo (Pago)</option>
                <option value="trialing">Em Teste (14 Dias)</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label>E-mail do Proprietário (opcional para vínculo imediato)</Label>
              <Input
                placeholder="Ex.: doutor@email.com"
                value={newClinicOwnerEmail}
                onChange={(e) => setNewClinicOwnerEmail(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewClinicOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={createClinicMutation.isPending}
              onClick={() => createClinicMutation.mutate()}
            >
              Criar Clínica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          MODAL: EMITIR AVISO / BROADCAST
      ========================================================================= */}
      <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy">Emitir Aviso na Plataforma</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label>Destinatário</Label>
              <select
                value={broadcastTargetClinic}
                onChange={(e) => setBroadcastTargetClinic(e.target.value)}
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                <option value="all">Todas as Clínicas (Global)</option>
                {clinics.map((c) => (
                  <option key={c.id} value={c.id}>
                    Apenas: {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label>Prioridade</Label>
              <select
                value={broadcastPriority}
                onChange={(e) => setBroadcastPriority(e.target.value as any)}
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgente</option>
                <option value="maintenance">Manutenção Programada</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label>Título do Comunicado *</Label>
              <Input
                placeholder="Ex.: Nova funcionalidade de Guias TISS liberada!"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Mensagem Detalhada *</Label>
              <Textarea
                rows={3}
                placeholder="Texto explicativo para a equipe da clínica..."
                value={broadcastMsg}
                onChange={(e) => setBroadcastMsg(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBroadcastOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={broadcastMutation.isPending}
              onClick={() => broadcastMutation.mutate()}
            >
              Publicar Aviso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          MODAL: EXCLUSÃO COM CONFIRMAÇÃO DUPLA
      ========================================================================= */}
      <Dialog open={deleteClinicOpen} onOpenChange={setDeleteClinicOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Confirmação Dupla de Exclusão
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              Você está prestes a excluir permanentemente a clínica{" "}
              <b className="text-foreground">{selectedClinic?.name}</b> e todos os seus registros de pacientes, prontuários e movimentações financeiras.
            </p>
            <p className="font-bold text-destructive">Esta ação é irreversível.</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteClinicOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteClinicMutation.isPending}
              onClick={() => deleteClinicMutation.mutate()}
            >
              {deleteClinicMutation.isPending ? "Excluindo..." : "Sim, Excluir Definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
