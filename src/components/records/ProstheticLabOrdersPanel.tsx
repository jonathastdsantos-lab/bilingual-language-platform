import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  FlaskConical,
  PackageCheck,
  Plus,
  Printer,
  Trash2,
  Truck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createProstheticLabOrder,
  deleteProstheticLabOrder,
  PROSTHESIS_TYPES,
  PROSTHETIC_LAB_STAGES,
  PROSTHETIC_STAGE_LABELS,
  registerProstheticOrderExpenseInFinance,
  summarizeProstheticLabOrders,
  updateProstheticLabOrderStage,
  VITA_SHADES,
} from "@/modules/records";
import type { ProstheticLabOrder, ProstheticLabStage } from "@/types";
import { formatCurrencyBRL } from "@/utils/timezone";

interface ProstheticLabOrdersPanelProps {
  clinicId: string;
  clinicName: string;
  patient: {
    id: string;
    full_name: string;
    cpf: string | null;
  };
  orders: ProstheticLabOrder[];
  professionals: Array<{ id: string; name: string; cro?: string | null }>;
  canWrite: boolean;
  selectedTooth: number | null;
}

const STAGE_BADGE_STYLES: Record<ProstheticLabStage, string> = {
  sent: "border-sky-300 bg-sky-500/10 text-sky-800",
  infrastructure_try_in: "border-indigo-300 bg-indigo-500/10 text-indigo-800",
  teeth_try_in: "border-purple-300 bg-purple-500/10 text-purple-800",
  glaze_finish: "border-amber-300 bg-amber-500/10 text-amber-800",
  delivered_to_clinic: "border-teal-400 bg-teal-500/15 text-teal-800",
  installed_in_patient: "border-emerald-400 bg-emerald-500/15 text-emerald-800",
  returned_adjustment: "border-destructive/40 bg-destructive/15 text-destructive",
};

function defaultDueDateIso(daysAhead = 7): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + daysAhead);
  return dt.toISOString().slice(0, 10);
}

export function ProstheticLabOrdersPanel({
  clinicId,
  clinicName,
  patient,
  orders,
  professionals,
  canWrite,
  selectedTooth,
}: ProstheticLabOrdersPanelProps) {
  const qc = useQueryClient();
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [showForm, setShowForm] = useState(false);
  const [laboratoryName, setLaboratoryName] = useState("");
  const [prosthesisType, setProsthesisType] = useState<string>(PROSTHESIS_TYPES[0]);
  const [toothNumbers, setToothNumbers] = useState(selectedTooth ? String(selectedTooth) : "");
  const [vitaShade, setVitaShade] = useState<string>("A2");
  const [professionalId, setProfessionalId] = useState<string>(professionals[0]?.id ?? "");
  const [stage, setStage] = useState<ProstheticLabStage>("sent");
  const [sentDate, setSentDate] = useState<string>(todayIso);
  const [dueDate, setDueDate] = useState<string>(() => defaultDueDateIso(7));
  const [labCost, setLabCost] = useState<string>("0");
  const [generateExpenseInFinance, setGenerateExpenseInFinance] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (selectedTooth && !toothNumbers) {
      setToothNumbers(String(selectedTooth));
    }
  }, [selectedTooth, toothNumbers]);

  const summary = useMemo(
    () => summarizeProstheticLabOrders(orders, todayIso),
    [orders, todayIso],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const numericCost = Number(labCost.replace(",", ".")) || 0;
      await createProstheticLabOrder(
        clinicId,
        {
          patient_id: patient.id,
          professional_id: professionalId || null,
          laboratory_name: laboratoryName,
          prosthesis_type: prosthesisType,
          tooth_numbers: toothNumbers || null,
          vita_shade: vitaShade || null,
          stage,
          sent_date: sentDate,
          due_date: dueDate,
          lab_cost: numericCost,
          notes: notes || null,
        },
        {
          generateExpenseInFinance,
          patientName: patient.full_name,
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prosthetic-lab-orders", clinicId, patient.id] });
      qc.invalidateQueries({ queryKey: ["clinical-records", clinicId, patient.id] });
      qc.invalidateQueries({ queryKey: ["financial-entries", clinicId] });
      toast.success("Ordem de Serviço Protética registrada com sucesso.");
      setShowForm(false);
      setLaboratoryName("");
      setToothNumbers(selectedTooth ? String(selectedTooth) : "");
      setLabCost("0");
      setNotes("");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar Ordem Protética.");
    },
  });

  const stageMutation = useMutation({
    mutationFn: async (params: { order: ProstheticLabOrder; nextStage: ProstheticLabStage }) => {
      await updateProstheticLabOrderStage(clinicId, params.order, params.nextStage);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prosthetic-lab-orders", clinicId, patient.id] });
      qc.invalidateQueries({ queryKey: ["clinical-records", clinicId, patient.id] });
      toast.success("Etapa laboratorial atualizada.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar etapa.");
    },
  });

  const financeMutation = useMutation({
    mutationFn: async (order: ProstheticLabOrder) => {
      await registerProstheticOrderExpenseInFinance(clinicId, order, patient.full_name);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prosthetic-lab-orders", clinicId, patient.id] });
      qc.invalidateQueries({ queryKey: ["financial-entries", clinicId] });
      toast.success("Custo laboratorial lançado no Contas a Pagar (Financeiro).");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao lançar despesa no Financeiro.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (orderId: string) => {
      await deleteProstheticLabOrder(clinicId, orderId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prosthetic-lab-orders", clinicId, patient.id] });
      toast.success("Ordem Protética excluída.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir Ordem Protética.");
    },
  });

  const handlePrintLabOrder = (order: ProstheticLabOrder) => {
    const prof = professionals.find((p) => p.id === order.professional_id);
    const popup = window.open("", "_blank", "width=840,height=720");
    if (!popup) {
      toast.error("Permita pop-ups no navegador para imprimir a Guia Protética.");
      return;
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Guia de Laboratório de Prótese — ${patient.full_name}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 28px; }
    .box { border: 2px solid #0f172a; border-radius: 12px; padding: 24px; max-width: 720px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 18px; }
    .title { font-size: 18px; font-weight: 800; text-transform: uppercase; }
    .sub { font-size: 12px; color: #475569; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .field { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; }
    .label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; }
    .value { font-size: 14px; font-weight: 700; margin-top: 3px; }
    .notes { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; min-height: 90px; white-space: pre-wrap; font-size: 13px; }
    .sig { margin-top: 42px; display: flex; justify-content: space-between; text-align: center; font-size: 12px; }
    .sig-line { width: 44%; border-top: 1px solid #0f172a; padding-top: 6px; }
    @media print { .no-print { display: none; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="box">
    <div class="header">
      <div>
        <div class="title">${clinicName}</div>
        <div class="sub">Ordem de Serviço / Requisição de Prótese Odontológica</div>
      </div>
      <div style="text-align: right;">
        <div class="label">Envio / Prazo</div>
        <div class="value">${order.sent_date} → ${order.due_date}</div>
      </div>
    </div>

    <div class="grid">
      <div class="field">
        <div class="label">Laboratório de Prótese</div>
        <div class="value">${order.laboratory_name}</div>
      </div>
      <div class="field">
        <div class="label">Paciente</div>
        <div class="value">${patient.full_name}</div>
      </div>
      <div class="field">
        <div class="label">Trabalho Protético Solicitado</div>
        <div class="value">${order.prosthesis_type}</div>
      </div>
      <div class="field">
        <div class="label">Elementos Dentários / Região & Cor Vita</div>
        <div class="value">Dentes: ${order.tooth_numbers || "Arcada"} • Cor: ${order.vita_shade || "Não especificada"}</div>
      </div>
      <div class="field">
        <div class="label">Cirurgião-Dentista Solicitante</div>
        <div class="value">${prof?.name ?? order.professionals?.name ?? "Cirurgião-Dentista"}${prof?.cro ? ` (CRO ${prof.cro})` : ""}</div>
      </div>
      <div class="field">
        <div class="label">Etapa Atual</div>
        <div class="value">${PROSTHETIC_STAGE_LABELS[order.stage]}</div>
      </div>
    </div>

    <div class="label" style="margin-bottom: 6px;">Especificações Técnicas / Desenho Protético / Observações ao TPD</div>
    <div class="notes">${order.notes || "Seguir anatomia e guia de oclusão enviada no modelo/escaneamento."}</div>

    <div class="sig">
      <div class="sig-line">Assinatura e Carimbo do Cirurgião-Dentista</div>
      <div class="sig-line">Recebimento do Laboratório de Prótese (TPD)</div>
    </div>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  };

  return (
    <div className="space-y-5">
      {/* KPIs do Controle de Laboratório de Prótese */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Em Confecção / Provas no Lab</span>
            <FlaskConical className="h-4 w-4 text-teal" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-navy">{summary.activeInLabCount}</p>
          <p className="text-[11px] text-muted-foreground">
            {summary.totalOrders} trabalho(s) protético(s) no histórico
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Prontos na Clínica</span>
            <PackageCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-emerald-700">{summary.readyInClinicCount}</p>
          <p className="text-[11px] text-muted-foreground">
            {summary.installedCount} já cimentado(s)/instalado(s)
          </p>
        </div>

        <div
          className={`rounded-2xl border p-4 shadow-card ${
            summary.overdueCount > 0 ? "border-destructive/40 bg-destructive/5" : "bg-card"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Com Prazo de Entrega Vencido</span>
            <Clock className={`h-4 w-4 ${summary.overdueCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </div>
          <p
            className={`mt-1.5 text-2xl font-extrabold ${
              summary.overdueCount > 0 ? "text-destructive" : "text-navy"
            }`}
          >
            {summary.overdueCount}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Cobrar retorno do laboratório se atrasado
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Custo Laboratorial Acumulado</span>
            <DollarSign className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-navy">{formatCurrencyBRL(summary.totalLabCost)}</p>
          <p className="text-[11px] text-muted-foreground">
            Integrado ao Contas a Pagar (Financeiro)
          </p>
        </div>
      </div>

      {/* Cabeçalho e Botão Nova Ordem de Serviço Protética */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-card">
        <div>
          <h3 className="text-sm font-extrabold text-navy">
            Controle de Laboratório de Prótese (Rastreamento de Trabalhos Protéticos)
          </h3>
          <p className="text-xs text-muted-foreground">
            Acompanhe envios de moldagens/escaneamentos, provas de infraestrutura/cerâmica, escala Vita, prazos e custos laboratoriais.
          </p>
        </div>
        {canWrite && (
          <Button
            type="button"
            variant={showForm ? "outline" : "default"}
            size="sm"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus className="h-4 w-4" />
            {showForm ? "Fechar Formulário" : "Nova Ordem de Prótese (OS)"}
          </Button>
        )}
      </div>

      {/* Formulário de Nova Ordem de Serviço Protética */}
      {showForm && canWrite && (
        <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
          <h4 className="text-sm font-extrabold text-navy">
            Nova Requisição / Envio para Laboratório de Prótese
          </h4>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Nome do Laboratório de Prótese / TPD *</Label>
              <Input
                placeholder="Ex.: Laboratório Estética Dental / TPD Carlos"
                value={laboratoryName}
                onChange={(e) => setLaboratoryName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Tipo de Trabalho Protético *</Label>
              <select
                aria-label="Tipo de Trabalho Protético"
                value={prosthesisType}
                onChange={(e) => setProsthesisType(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                {PROSTHESIS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Dentes FDI / Arcada</Label>
              <Input
                placeholder="Ex.: 11, 21 ou Superior"
                value={toothNumbers}
                onChange={(e) => setToothNumbers(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Cor / Escala Vita</Label>
              <select
                aria-label="Cor Escala Vita"
                value={vitaShade}
                onChange={(e) => setVitaShade(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                {VITA_SHADES.map((shade) => (
                  <option key={shade} value={shade}>
                    {shade}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Cirurgião-Dentista Solicitante</Label>
              <select
                aria-label="Cirurgião-Dentista Solicitante"
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">Selecionar profissional...</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Etapa Inicial</Label>
              <select
                aria-label="Etapa Inicial"
                value={stage}
                onChange={(e) => setStage(e.target.value as ProstheticLabStage)}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                {PROSTHETIC_LAB_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {PROSTHETIC_STAGE_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Data de Envio *</Label>
              <Input
                type="date"
                value={sentDate}
                onChange={(e) => setSentDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Prazo de Retorno / Entrega *</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Custo do Laboratório (R$)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Ex.: 380.00"
                value={labCost}
                onChange={(e) => setLabCost(e.target.value)}
              />
            </div>

            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-navy">
                <input
                  type="checkbox"
                  checked={generateExpenseInFinance}
                  onChange={(e) => setGenerateExpenseInFinance(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-teal"
                />
                Lançar no Contas a Pagar (Financeiro)
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Instruções Técnicas ao Protético (substrato, textura, pôntico, oclusão)
            </Label>
            <Textarea
              rows={2}
              placeholder="Ex.: Substrato escurecido no 11 (usar coping opaco). Textura superficial suave, borda incisal translúcida..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Registrando OS..." : "Salvar Ordem Protética"}
            </Button>
          </div>
        </div>
      )}

      {/* Listagem de Trabalhos Protéticos do Paciente */}
      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <Truck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-bold text-navy">
            Nenhum trabalho protético registrado para este paciente
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Clique em &ldquo;Nova Ordem de Prótese (OS)&rdquo; para rastrear coroas, facetas, próteses protocolo ou placas miorrelaxantes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const isFinished =
              order.stage === "delivered_to_clinic" || order.stage === "installed_in_patient";
            const isOverdue = !isFinished && order.due_date < todayIso;

            return (
              <div
                key={order.id}
                className={`rounded-2xl border bg-card p-4 shadow-card transition ${
                  isOverdue ? "border-destructive/50" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-navy">
                        {order.prosthesis_type}
                      </span>
                      {order.tooth_numbers && (
                        <span className="rounded-lg bg-navy/10 px-2 py-0.5 text-xs font-bold text-navy">
                          Dente(s): {order.tooth_numbers}
                        </span>
                      )}
                      {order.vita_shade && (
                        <span className="rounded-lg border border-amber-300 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-900">
                          Cor Vita: {order.vita_shade}
                        </span>
                      )}
                      <span
                        className={`rounded-lg border px-2.5 py-0.5 text-xs font-bold ${STAGE_BADGE_STYLES[order.stage]}`}
                      >
                        {PROSTHETIC_STAGE_LABELS[order.stage]}
                      </span>
                      {isOverdue && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-destructive px-2 py-0.5 text-[11px] font-bold text-white">
                          <AlertTriangle className="h-3 w-3" />
                          Prazo vencido ({order.due_date})
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      <b>Laboratório:</b> {order.laboratory_name} · <b>Envio:</b> {order.sent_date} ·{" "}
                      <b>Prazo de Entrega:</b> {order.due_date}
                      {order.delivered_date ? ` · Entregue em: ${order.delivered_date}` : ""}
                      {order.professionals?.name ? ` · Dr(a). ${order.professionals.name}` : ""}
                    </p>

                    {order.notes && (
                      <p className="mt-1 rounded-xl bg-muted/50 px-3 py-1.5 text-xs text-foreground">
                        <b>Instruções ao TPD:</b> {order.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-right">
                      <p className="text-xs font-bold text-navy">
                        Custo Lab: {formatCurrencyBRL(Number(order.lab_cost) || 0)}
                      </p>
                      {order.financial_entry_generated ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Lançado no Contas a Pagar
                        </span>
                      ) : (
                        Number(order.lab_cost) > 0 &&
                        canWrite && (
                          <button
                            type="button"
                            disabled={financeMutation.isPending}
                            onClick={() => financeMutation.mutate(order)}
                            className="text-[11px] font-bold text-teal underline hover:text-teal/80"
                          >
                            + Lançar no Contas a Pagar
                          </button>
                        )
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handlePrintLabOrder(order)}
                      title="Imprimir Guia de Serviço para o Protético"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Guia OS
                    </Button>

                    {canWrite && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(order.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Seletor rápido de evolução de etapa laboratorial */}
                {canWrite && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
                    <span className="mr-1 text-[11px] font-bold text-muted-foreground">
                      Avançar Etapa:
                    </span>
                    {PROSTHETIC_LAB_STAGES.map((st) => {
                      const active = order.stage === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          disabled={active || stageMutation.isPending}
                          onClick={() => stageMutation.mutate({ order, nextStage: st })}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                            active
                              ? "border-navy bg-navy text-white"
                              : "border-border bg-background text-muted-foreground hover:border-teal hover:text-navy"
                          }`}
                        >
                          {PROSTHETIC_STAGE_LABELS[st]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
