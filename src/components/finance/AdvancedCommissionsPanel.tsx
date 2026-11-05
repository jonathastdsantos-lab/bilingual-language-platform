import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Calculator,
  Plus,
  Printer,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  DollarSign,
  TrendingDown,
  Building2,
  Calendar,
  Layers,
  Settings,
  Trash2,
  ChevronRight,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  fetchCommissionSettlements,
  fetchCommissionSettlementDetails,
  calculateCommissionPreview,
  createCommissionSettlement,
  approveAndPayCommissionSettlement,
  fetchCommissionRules,
  upsertCommissionRule,
  deleteCommissionRule,
  generateSettlementPrintableHtml,
} from "@/modules/commissions";
import type {
  CommissionSettlement,
  CommissionSettlementItem,
  CommissionPreviewResult,
  CommissionRule,
} from "@/types";

interface AdvancedCommissionsPanelProps {
  clinicId: string;
  clinicName: string;
  professionals: Array<{ id: string; name: string; cro?: string | null; commission_pct?: number | string }>;
  canManage: boolean;
}

export function AdvancedCommissionsPanel({
  clinicId,
  clinicName,
  professionals,
  canManage,
}: AdvancedCommissionsPanelProps) {
  const qc = useQueryClient();

  const [selectedProfFilter, setSelectedProfFilter] = useState<string>("all");
  const [newSettlementModalOpen, setNewSettlementModalOpen] = useState<boolean>(false);
  const [rulesModalOpen, setRulesModalOpen] = useState<boolean>(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState<boolean>(false);
  const [activeSettlementId, setActiveSettlementId] = useState<string | null>(null);

  // Estados do formulário de novo fechamento
  const [newProfId, setNewProfId] = useState<string>(professionals[0]?.id || "");
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0] || "";
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split("T")[0] || "");
  const [notes, setNotes] = useState<string>("");

  // Regras de comissão
  const [ruleProfId, setRuleProfId] = useState<string>(professionals[0]?.id || "");
  const [ruleProcedure, setRuleProcedure] = useState<string>("");
  const [ruleCalcType, setRuleCalcType] = useState<"percentage_net_of_lab" | "percentage_gross" | "fixed_amount">("percentage_net_of_lab");
  const [rulePercentage, setRulePercentage] = useState<number>(40);
  const [ruleFixed, setRuleFixed] = useState<number>(0);

  // Consulta lista de fechamentos
  const { data: settlements = [], isLoading: isLoadingSettlements } = useQuery({
    queryKey: ["commissionSettlements", clinicId, selectedProfFilter],
    queryFn: () => fetchCommissionSettlements(clinicId, selectedProfFilter),
  });

  // Consulta detalhes do fechamento ativo
  const { data: activeDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["commissionSettlementDetails", activeSettlementId],
    queryFn: () => (activeSettlementId ? fetchCommissionSettlementDetails(activeSettlementId) : null),
    enabled: Boolean(activeSettlementId && detailsModalOpen),
  });

  // Consulta regras de comissão
  const { data: rules = [], refetch: refetchRules } = useQuery({
    queryKey: ["commissionRules", clinicId, ruleProfId],
    queryFn: () => fetchCommissionRules(clinicId, ruleProfId),
    enabled: rulesModalOpen,
  });

  // Consulta da prévia no modal de criação
  const {
    data: previewData,
    isLoading: isCalculatingPreview,
    refetch: refetchPreview,
  } = useQuery({
    queryKey: ["commissionPreview", clinicId, newProfId, startDate, endDate],
    queryFn: () => (newProfId && startDate && endDate ? calculateCommissionPreview(clinicId, newProfId, startDate, endDate) : null),
    enabled: Boolean(newSettlementModalOpen && newProfId && startDate && endDate),
  });

  // Mutação para criar fechamento
  const createSettlementMutation = useMutation({
    mutationFn: async () => {
      if (!previewData || previewData.items.length === 0) {
        throw new Error("Nenhum atendimento apurado no período selecionado.");
      }
      return await createCommissionSettlement(clinicId, {
        professionalId: newProfId,
        periodStart: startDate,
        periodEnd: endDate,
        items: previewData.items,
        notes: notes.trim() || null,
      });
    },
    onSuccess: (data) => {
      toast.success(`Fechamento ${data.settlement_code} gerado com sucesso!`);
      setNewSettlementModalOpen(false);
      qc.invalidateQueries({ queryKey: ["commissionSettlements", clinicId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Mutação para liquidar / pagar repasse
  const paySettlementMutation = useMutation({
    mutationFn: async (settlementId: string) => {
      const res = await approveAndPayCommissionSettlement(settlementId, "pix");
      if (!res.success) throw new Error(res.error || "Erro ao liquidar repasse.");
      return res;
    },
    onSuccess: (res) => {
      toast.success(res.message || "Repasse liquidado e lançado no financeiro!");
      qc.invalidateQueries({ queryKey: ["commissionSettlements", clinicId] });
      if (activeSettlementId) {
        qc.invalidateQueries({ queryKey: ["commissionSettlementDetails", activeSettlementId] });
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Mutação para salvar regra
  const saveRuleMutation = useMutation({
    mutationFn: async () => {
      await upsertCommissionRule(clinicId, {
        professional_id: ruleProfId,
        procedure_name: ruleProcedure.trim() || null,
        calculation_type: ruleCalcType,
        percentage: Number(rulePercentage),
        fixed_amount: Number(ruleFixed),
        deduct_lab_costs: ruleCalcType === "percentage_net_of_lab",
      });
    },
    onSuccess: () => {
      toast.success("Regra de comissão salva!");
      setRuleProcedure("");
      refetchRules();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Mutação para excluir regra
  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      await deleteCommissionRule(ruleId);
    },
    onSuccess: () => {
      toast.success("Regra removida!");
      refetchRules();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Cálculos de resumo
  const totalPaid = settlements
    .filter((s) => s.status === "paid")
    .reduce((acc, s) => acc + Number(s.net_commission_amount), 0);

  const totalPending = settlements
    .filter((s) => s.status === "draft" || s.status === "approved")
    .reduce((acc, s) => acc + Number(s.net_commission_amount), 0);

  const totalLabDeductions = settlements.reduce(
    (acc, s) => acc + Number(s.total_lab_deductions),
    0
  );

  const fmtMoney = (v: number) =>
    Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const fmtDate = (iso: string) => {
    if (!iso) return "-";
    const datePart = iso.split("T")[0] || "";
    const parts = datePart.split("-");
    const y = parts[0] || "";
    const m = parts[1] || "";
    const d = parts[2] || "";
    return d && m && y ? `${d}/${m}/${y}` : iso;
  };

  const handlePrint = (settlement: CommissionSettlement, items: CommissionSettlementItem[]) => {
    const html = generateSettlementPrintableHtml(settlement, items, clinicName);
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 300);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cards de Métricas Superiores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Repasses Liquidados</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-navy mt-1">
            {fmtMoney(totalPaid)}
          </div>
          <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
            Lançados como despesa paga
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Repasses Pendentes</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-navy mt-1">
            {fmtMoney(totalPending)}
          </div>
          <p className="text-[11px] text-amber-600 font-semibold mt-0.5">
            Aguardando aprovação / pagamento
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Descontos de Prótese</span>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </div>
          <div className="text-2xl font-extrabold text-navy mt-1">
            {fmtMoney(totalLabDeductions)}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Custos laboratoriais abatidos
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Total de Lotes Fechados</span>
            <Layers className="h-4 w-4 text-teal" />
          </div>
          <div className="text-2xl font-extrabold text-navy mt-1">
            {settlements.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Extratos apurados
          </p>
        </div>
      </div>

      {/* Ações e Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={selectedProfFilter} onValueChange={setSelectedProfFilter}>
            <SelectTrigger className="w-56 text-xs font-semibold">
              <SelectValue placeholder="Filtrar por dentista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Dentistas</SelectItem>
              {professionals.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRulesModalOpen(true)}
              className="gap-1.5 text-xs font-semibold"
            >
              <Settings className="h-4 w-4 text-slate-600" />
              Regras de Comissão
            </Button>

            <Button
              size="sm"
              onClick={() => {
                if (professionals.length === 0) {
                  toast.error("Nenhum profissional cadastrado na clínica.");
                  return;
                }
                setNewSettlementModalOpen(true);
              }}
              className="bg-teal hover:bg-teal-600 text-white font-bold gap-1.5 text-xs shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Novo Fechamento de Repasse
            </Button>
          </div>
        )}
      </div>

      {/* Tabela de Fechamentos de Repasse */}
      <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-navy text-sm flex items-center gap-2">
            <Calculator className="h-4 w-4 text-teal" />
            Histórico de Fechamentos & Extratos de Repasse
          </h3>
          <span className="text-xs text-muted-foreground">
            {settlements.length} fechamentos encontrados
          </span>
        </div>

        {isLoadingSettlements ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Carregando extratos de comissão...
          </div>
        ) : settlements.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <Calculator className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              Nenhum fechamento de repasse gerado ainda
            </p>
            <p className="text-xs text-muted-foreground">
              Clique em "Novo Fechamento de Repasse" para apurar a produção dos dentistas parceiros.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/70 border-b text-slate-700 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3">Código</th>
                  <th className="p-3">Cirurgião-Dentista</th>
                  <th className="p-3">Período</th>
                  <th className="p-3 text-right">Bruto</th>
                  <th className="p-3 text-right">Desconto Protético</th>
                  <th className="p-3 text-right">Líquido a Repassar</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlements.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3 font-mono font-bold text-navy">
                      {s.settlement_code}
                    </td>
                    <td className="p-3 font-semibold text-slate-800">
                      {s.professional?.name || "Dentista Parceiro"}
                    </td>
                    <td className="p-3 text-slate-600">
                      {fmtDate(s.period_start)} a {fmtDate(s.period_end)}
                    </td>
                    <td className="p-3 text-right font-medium text-slate-700">
                      {fmtMoney(s.total_gross_amount)}
                    </td>
                    <td className="p-3 text-right font-medium text-rose-600">
                      {Number(s.total_lab_deductions) > 0 ? `-${fmtMoney(s.total_lab_deductions)}` : "R$ 0,00"}
                    </td>
                    <td className="p-3 text-right font-bold text-teal text-sm">
                      {fmtMoney(s.net_commission_amount)}
                    </td>
                    <td className="p-3 text-center">
                      <Badge
                        className={
                          s.status === "paid"
                            ? "bg-emerald-500/10 text-emerald-700 font-semibold"
                            : "bg-amber-500/10 text-amber-700 font-semibold"
                        }
                      >
                        {s.status === "paid" ? "Liquidado" : "Em Aberto"}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Ver Detalhes do Espelho"
                          onClick={() => {
                            setActiveSettlementId(s.id);
                            setDetailsModalOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 text-slate-600" />
                        </Button>

                        {canManage && s.status !== "paid" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 border-emerald-500/40 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => paySettlementMutation.mutate(s.id)}
                            disabled={paySettlementMutation.isPending}
                          >
                            <DollarSign className="h-3 w-3 mr-1" />
                            Liquidar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: NOVO FECHAMENTO DE REPASSE */}
      <Dialog open={newSettlementModalOpen} onOpenChange={setNewSettlementModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-navy">
              <Calculator className="h-5 w-5 text-teal" />
              <span>Apurar Fechamento de Repasse Odontológico</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Dentista Parceiro</Label>
                <Select value={newProfId} onValueChange={setNewProfId}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {professionals.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Data Inicial</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Data Final</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            {/* Prévia dos itens calculados */}
            <div className="border rounded-2xl p-4 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-navy">
                  Prévia de Atendimentos Concluídos ({previewData?.items_count || 0})
                </span>
                {isCalculatingPreview && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3 animate-spin" /> Calculando regras...
                  </span>
                )}
              </div>

              {previewData && previewData.items.length > 0 ? (
                <div className="max-h-60 overflow-y-auto rounded-xl border bg-white">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-slate-100 border-b font-semibold text-slate-700">
                      <tr>
                        <th className="p-2">Data</th>
                        <th className="p-2">Paciente</th>
                        <th className="p-2">Procedimento</th>
                        <th className="p-2 text-right">Bruto</th>
                        <th className="p-2 text-right">Protético</th>
                        <th className="p-2 text-right">Base</th>
                        <th className="p-2 text-right">%</th>
                        <th className="p-2 text-right">Comissão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewData.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2">{fmtDate(it.service_date)}</td>
                          <td className="p-2 font-medium">{it.patient_name}</td>
                          <td className="p-2">{it.procedure_name}</td>
                          <td className="p-2 text-right">{fmtMoney(it.gross_amount)}</td>
                          <td className="p-2 text-right text-rose-600">
                            {Number(it.lab_cost) > 0 ? `-${fmtMoney(it.lab_cost)}` : "-"}
                          </td>
                          <td className="p-2 text-right font-medium">{fmtMoney(it.calculation_basis)}</td>
                          <td className="p-2 text-right">{it.commission_rate}%</td>
                          <td className="p-2 text-right font-bold text-teal">
                            {fmtMoney(it.commission_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center p-4 text-xs text-muted-foreground">
                  Nenhuma consulta concluída neste período para o dentista selecionado.
                </div>
              )}

              {/* Totais do Fechamento */}
              {previewData && previewData.items.length > 0 && (
                <div className="grid grid-cols-3 gap-2 pt-2 border-t text-xs">
                  <div>
                    <span className="text-slate-500">Total Produção:</span>
                    <div className="font-bold text-navy">{fmtMoney(previewData.total_gross_amount)}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">(-) Desconto Protético:</span>
                    <div className="font-bold text-rose-600">-{fmtMoney(previewData.total_lab_deductions)}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Total Líquido a Repassar:</span>
                    <div className="font-extrabold text-teal text-sm">{fmtMoney(previewData.net_commission_amount)}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Observações Internas (opcional)</Label>
              <Input
                placeholder="Ex: Fechamento referente à 1ª quinzena de novembro"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewSettlementModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                !previewData ||
                previewData.items.length === 0 ||
                createSettlementMutation.isPending
              }
              onClick={() => createSettlementMutation.mutate()}
              className="bg-teal hover:bg-teal-600 text-white font-bold"
            >
              {createSettlementMutation.isPending ? "Gerando..." : "Confirmar e Gerar Fechamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: DETALHES DO ESPELHO / IMPRESSÃO */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-navy">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-teal" />
                <span>Espelho de Repasse — {activeDetails?.settlement.settlement_code}</span>
              </div>
              {activeDetails && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePrint(activeDetails.settlement, activeDetails.items)}
                  className="gap-1.5 text-xs mr-6"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir Espelho
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          {isLoadingDetails || !activeDetails ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Carregando itens do repasse...
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50 rounded-xl border text-xs">
                <div>
                  <span className="text-slate-500">Dentista:</span>
                  <div className="font-bold text-navy">{activeDetails.settlement.professional?.name}</div>
                </div>
                <div>
                  <span className="text-slate-500">Período:</span>
                  <div className="font-semibold text-slate-800">
                    {fmtDate(activeDetails.settlement.period_start)} a {fmtDate(activeDetails.settlement.period_end)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Status:</span>
                  <div>
                    <Badge
                      className={
                        activeDetails.settlement.status === "paid"
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-amber-500/10 text-amber-700"
                      }
                    >
                      {activeDetails.settlement.status === "paid" ? "Liquidado" : "Em Aberto"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Valor Líquido:</span>
                  <div className="font-extrabold text-teal text-sm">
                    {fmtMoney(activeDetails.settlement.net_commission_amount)}
                  </div>
                </div>
              </div>

              {/* Tabela de Atendimentos */}
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 border-b font-bold text-slate-700">
                    <tr>
                      <th className="p-2.5">Data</th>
                      <th className="p-2.5">Paciente</th>
                      <th className="p-2.5">Procedimento</th>
                      <th className="p-2.5 text-right">Bruto</th>
                      <th className="p-2.5 text-right">Protético</th>
                      <th className="p-2.5 text-right">Base</th>
                      <th className="p-2.5 text-right">%</th>
                      <th className="p-2.5 text-right">Comissão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeDetails.items.map((it) => (
                      <tr key={it.id}>
                        <td className="p-2.5">{fmtDate(it.service_date)}</td>
                        <td className="p-2.5 font-medium">{it.patient_name}</td>
                        <td className="p-2.5">{it.procedure_name}</td>
                        <td className="p-2.5 text-right">{fmtMoney(it.gross_amount)}</td>
                        <td className="p-2.5 text-right text-rose-600">
                          {Number(it.lab_cost) > 0 ? `-${fmtMoney(it.lab_cost)}` : "-"}
                        </td>
                        <td className="p-2.5 text-right font-medium">{fmtMoney(it.calculation_basis)}</td>
                        <td className="p-2.5 text-right">{it.commission_rate}%</td>
                        <td className="p-2.5 text-right font-bold text-teal">
                          {fmtMoney(it.commission_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {canManage && activeDetails.settlement.status !== "paid" && (
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={() => paySettlementMutation.mutate(activeDetails.settlement.id)}
                    disabled={paySettlementMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Aprovar e Liquidar Repasse Agora
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: REGRAS DE COMISSÃO */}
      <Dialog open={rulesModalOpen} onOpenChange={setRulesModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-navy">
              <Settings className="h-5 w-5 text-teal" />
              <span>Regras de Comissão Odontológica</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-slate-50 border rounded-xl space-y-3">
              <span className="text-xs font-bold text-navy">Nova Regra de Comissão:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">Profissional</Label>
                  <Select value={ruleProfId} onValueChange={setRuleProfId}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {professionals.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">Procedimento (opcional)</Label>
                  <Input
                    placeholder="Ex: Implante ou deixe vazio para geral"
                    value={ruleProcedure}
                    onChange={(e) => setRuleProcedure(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">Modalidade de Cálculo</Label>
                  <Select
                    value={ruleCalcType}
                    onValueChange={(v: any) => setRuleCalcType(v)}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage_net_of_lab">
                        % Líquido (Abatendo Protético)
                      </SelectItem>
                      <SelectItem value="percentage_gross">
                        % Bruto (Sem dedução)
                      </SelectItem>
                      <SelectItem value="fixed_amount">
                        Valor Fixo (R$)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">
                    {ruleCalcType === "fixed_amount" ? "Valor Fixo (R$)" : "Percentual (%)"}
                  </Label>
                  {ruleCalcType === "fixed_amount" ? (
                    <Input
                      type="number"
                      step={10}
                      value={ruleFixed}
                      onChange={(e) => setRuleFixed(Number(e.target.value))}
                      className="text-xs"
                    />
                  ) : (
                    <Input
                      type="number"
                      step={5}
                      min={0}
                      max={100}
                      value={rulePercentage}
                      onChange={(e) => setRulePercentage(Number(e.target.value))}
                      className="text-xs"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  onClick={() => saveRuleMutation.mutate()}
                  disabled={saveRuleMutation.isPending}
                  className="bg-navy hover:bg-navy-700 text-white text-xs gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Salvar Regra
                </Button>
              </div>
            </div>

            {/* Lista de Regras Cadastradas */}
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 border-b font-bold text-slate-700">
                  <tr>
                    <th className="p-2.5">Procedimento</th>
                    <th className="p-2.5">Modalidade</th>
                    <th className="p-2.5 text-right">Taxa / Valor</th>
                    <th className="p-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rules.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-muted-foreground">
                        Nenhuma regra específica cadastrada. O sistema usa o % padrão do dentista com dedução de protético.
                      </td>
                    </tr>
                  ) : (
                    rules.map((r) => (
                      <tr key={r.id}>
                        <td className="p-2.5 font-semibold text-navy">
                          {r.procedure_name || "Geral (Todos os procedimentos)"}
                        </td>
                        <td className="p-2.5 text-slate-600">
                          {r.calculation_type === "percentage_net_of_lab"
                            ? "% com dedução de protético"
                            : r.calculation_type === "fixed_amount"
                              ? "Valor fixo por atendimento"
                              : "% bruto"}
                        </td>
                        <td className="p-2.5 text-right font-bold text-teal">
                          {r.calculation_type === "fixed_amount"
                            ? fmtMoney(r.fixed_amount)
                            : `${r.percentage}%`}
                        </td>
                        <td className="p-2.5 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteRuleMutation.mutate(r.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
