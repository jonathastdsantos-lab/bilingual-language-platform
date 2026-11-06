import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  Filter,
  Plus,
  Printer,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  buildTissPrintableHtml,
  calculateTissBillingSummary,
  createTissGuide,
  deleteTissGuide,
  generateTissXmlBatch,
  getTissGlosaAppeals,
  getTissSettings,
  recordTissGlosaAppeal,
  saveTissSettings,
  TISS_GLOSA_REASONS,
  TISS_GUIDE_STATUS_LABELS,
  TISS_GUIDE_TYPE_LABELS,
  TUSS_ODONTO_CATALOG,
  triggerTissXmlDownload,
  updateTissGuideStatus,
  validateGuidesForXmlBatch,
  type TissGlosaAppeal,
  type TissSettings,
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

interface PendingGuideItem {
  tuss_code: string;
  description: string;
  tooth_number?: number | null;
  tooth_surface?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
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

  // Configurações do Módulo TISS
  const [settings, setSettings] = useState<TissSettings>(() => getTissSettings(clinicId));
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [glosaModalOpen, setGlosaModalOpen] = useState(false);
  const [activeGlosaGuide, setActiveGlosaGuide] = useState<TissGuide | null>(null);

  // Filtros de Listagem
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInsuranceFilter, setSelectedInsuranceFilter] = useState("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all");

  // Estado do Formulário de Criação
  const [showForm, setShowForm] = useState(false);
  const [patientId, setPatientId] = useState(patients[0]?.id ?? "");
  const [insuranceId, setInsuranceId] = useState(insurances[0]?.id ?? "");
  const [professionalId, setProfessionalId] = useState(professionals[0]?.id ?? "");
  const [guideNumber, setGuideNumber] = useState(
    () => `GTO-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`
  );
  const [authCode, setAuthCode] = useState("");
  const [guideType, setGuideType] = useState<TissGuideType>("treatment");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiration, setCardExpiration] = useState("");
  const [cnsNumber, setCnsNumber] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  // Lista de Procedimentos TUSS adicionados à nova guia
  const [guideItems, setGuideItems] = useState<PendingGuideItem[]>([
    {
      tuss_code: "81000030",
      description: "Consulta odontológica inicial / Exame clínico",
      quantity: 1,
      unit_price: 90.0,
      total_price: 90.0,
    },
  ]);

  // Item em edição no formulário
  const [selectedTussCatalogCode, setSelectedTussCatalogCode] = useState("81000030");
  const [customTussCode, setCustomTussCode] = useState("81000030");
  const [customProcDesc, setCustomProcDesc] = useState("Consulta odontológica inicial / Exame clínico");
  const [toothNumber, setToothNumber] = useState("");
  const [toothSurface, setToothSurface] = useState("");
  const [itemQuantity, setItemQuantity] = useState("1");
  const [itemUnitPrice, setItemUnitPrice] = useState("90.00");

  // Estado do Modal de Glosa
  const [glosaReasonCode, setGlosaReasonCode] = useState(TISS_GLOSA_REASONS[0]?.code ?? "1001");
  const [glosaCustomReason, setGlosaCustomReason] = useState(TISS_GLOSA_REASONS[0]?.description ?? "");
  const [glosaAmount, setGlosaAmount] = useState("");
  const [glosaAppealText, setGlosaAppealText] = useState("");

  // Estado do Modal de Exportação XML
  const [exportInsuranceId, setExportInsuranceId] = useState("all");
  const [markAsBilledOnDownload, setMarkAsBilledOnDownload] = useState(
    settings.switches.autoMarkBilledOnXmlExport
  );

  // Atualiza item em edição ao selecionar do catálogo TUSS
  const handleSelectCatalogItem = (code: string) => {
    setSelectedTussCatalogCode(code);
    const item = TUSS_ODONTO_CATALOG.find((p) => p.code === code);
    if (item) {
      setCustomTussCode(item.code);
      setCustomProcDesc(item.description);
      setItemUnitPrice(item.defaultPrice.toFixed(2));
    }
  };

  // Adiciona procedimento à lista da guia
  const handleAddItemToGuide = () => {
    if (!customTussCode.trim() || !customProcDesc.trim()) {
      toast.error("Informe código e descrição do procedimento TUSS.");
      return;
    }

    const q = parseInt(itemQuantity, 10) || 1;
    const up = parseFloat(itemUnitPrice.replace(",", ".")) || 0;
    const tPrice = Number((q * up).toFixed(2));

    const newItem: PendingGuideItem = {
      tuss_code: customTussCode.trim(),
      description: customProcDesc.trim(),
      tooth_number: toothNumber ? parseInt(toothNumber, 10) : null,
      tooth_surface: toothSurface.trim() || null,
      quantity: q,
      unit_price: up,
      total_price: tPrice,
    };

    setGuideItems((prev) => [...prev, newItem]);
    setToothNumber("");
    setToothSurface("");
    toast.success("Procedimento adicionado à guia!");
  };

  const handleRemoveItemFromGuide = (index: number) => {
    setGuideItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalCalculatedGuideAmount = useMemo(() => {
    return guideItems.reduce((acc, it) => acc + it.total_price, 0);
  }, [guideItems]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async () => {
      if (guideItems.length === 0) {
        throw new Error("Adicione ao menos um procedimento TUSS à guia.");
      }

      await createTissGuide(clinicId, {
        patient_id: patientId,
        insurance_id: insuranceId,
        professional_id: professionalId || null,
        guide_number: guideNumber,
        auth_code: authCode || null,
        guide_type: guideType,
        status: "draft",
        card_number: cardNumber,
        card_expiration: cardExpiration || null,
        cns_number: cnsNumber || null,
        issue_date: issueDate,
        notes: notes || null,
        items: guideItems.map((it) => ({
          tuss_code: it.tuss_code,
          description: it.description,
          tooth_number: it.tooth_number ?? null,
          tooth_surface: it.tooth_surface ?? null,
          quantity: it.quantity,
          unit_price: it.unit_price,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tissGuides", clinicId] });
      toast.success("Guia TISS GTO emitida com sucesso.");
      setShowForm(false);
      setGuideNumber(`GTO-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`);
      setAuthCode("");
      setCardNumber("");
      setCardExpiration("");
      setGuideItems([
        {
          tuss_code: "81000030",
          description: "Consulta odontológica inicial / Exame clínico",
          quantity: 1,
          unit_price: 90.0,
          total_price: 90.0,
        },
      ]);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao emitir Guia TISS.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (params: { guideId: string; nextStatus: TissGuideStatus; glosedAmount?: number | undefined }) => {
      await updateTissGuideStatus(
        clinicId,
        params.guideId,
        params.nextStatus,
        params.glosedAmount !== undefined ? { glosedAmount: params.glosedAmount } : undefined,
      );
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

  // Salvar preferências
  const handleSaveSettings = (updates: Partial<TissSettings>) => {
    const saved = saveTissSettings(clinicId, updates);
    setSettings(saved);
    toast.success("Configurações TISS atualizadas com sucesso!");
    setSettingsModalOpen(false);
  };

  // Abrir modal de glosa
  const handleOpenGlosaModal = (guide: TissGuide) => {
    setActiveGlosaGuide(guide);
    setGlosaAmount(String(guide.glosed_amount > 0 ? guide.glosed_amount : guide.total_amount));
    setGlosaAppealText("");
    setGlosaModalOpen(true);
  };

  // Confirmar registro e recurso de glosa
  const handleConfirmGlosaAppeal = async () => {
    if (!activeGlosaGuide) return;
    const gAmount = parseFloat(glosaAmount.replace(",", ".")) || Number(activeGlosaGuide.total_amount);

    try {
      await statusMutation.mutateAsync({
        guideId: activeGlosaGuide.id,
        nextStatus: "glosed",
        glosedAmount: gAmount,
      });

      if (glosaAppealText.trim()) {
        recordTissGlosaAppeal(clinicId, {
          guideId: activeGlosaGuide.id,
          guideNumber: activeGlosaGuide.guide_number,
          insuranceName: activeGlosaGuide.dental_insurances?.name || "Convênio",
          glosedAmount: gAmount,
          glosaCode: glosaReasonCode,
          glosaReason: glosaCustomReason,
          appealJustification: glosaAppealText.trim(),
        });
        toast.success("Recurso de glosa registrado com sucesso para envio à operadora!");
      }

      setGlosaModalOpen(false);
      setActiveGlosaGuide(null);
    } catch {
      toast.error("Erro ao registrar glosa.");
    }
  };

  // Filtro de guias na visualização
  const filteredGuides = useMemo(() => {
    return guides.filter((g) => {
      if (selectedInsuranceFilter !== "all" && g.insurance_id !== selectedInsuranceFilter) {
        return false;
      }
      if (selectedStatusFilter !== "all" && g.status !== selectedStatusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const num = g.guide_number.toLowerCase();
        const pac = g.patients?.full_name?.toLowerCase() || "";
        const card = g.card_number.toLowerCase();
        if (!num.includes(q) && !pac.includes(q) && !card.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [guides, selectedInsuranceFilter, selectedStatusFilter, searchQuery]);

  // Guias elegíveis para exportação no modal
  const exportTargetGuides = useMemo(() => {
    return guides.filter((g) => {
      if (exportInsuranceId !== "all" && g.insurance_id !== exportInsuranceId) {
        return false;
      }
      // Inclui guias autorizadas ou faturadas
      return g.status === "authorized" || g.status === "billed" || g.status === "draft";
    });
  }, [guides, exportInsuranceId]);

  const exportValidation = useMemo(() => {
    return validateGuidesForXmlBatch(exportTargetGuides, settings);
  }, [exportTargetGuides, settings]);

  // Executa geração e download do XML
  const handleDownloadXmlBatch = async () => {
    if (!exportValidation.isValid) {
      toast.error("Corrija as inconsistências antes de exportar o lote XML.");
      return;
    }

    const targetInsurance = insurances.find((i) => i.id === exportInsuranceId);
    const insuranceName = targetInsurance?.name || "Operadora Odontológica";
    const ansCode = targetInsurance?.ans_code || "000000";

    const xmlContent = generateTissXmlBatch({
      clinicName,
      cnes: settings.cnesNumber,
      tissVersion: settings.tissVersion,
      insuranceName,
      ansCode,
      guides: exportTargetGuides,
    });

    const fileName = `tiss_${ansCode}_lote_${new Date().toISOString().slice(0, 10)}.xml`;
    triggerTissXmlDownload(xmlContent, fileName);
    toast.success(`Lote XML TISS baixado com sucesso: ${fileName}`);

    // Se a opção de marcar como faturadas estiver ativa
    if (markAsBilledOnDownload) {
      for (const g of exportTargetGuides) {
        if (g.status === "authorized" || g.status === "draft") {
          await updateTissGuideStatus(clinicId, g.id, "billed");
        }
      }
      qc.invalidateQueries({ queryKey: ["tissGuides", clinicId] });
      toast.info("Guias do lote atualizadas para status Faturada!");
    }

    setExportModalOpen(false);
  };

  const handlePrint = (guide: TissGuide) => {
    const html = buildTissPrintableHtml({ clinicName, guide });
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Permita pop-ups no navegador para imprimir a Guia TISS.");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* BANNER DO MÓDULO & SWITCHES DE CONTROLE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border-2 border-teal/20 bg-gradient-to-r from-teal/10 via-white to-slate-50 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal text-white shadow-md">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-navy">
                Faturamento TISS para Convênios Odontológicos
              </h3>
              <Badge className={settings.switches.enableTissModule ? "bg-teal text-white" : "bg-slate-200 text-slate-700"}>
                {settings.switches.enableTissModule ? "Módulo Ativo" : "Módulo Pausado"}
              </Badge>
              <Badge variant="outline" className="border-teal/30 text-teal text-[10px] font-mono">
                ANS {settings.tissVersion} · CNES: {settings.cnesNumber}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              GTO eletrônica, procedimentos TUSS, validação de dentes FDI, exportação de lote XML e gestão de recursos de glosas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 shadow-xs">
            <span className="text-xs font-semibold text-slate-700">Faturamento TISS:</span>
            <Switch
              checked={settings.switches.enableTissModule}
              onCheckedChange={(checked) =>
                handleSaveSettings({
                  switches: { ...settings.switches, enableTissModule: checked },
                })
              }
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSettingsModalOpen(true)}
            className="rounded-xl gap-2 font-bold"
          >
            <Settings className="h-4 w-4" />
            Configurar CNES
          </Button>
        </div>
      </div>

      {/* KPIS DE FATURAMENTO TISS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Faturado em Lote (Enviado)</span>
            <Clock className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-navy">
            {formatCurrencyBRL(summary.totalBilledAmount)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {summary.billedCount} guia(s) aguardando liquidação da operadora
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Recebido / Liquidado</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-emerald-600">
            {formatCurrencyBRL(summary.totalPaidAmount)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {summary.paidCount} guia(s) pagas com sucesso
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
            <FileSpreadsheet className="h-4 w-4 text-teal" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-navy">{summary.totalGuides}</p>
          <p className="text-[11px] text-muted-foreground">
            {summary.authorizedCount} autorizada(s) · {summary.draftCount} rascunho(s)
          </p>
        </div>
      </div>

      {/* BARRA DE AÇÕES, BUSCA E FILTROS */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-card">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por Nº da Guia, paciente ou carteirinha..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl"
            />
          </div>

          <select
            value={selectedInsuranceFilter}
            onChange={(e) => setSelectedInsuranceFilter(e.target.value)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs"
          >
            <option value="all">Todos os Convênios</option>
            {insurances.map((ins) => (
              <option key={ins.id} value={ins.id}>
                {ins.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs"
          >
            <option value="all">Todos os Status</option>
            <option value="draft">Rascunho</option>
            <option value="authorized">Autorizada</option>
            <option value="billed">Faturada / Lote</option>
            <option value="paid">Paga / Liquidada</option>
            <option value="glosed">Glosada</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExportModalOpen(true)}
            className="rounded-xl gap-2 font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            <FileCode className="h-4 w-4" />
            Exportar Lote XML (ANS)
          </Button>

          {canWrite && (
            <Button
              type="button"
              variant={showForm ? "outline" : "default"}
              size="sm"
              onClick={() => setShowForm((v) => !v)}
              className="rounded-xl gap-2 font-bold bg-teal hover:bg-teal-600 text-white"
            >
              <Plus className="h-4 w-4" />
              {showForm ? "Fechar Formulário" : "Nova Guia TISS (GTO)"}
            </Button>
          )}
        </div>
      </div>

      {/* FORMULÁRIO DE NOVA GUIA TISS (GTO) */}
      {showForm && canWrite && (
        <div className="space-y-4 rounded-3xl border-2 border-teal/20 bg-card p-6 shadow-md">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h4 className="text-base font-extrabold text-navy">
                Emitir Nova Guia de Tratamento Odontológico (GTO — ANS)
              </h4>
              <p className="text-xs text-muted-foreground">
                Preencha os dados do beneficiário e adicione os procedimentos odontológicos com códigos da Tabela TUSS.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
              className="rounded-full h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Paciente Beneficiário *</Label>
              <select
                aria-label="Paciente Beneficiário"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.cpf ?? "Sem CPF"})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Operadora / Convênio *</Label>
              <select
                aria-label="Operadora Convênio"
                value={insuranceId}
                onChange={(e) => setInsuranceId(e.target.value)}
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                {insurances.map((ins) => (
                  <option key={ins.id} value={ins.id}>
                    {ins.name} {ins.ans_code ? `(Registro ANS ${ins.ans_code})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Cirurgião-Dentista Solicitante</Label>
              <select
                aria-label="Cirurgião-Dentista Solicitante"
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                <option value="">Clínica Geral</option>
                {professionals.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name} {pr.cro ? `(${pr.cro})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Número da Guia *</Label>
              <Input
                value={guideNumber}
                onChange={(e) => setGuideNumber(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Número da Carteirinha *</Label>
              <Input
                placeholder="Ex.: 998877665544"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Validade da Carteirinha</Label>
              <Input
                type="date"
                value={cardExpiration}
                onChange={(e) => setCardExpiration(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Senha de Autorização (Token)</Label>
              <Input
                placeholder="Ex.: AUT-8877"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Tipo de Atendimento</Label>
              <select
                aria-label="Tipo de Atendimento"
                value={guideType}
                onChange={(e) => setGuideType(e.target.value as TissGuideType)}
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                <option value="treatment">GTO — Tratamento Odontológico</option>
                <option value="initial_exam">Exame Inicial / Avaliação</option>
                <option value="urgency">Atendimento de Urgência</option>
              </select>
            </div>
          </div>

          {/* BUILDER DE PROCEDIMENTOS TUSS */}
          <div className="rounded-2xl border bg-slate-50 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-xs font-extrabold uppercase text-navy">
                  Procedimentos Odontológicos Realizados (Tabela TUSS)
                </h5>
                <p className="text-[11px] text-muted-foreground">
                  Selecione os procedimentos efetuados na consulta para inclusão na GTO oficial.
                </p>
              </div>
              <Badge variant="outline" className="bg-white border-teal/30 text-teal font-bold">
                {guideItems.length} procedimento(s) adicionado(s)
              </Badge>
            </div>

            {/* Linha de Adição de Procedimento */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end bg-white p-3 rounded-xl border shadow-xs">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-[11px] font-bold text-slate-700">Catálogo TUSS Frequente</Label>
                <select
                  value={selectedTussCatalogCode}
                  onChange={(e) => handleSelectCatalogItem(e.target.value)}
                  className="flex h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
                >
                  {TUSS_ODONTO_CATALOG.map((item) => (
                    <option key={item.code} value={item.code}>
                      [{item.code}] {item.description} ({item.category})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-[11px] font-bold text-slate-700">Descrição Personalizada</Label>
                <Input
                  value={customProcDesc}
                  onChange={(e) => setCustomProcDesc(e.target.value)}
                  className="h-8 text-xs rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">Dente / Face</Label>
                <div className="flex gap-1">
                  <Input
                    placeholder="Dente"
                    value={toothNumber}
                    onChange={(e) => setToothNumber(e.target.value)}
                    className="h-8 text-xs rounded-lg w-1/2"
                  />
                  <Input
                    placeholder="Face"
                    value={toothSurface}
                    onChange={(e) => setToothSurface(e.target.value)}
                    className="h-8 text-xs rounded-lg w-1/2"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">Valor Unit. (R$)</Label>
                <div className="flex gap-1.5">
                  <Input
                    value={itemUnitPrice}
                    onChange={(e) => setItemUnitPrice(e.target.value)}
                    className="h-8 text-xs rounded-lg"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddItemToGuide}
                    className="h-8 px-2.5 bg-teal hover:bg-teal-600 text-white font-bold"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Lista de Procedimentos Adicionados */}
            {guideItems.length > 0 && (
              <div className="rounded-xl border bg-white overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b">
                    <tr>
                      <th className="py-2 px-3 font-bold">Código TUSS</th>
                      <th className="py-2 px-3 font-bold">Descrição</th>
                      <th className="py-2 px-3 font-bold">Dente FDI</th>
                      <th className="py-2 px-3 font-bold">Face</th>
                      <th className="py-2 px-3 font-bold text-center">Qtd.</th>
                      <th className="py-2 px-3 font-bold text-right">Vl. Unit.</th>
                      <th className="py-2 px-3 font-bold text-right">Vl. Total</th>
                      <th className="py-2 px-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {guideItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-bold text-teal">{item.tuss_code}</td>
                        <td className="py-2 px-3">{item.description}</td>
                        <td className="py-2 px-3">{item.tooth_number ? `Dente ${item.tooth_number}` : "—"}</td>
                        <td className="py-2 px-3">{item.tooth_surface || "—"}</td>
                        <td className="py-2 px-3 text-center">{item.quantity}</td>
                        <td className="py-2 px-3 text-right">R$ {item.unit_price.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-bold text-navy">
                          R$ {item.total_price.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItemFromGuide(idx)}
                            className="text-slate-400 hover:text-destructive p-1 rounded-md"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-xs text-muted-foreground">
                O total é recalculado automaticamente a cada item inserido.
              </span>
              <div className="text-right">
                <span className="text-xs font-semibold text-slate-600 mr-2">Total da Guia:</span>
                <span className="text-base font-extrabold text-navy">
                  R$ {totalCalculatedGuideAmount.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowForm(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={createMutation.isPending || guideItems.length === 0}
              onClick={() => createMutation.mutate()}
              className="rounded-xl bg-teal hover:bg-teal-600 text-white font-bold"
            >
              {createMutation.isPending ? "Emitindo Guia..." : "Emitir Guia TISS"}
            </Button>
          </div>
        </div>
      )}

      {/* LISTAGEM DE GUIAS TISS */}
      {filteredGuides.length === 0 ? (
        <div className="rounded-3xl border border-dashed bg-card p-12 text-center">
          <FileText className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-bold text-navy">Nenhuma Guia TISS encontrada</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cadastre os convênios atendidos pela clínica e emita guias de faturamento direto no padrão ANS.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGuides.map((guide) => (
            <div key={guide.id} className="rounded-3xl border bg-card p-5 shadow-sm space-y-4 hover:shadow-md transition">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold text-navy font-mono">
                      {guide.guide_number}
                    </span>
                    <Badge variant="outline" className="bg-navy/5 text-navy border-navy/20 font-bold">
                      {guide.dental_insurances?.name ?? "Convênio"}
                    </Badge>
                    <span className={`rounded-lg border px-2.5 py-0.5 text-xs font-bold ${STATUS_BADGE_STYLES[guide.status]}`}>
                      {TISS_GUIDE_STATUS_LABELS[guide.status]}
                    </span>
                    {guide.auth_code && (
                      <Badge className="bg-teal/15 text-teal border-teal/20 font-bold text-xs">
                        Senha: {guide.auth_code}
                      </Badge>
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
                    className="rounded-xl gap-1.5 text-xs"
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
                      className="text-destructive hover:bg-destructive/10 rounded-full h-8 w-8 p-0"
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
                <div className="rounded-2xl bg-slate-50 p-3 text-xs border">
                  <div className="grid gap-1.5">
                    {guide.items.map((it) => (
                      <div key={it.id} className="flex justify-between items-center text-slate-700">
                        <span>
                          <b className="font-mono text-teal font-bold">{it.tuss_code}</b> — {it.description}
                          {it.tooth_number ? ` (Dente FDI: ${it.tooth_number})` : ""}
                          {it.tooth_surface ? ` [Face: ${it.tooth_surface}]` : ""}
                        </span>
                        <span className="font-bold text-navy">
                          {formatCurrencyBRL(Number(it.total_price) || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ações de Transição de Status e Recursos */}
              {canWrite && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-muted-foreground mr-1">Status:</span>
                    {(["draft", "authorized", "billed", "paid"] as TissGuideStatus[]).map((st) => (
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

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={guide.status === "glosed" ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => handleOpenGlosaModal(guide)}
                      className="rounded-xl text-xs h-7 gap-1.5"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {guide.status === "glosed" ? "Recorrer da Glosa" : "Registrar Glosa"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MODAL: EXPORTAR LOTE XML TISS (ANS) */}
      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-navy">
              <FileCode className="h-5 w-5 text-indigo-600" />
              <span>Exportar Lote Eletrônico TISS (XML — Padrão ANS)</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Filtrar Convênio para o Lote</Label>
              <select
                value={exportInsuranceId}
                onChange={(e) => setExportInsuranceId(e.target.value)}
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                <option value="all">Todos os Convênios ({guides.length} guias)</option>
                {insurances.map((ins) => (
                  <option key={ins.id} value={ins.id}>
                    {ins.name} {ins.ans_code ? `(ANS ${ins.ans_code})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Painel de Validação Prévia */}
            <div className="rounded-2xl border bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-navy">Validação Prévia das Guias:</span>
                {exportValidation.isValid ? (
                  <Badge className="bg-emerald-500/15 text-emerald-800 font-bold text-[10px]">
                    Lote Válido para Transmissão
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="font-bold text-[10px]">
                    {exportValidation.errors.length} Inconsistência(s)
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white p-2.5 rounded-xl border">
                  <span className="text-muted-foreground block text-[10px]">Guias no Lote</span>
                  <span className="text-base font-bold text-navy">{exportValidation.guideCount}</span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border">
                  <span className="text-muted-foreground block text-[10px]">Valor Total do Lote</span>
                  <span className="text-base font-bold text-teal">
                    {formatCurrencyBRL(exportValidation.totalBatchValue)}
                  </span>
                </div>
              </div>

              {exportValidation.errors.length > 0 && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Bloqueios encontrados:</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    {exportValidation.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {exportValidation.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span>Avisos recomendados:</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    {exportValidation.warnings.map((warn, i) => (
                      <li key={i}>{warn}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={markAsBilledOnDownload}
                onCheckedChange={setMarkAsBilledOnDownload}
              />
              <Label className="text-xs font-semibold text-slate-700">
                Marcar automaticamente as guias deste lote como "Faturadas / Enviadas"
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setExportModalOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!exportValidation.isValid || exportValidation.guideCount === 0}
              onClick={handleDownloadXmlBatch}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2"
            >
              <Download className="h-4 w-4" />
              Baixar Arquivo XML TISS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: GESTÃO & RECURSO DE GLOSA */}
      <Dialog open={glosaModalOpen} onOpenChange={setGlosaModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              <span>Contestação & Recurso de Glosa — Guia {activeGlosaGuide?.guide_number}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Motivo da Glosa (Código ANS) *</Label>
              <select
                value={glosaReasonCode}
                onChange={(e) => {
                  setGlosaReasonCode(e.target.value);
                  const reason = TISS_GLOSA_REASONS.find((r) => r.code === e.target.value);
                  if (reason) setGlosaCustomReason(reason.description);
                }}
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                {TISS_GLOSA_REASONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    [{r.code}] {r.description} ({r.category})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Valor Glosado pela Operadora (R$) *</Label>
              <Input
                value={glosaAmount}
                onChange={(e) => setGlosaAmount(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">
                Justificativa Técnica para o Recurso de Glosa
              </Label>
              <Textarea
                rows={3}
                placeholder="Ex.: Radiografia periapical comprobatória em anexo. Procedimento realizado conforme diretrizes clínicas e autorização concedida em 10/10."
                value={glosaAppealText}
                onChange={(e) => setGlosaAppealText(e.target.value)}
                className="text-xs rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setGlosaModalOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmGlosaAppeal}
              className="rounded-xl bg-destructive hover:bg-destructive/90 text-white font-bold"
            >
              Confirmar Glosa & Salvar Recurso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: CONFIGURAÇÕES DO MÓDULO TISS & CNES */}
      <Dialog open={settingsModalOpen} onOpenChange={setSettingsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-navy">
              <Settings className="h-5 w-5 text-teal" />
              <span>Configurações TISS & Estabelecimento de Saúde</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">CNES da Clínica *</Label>
              <Input
                value={settings.cnesNumber}
                onChange={(e) => setSettings((s) => ({ ...s, cnesNumber: e.target.value }))}
                placeholder="Ex.: 7891234"
                className="h-9 text-xs rounded-xl"
              />
              <span className="text-[10px] text-muted-foreground">
                Cadastro Nacional de Estabelecimentos de Saúde da clínica junto ao Ministério da Saúde.
              </span>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Versão Padrão TISS da ANS</Label>
              <select
                value={settings.tissVersion}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    tissVersion: e.target.value as "v3.05.00" | "v4.01.00",
                  }))
                }
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
              >
                <option value="v4.01.00">Padrão TISS v4.01.00 (Mais Recente)</option>
                <option value="v3.05.00">Padrão TISS v3.05.00 (Legado)</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Código do Prestador Padrão</Label>
              <Input
                value={settings.providerCodeInInsurance}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, providerCodeInInsurance: e.target.value }))
                }
                placeholder="Ex.: 0012984"
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Alerta de Carteirinha Expirada
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Avisa antes de emitir caso a carteira do beneficiário esteja vencida.
                  </span>
                </div>
                <Switch
                  checked={settings.switches.enableCardExpirationAlert}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({
                      ...s,
                      switches: { ...s.switches, enableCardExpirationAlert: checked },
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Exigir Dente (FDI) em Restaurações
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Impede emissão de restaurações sem dente informado para evitar glosas.
                  </span>
                </div>
                <Switch
                  checked={settings.switches.requireToothOnRestorations}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({
                      ...s,
                      switches: { ...s.switches, requireToothOnRestorations: checked },
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettingsModalOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => handleSaveSettings(settings)}
              className="rounded-xl bg-teal hover:bg-teal-600 text-white font-bold"
            >
              Salvar Configurações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
