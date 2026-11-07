import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  ShieldAlert,
  Search,
  Filter,
  Download,
  RefreshCw,
  ArrowRight,
  UserCheck,
  CreditCard,
  Layers,
  Calendar,
  Clock,
  Building2,
  FileText,
  Plus,
  Info,
  CheckCircle2,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlatformAuditLog, PlatformAuditCategory } from "@/types";
import { exportAuditLogsToCsv, logSuperadminAction } from "@/modules/superadmin";

interface DeveloperAuditLogPanelProps {
  logs: PlatformAuditLog[];
  isLoading: boolean;
  onRefresh: () => void;
  clinicsList?: Array<{ id: string; name: string }>;
}

export function DeveloperAuditLogPanel({
  logs,
  isLoading,
  onRefresh,
  clinicsList = [],
}: DeveloperAuditLogPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailModalLog, setDetailModalLog] = useState<PlatformAuditLog | null>(null);

  // Modal para registrar intervenção manual
  const [manualLogOpen, setManualLogOpen] = useState(false);
  const [manualAction, setManualAction] = useState("manual_support_intervention");
  const [manualCategory, setManualCategory] = useState<PlatformAuditCategory>("access");
  const [manualClinicId, setManualClinicId] = useState<string>("");
  const [manualUserEmail, setManualUserEmail] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  // Filtragem
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedCategory !== "all") {
        if (log.category !== selectedCategory) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inEmail = log.admin_email.toLowerCase().includes(q);
        const inName = (log.admin_name || "").toLowerCase().includes(q);
        const inAction = log.action.toLowerCase().includes(q);
        const inClinic = (log.target_clinic_name || "").toLowerCase().includes(q);
        const inUser = (log.target_user_email || "").toLowerCase().includes(q);
        const inDetails = JSON.stringify(log.details || {}).toLowerCase().includes(q);
        return inEmail || inName || inAction || inClinic || inUser || inDetails;
      }
      return true;
    });
  }, [logs, selectedCategory, searchQuery]);

  // Contadores por categoria
  const countAccess = useMemo(() => logs.filter((l) => l.category === "access").length, [logs]);
  const countPlans = useMemo(() => logs.filter((l) => l.category === "plan").length, [logs]);
  const countSubs = useMemo(() => logs.filter((l) => l.category === "subscription").length, [logs]);

  function handleExportCsv() {
    if (filteredLogs.length === 0) {
      toast.error("Nenhum registro para exportar.");
      return;
    }
    const csvData = exportAuditLogsToCsv(filteredLogs);
    const blob = new Blob(["\uFEFF" + csvData], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria_desenvolvedor_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Relatório de auditoria exportado com sucesso.");
  }

  async function handleCreateManualLog(e: React.FormEvent) {
    e.preventDefault();
    if (!manualReason.trim()) {
      toast.error("Informe a justificativa da intervenção.");
      return;
    }

    setIsSubmittingManual(true);
    try {
      const targetClinic = clinicsList.find((c) => c.id === manualClinicId);
      await logSuperadminAction({
        action: manualAction,
        category: manualCategory,
        targetClinicId: manualClinicId || null,
        targetClinicName: targetClinic?.name || null,
        targetUserEmail: manualUserEmail.trim() || null,
        details: {
          reason: manualReason.trim(),
          type: "manual_developer_entry",
        },
      });
      toast.success("Registro de auditoria inserido com sucesso.");
      setManualLogOpen(false);
      setManualReason("");
      setManualClinicId("");
      setManualUserEmail("");
      onRefresh();
    } catch (err: any) {
      toast.error("Erro ao registrar auditoria: " + (err.message || String(err)));
    } finally {
      setIsSubmittingManual(false);
    }
  }

  const formatRelativeTime = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "agora há pouco";
      if (diffMin < 60) return `há ${diffMin} min`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `há ${diffHours}h`;
      const diffDays = Math.floor(diffHours / 24);
      return `há ${diffDays} dia(s)`;
    } catch {
      return "";
    }
  };

  const getCategoryBadge = (category?: string | null) => {
    switch (category) {
      case "access":
        return (
          <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800 text-[11px] gap-1">
            <Lock className="w-3 h-3" /> Acesso & Permissão
          </Badge>
        );
      case "plan":
        return (
          <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800 text-[11px] gap-1">
            <Layers className="w-3 h-3" /> Plano Comercial
          </Badge>
        );
      case "subscription":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 text-[11px] gap-1">
            <CreditCard className="w-3 h-3" /> Assinatura & Trial
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[11px] gap-1">
            <Info className="w-3 h-3" /> Sistema
          </Badge>
        );
    }
  };

  const formatActionTitle = (action: string) => {
    const map: Record<string, string> = {
      alteracao_plano: "Alteração de Plano Comercial",
      alteracao_status_assinatura: "Mudança de Status da Assinatura",
      prorrogacao_trial: "Prorrogação de Período de Testes (Trial)",
      update_subscription: "Atualização de Plano/Assinatura",
      create_clinic: "Criação de Nova Clínica",
      delete_clinic: "Exclusão de Clínica",
      grant_superadmin: "Concessão de Privilégio Superadmin",
      revoke_superadmin: "Revogação de Privilégio Superadmin",
      suspend_clinic: "Suspensão de Acesso da Clínica",
      activate_clinic: "Reativação de Acesso da Clínica",
      change_member_role: "Alteração de Cargo de Usuário",
      add_note: "Nota Interna Registrada",
      create_broadcast_announcement: "Disparo de Comunicado Global",
      manual_support_intervention: "Intervenção Técnica Manual",
    };
    return map[action] || action.replace(/_/g, " ").toUpperCase();
  };

  return (
    <div className="space-y-4">
      {/* Cards de Métricas de Auditoria */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Total de Ações Gravadas
            </CardTitle>
            <ShieldAlert className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-extrabold text-foreground">{logs.length}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Trilha de auditoria imutável</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-sky-600 uppercase">
              Alterações de Acesso
            </CardTitle>
            <Lock className="w-4 h-4 text-sky-600" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-extrabold text-sky-700 dark:text-sky-400">{countAccess}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Bloqueios, permissões e papéis</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-purple-600 uppercase">
              Alterações de Planos
            </CardTitle>
            <Layers className="w-4 h-4 text-purple-600" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-extrabold text-purple-700 dark:text-purple-400">{countPlans}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Upgrades e downgrades comerciais</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-emerald-600 uppercase">
              Assinaturas & Trial
            </CardTitle>
            <CreditCard className="w-4 h-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">{countSubs}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Prorrogações e status SaaS</p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Controles, Filtros e Ações */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg bg-muted p-1 text-xs font-medium">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-3 py-1.5 rounded-md transition ${
                selectedCategory === "all" ? "bg-background text-foreground shadow-sm font-bold" : "text-muted-foreground"
              }`}
            >
              Todos ({logs.length})
            </button>
            <button
              onClick={() => setSelectedCategory("access")}
              className={`px-3 py-1.5 rounded-md transition ${
                selectedCategory === "access" ? "bg-background text-sky-600 shadow-sm font-bold" : "text-muted-foreground"
              }`}
            >
              Acessos ({countAccess})
            </button>
            <button
              onClick={() => setSelectedCategory("plan")}
              className={`px-3 py-1.5 rounded-md transition ${
                selectedCategory === "plan" ? "bg-background text-purple-600 shadow-sm font-bold" : "text-muted-foreground"
              }`}
            >
              Planos ({countPlans})
            </button>
            <button
              onClick={() => setSelectedCategory("subscription")}
              className={`px-3 py-1.5 rounded-md transition ${
                selectedCategory === "subscription" ? "bg-background text-emerald-600 shadow-sm font-bold" : "text-muted-foreground"
              }`}
            >
              Assinaturas ({countSubs})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por clínica, usuário ou ação..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="text-xs h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="text-xs h-9"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Exportar CSV
          </Button>

          <Button
            size="sm"
            onClick={() => setManualLogOpen(true)}
            className="text-xs h-9 gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Registrar Intervenção
          </Button>
        </div>
      </div>

      {/* Lista de Registros Auditados */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-muted-foreground">
          Carregando trilha de auditoria do desenvolvedor...
        </div>
      ) : filteredLogs.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-foreground text-sm">Nenhum registro de auditoria encontrado</h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
            Nenhuma ação corresponde aos filtros selecionados. As alterações de planos, assinaturas e permissões são registradas automaticamente.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log) => {
            const hasDiff = log.old_values && log.new_values;
            const clinicName = log.target_clinic_name || (log.details as any)?.clinic_name;
            const reason = (log.details as any)?.reason;

            return (
              <Card key={log.id} className="transition-all hover:border-primary/40 shadow-sm">
                <CardContent className="p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 text-xs">
                  <div className="space-y-2 flex-1">
                    {/* Linha 1: Categoria, Título da Ação e Alvo */}
                    <div className="flex flex-wrap items-center gap-2">
                      {getCategoryBadge(log.category)}
                      <span className="font-extrabold text-sm text-foreground">
                        {formatActionTitle(log.action)}
                      </span>
                      {clinicName && (
                        <span className="flex items-center gap-1 font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded text-[11px]">
                          <Building2 className="w-3 h-3 text-primary" /> {clinicName}
                        </span>
                      )}
                      {log.target_user_email && (
                        <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
                          <UserCheck className="w-3 h-3" /> {log.target_user_email}
                        </span>
                      )}
                    </div>

                    {/* Linha 2: Visual Diff (Antes ➔ Depois) */}
                    {hasDiff && (
                      <div className="p-2.5 rounded-lg bg-muted/30 border border-muted-foreground/10 flex flex-wrap items-center gap-3 font-mono text-[11px]">
                        {log.old_values?.["plan_id"] !== undefined && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">Plano:</span>
                            <span className="line-through text-red-500 font-bold">
                              {String(log.old_values["plan_id"] || "nenhum")}
                            </span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="text-emerald-600 font-bold">
                              {String(log.new_values?.["plan_id"] || "nenhum")}
                            </span>
                          </div>
                        )}

                        {log.old_values?.["subscription_status"] !== undefined && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">Status:</span>
                            <span className="line-through text-red-500 font-bold">
                              {String(log.old_values["subscription_status"] || "nenhum")}
                            </span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="text-emerald-600 font-bold">
                              {String(log.new_values?.["subscription_status"] || "nenhum")}
                            </span>
                          </div>
                        )}

                        {log.old_values?.["role"] !== undefined && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">Cargo:</span>
                            <span className="line-through text-red-500 font-bold">
                              {String(log.old_values["role"])}
                            </span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="text-emerald-600 font-bold">
                              {String(log.new_values?.["role"])}
                            </span>
                          </div>
                        )}

                        {log.new_values?.["trial_ends_at"] && (
                          <div className="flex items-center gap-1.5 text-blue-600">
                            <span>Novo Trial até:</span>
                            <span className="font-bold">
                              {new Date(String(log.new_values["trial_ends_at"])).toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Linha 3: Justificativa / Motivo */}
                    {reason && (
                      <p className="text-muted-foreground text-[11px] italic">
                        <strong>Motivo:</strong> "{reason}"
                      </p>
                    )}
                  </div>

                  {/* Lado Direito: Quem Fez, Quando e Detalhes */}
                  <div className="flex flex-col md:items-end justify-between gap-2 shrink-0 md:border-l md:pl-4 pt-2 md:pt-0 border-t md:border-t-0">
                    <div className="space-y-0.5 md:text-right">
                      <div className="font-semibold text-foreground flex items-center md:justify-end gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-primary" />
                        <span>{log.admin_name || log.admin_email}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center md:justify-end gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(log.created_at).toLocaleString("pt-BR")}</span>
                        <span className="text-[10px] text-slate-400">({formatRelativeTime(log.created_at)})</span>
                      </div>
                      {log.ip_address && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          IP: {log.ip_address}
                        </div>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDetailModalLog(log)}
                      className="text-[11px] h-7 px-2 text-primary hover:text-primary"
                    >
                      Ver Dados Completos
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Detalhes Completos do Log (Payload JSON) */}
      <Dialog open={!!detailModalLog} onOpenChange={(o) => !o && setDetailModalLog(null)}>
        <DialogContent className="max-w-xl text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Detalhes do Registro de Auditoria
            </DialogTitle>
            <DialogDescription className="text-xs">
              Identificador único imutável: <code className="font-mono text-primary">{detailModalLog?.id}</code>
            </DialogDescription>
          </DialogHeader>

          {detailModalLog && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-muted/40">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Responsável:</span>
                  <strong className="text-foreground">{detailModalLog.admin_email}</strong>
                  {detailModalLog.admin_name && (
                    <span className="text-muted-foreground block text-[11px]">({detailModalLog.admin_name})</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Data / Hora (UTC):</span>
                  <strong className="text-foreground">{new Date(detailModalLog.created_at).toLocaleString("pt-BR")}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Ação:</span>
                  <strong className="font-mono text-primary">{detailModalLog.action}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Categoria:</span>
                  <strong>{detailModalLog.category || "system"}</strong>
                </div>
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px] font-semibold mb-1">
                  Dados Estruturados (JSON Payload):
                </span>
                <pre className="p-3 rounded-lg bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-60 whitespace-pre-wrap border border-slate-800">
                  {JSON.stringify(
                    {
                      old_values: detailModalLog.old_values,
                      new_values: detailModalLog.new_values,
                      details: detailModalLog.details,
                      ip_address: detailModalLog.ip_address,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button size="sm" onClick={() => setDetailModalLog(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para Inserção Manual de Auditoria pelo Desenvolvedor */}
      <Dialog open={manualLogOpen} onOpenChange={setManualLogOpen}>
        <DialogContent className="max-w-md text-xs">
          <form onSubmit={handleCreateManualLog}>
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-primary" /> Registrar Intervenção Manual
              </DialogTitle>
              <DialogDescription className="text-xs">
                Insira no histórico auditável uma alteração de acesso, ajuste técnico ou suporte concedido fora do fluxo padrão.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3">
              <div className="space-y-1">
                <Label htmlFor="category">Categoria da Intervenção</Label>
                <Select
                  value={manualCategory}
                  onValueChange={(v) => setManualCategory(v as PlatformAuditCategory)}
                >
                  <SelectTrigger id="category" className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="access" className="text-xs">Acesso & Permissões (Usuários/Clínica)</SelectItem>
                    <SelectItem value="plan" className="text-xs">Plano Comercial (Upgrade/Downgrade)</SelectItem>
                    <SelectItem value="subscription" className="text-xs">Assinatura & Faturamento</SelectItem>
                    <SelectItem value="system" className="text-xs">Manutenção de Sistema & Banco</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="actionName">Nome da Ação</Label>
                <Input
                  id="actionName"
                  value={manualAction}
                  onChange={(e) => setManualAction(e.target.value)}
                  placeholder="Ex: manual_support_intervention, adjust_storage_limit..."
                  className="text-xs font-mono"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="clinicSelect">Clínica Alvo (Opcional)</Label>
                <Select value={manualClinicId} onValueChange={setManualClinicId}>
                  <SelectTrigger id="clinicSelect" className="text-xs">
                    <SelectValue placeholder="Selecione a clínica..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-48">
                    {clinicsList.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="userEmail">E-mail do Usuário Afetado (Opcional)</Label>
                <Input
                  id="userEmail"
                  type="email"
                  value={manualUserEmail}
                  onChange={(e) => setManualUserEmail(e.target.value)}
                  placeholder="Ex: dentista@clinica.com"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="reason">Justificativa da Ação (Obrigatório)</Label>
                <Textarea
                  id="reason"
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="Descreva detalhadamente o motivo da alteração de acesso, plano ou assinatura para fins de compliance..."
                  rows={3}
                  className="text-xs resize-none"
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setManualLogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isSubmittingManual}>
                {isSubmittingManual ? "Gravando..." : "Gravar no Registro Auditável"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

