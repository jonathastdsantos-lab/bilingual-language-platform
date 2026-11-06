import { useState, useMemo } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Search,
  Filter,
  Download,
  Printer,
  Sliders,
  Settings,
  MessageCircle,
  Users,
  Calendar,
  Layers,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Package,
  FileCheck,
  XCircle,
  HelpCircle,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { StockItem, StockMovement } from "@/types";
import {
  extractAnvisaLots,
  tracePatientsByBatchNumber,
  getAnvisaStockSettings,
  saveAnvisaStockSettings,
  buildAnvisaWhatsAppAlertMessage,
  type AnvisaLotRecord,
  type AnvisaStockSettings,
  type AnvisaPatientTraceRecord,
  type AnvisaSanitaryStatus,
} from "@/modules/stock/anvisa-lots";
import { downloadCsvFile } from "@/modules/reports";
import { buildWhatsAppWebUrl } from "@/modules/whatsapp";

interface AnvisaLotsTraceabilityPanelProps {
  clinicId: string;
  clinicName?: string;
  items: StockItem[];
  movements: StockMovement[];
  patients?: Array<{ id: string; full_name: string }>;
  professionals?: Array<{ id: string; name: string }>;
}

export function AnvisaLotsTraceabilityPanel({
  clinicId,
  clinicName = "SondaPro Dental",
  items = [],
  movements = [],
  patients = [],
  professionals = [],
}: AnvisaLotsTraceabilityPanelProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "critical" | "expired" | "ok">("all");

  // Configurações & Switches Sanitários
  const [settings, setSettings] = useState<AnvisaStockSettings>(() =>
    getAnvisaStockSettings(clinicId)
  );
  const [configOpen, setConfigOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<AnvisaStockSettings>(settings);

  // Modal de Rastreabilidade Reversa de Paciente
  const [selectedLotForTrace, setSelectedLotForTrace] = useState<AnvisaLotRecord | null>(null);

  // Mapas para resolução rápida de nomes de pacientes e dentistas
  const patientsMap = useMemo(() => {
    const map = new Map<string, string>();
    patients.forEach((p) => map.set(p.id, p.full_name));
    return map;
  }, [patients]);

  const professionalsMap = useMemo(() => {
    const map = new Map<string, string>();
    professionals.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [professionals]);

  // Extração e auditoria dos lotes da clínica
  const lots = useMemo(() => {
    return extractAnvisaLots(items, movements);
  }, [items, movements]);

  // Contadores Sanitários
  const expiredLots = useMemo(() => lots.filter((l) => l.status === "expired"), [lots]);
  const criticalLots = useMemo(
    () => lots.filter((l) => l.status === "critical_30d" || l.status === "warning_60d"),
    [lots]
  );
  const regularLots = useMemo(
    () => lots.filter((l) => l.status === "ok" || l.status === "warning_90d"),
    [lots]
  );

  const totalValueAtRisk = useMemo(() => {
    const atRisk = lots.filter((l) => l.status === "expired" || l.status === "critical_30d");
    return atRisk.reduce((acc, l) => acc + l.totalCostInLot, 0);
  }, [lots]);

  // Lotes filtrados
  const filteredLots = useMemo(() => {
    return lots.filter((l) => {
      const term = search.trim().toLowerCase();
      const matchesSearch =
        !term ||
        l.batchNumber.toLowerCase().includes(term) ||
        l.itemName.toLowerCase().includes(term) ||
        (l.supplier || "").toLowerCase().includes(term);

      const matchesCat = categoryFilter === "all" || l.category === categoryFilter;

      let matchesStatus = true;
      if (statusFilter === "critical") {
        matchesStatus = l.status === "critical_30d" || l.status === "warning_60d";
      } else if (statusFilter === "expired") {
        matchesStatus = l.status === "expired";
      } else if (statusFilter === "ok") {
        matchesStatus = l.status === "ok" || l.status === "warning_90d";
      }

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [lots, search, categoryFilter, statusFilter]);

  // Categorias únicas existentes para o filtro
  const categories = useMemo(() => {
    const set = new Set<string>();
    lots.forEach((l) => set.add(l.category));
    return Array.from(set);
  }, [lots]);

  // Pacientes rastreados no lote selecionado
  const tracedPatients: AnvisaPatientTraceRecord[] = useMemo(() => {
    if (!selectedLotForTrace) return [];
    return tracePatientsByBatchNumber(
      movements,
      selectedLotForTrace.batchNumber,
      patientsMap,
      professionalsMap
    );
  }, [selectedLotForTrace, movements, patientsMap, professionalsMap]);

  // Formatação de Dinheiro
  const fmtMoney = (v: number) =>
    Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Salvar Configurações
  const handleSaveSettings = () => {
    const saved = saveAnvisaStockSettings(clinicId, draftSettings);
    setSettings(saved);
    setConfigOpen(false);
    toast.success("Parâmetros e switches sanitários salvos!");
  };

  // Disparo de Alerta no WhatsApp
  const handleSendWhatsAppAlert = () => {
    const phone = settings.responsiblePhone.trim();
    if (!phone) {
      toast.error("Configure o número de WhatsApp da Responsável Técnica nas configurações.");
      setDraftSettings(settings);
      setConfigOpen(true);
      return;
    }

    const message = buildAnvisaWhatsAppAlertMessage(clinicName, settings.responsibleName, lots);
    const url = buildWhatsAppWebUrl(phone, message);
    window.open(url, "_blank");
    toast.success("Relatório de controle de lotes preparado no WhatsApp!");
  };

  // Exportar Livro de Registro Sanitário ANVISA em CSV
  const handleExportAnvisaCsv = () => {
    downloadCsvFile(
      `livro-registro-lotes-anvisa-${clinicName.toLowerCase().replace(/\s+/g, "-")}`,
      [
        "Insumo Odontológico",
        "Categoria",
        "Número do Lote",
        "Registro ANVISA",
        "Fabricante / Fornecedor",
        "Data de Validade",
        "Dias Restantes",
        "Saldo Físico",
        "Unidade",
        "Custo Unitário (BRL)",
        "Valor Total no Lote (BRL)",
        "Status Sanitário ANVISA",
        "Quarentena Ativa",
        "Pacientes Rastreados",
      ],
      filteredLots.map((l) => [
        l.itemName,
        l.category,
        l.batchNumber,
        l.anvisaRegister || "Conforme RDC 63",
        l.supplier || "Não informado",
        l.expirationDate || "Não informada",
        l.daysToExpiration !== null ? l.daysToExpiration : "-",
        l.currentQuantity,
        l.unitMeasure,
        l.unitCost.toFixed(2),
        l.totalCostInLot.toFixed(2),
        l.status === "expired"
          ? "VENCIDO"
          : l.status === "critical_30d"
          ? "CRÍTICO (30 DIAS)"
          : l.status === "warning_60d"
          ? "ATENÇÃO (60 DIAS)"
          : "REGULAR",
        l.isQuarantined ? "SIM" : "NÃO",
        l.usedInPatientsCount,
      ])
    );
    toast.success("Livro de Registro Sanitário exportado em CSV.");
  };

  return (
    <div className="space-y-6">
      {/* HEADER & AÇÕES */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight">
                Gestão Avançada de Lotes & Rastreabilidade ANVISA
              </h2>
              <p className="text-xs text-muted-foreground">
                Controle sanitário PEPS (FIFO), alerta de validades, quarentena e rastreabilidade reversa de pacientes.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => {
              setDraftSettings(settings);
              setConfigOpen(true);
            }}
          >
            <Settings className="h-3.5 w-3.5 text-primary" />
            Configurações & Switches
          </Button>

          {settings.switches.enableWhatsAppExpiryAlerts && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              onClick={handleSendWhatsAppAlert}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Alertar no WhatsApp
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Imprimir
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            className="text-xs gap-1.5 shadow-xs"
            onClick={handleExportAnvisaCsv}
          >
            <Download className="h-3.5 w-3.5" />
            Livro ANVISA (CSV)
          </Button>
        </div>
      </div>

      {/* SEMÁFORO SANITÁRIO (CARDS DE KPI) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* REGULARES */}
        <Card className="shadow-xs border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/20 dark:bg-emerald-950/10">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                Lotes Regulares
              </span>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black font-display text-emerald-700 dark:text-emerald-400">
              {regularLots.length} lotes
            </div>
            <p className="text-[11px] text-muted-foreground">
              Dentro do prazo e aptos para procedimentos.
            </p>
          </CardContent>
        </Card>

        {/* VENCENDO EM 30-60 DIAS */}
        <Card className="shadow-xs border-amber-200/70 dark:border-amber-900/50 bg-amber-50/20 dark:bg-amber-950/10">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Vencem em até 60 Dias
              </span>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black font-display text-amber-700 dark:text-amber-400">
              {criticalLots.length} lotes
            </div>
            <p className="text-[11px] text-muted-foreground">
              Priorizar uso na regra PEPS (Primeiro que Vence).
            </p>
          </CardContent>
        </Card>

        {/* VENCIDOS / QUARENTENA */}
        <Card className="shadow-xs border-rose-200/70 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-950/10">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold text-rose-800 dark:text-rose-300">
                Lotes Vencidos / Quarentena
              </span>
              <ShieldAlert className="h-4 w-4 text-rose-600" />
            </div>
            <div className="text-2xl font-black font-display text-rose-700 dark:text-rose-400">
              {expiredLots.length} lotes
            </div>
            <p className="text-[11px] text-muted-foreground">
              Bloqueados sanitariamente para uso em pacientes.
            </p>
          </CardContent>
        </Card>

        {/* VALOR EM RISCO */}
        <Card className="shadow-xs border-slate-200 dark:border-slate-800">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold">Custo em Risco Sanitário</span>
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-black font-display text-navy dark:text-white">
              {fmtMoney(totalValueAtRisk)}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Total investido em insumos vencidos ou a vencer.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* RECOMENDAÇÃO PEPS (FIFO) */}
      {settings.switches.enableFifoRecommendation && criticalLots.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-500/10 text-amber-950 dark:text-amber-200 shadow-xs">
          <Sparkles className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <span className="font-bold">Recomendação Sanitária PEPS (Primeiro que Expira, Primeiro que Sai):</span>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Existem {criticalLots.length} lotes com vencimento próximo. Oriente os dentistas e assistentes a retirarem os lotes identificados com etiqueta amarela nos consultórios antes de abrir caixas novas, evitando perdas financeiras e infrações sanitárias.
            </p>
          </div>
        </div>
      )}

      {/* BARRA DE FILTROS E PESQUISA */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por lote, insumo ou fornecedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {categories.length > 0 && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-44 text-xs">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Categorias</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as "all" | "critical" | "expired" | "ok")}
          >
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue placeholder="Status Sanitário" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="critical">Em Risco (30-60d)</SelectItem>
              <SelectItem value="expired">Vencidos / Quarentena</SelectItem>
              <SelectItem value="ok">Regulares</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* TABELA DE LOTES ANVISA */}
      <Card className="shadow-xs border-slate-200/80 dark:border-slate-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Insumo Odontológico</TableHead>
                  <TableHead>Número do Lote</TableHead>
                  <TableHead>Fabricante / Fornecedor</TableHead>
                  <TableHead>Validade Sanitária</TableHead>
                  <TableHead className="text-center">Status Sanitário</TableHead>
                  <TableHead className="text-right">Saldo Físico</TableHead>
                  <TableHead className="text-right">Valor em Estoque</TableHead>
                  <TableHead className="text-center">Rastreabilidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-xs text-muted-foreground">
                      Nenhum lote sanitário encontrado para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLots.map((lot) => {
                    const isExp = lot.status === "expired";
                    const isCrit = lot.status === "critical_30d" || lot.status === "warning_60d";

                    return (
                      <TableRow
                        key={lot.lotKey}
                        className={isExp ? "bg-rose-500/5" : isCrit ? "bg-amber-500/5" : undefined}
                      >
                        <TableCell>
                          <div className="font-bold text-xs">{lot.itemName}</div>
                          <div className="text-[10px] text-muted-foreground">{lot.category}</div>
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs font-semibold">
                            {lot.batchNumber}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground">
                          {lot.supplier || "Não especificado"}
                        </TableCell>

                        <TableCell>
                          {lot.expirationDate ? (
                            <div className="text-xs font-medium">
                              <div>
                                {new Date(`${lot.expirationDate}T00:00:00`).toLocaleDateString(
                                  "pt-BR"
                                )}
                              </div>
                              <div
                                className={`text-[10px] font-bold ${
                                  isExp
                                    ? "text-rose-600"
                                    : isCrit
                                    ? "text-amber-600"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {isExp
                                  ? "VENCIDO"
                                  : lot.daysToExpiration !== null
                                  ? `${lot.daysToExpiration} dias restantes`
                                  : ""}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem data</span>
                          )}
                        </TableCell>

                        <TableCell className="text-center">
                          {lot.status === "expired" ? (
                            <Badge
                              variant="destructive"
                              className="text-[10px] font-bold gap-1 bg-rose-600"
                            >
                              <ShieldAlert className="h-3 w-3" />
                              Quarentena (Vencido)
                            </Badge>
                          ) : lot.status === "critical_30d" ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-bold gap-1 border-rose-500 text-rose-700 bg-rose-50 dark:bg-rose-950/40"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Crítico (30 dias)
                            </Badge>
                          ) : lot.status === "warning_60d" ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-bold gap-1 border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/40"
                            >
                              <Clock className="h-3 w-3" />
                              Atenção (60 dias)
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-bold gap-1 border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Regular
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-right font-mono font-medium text-xs">
                          {lot.currentQuantity} {lot.unitMeasure}
                        </TableCell>

                        <TableCell className="text-right font-mono font-bold text-xs text-navy dark:text-white">
                          {fmtMoney(lot.totalCostInLot)}
                        </TableCell>

                        <TableCell className="text-center">
                          {settings.switches.enablePatientReverseTracking ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] gap-1 text-primary hover:text-primary font-semibold"
                              onClick={() => setSelectedLotForTrace(lot)}
                            >
                              <Users className="h-3 w-3" />
                              Rastrear Pacientes ({lot.usedInPatientsCount})
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* MODAL DE RASTREABILIDADE REVERSA DE PACIENTES */}
      <Dialog
        open={Boolean(selectedLotForTrace)}
        onOpenChange={(open) => !open && setSelectedLotForTrace(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Rastreabilidade Reversa de Pacientes (ANVISA)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Histórico de todos os procedimentos clínicos e pacientes que receberam o lote selecionado.
            </DialogDescription>
          </DialogHeader>

          {selectedLotForTrace && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="font-bold text-sm">{selectedLotForTrace.itemName}</div>
                  <div className="text-xs text-muted-foreground">
                    Lote: <strong className="font-mono text-primary">{selectedLotForTrace.batchNumber}</strong>
                  </div>
                </div>
                <div className="text-xs text-right">
                  <Badge variant="outline">
                    Validade:{" "}
                    {selectedLotForTrace.expirationDate
                      ? new Date(`${selectedLotForTrace.expirationDate}T00:00:00`).toLocaleDateString(
                          "pt-BR"
                        )
                      : "Sem data"}
                  </Badge>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto border rounded-xl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Dentista Executor</TableHead>
                      <TableHead>Motivo / Procedimento</TableHead>
                      <TableHead className="text-center">Quantidade</TableHead>
                      <TableHead className="text-right">Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tracedPatients.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">
                          Nenhum paciente registrado utilizando este lote no prontuário até o momento.
                        </TableCell>
                      </TableRow>
                    ) : (
                      tracedPatients.map((tp) => (
                        <TableRow key={tp.movementId}>
                          <TableCell className="font-bold text-xs">{tp.patientName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {tp.professionalName || "Dentista da Clínica"}
                          </TableCell>
                          <TableCell className="text-xs">{tp.reason}</TableCell>
                          <TableCell className="text-center font-mono text-xs">
                            {tp.quantityUsed}
                          </TableCell>
                          <TableCell className="text-right text-[11px] font-mono text-muted-foreground">
                            {new Date(tp.usedAt).toLocaleDateString("pt-BR")}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedLotForTrace(null)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE CONFIGURAÇÃO SANITÁRIA & SWITCHES */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              Parâmetros Sanitários & Alertas ANVISA
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure os dados da Responsável Técnica e ative/desative os mecanismos de rastreabilidade.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome da Responsável Técnica (RT)</Label>
              <Input
                value={draftSettings.responsibleName}
                onChange={(e) =>
                  setDraftSettings((s) => ({ ...s, responsibleName: e.target.value }))
                }
                placeholder="Ex: Dra. Mariana Costa"
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">WhatsApp da RT (Notificações)</Label>
                <Input
                  value={draftSettings.responsiblePhone}
                  onChange={(e) =>
                    setDraftSettings((s) => ({ ...s, responsiblePhone: e.target.value }))
                  }
                  placeholder="Ex: 11988887777"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Registro CRO / Licença ANVISA</Label>
                <Input
                  value={draftSettings.croOrAnvisaId}
                  onChange={(e) =>
                    setDraftSettings((s) => ({ ...s, croOrAnvisaId: e.target.value }))
                  }
                  placeholder="Ex: CRO-SP 123456"
                  className="text-xs"
                />
              </div>
            </div>

            {/* SWITCHES DE ATIVAÇÃO */}
            <div className="space-y-3 pt-3 border-t">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-primary" />
                Switches de Ativação do Módulo
              </h4>

              <div className="flex items-center justify-between p-3 rounded-xl border bg-card/60">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">Rastreabilidade Estrita de Lotes ANVISA</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Exige lote e validade na entrada de anestésicos e resinas.
                  </p>
                </div>
                <Switch
                  checked={draftSettings.switches.enableAnvisaLotTracking}
                  onCheckedChange={(val) =>
                    setDraftSettings((s) => ({
                      ...s,
                      switches: { ...s.switches, enableAnvisaLotTracking: val },
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border bg-card/60">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">Recomendação PEPS (FIFO)</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Sinaliza visualmente o consumo prioritário do lote que vence primeiro.
                  </p>
                </div>
                <Switch
                  checked={draftSettings.switches.enableFifoRecommendation}
                  onCheckedChange={(val) =>
                    setDraftSettings((s) => ({
                      ...s,
                      switches: { ...s.switches, enableFifoRecommendation: val },
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border bg-card/60">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">Alertas de Vencimento no WhatsApp</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Habilita o envio de relatórios sanitários no WhatsApp da RT.
                  </p>
                </div>
                <Switch
                  checked={draftSettings.switches.enableWhatsAppExpiryAlerts}
                  onCheckedChange={(val) =>
                    setDraftSettings((s) => ({
                      ...s,
                      switches: { ...s.switches, enableWhatsAppExpiryAlerts: val },
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border bg-card/60">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">Rastreabilidade Reversa de Pacientes</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Permite auditar em quais pacientes cada lote foi administrado.
                  </p>
                </div>
                <Switch
                  checked={draftSettings.switches.enablePatientReverseTracking}
                  onCheckedChange={(val) =>
                    setDraftSettings((s) => ({
                      ...s,
                      switches: { ...s.switches, enablePatientReverseTracking: val },
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border bg-card/60">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">Bloqueio Automático em Quarentena</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Bloqueia saídas de lotes que já atingiram a data de validade.
                  </p>
                </div>
                <Switch
                  checked={draftSettings.switches.enableQuarantineLock}
                  onCheckedChange={(val) =>
                    setDraftSettings((s) => ({
                      ...s,
                      switches: { ...s.switches, enableQuarantineLock: val },
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfigOpen(false)}>
              Cancelar
            </Button>
            <Button variant="default" size="sm" onClick={handleSaveSettings}>
              Salvar Parâmetros
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
