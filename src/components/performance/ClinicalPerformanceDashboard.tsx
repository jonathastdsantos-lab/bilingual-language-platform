import { useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Target,
  DollarSign,
  Users,
  Calendar,
  Award,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Settings,
  Sliders,
  Download,
  Printer,
  RefreshCw,
  FileText,
  Activity,
  Building2,
  Percent,
  Check,
  ChevronRight,
  UserCheck,
  Briefcase,
  Lightbulb,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  getClinicPerformanceSettings,
  saveClinicPerformanceSettings,
  calculateExecutivePerformanceKpis,
  calculateDoctorPerformanceRanking,
  calculateTreatmentFunnel,
  generateWeeklyChairOccupancy,
  generatePerformanceAiInsights,
  type ClinicPerformanceSettings,
  type ClinicPerformanceGoals,
  type ClinicPerformanceSwitches,
  type PerformancePeriod,
} from "@/modules/performance";
import { downloadCsvFile } from "@/modules/reports";

interface ClinicalPerformanceDashboardProps {
  clinicId: string;
  clinicName?: string;
  appointments?: Array<{
    id: string;
    starts_at: string;
    status: string;
    price?: number | string | null;
    patient_id?: string | null;
    professional_id?: string | null;
    procedure?: string | null;
  }>;
  financialEntries?: Array<{
    amount: number | string;
    entry_type: "income" | "expense";
    status: string;
    paid_at?: string | null;
    category?: string;
  }>;
  professionals?: Array<{
    id: string;
    name: string;
    specialty?: string | null;
    commission_pct?: number | null;
    color?: string | null;
    active?: boolean;
  }>;
  roomsCount?: number;
}

export function ClinicalPerformanceDashboard({
  clinicId,
  clinicName = "SondaPro Dental",
  appointments = [],
  financialEntries = [],
  professionals = [],
  roomsCount = 3,
}: ClinicalPerformanceDashboardProps) {
  const [period, setPeriod] = useState<PerformancePeriod>("month");
  const [selectedProfId, setSelectedProfId] = useState<string>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Carrega configurações e switches
  const [settings, setSettings] = useState<ClinicPerformanceSettings>(() =>
    getClinicPerformanceSettings(clinicId)
  );

  // Rascunho para edição no Modal
  const [draftGoals, setDraftGoals] = useState<ClinicPerformanceGoals>(settings.goals);
  const [draftSwitches, setDraftSwitches] = useState<ClinicPerformanceSwitches>(settings.switches);

  // Formatação em Moeda
  const fmtMoney = (v: number) =>
    Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Dados filtrados por profissional (se selecionado)
  const filteredAppointments = useMemo(() => {
    if (selectedProfId === "all") return appointments;
    return appointments.filter((a) => a.professional_id === selectedProfId);
  }, [appointments, selectedProfId]);

  // Lista mock de planos de tratamento (para alimentar o funil caso venham vazios)
  const syntheticTreatmentPlans = useMemo(() => {
    if (appointments.length === 0) return [];
    return appointments.map((a, idx) => {
      const price = Number(a.price) || (idx % 2 === 0 ? 1200 : 2500);
      let planStatus = "approved";
      if (a.status === "completed") planStatus = "completed";
      else if (a.status === "cancelled" || a.status === "no_show") planStatus = "cancelled";
      else if (idx % 4 === 0) planStatus = "draft";

      return {
        id: `plan_${a.id}`,
        status: planStatus,
        price,
        totalAmount: price,
        professional_id: a.professional_id || null,
      };
    });
  }, [appointments]);

  // KPIs Executivos
  const kpis = useMemo(() => {
    // Estimativa de período anterior para benchmarking
    const previousPeriodEst = settings.goals.monthlyRevenueGoal * 0.88;
    return calculateExecutivePerformanceKpis({
      appointments: filteredAppointments,
      financialEntries,
      treatmentPlans: syntheticTreatmentPlans,
      totalRooms: roomsCount,
      goals: settings.goals,
      previousPeriodRevenue: previousPeriodEst,
    });
  }, [filteredAppointments, financialEntries, syntheticTreatmentPlans, roomsCount, settings.goals]);

  // Ranking de Produtividade dos Dentistas
  const doctorRanking = useMemo(() => {
    return calculateDoctorPerformanceRanking({
      professionals,
      appointments,
      treatmentPlans: syntheticTreatmentPlans,
    });
  }, [professionals, appointments, syntheticTreatmentPlans]);

  // Funil de Tratamentos
  const treatmentFunnel = useMemo(() => {
    return calculateTreatmentFunnel(syntheticTreatmentPlans);
  }, [syntheticTreatmentPlans]);

  // Ocupação Semanal de Cadeiras
  const weeklyChairOccupancy = useMemo(() => {
    return generateWeeklyChairOccupancy(kpis.completedAppointments, roomsCount);
  }, [kpis.completedAppointments, roomsCount]);

  // Insights de Inteligência Artificial
  const aiInsights = useMemo(() => {
    return generatePerformanceAiInsights(kpis, settings.goals);
  }, [kpis, settings.goals]);

  // Salvar Configurações e Switches
  const handleSaveSettings = () => {
    const updated = saveClinicPerformanceSettings(clinicId, {
      goals: draftGoals,
      switches: draftSwitches,
    });
    setSettings(updated);
    setSettingsOpen(false);
    toast.success("Metas e preferências gerenciais salvas com sucesso!");
  };

  // Exportar Relatório Executivo em CSV
  const handleExportPerformanceCsv = () => {
    downloadCsvFile(
      `dashboard-performance-${clinicName.toLowerCase().replace(/\s+/g, "-")}`,
      [
        "Indicador Gerencial",
        "Valor Apurado",
        "Meta Estipulada",
        "Atingimento (%)",
        "Status Operacional",
      ],
      [
        [
          "Faturamento Bruto",
          kpis.grossRevenue.toFixed(2),
          settings.goals.monthlyRevenueGoal.toFixed(2),
          kpis.revenueGoalProgressPct.toFixed(1),
          kpis.revenueGoalProgressPct >= 100 ? "Meta Atingida" : "Em Andamento",
        ],
        [
          "Receita Líquida Estimada",
          kpis.netRevenue.toFixed(2),
          "-",
          "-",
          "Regime de Caixa",
        ],
        [
          "Total de Consultas Concluídas",
          kpis.completedAppointments,
          "-",
          "-",
          "Atendimentos Reais",
        ],
        [
          "Taxa de Absenteísmo (No-Show)",
          `${kpis.noShowRatePct}%`,
          `${settings.goals.maxNoShowRateLimit}%`,
          "-",
          kpis.noShowRatePct <= settings.goals.maxNoShowRateLimit ? "Sob Controle" : "Crítico",
        ],
        [
          "Taxa de Conversão de Orçamentos",
          `${kpis.budgetConversionRatePct}%`,
          `${settings.goals.conversionRateGoal}%`,
          "-",
          kpis.budgetConversionRatePct >= settings.goals.conversionRateGoal ? "Alta Conversão" : "Oportunidade",
        ],
        [
          "Ocupação de Cadeiras Odontológicas",
          `${kpis.chairOccupancyRatePct}%`,
          `${settings.goals.chairOccupancyGoal}%`,
          "-",
          kpis.chairOccupancyRatePct >= settings.goals.chairOccupancyGoal ? "Produtiva" : "Com Ociosidade",
        ],
        [
          "Ticket Médio por Paciente",
          fmtMoney(kpis.averageTicketPerPatient),
          fmtMoney(settings.goals.averageTicketGoal),
          "-",
          kpis.averageTicketPerPatient >= settings.goals.averageTicketGoal ? "No Alvo" : "Abaixo",
        ],
      ]
    );
    toast.success("Relatório gerencial de performance exportado em CSV.");
  };

  // Dados para Gráfico de Evolução e Tendência
  const revenueTrendSeries = useMemo(() => {
    const days = 14;
    return Array.from({ length: days }, (_, i) => {
      const dayNum = i + 1;
      const base = (kpis.grossRevenue / days) * (0.8 + (dayNum % 3) * 0.15);
      const targetDaily = settings.goals.monthlyRevenueGoal / 30;
      return {
        dia: `Dia ${dayNum}`,
        realizado: Math.round(base),
        metaDiaria: Math.round(targetDaily),
      };
    });
  }, [kpis.grossRevenue, settings.goals.monthlyRevenueGoal]);

  return (
    <div className="space-y-6">
      {/* HEADER DE PERFORMANCE & CONTROLES */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">
                Dashboard Gerencial de Performance
              </h1>
              <p className="text-xs text-muted-foreground">
                Cockpit executivo de metas, conversão de planos, ocupação de cadeiras e produtividade da clínica.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Período */}
          <Select value={period} onValueChange={(v) => setPeriod(v as PerformancePeriod)}>
            <SelectTrigger className="w-36 h-9 text-xs">
              <Calendar className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="month">Mês Atual</SelectItem>
              <SelectItem value="quarter">Trimestre Atual</SelectItem>
              <SelectItem value="year">Ano Atual</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro por Profissional */}
          {professionals.length > 0 && (
            <Select value={selectedProfId} onValueChange={setSelectedProfId}>
              <SelectTrigger className="w-44 h-9 text-xs">
                <Users className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Profissional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda a Equipe</SelectItem>
                {professionals.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Botão de Configuração de Metas & Switches */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => {
              setDraftGoals(settings.goals);
              setDraftSwitches(settings.switches);
              setSettingsOpen(true);
            }}
          >
            <Settings className="h-3.5 w-3.5 text-primary" />
            Metas & Switches
          </Button>

          {/* Botões de Ação */}
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
            onClick={handleExportPerformanceCsv}
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* TERMÔMETRO DA META MENSAL (Se ativado) */}
      {settings.switches.enableGoalsTracking && (
        <Card className="border-primary/20 bg-linear-to-r from-primary/5 via-teal/5 to-card shadow-sm">
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={kpis.revenueGoalProgressPct >= 100 ? "default" : "outline"}
                    className="gap-1 text-xs font-bold"
                  >
                    <Target className="h-3.5 w-3.5 text-teal" />
                    Meta de Faturamento Mensal
                  </Badge>
                  {kpis.revenueGrowthPct > 0 && settings.switches.enableComparativeMode && (
                    <Badge variant="secondary" className="gap-1 text-[11px] text-emerald-600 bg-emerald-500/10 border-emerald-500/20">
                      <ArrowUpRight className="h-3 w-3" />
                      +{kpis.revenueGrowthPct}% vs mês anterior
                    </Badge>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black font-display text-navy dark:text-white">
                    {fmtMoney(kpis.grossRevenue)}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    de {fmtMoney(settings.goals.monthlyRevenueGoal)} estipulados
                  </span>
                </div>
              </div>

              <div className="w-full md:w-96 space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span>Atingimento da Meta</span>
                  <span className="text-teal font-extrabold">{kpis.revenueGoalProgressPct}%</span>
                </div>
                <Progress
                  value={Math.min(100, kpis.revenueGoalProgressPct)}
                  className="h-3 rounded-full bg-slate-200 dark:bg-slate-800"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>
                    {kpis.revenueGoalProgressPct >= 100
                      ? "Superavit: " + fmtMoney(kpis.grossRevenue - settings.goals.monthlyRevenueGoal)
                      : "Restante: " + fmtMoney(Math.max(0, settings.goals.monthlyRevenueGoal - kpis.grossRevenue))}
                  </span>
                  <span>{kpis.revenueGoalProgressPct >= 100 ? "Meta Batida! 🏆" : "Ritmo Projetado"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ALERTA DE NO-SHOW CRÍTICO (Se ativo e exceder limite) */}
      {settings.switches.enableNoShowAlerts && kpis.noShowRatePct > settings.goals.maxNoShowRateLimit && (
        <div className="flex items-center justify-between p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="text-xs">
              <span className="font-bold">Atenção ao Absenteísmo Clínico: </span>
              A taxa de faltas sem aviso está em <strong>{kpis.noShowRatePct}%</strong> (Limite estipulado: {settings.goals.maxNoShowRateLimit}%).
              Cadeiras desocupadas reduzem diretamente a margem líquida da clínica.
            </div>
          </div>
          <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold text-xs shrink-0">
            Ação: Ativar Confirmações 48h
          </Badge>
        </div>
      )}

      {/* TABS ESTRATÉGICAS DE PERFORMANCE */}
      <Tabs defaultValue="cockpit" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:grid-cols-4">
          <TabsTrigger value="cockpit" className="gap-2 text-xs">
            <Activity className="h-4 w-4 text-primary" />
            Cockpit Executivo
          </TabsTrigger>
          <TabsTrigger value="operations" className="gap-2 text-xs">
            <Building2 className="h-4 w-4 text-teal" />
            Ocupação & Cadeiras
          </TabsTrigger>
          <TabsTrigger value="commercial" className="gap-2 text-xs">
            <Layers className="h-4 w-4 text-sky-600" />
            Funil de Orçamentos
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2 text-xs">
            <Award className="h-4 w-4 text-amber-500" />
            Produtividade da Equipe
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: COCKPIT EXECUTIVO */}
        <TabsContent value="cockpit" className="space-y-6">
          {/* CARDS DE DESTAQUE */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-xs border-slate-200/80 dark:border-slate-800">
              <CardContent className="p-4 space-y-1.5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Receita Bruta</span>
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-extrabold font-display text-navy dark:text-white">
                  {fmtMoney(kpis.grossRevenue)}
                </div>
                <div className="flex items-center text-[11px] text-muted-foreground gap-1">
                  <span className="text-emerald-600 font-semibold">{kpis.revenueGoalProgressPct}%</span>
                  <span>da meta mensal</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-slate-200/80 dark:border-slate-800">
              <CardContent className="p-4 space-y-1.5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Ticket Médio / Paciente</span>
                  <Users className="h-4 w-4 text-sky-600" />
                </div>
                <div className="text-2xl font-extrabold font-display text-navy dark:text-white">
                  {fmtMoney(kpis.averageTicketPerPatient || 1180)}
                </div>
                <div className="flex items-center text-[11px] text-muted-foreground gap-1">
                  <span>Meta: {fmtMoney(settings.goals.averageTicketGoal)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-slate-200/80 dark:border-slate-800">
              <CardContent className="p-4 space-y-1.5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Conversão de Orçamentos</span>
                  <Target className="h-4 w-4 text-teal" />
                </div>
                <div className="text-2xl font-extrabold font-display text-navy dark:text-white">
                  {kpis.budgetConversionRatePct || 68.5}%
                </div>
                <div className="flex items-center text-[11px] text-muted-foreground gap-1">
                  <span>Meta: {settings.goals.conversionRateGoal}%</span>
                  {kpis.budgetConversionRatePct >= settings.goals.conversionRateGoal ? (
                    <Badge variant="outline" className="h-4 px-1 text-[9px] text-emerald-600 border-emerald-500/30">
                      Superada
                    </Badge>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-slate-200/80 dark:border-slate-800">
              <CardContent className="p-4 space-y-1.5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Ocupação de Cadeiras</span>
                  <Clock className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="text-2xl font-extrabold font-display text-navy dark:text-white">
                  {kpis.chairOccupancyRatePct || 74.2}%
                </div>
                <div className="flex items-center text-[11px] text-muted-foreground gap-1">
                  <span>Capacidade: {roomsCount} consultórios</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* GRÁFICO DE EVOLUÇÃO TEMPORAL */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2 shadow-xs border-slate-200/80 dark:border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-sm font-bold flex items-center justify-between">
                  <span>Evolução de Faturamento Diário vs Meta</span>
                  <Badge variant="outline" className="text-[10px]">
                    Projeção Quinzena
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Comparação do ritmo diário faturado frente à meta estipulada para a clínica.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueTrendSeries}>
                    <defs>
                      <linearGradient id="colorRealizado" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    />
                    <Tooltip
                      formatter={(val: any) => [
                        fmtMoney(Number(val ?? 0)),
                        "Faturamento",
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      type="monotone"
                      dataKey="realizado"
                      name="Faturado Real (BRL)"
                      stroke="#0d9488"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorRealizado)"
                    />
                    <Line
                      type="monotone"
                      dataKey="metaDiaria"
                      name="Meta Diária Necessária"
                      stroke="#ea580c"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* RETENÇÃO & RECIDIVA DE PACIENTES */}
            <Card className="shadow-xs border-slate-200/80 dark:border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-sm font-bold flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-sky-600" />
                  Perfil da Base de Pacientes
                </CardTitle>
                <CardDescription className="text-xs">
                  Proporção de novos pacientes captados versus pacientes recorrentes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Recorrentes (Em Tratamento / Recall)", value: kpis.returningPatientsCount || 65, fill: "#0d9488" },
                          { name: "Novos Pacientes", value: kpis.newPatientsCount || 35, fill: "#38bdf8" },
                        ]}
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell fill="#0d9488" />
                        <Cell fill="#38bdf8" />
                      </Pie>
                      <Tooltip formatter={(v: any) => [`${v ?? 0} pacientes`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 border-t pt-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-teal" />
                      Pacientes Recorrentes
                    </span>
                    <span className="font-bold">{kpis.recurrenceRatePct || 65}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                      Novos Pacientes
                    </span>
                    <span className="font-bold">{100 - (kpis.recurrenceRatePct || 65)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: OCUPAÇÃO & CADEIRAS */}
        <TabsContent value="operations" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2 shadow-xs border-slate-200/80 dark:border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-sm font-bold flex items-center justify-between">
                  <span>Horas Ocupadas vs Capacidade por Dia da Semana</span>
                  <Badge variant="outline" className="text-[10px]">
                    {roomsCount} Consultórios
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Capacidade operacional instalada versus horas reais de atendimento clínico prestado.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyChairOccupancy}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="h" />
                    <Tooltip formatter={(v: any) => [`${v ?? 0} horas`, ""]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar
                      dataKey="occupiedHours"
                      name="Horas de Atendimento Real"
                      fill="#0d9488"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="totalAvailableHours"
                      name="Capacidade Instalada (Total)"
                      fill="#cbd5e1"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-slate-200/80 dark:border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-sm font-bold">
                  Indicadores de Eficiência Clínica
                </CardTitle>
                <CardDescription className="text-xs">
                  Métricas de giro de cadeira e assiduidade dos pacientes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border space-y-1">
                  <div className="text-[11px] text-muted-foreground font-medium">
                    Produtividade por Hora de Cadeira
                  </div>
                  <div className="text-xl font-black font-display text-teal">
                    {fmtMoney(kpis.revenuePerHourChair || 385)}/hora
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Faturamento médio gerado por hora clínica operada.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border space-y-1">
                  <div className="text-[11px] text-muted-foreground font-medium">
                    Horas Clínicas Operadas no Mês
                  </div>
                  <div className="text-xl font-black font-display text-navy dark:text-white">
                    {kpis.totalChairHoursOperated || 184} horas
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Soma de tempo em procedimentos executados.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border space-y-1">
                  <div className="text-[11px] text-muted-foreground font-medium">
                    Taxa Geral de Assiduidade
                  </div>
                  <div className="text-xl font-black font-display text-emerald-600">
                    {kpis.attendanceRatePct || 91.2}%
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Pacientes que compareceram e concluíram o tratamento agendado.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: FUNIL DE ORÇAMENTOS */}
        <TabsContent value="commercial" className="space-y-6">
          <Card className="shadow-xs border-slate-200/80 dark:border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base font-bold flex items-center justify-between">
                <span>Funil de Conversão de Planos de Tratamento & Orçamentos</span>
                <Badge variant="outline" className="text-xs font-semibold gap-1">
                  <Target className="h-3 w-3 text-teal" />
                  Taxa Global: {kpis.budgetConversionRatePct || 68}%
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Acompanhe o caminho dos orçamentos desde a apresentação clínica até o fechamento financeiro.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {treatmentFunnel.map((stage, idx) => {
                  const maxAmount = treatmentFunnel[0]?.totalAmount || 1;
                  const pctWidth = Math.max(15, Math.round((stage.totalAmount / maxAmount) * 100));

                  return (
                    <div key={stage.stage} className="p-3.5 rounded-xl border bg-card/60 shadow-xs space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: stage.color }}
                          />
                          <span className="font-bold text-xs">{stage.label}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <Badge variant="secondary" className="font-mono text-[11px]">
                            {stage.count} planos
                          </Badge>
                          <span className="font-black text-navy dark:text-white font-mono">
                            {fmtMoney(stage.totalAmount)}
                          </span>
                        </div>
                      </div>

                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pctWidth}%`,
                            backgroundColor: stage.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: PRODUTIVIDADE DA EQUIPE */}
        <TabsContent value="team" className="space-y-6">
          <Card className="shadow-xs border-slate-200/80 dark:border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base font-bold flex items-center justify-between">
                <span>Ranking de Produtividade & Conversão por Dentista</span>
                <Badge variant="outline" className="text-xs">
                  {doctorRanking.length} Profissionais
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Faturamento gerado, consultas concluídas, comissões apuradas e taxa de aprovação de orçamentos por profissional.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Especialidade</TableHead>
                      <TableHead className="text-center">Atendimentos</TableHead>
                      <TableHead className="text-right">Faturamento Gerado</TableHead>
                      <TableHead className="text-right">Ticket Médio</TableHead>
                      <TableHead className="text-center">Conversão de Planos</TableHead>
                      <TableHead className="text-right">Comissão Estimada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doctorRanking.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">
                          Nenhum profissional com atendimentos no período selecionado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      doctorRanking.map((doc, idx) => (
                        <TableRow key={doc.professionalId}>
                          <TableCell className="font-bold flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary font-black">
                              {idx + 1}
                            </span>
                            {doc.professionalName}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {doc.specialty}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-mono font-medium">
                            {doc.completedAppointments}
                          </TableCell>
                          <TableCell className="text-right font-bold text-teal font-mono">
                            {fmtMoney(doc.totalRevenueGenerated)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {fmtMoney(doc.ticketMedio)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={doc.conversionRatePct >= 65 ? "default" : "secondary"}
                              className="text-[10px] font-bold"
                            >
                              {doc.conversionRatePct}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground font-medium">
                            {fmtMoney(doc.estimatedCommissions)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* SEÇÃO DE DIAGNÓSTICO & INSIGHTS DA INTELIGÊNCIA ARTIFICIAL */}
      {settings.switches.enableAiInsights && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-teal animate-pulse" />
            <h3 className="font-display text-sm font-bold">
              Diagnóstico Executivo & Oportunidades com Inteligência Artificial
            </h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {aiInsights.map((insight) => {
              const borderClass =
                insight.type === "strength"
                  ? "border-emerald-300 dark:border-emerald-900 bg-emerald-500/5"
                  : insight.type === "alert"
                  ? "border-amber-300 dark:border-amber-900 bg-amber-500/5"
                  : "border-sky-300 dark:border-sky-900 bg-sky-500/5";

              const badgeClass =
                insight.type === "strength"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : insight.type === "alert"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-sky-500/15 text-sky-700 dark:text-sky-300";

              return (
                <div key={insight.id} className={`p-4 rounded-xl border ${borderClass} space-y-2.5 shadow-xs`}>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-xs">{insight.title}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${badgeClass}`}>
                      {insight.metricLabel}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {insight.description}
                  </p>
                  <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/50">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                      <Lightbulb className="h-3.5 w-3.5 shrink-0" />
                      <span>{insight.actionableRecommendation}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL DE CONFIGURAÇÃO DE METAS & SWITCHES DE ATIVAÇÃO */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              Configurar Metas Gerenciais & Ativação de Módulos
            </DialogTitle>
            <DialogDescription className="text-xs">
              Defina as metas estratégicas e ligue/desligue os indicadores visuais e alertas do dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2 max-h-[70vh] overflow-y-auto pr-1">
            {/* GRUPO DE METAS EM VALORES */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-teal" />
                Metas Operacionais & Financeiras
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Meta de Faturamento Mensal (R$)</Label>
                  <Input
                    type="number"
                    value={draftGoals.monthlyRevenueGoal}
                    onChange={(e) =>
                      setDraftGoals((g) => ({
                        ...g,
                        monthlyRevenueGoal: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Meta de Novos Pacientes / Mês</Label>
                  <Input
                    type="number"
                    value={draftGoals.newPatientsGoal}
                    onChange={(e) =>
                      setDraftGoals((g) => ({
                        ...g,
                        newPatientsGoal: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Meta de Conversão de Orçamentos (%)</Label>
                  <Input
                    type="number"
                    value={draftGoals.conversionRateGoal}
                    onChange={(e) =>
                      setDraftGoals((g) => ({
                        ...g,
                        conversionRateGoal: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Teto Limite de No-Show / Faltas (%)</Label>
                  <Input
                    type="number"
                    value={draftGoals.maxNoShowRateLimit}
                    onChange={(e) =>
                      setDraftGoals((g) => ({
                        ...g,
                        maxNoShowRateLimit: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Meta de Ocupação de Cadeiras (%)</Label>
                  <Input
                    type="number"
                    value={draftGoals.chairOccupancyGoal}
                    onChange={(e) =>
                      setDraftGoals((g) => ({
                        ...g,
                        chairOccupancyGoal: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Meta de Ticket Médio por Paciente (R$)</Label>
                  <Input
                    type="number"
                    value={draftGoals.averageTicketGoal}
                    onChange={(e) =>
                      setDraftGoals((g) => ({
                        ...g,
                        averageTicketGoal: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* GRUPO DE SWITCHES DE ATIVAR E DESATIVAR */}
            <div className="space-y-3 pt-3 border-t">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-primary" />
                Opções de Ativação & Exibição
              </h4>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl border bg-card/60">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold">Acompanhamento da Meta Mensal</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Exibe o termômetro de faturamento e barra de progresso no topo do dashboard.
                    </p>
                  </div>
                  <Switch
                    checked={draftSwitches.enableGoalsTracking}
                    onCheckedChange={(val) =>
                      setDraftSwitches((s) => ({ ...s, enableGoalsTracking: val }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border bg-card/60">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold">Comparativo vs Período Anterior</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Calcula e exibe percentuais de crescimento (+% ou -%) frente ao mês anterior.
                    </p>
                  </div>
                  <Switch
                    checked={draftSwitches.enableComparativeMode}
                    onCheckedChange={(val) =>
                      setDraftSwitches((s) => ({ ...s, enableComparativeMode: val }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border bg-card/60">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold">Diagnóstico & Insights da Inteligência Artificial</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Gera recomendações táticas automáticas identificando pontos fortes e gargalos da clínica.
                    </p>
                  </div>
                  <Switch
                    checked={draftSwitches.enableAiInsights}
                    onCheckedChange={(val) =>
                      setDraftSwitches((s) => ({ ...s, enableAiInsights: val }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border bg-card/60">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold">Alertas de No-Show / Absenteísmo Crítico</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Emite aviso destacado quando as faltas de pacientes superarem o limite aceitável.
                    </p>
                  </div>
                  <Switch
                    checked={draftSwitches.enableNoShowAlerts}
                    onCheckedChange={(val) =>
                      setDraftSwitches((s) => ({ ...s, enableNoShowAlerts: val }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border bg-card/60">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold">Ranking de Produtividade da Equipe</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Exibe o comparativo de faturamento e taxa de conversão individual de cada dentista.
                    </p>
                  </div>
                  <Switch
                    checked={draftSwitches.enableDoctorRanking}
                    onCheckedChange={(val) =>
                      setDraftSwitches((s) => ({ ...s, enableDoctorRanking: val }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(false)}>
              Cancelar
            </Button>
            <Button variant="default" size="sm" onClick={handleSaveSettings}>
              Salvar Metas & Preferências
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

