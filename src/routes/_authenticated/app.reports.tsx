import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Download,
  Printer,
  FileSpreadsheet,
  TrendingUp,
  Award,
  Clock,
} from "lucide-react";
import { supabase } from "@/services/supabase";
import { useClinic } from "@/lib/clinic";
import { useT, formatBRL } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchFinancialEntries,
  calculateProfessionalCommissions,
} from "@/modules/finance";
import { fetchStockItems, evaluateStockItemStatus } from "@/modules/stock";
import { calculateClinicalDRE, downloadCsvFile } from "@/modules/reports";
import type { FinancialEntry, StockItem } from "@/types";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({
    meta: [
      { title: "Relatórios Gerenciais & DRE — SondaPro" },
      {
        name: "description",
        content:
          "Demonstrativo de Resultado do Exercício (DRE Clínico), produtividade por profissional e exportação CSV.",
      },
    ],
  }),
  component: ReportsPage,
});

interface ProfessionalRow {
  id: string;
  name: string;
  specialty: string | null;
  commission_pct: number;
}

function ReportsPage() {
  const { t, dateLocale } = useT();
  const { clinicId, clinicName, activeUnitId, hasPermission } = useClinic();

  const canView = hasPermission("reports.view");

  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReportsData = useCallback(async () => {
    if (!clinicId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [entriesData, stockData, profsRes] = await Promise.all([
        fetchFinancialEntries(clinicId),
        fetchStockItems(clinicId),
        supabase
          .from("professionals")
          .select("id, name, specialty, commission_pct")
          .eq("clinic_id", clinicId)
          .order("name", { ascending: true }),
      ]);

      if (profsRes.error) {
        toast.error(profsRes.error.message);
      }

      setEntries(entriesData);
      setStockItems(stockData);
      setProfessionals((profsRes.data ?? []) as ProfessionalRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [clinicId, canView, t]);

  useEffect(() => {
    void loadReportsData();
  }, [loadReportsData]);

  const scopedEntries = useMemo(() => {
    if (!activeUnitId || activeUnitId === "all") return entries;
    return entries.filter((e) => !e.unit_id || e.unit_id === activeUnitId);
  }, [entries, activeUnitId]);

  const commissions = useMemo(
    () => calculateProfessionalCommissions(scopedEntries, professionals),
    [scopedEntries, professionals]
  );

  const dre = useMemo(
    () => calculateClinicalDRE(scopedEntries, commissions),
    [scopedEntries, commissions]
  );

  function handleExportDreCsv() {
    downloadCsvFile(
      `dre-clinico-${clinicName.toLowerCase().replace(/\s+/g, "-")}`,
      ["Conta / Indicador DRE", "Valor (BRL)", "Participação (%)"],
      [
        [t("rep.grossRevenue"), dre.grossRealizedRevenue.toFixed(2), "100%"],
        [t("rep.directCosts"), (-dre.directClinicalCosts).toFixed(2), ""],
        [t("rep.commissions"), (-dre.professionalCommissions).toFixed(2), ""],
        [
          t("rep.contributionMargin"),
          dre.contributionMargin.toFixed(2),
          `${dre.contributionMarginPct}%`,
        ],
        [t("rep.adminExpenses"), (-dre.administrativeExpenses).toFixed(2), ""],
        [t("rep.taxes"), (-dre.taxesAndFees).toFixed(2), ""],
        [
          t("rep.netResult"),
          dre.netOperatingResult.toFixed(2),
          `${dre.netMarginPct}%`,
        ],
      ]
    );
    toast.success("DRE Clínico exportado em CSV.");
  }

  function handleExportFinancialEntriesCsv() {
    downloadCsvFile(
      `lancamentos-financeiros-${clinicName.toLowerCase().replace(/\s+/g, "-")}`,
      [
        "Vencimento",
        "Natureza",
        "Categoria",
        "Descrição",
        "Paciente",
        "Profissional",
        "Forma Pagamento",
        "Status",
        "Valor (BRL)",
      ],
      scopedEntries.map((e) => [
        e.due_date,
        e.entry_type === "income" ? "Receita" : "Despesa",
        e.category,
        e.description,
        e.patients?.full_name ?? "",
        e.professionals?.name ?? "",
        e.payment_method,
        e.status,
        Number(e.amount).toFixed(2),
      ])
    );
    toast.success("Lançamentos financeiros exportados em CSV.");
  }

  function handleExportCommissionsCsv() {
    downloadCsvFile(
      `comissoes-profissionais-${clinicName.toLowerCase().replace(/\s+/g, "-")}`,
      [
        "Profissional",
        "Comissão (%)",
        "Base Recebida (BRL)",
        "Base em Aberto (BRL)",
        "Comissão Realizada (BRL)",
        "Comissão Prevista (BRL)",
      ],
      commissions.map((c) => [
        c.professionalName,
        c.commissionPct.toFixed(1),
        c.realizedRevenue.toFixed(2),
        c.pendingRevenue.toFixed(2),
        c.realizedCommission.toFixed(2),
        c.pendingCommission.toFixed(2),
      ])
    );
    toast.success("Relatório de comissões exportado em CSV.");
  }

  function handleExportStockCsv() {
    downloadCsvFile(
      `estoque-insumos-${clinicName.toLowerCase().replace(/\s+/g, "-")}`,
      [
        "Insumo",
        "Categoria",
        "SKU",
        "Apresentação",
        "Saldo Atual",
        "Estoque Mínimo",
        "Custo Unitário (BRL)",
        "Lote ANVISA",
        "Validade",
        "Status Sanitário",
      ],
      stockItems.map((i) => [
        i.name,
        i.category,
        i.sku ?? "",
        i.unit_measure,
        Number(i.current_quantity),
        Number(i.min_quantity),
        Number(i.unit_cost).toFixed(2),
        i.batch_number ?? "",
        i.expiration_date ?? "",
        evaluateStockItemStatus(i),
      ])
    );
    toast.success("Inventário de estoque exportado em CSV.");
  }

  if (!canView) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        {t("common.noPermission")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              {t("rep.title")}
            </h1>
            <p className="text-xs text-muted-foreground">{t("rep.subtitle")}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs">
            <Clock className="h-3.5 w-3.5 text-primary" />
            {t("dash.timezoneBadge")}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            {t("rep.print")}
          </Button>
          <Button
            type="button"
            variant="hero"
            size="sm"
            onClick={handleExportDreCsv}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t("rep.exportDreCsv")}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      ) : (
        <Tabs defaultValue="dre" className="space-y-4">
          <TabsList className="grid w-full grid-cols-1 sm:w-auto sm:grid-cols-3">
            <TabsTrigger value="dre" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              {t("rep.tabDre")}
            </TabsTrigger>
            <TabsTrigger value="productivity" className="gap-2">
              <Award className="h-4 w-4" />
              {t("rep.tabProductivity")}
            </TabsTrigger>
            <TabsTrigger value="export" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              {t("rep.tabExport")}
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: DRE CLÍNICO */}
          <TabsContent value="dre" className="space-y-6">
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">
                  {t("rep.tabDre")} — {clinicName}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estrutura do Demonstrativo (Regime de Caixa)</TableHead>
                      <TableHead className="text-right">Valor Apurado (BRL)</TableHead>
                      <TableHead className="text-right">Margem / AV (%)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-semibold text-emerald-800">
                        {t("rep.grossRevenue")}
                      </TableCell>
                      <TableCell className="text-right font-display font-bold text-emerald-700">
                        {formatBRL(dre.grossRealizedRevenue, dateLocale)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold">
                        100,0%
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell className="pl-6 text-xs text-muted-foreground">
                        {t("rep.directCosts")}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium text-rose-700">
                        - {formatBRL(dre.directClinicalCosts, dateLocale)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        —
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell className="pl-6 text-xs text-muted-foreground">
                        {t("rep.commissions")}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium text-rose-700">
                        - {formatBRL(dre.professionalCommissions, dateLocale)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        —
                      </TableCell>
                    </TableRow>

                    <TableRow className="bg-sky-50/70">
                      <TableCell className="font-display font-bold text-sky-900">
                        {t("rep.contributionMargin")}
                      </TableCell>
                      <TableCell className="text-right font-display font-extrabold text-sky-900">
                        {formatBRL(dre.contributionMargin, dateLocale)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-bold text-sky-900">
                        {dre.contributionMarginPct.toFixed(1)}%
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell className="pl-6 text-xs text-muted-foreground">
                        {t("rep.adminExpenses")}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium text-rose-700">
                        - {formatBRL(dre.administrativeExpenses, dateLocale)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        —
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell className="pl-6 text-xs text-muted-foreground">
                        {t("rep.taxes")}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium text-rose-700">
                        - {formatBRL(dre.taxesAndFees, dateLocale)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        —
                      </TableCell>
                    </TableRow>

                    <TableRow
                      className={
                        dre.netOperatingResult >= 0
                          ? "bg-emerald-50/80"
                          : "bg-rose-50/80"
                      }
                    >
                      <TableCell className="font-display text-sm font-extrabold">
                        {t("rep.netResult")}
                      </TableCell>
                      <TableCell
                        className={`text-right font-display text-base font-extrabold ${
                          dre.netOperatingResult >= 0
                            ? "text-emerald-800"
                            : "text-rose-800"
                        }`}
                      >
                        {formatBRL(dre.netOperatingResult, dateLocale)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-extrabold">
                        {dre.netMarginPct.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="shadow-card">
                <CardHeader className="pb-3">
                  <CardTitle className="font-display text-sm">
                    {t("rep.incomeBreakdown")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dre.incomeByCategory.length === 0 ? (
                    <div className="rounded-xl border border-dashed py-8 text-center text-xs text-muted-foreground">
                      {t("common.none")}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dre.incomeByCategory.map((line) => (
                        <div key={line.category} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">{line.category}</span>
                            <span className="font-semibold text-emerald-700">
                              {formatBRL(line.amount, dateLocale)} ({line.sharePct}%)
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-100">
                            <div
                              className="h-full rounded-full bg-emerald-600"
                              style={{ width: `${Math.min(100, line.sharePct)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader className="pb-3">
                  <CardTitle className="font-display text-sm">
                    {t("rep.expenseBreakdown")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dre.expenseByCategory.length === 0 ? (
                    <div className="rounded-xl border border-dashed py-8 text-center text-xs text-muted-foreground">
                      {t("common.none")}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dre.expenseByCategory.map((line) => (
                        <div key={line.category} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">{line.category}</span>
                            <span className="font-semibold text-rose-700">
                              {formatBRL(line.amount, dateLocale)} ({line.sharePct}%)
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-rose-100">
                            <div
                              className="h-full rounded-full bg-rose-600"
                              style={{ width: `${Math.min(100, line.sharePct)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 2: PRODUTIVIDADE E COMISSÕES */}
          <TabsContent value="productivity">
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">
                  {t("rep.tabProductivity")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {commissions.length === 0 ? (
                  <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                    {t("common.none")}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("ag.professional")}</TableHead>
                        <TableHead className="text-right">{t("set.commission")}</TableHead>
                        <TableHead className="text-right">Produção Quitada (R$)</TableHead>
                        <TableHead className="text-right">Produção em Aberto (R$)</TableHead>
                        <TableHead className="text-right">{t("fin.commRealized")}</TableHead>
                        <TableHead className="text-right">{t("fin.commPending")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commissions.map((row) => (
                        <TableRow key={row.professionalId}>
                          <TableCell className="font-semibold">
                            {row.professionalName}
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium">
                            {row.commissionPct.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium">
                            {formatBRL(row.realizedRevenue, dateLocale)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {formatBRL(row.pendingRevenue, dateLocale)}
                          </TableCell>
                          <TableCell className="text-right font-display font-bold text-emerald-700">
                            {formatBRL(row.realizedCommission, dateLocale)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium text-amber-700">
                            {formatBRL(row.pendingCommission, dateLocale)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: CENTRAL DE EXPORTAÇÃO CSV */}
          <TabsContent value="export">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="shadow-card">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <h3 className="font-display text-sm font-bold">
                      DRE Clínico Completo (.CSV)
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Demonstrativo contábil com receitas, custos diretos, comissões e resultado líquido.
                    </p>
                  </div>
                  <Button variant="hero" size="sm" onClick={handleExportDreCsv}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Baixar CSV
                  </Button>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <h3 className="font-display text-sm font-bold">
                      Lançamentos Financeiros ({scopedEntries.length})
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Todas as receitas, despesas, parcelas, vencimentos e formas de pagamento.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportFinancialEntriesCsv}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Baixar CSV
                  </Button>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <h3 className="font-display text-sm font-bold">
                      Repasse de Comissões ({commissions.length})
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Relatório de produção e comissões realizadas e previstas por dentista.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportCommissionsCsv}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Baixar CSV
                  </Button>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <h3 className="font-display text-sm font-bold">
                      Inventário de Estoque e Lotes ANVISA ({stockItems.length})
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Posição completa de insumos, custos unitários, lotes e validades sanitárias.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleExportStockCsv}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Baixar CSV
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

