import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  FileSpreadsheet,
  FileText,
  Plus,
  Printer,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildTissPrintableHtml,
  calculateTissBillingSummary,
  createTissGuide,
  deleteTissGuide,
  TISS_GUIDE_STATUS_LABELS,
  TISS_GUIDE_TYPE_LABELS,
  updateTissGuideStatus,
} from "@/modules/tiss";
import type { DentalInsurance, TissGuide, TissGuideStatus, TissGuideType } from "@/types";
import { formatCurrencyBRL } from "@/utils/timezone";

interface TissPatientOption {
  id: string;
  full_name: string;
  cpf?: string | null;
}

interface TissProfessionalOption {
  id: string;
  name: string;
  cro?: string | null;
}

interface TissGuidesPanelProps {
  clinicId: string;
  clinicName: string;
  guides: TissGuide[];
  insurances: DentalInsurance[];
  patients: TissPatientOption[];
  professionals: TissProfessionalOption[];
  canWrite: boolean;
}

const STATUS_BADGE_STYLES: Record<TissGuideStatus, string> = {
  draft: "border-slate-300 bg-slate-100 text-slate-800",
  authorized: "border-sky-300 bg-sky-500/10 text-sky-800",
  billed: "border-indigo-300 bg-indigo-500/10 text-indigo-800",
  paid: "border-emerald-300 bg-emerald-500/10 text-emerald-800",
  glosed: "border-destructive/40 bg-destructive/15 text-destructive",
  cancelled: "border-muted bg-muted text-muted-foreground",
};

export function TissGuidesPanel({
  clinicId,
  clinicName,
  guides,
  insurances,
  patients,
  professionals,
  canWrite,
}: TissGuidesPanelProps) {
  const qc = useQueryClient();
  const summary = useMemo(() => calculateTissBillingSummary(guides), [guides]);

  const [showForm, setShowForm] = useState(false);
  const [patientId, setPatientId] = useState(patients[0]?.id ?? "");
  const [insuranceId, setInsuranceId] = useState(insurances[0]?.id ?? "");
  const [professionalId, setProfessionalId] = useState(professionals[0]?.id ?? "");
  const [guideNumber, setGuideNumber] = useState(
    () => `GTO-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
  );
  const [authCode, setAuthCode] = useState("");
  const [guideType, setGuideType] = useState<TissGuideType>("treatment");
  const [cardNumber, setCardNumber] = useState("");
  const [cnsNumber, setCnsNumber] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Procedimento inicial TUSS
  const [tussCode, setTussCode] = useState("81000030");
  const [procDesc, setProcDesc] = useState("Consulta odontológica inicial");
  const [toothNumber, setToothNumber] = useState("");
  const [toothSurface, setToothSurface] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("120.00");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const q = parseInt(quantity, 10) || 1;
      const up = parseFloat(unitPrice.replace(",", ".")) || 0;
      await createTissGuide(clinicId, {
        patient_id: patientId,
        insurance_id: insuranceId,
        professional_id: professionalId || null,
        guide_number: guideNumber,
        auth_code: authCode || null,
        guide_type: guideType,
        status: "draft",
        card_number: cardNumber,
        cns_number: cnsNumber || null,
        issue_date: issueDate,
        notes: notes || null,
        items: [
          {
            tuss_code: tussCode,
            description: procDesc,
            tooth_number: toothNumber ? parseInt(toothNumber, 10) : null,
            tooth_surface: toothSurface || null,
            quantity: q,
            unit_price: up,
          },
        ],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tissGuides", clinicId] });
      toast.success("Guia TISS GTO emitida com sucesso.");
      setShowForm(false);
      setGuideNumber(`GTO-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`);
      setAuthCode("");
      setCardNumber("");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao emitir Guia TISS.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (params: { guideId: string; nextStatus: TissGuideStatus }) => {
      await updateTissGuideStatus(clinicId, params.guideId, params.nextStatus);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tissGuides", clinicId] });
      toast.success("Status da Guia TISS atualizado.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar status da guia.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (guideId: string) => {
      await deleteTissGuide(clinicId, guideId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tissGuides", clinicId] });
      toast.success("Guia TISS excluída.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir guia.");
    },
  });

  const handlePrint = (guide: TissGuide) => {
    const popup = window.open("", "_blank", "width=860,height=760");
    if (!popup) {
      toast.error("Permita pop-ups no navegador para imprimir a Guia TISS.");
      return;
    }
    const html = buildTissPrintableHtml({ clinicName, guide });
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  };

  return (
    <div className="space-y-6">
      {/* KPIs do Faturamento TISS */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Guias em Faturamento</span>
            <FileSpreadsheet className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-navy">{summary.billedCount}</p>
          <p className="text-[11px] text-muted-foreground">
            Total a receber: {formatCurrencyBRL(summary.totalBilledAmount)}
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Guias Liquidadas / Pagas</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-emerald-700">{formatCurrencyBRL(summary.totalPaidAmount)}</p>
          <p className="text-[11px] text-muted-foreground">
            {summary.paidCount} guia(s) recebida(s) de convênios
          </p>
        </div>

        <div
          className={`rounded-2xl border p-4 shadow-card ${
            summary.glosedCount > 0 ? "border-destructive/40 bg-destructive/5" : "bg-card"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Glosas de Convênio</span>
            <ShieldAlert className={`h-4 w-4 ${summary.glosedCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </div>
          <p className={`mt-1.5 text-2xl font-extrabold ${summary.glosedCount > 0 ? "text-destructive" : "text-navy"}`}>
            {formatCurrencyBRL(summary.totalGlosedAmount)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {summary.glosedCount} guia(s) com contestação pendente
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Total de Guias Emitidas</span>
            <Building2 className="h-4 w-4 text-teal" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-navy">{summary.totalGuides}</p>
          <p className="text-[11px] text-muted-foreground">
            {summary.authorizedCount} autorizada(s) · {summary.draftCount} rascunho(s)
          </p>
        </div>
      </div>

      {/* Header e Ação Nova Guia */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-card">
        <div>
          <h3 className="text-sm font-extrabold text-navy">
            Guias TISS / Faturamento de Convênios Odontológicos (GTO — ANS)
          </h3>
          <p className="text-xs text-muted-foreground">
            Emissão de Guias de Tratamento Odontológico padrão ANS com código TUSS, dente/face e controle de faturamento e glosas.
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
            {showForm ? "Fechar Formulário" : "Nova Guia TISS (GTO)"}
          </Button>
        )}
      </div>

      {/* Formulário de Nova Guia TISS */}
      {showForm && canWrite && (
        <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
          <h4 className="text-sm font-extrabold text-navy">
            Emitir Nova Guia de Tratamento Odontológico (GTO)
          </h4>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Paciente Beneficiário *</Label>
              <select
                aria-label="Paciente Beneficiário"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.cpf ?? "Sem CPF"})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Operadora / Convênio *</Label>
              <select
                aria-label="Operadora Convênio"
                value={insuranceId}
                onChange={(e) => setInsuranceId(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                {insurances.map((ins) => (
                  <option key={ins.id} value={ins.id}>
                    {ins.name} {ins.ans_code ? `(ANS ${ins.ans_code})` : ""}
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
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                <option value="">Clínica Geral</option>
                {professionals.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Número da Guia *</Label>
              <Input value={guideNumber} onChange={(e) => setGuideNumber(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Número da Carteirinha *</Label>
              <Input
                placeholder="Ex.: 998877665544"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Senha de Autorização (Token)</Label>
              <Input
                placeholder="Ex.: AUT-8877"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de Atendimento</Label>
              <select
                aria-label="Tipo de Atendimento"
                value={guideType}
                onChange={(e) => setGuideType(e.target.value as TissGuideType)}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                <option value="treatment">GTO — Tratamento Odontológico</option>
                <option value="initial_exam">Exame Inicial</option>
                <option value="urgency">Urgência</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Data de Emissão *</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
            <span className="text-xs font-extrabold uppercase text-navy">Procedimento TUSS Principal</span>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1">
                <Label className="text-[11px]">Código TUSS *</Label>
                <Input value={tussCode} onChange={(e) => setTussCode(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-[11px]">Descrição *</Label>
                <Input value={procDesc} onChange={(e) => setProcDesc(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Dente FDI / Face</Label>
                <div className="flex gap-1.5">
                  <Input placeholder="Dente" value={toothNumber} onChange={(e) => setToothNumber(e.target.value)} />
                  <Input placeholder="Face" value={toothSurface} onChange={(e) => setToothSurface(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Valor Acordado (R$)</Label>
                <Input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Emitindo Guia..." : "Salvar Guia TISS"}
            </Button>
          </div>
        </div>
      )}

      {/* Listagem de Guias TISS */}
      {guides.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-bold text-navy">Nenhuma Guia TISS emitida ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cadastre os convênios atendidos pela clínica e emita guias de faturamento direto no padrão ANS.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {guides.map((guide) => (
            <div key={guide.id} className="rounded-2xl border bg-card p-4 shadow-card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold text-navy">
                      {guide.guide_number}
                    </span>
                    <span className="rounded-lg bg-navy/10 px-2 py-0.5 text-xs font-bold text-navy">
                      {guide.dental_insurances?.name ?? "Convênio"}
                    </span>
                    <span className={`rounded-lg border px-2.5 py-0.5 text-xs font-bold ${STATUS_BADGE_STYLES[guide.status]}`}>
                      {TISS_GUIDE_STATUS_LABELS[guide.status]}
                    </span>
                    {guide.auth_code && (
                      <span className="rounded-lg bg-teal/15 px-2 py-0.5 text-xs font-bold text-teal">
                        Senha: {guide.auth_code}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    <b>Paciente:</b> {guide.patients?.full_name} · <b>Carteirinha:</b> {guide.card_number} ·{" "}
                    <b>Emissão:</b> {guide.issue_date}
                    {guide.professionals?.name ? ` · Dr(a). ${guide.professionals.name}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-right">
                    <p className="text-xs font-extrabold text-navy">
                      Total: {formatCurrencyBRL(Number(guide.total_amount) || 0)}
                    </p>
                    {guide.status === "glosed" && (
                      <span className="text-[11px] font-bold text-destructive">
                        Glosa: {formatCurrencyBRL(Number(guide.glosed_amount) || 0)}
                      </span>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handlePrint(guide)}
                    title="Imprimir Guia GTO Oficial ANS"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimir GTO
                  </Button>

                  {canWrite && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(guide.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Procedimentos da Guia */}
              {guide.items && guide.items.length > 0 && (
                <div className="rounded-xl bg-muted/30 p-2.5 text-xs">
                  <div className="grid gap-1">
                    {guide.items.map((it) => (
                      <div key={it.id} className="flex justify-between items-center text-slate-700">
                        <span>
                          <b className="font-mono">{it.tuss_code}</b> — {it.description}
                          {it.tooth_number ? ` (Dente ${it.tooth_number})` : ""}
                        </span>
                        <span className="font-bold">{formatCurrencyBRL(Number(it.total_price) || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ações de Transição de Status do Faturamento */}
              {canWrite && (
                <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
                  <span className="text-[11px] font-bold text-muted-foreground mr-1">Faturamento:</span>
                  {(["draft", "authorized", "billed", "paid", "glosed"] as TissGuideStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      disabled={guide.status === st || statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ guideId: guide.id, nextStatus: st })}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                        guide.status === st
                          ? "border-navy bg-navy text-white"
                          : "border-border bg-background text-muted-foreground hover:border-teal hover:text-navy"
                      }`}
                    >
                      {TISS_GUIDE_STATUS_LABELS[st]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

