import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
} from "recharts";
import {
  TrendingUp,
  Award,
  Layers,
  Sparkles,
  PieChart,
  DollarSign,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { calculateProcedureAbcCurve, downloadCsvFile } from "@/modules/reports";
import type { ClinicalDreReport, ProcedureAbcReport } from "@/types";

interface ExecutiveIntelligenceDashboardProps {
  dre: ClinicalDreReport;
  appointments: Array<{
    procedure: string | null;
    price: number | string | null;
    status: string;
  }>;
  clinicName: string;
}

export function ExecutiveIntelligenceDashboard({
  dre,
  appointments,
  clinicName,
}: ExecutiveIntelligenceDashboardProps) {
  const [search, setSearch] = useState<string>("");
  const [selectedClass, setSelectedClass] = useState<"ALL" | "A" | "B" | "C">("ALL");

  const abcReport: ProcedureAbcReport = useMemo(() => {
    return calculateProcedureAbcCurve(appointments);
  }, [appointments]);

  const fmtMoney = (v: number) =>
    Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Dados para o Gráfico DRE em Cascata/Barras
  const dreChartData = [
    {
      etapa: "Receita Bruta",
      valor: dre.grossRealizedRevenue,
      tipo: "receita",
      fill: "#0d9488", // teal
    },
    {
      etapa: "Custos Insumos/Lab",
      valor: dre.directClinicalCosts,
      tipo: "custo",
      fill: "#f43f5e", // rose
    },
    {
      etapa: "Margem Contrib.",
      valor: dre.contributionMargin,
      tipo: "resultado",
      fill: "#0284c7", // sky
    },
    {
      etapa: "Comissões",
      valor: dre.professionalCommissions,
      tipo: "custo",
      fill: "#e11d48", // rose dark
    },
    {
      etapa: "Despesas Fixas",
      valor: dre.administrativeExpenses,
      tipo: "custo",
      fill: "#ea580c", // orange
    },
    {
      etapa: "Resultado Líquido",
      valor: dre.netOperatingResult,
      tipo: "resultado",
      fill: dre.netOperatingResult >= 0 ? "#10b981" : "#ef4444", // emerald ou red
    },
  ];

  // Itens para o Gráfico de Pareto (top 10 mais relevantes)
  const paretoChartData = useMemo(() => {
    return abcReport.items.slice(0, 10).map((it) => ({
      name: it.procedureName.length > 20 ? `${it.procedureName.slice(0, 18)}...` : it.procedureName,
      fullName: it.procedureName,
      faturamento: it.totalRevenue,
      acumulado: it.cumulativeSharePct,
      classe: it.classification,
    }));
  }, [abcReport]);

  // Itens filtrados para a tabela
  const filteredItems = useMemo(() => {
    return abcReport.items.filter((it) => {
      const matchSearch = it.procedureName.toLowerCase().includes(search.toLowerCase());
      const matchClass = selectedClass === "ALL" || it.classification === selectedClass;
      return matchSearch && matchClass;
    });
  }, [abcReport, search, selectedClass]);

  const handleExportAbcCsv = () => {
    downloadCsvFile(
      `curva-abc-procedimentos-${clinicName.toLowerCase().replace(/\s+/g, "-")}`,
      [
        "Classificação",
        "Procedimento",
        "Quantidade Executada",
        "Faturamento Total (BRL)",
        "Ticket Médio (BRL)",
        "Participação (%)",
        "Participação Acumulada (%)",
      ],
      abcReport.items.map((it) => [
        `Classe ${it.classification}`,
        it.procedureName,
        it.count,
        it.totalRevenue.toFixed(2),
        it.averageTicket.toFixed(2),
        it.revenueSharePct.toFixed(1),
        it.cumulativeSharePct.toFixed(1),
      ])
    );
  };

  return (
    <div className="space-y-8">
      {/* SEÇÃO 1: DRE VISUAL & FLUXO DE LUCRATIVIDADE */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-navy flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-teal" />
            DRE Visual — Fluxo de Lucratividade & Margem Operacional
          </h2>
          <p className="text-xs text-muted-foreground">
            Decomposição gráfica da receita até o lucro operacional líquido da clínica.
          </p>
        </div>

        {/* 3 Indicadores Chave de Rentabilidade */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-teal/20 bg-teal/5 shadow-sm">
            <CardHeader className="pb-1 pt-4 px-4">
              <span className="text-xs font-semibold text-teal">Margem de Contribuição</span>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-extrabold text-navy">
                {fmtMoney(dre.contributionMargin)}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Representa <strong>{dre.contributionMarginPct}%</strong> da receita bruta
              </p>
            </CardContent>
          </Card>

          <Card className={`shadow-sm ${dre.netOperatingResult >= 0 ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"}`}>
            <CardHeader className="pb-1 pt-4 px-4">
              <span className={`text-xs font-semibold ${dre.netOperatingResult >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                Resultado Líquido do Exercício
              </span>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`text-2xl font-extrabold ${dre.netOperatingResult >= 0 ? "text-emerald-800" : "text-rose-800"}`}>
                {fmtMoney(dre.netOperatingResult)}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Margem líquida final de <strong>{dre.netMarginPct}%</strong>
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-1 pt-4 px-4">
              <span className="text-xs font-semibold text-slate-600">Comissões & Despesas Fixas</span>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-extrabold text-navy">
                {fmtMoney(dre.professionalCommissions + dre.administrativeExpenses)}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Comissões: {fmtMoney(dre.professionalCommissions)} • Fixos: {fmtMoney(dre.administrativeExpenses)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Gráfico DRE */}
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-navy">
              Demonstrativo de Receitas, Custos e Margem (BRL)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dreChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="etapa" tick={{ fontSize: 11, fill: "#475569" }} />
                  <YAxis tickFormatter={(v) => `R$ ${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} tick={{ fontSize: 11, fill: "#475569" }} />
                  <Tooltip formatter={(value: any) => [fmtMoney(Number(value)), "Valor"]} />
                  <Bar dataKey="valor" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SEÇÃO 2: CURVA ABC DE PROCEDIMENTOS (PARETO) */}
      <div className="space-y-4 pt-4 border-t">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-navy flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-500" />
              Curva ABC de Procedimentos (Princípio de Pareto 80/20)
            </h2>
            <p className="text-xs text-muted-foreground">
              Identifique quais tratamentos geram 80% do faturamento da clínica para focar sua agenda e marketing.
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportAbcCsv}
            className="gap-1.5 text-xs font-semibold shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar Curva ABC em CSV
          </Button>
        </div>

        {/* 3 Cards de Resumo ABC */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Classe A (Alto Impacto)
              </span>
              <span>{abcReport.shareClassA}% da Receita</span>
            </div>
            <div className="text-2xl font-extrabold text-navy mt-1">
              {fmtMoney(abcReport.revenueClassA)}
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5">
              <strong>{abcReport.countClassA}</strong> procedimentos geram ~80% do faturamento
            </p>
          </div>

          <div className="rounded-2xl border-2 border-sky-500/30 bg-sky-500/5 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-sky-800">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Classe B (Médio Impacto)
              </span>
              <span>{abcReport.shareClassB}% da Receita</span>
            </div>
            <div className="text-2xl font-extrabold text-navy mt-1">
              {fmtMoney(abcReport.revenueClassB)}
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5">
              <strong>{abcReport.countClassB}</strong> procedimentos compõem os próximos ~15%
            </p>
          </div>

          <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-500/5 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-amber-800">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Classe C (Volume / Apoio)
              </span>
              <span>{abcReport.shareClassC}% da Receita</span>
            </div>
            <div className="text-2xl font-extrabold text-navy mt-1">
              {fmtMoney(abcReport.revenueClassC)}
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5">
              <strong>{abcReport.countClassC}</strong> procedimentos de rotina / menor ticket
            </p>
          </div>
        </div>

        {/* Gráfico de Pareto (Faturamento + Linha de % Acumulada) */}
        {paretoChartData.length > 0 && (
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-navy">
                Gráfico de Pareto — Top 10 Procedimentos & % Acumulada da Receita
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={paretoChartData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" angle={-25} textAnchor="end" tick={{ fontSize: 10, fill: "#475569" }} interval={0} />
                    <YAxis yAxisId="left" tickFormatter={(v) => `R$ ${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} tick={{ fontSize: 11, fill: "#475569" }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#0d9488" }} />
                    <Tooltip
                      formatter={(value: any, name: any) => [
                        name === "faturamento" ? fmtMoney(Number(value)) : `${value}%`,
                        name === "faturamento" ? "Faturamento" : "% Acumulada",
                      ]}
                      labelFormatter={(label, payload) => {
                        const row = payload?.[0]?.payload;
                        return row?.fullName || label;
                      }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Bar yAxisId="left" dataKey="faturamento" name="Faturamento (R$)" fill="#1e293b" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="acumulado" name="% Acumulado" stroke="#0d9488" strokeWidth={3} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabela Analítica ABC */}
        <Card className="shadow-card overflow-hidden">
          <CardHeader className="pb-3 border-b bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-bold text-navy">
              Detalhamento de Procedimentos por Classe ABC
            </CardTitle>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Buscar procedimento..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-44 text-xs"
              />
              <div className="inline-flex rounded-lg border bg-white p-0.5 text-xs font-semibold">
                {(["ALL", "A", "B", "C"] as const).map((cl) => (
                  <button
                    key={cl}
                    onClick={() => setSelectedClass(cl)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      selectedClass === cl
                        ? "bg-navy text-white"
                        : "text-slate-600 hover:text-navy"
                    }`}
                  >
                    {cl === "ALL" ? "Todos" : `Classe ${cl}`}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Nenhum procedimento encontrado com os filtros atuais.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-slate-100/60">
                      <TableHead className="w-16 text-center">Classe</TableHead>
                      <TableHead>Procedimento</TableHead>
                      <TableHead className="text-center">Quantidade</TableHead>
                      <TableHead className="text-right">Ticket Médio</TableHead>
                      <TableHead className="text-right">Faturamento Total</TableHead>
                      <TableHead className="text-right">% Participação</TableHead>
                      <TableHead className="text-right">% Acumulado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((it, idx) => (
                      <TableRow key={idx} className="hover:bg-slate-50/50">
                        <TableCell className="text-center">
                          <Badge
                            className={
                              it.classification === "A"
                                ? "bg-emerald-500/15 text-emerald-800 font-bold"
                                : it.classification === "B"
                                ? "bg-sky-500/15 text-sky-800 font-bold"
                                : "bg-amber-500/15 text-amber-800 font-bold"
                            }
                          >
                            Classe {it.classification}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold text-navy">
                          {it.procedureName}
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {it.count}
                        </TableCell>
                        <TableCell className="text-right font-medium text-slate-700">
                          {fmtMoney(it.averageTicket)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-navy">
                          {fmtMoney(it.totalRevenue)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-slate-600">
                          {it.revenueSharePct}%
                        </TableCell>
                        <TableCell className="text-right font-semibold text-teal">
                          {it.cumulativeSharePct}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

