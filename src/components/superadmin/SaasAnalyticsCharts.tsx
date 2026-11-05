import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  calculateConversionFunnel,
  calculatePlanDistributionData,
  calculateSaaSGrowthTimeline,
} from "@/modules/superadmin";
import type { DetailedPlatformClinic, SaasPlan } from "@/types";
import { formatCurrencyBRL } from "@/utils/timezone";

interface SaasAnalyticsChartsProps {
  clinics: DetailedPlatformClinic[];
  plans: SaasPlan[];
}

export function SaasAnalyticsCharts({ clinics, plans }: SaasAnalyticsChartsProps) {
  const timelineData = useMemo(
    () => calculateSaaSGrowthTimeline(clinics, plans, 6),
    [clinics, plans],
  );

  const planDist = useMemo(
    () => calculatePlanDistributionData(clinics, plans),
    [clinics, plans],
  );

  const funnel = useMemo(() => calculateConversionFunnel(clinics), [clinics]);

  const statusBars = useMemo(
    () => [
      { name: "Ativas", count: funnel.activePaying, fill: "#10b981" },
      { name: "Em Teste", count: funnel.inTrial, fill: "#0ea5e9" },
      { name: "Atrasadas", count: funnel.pastDue, fill: "#f59e0b" },
      { name: "Canceladas", count: funnel.cancelled, fill: "#ef4444" },
    ],
    [funnel],
  );

  return (
    <div className="space-y-4">
      {/* Indicadores de Conversão e Churn */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <span className="text-xs font-semibold text-muted-foreground">Taxa de Conversão (Trial → Pago)</span>
          <p className="mt-1 text-2xl font-extrabold text-emerald-600">{funnel.conversionRatePct}%</p>
          <p className="text-[11px] text-muted-foreground">Clínicas que concluíram o trial e assinaram</p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <span className="text-xs font-semibold text-muted-foreground">Taxa de Churn (Cancelamentos)</span>
          <p className="mt-1 text-2xl font-extrabold text-navy">{funnel.churnRatePct}%</p>
          <p className="text-[11px] text-muted-foreground">{funnel.cancelled} clínica(s) descontinuada(s)</p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <span className="text-xs font-semibold text-muted-foreground">Novas Clínicas (Mês Vigente)</span>
          <p className="mt-1 text-2xl font-extrabold text-teal">
            {timelineData[timelineData.length - 1]?.newClinics || 0}
          </p>
          <p className="text-[11px] text-muted-foreground">Cadastradas nos últimos 30 dias</p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <span className="text-xs font-semibold text-muted-foreground">Faturamento Mensal em Carteira</span>
          <p className="mt-1 text-2xl font-extrabold text-navy">
            {formatCurrencyBRL(
              planDist.reduce((acc, p) => acc + p.revenue, 0),
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">Soma de contratos vigentes</p>
        </div>
      </div>

      {/* Gráficos de Evolução */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Curva de Crescimento de Clínicas & MRR */}
        <div className="rounded-2xl border bg-card p-5 shadow-card space-y-3">
          <div>
            <h3 className="text-sm font-extrabold text-navy">Evolução de Clínicas e MRR (Últimos 6 Meses)</h3>
            <p className="text-xs text-muted-foreground">
              Trajetória acumulada de clientes e projeção de receita recorrente.
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="colorClinics" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: any, name: any) => [
                    name === "cumulativeClinics" ? `${val} clínicas` : formatCurrencyBRL(Number(val)),
                    name === "cumulativeClinics" ? "Clínicas Acumuladas" : "MRR Estimado",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeClinics"
                  stroke="#0d9488"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorClinics)"
                  name="cumulativeClinics"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Divisão de Receita por Plano Comercial */}
        <div className="rounded-2xl border bg-card p-5 shadow-card space-y-3">
          <div>
            <h3 className="text-sm font-extrabold text-navy">Distribuição de Receita por Plano SaaS</h3>
            <p className="text-xs text-muted-foreground">
              Participação de cada pacote na composição do faturamento mensal.
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={planDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="revenue"
                  nameKey="name"
                >
                  {planDist.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any) => [formatCurrencyBRL(Number(val)), "Receita Mensal"]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Distribuição por Status de Assinatura */}
      <div className="rounded-2xl border bg-card p-5 shadow-card space-y-3">
        <div>
          <h3 className="text-sm font-extrabold text-navy">Saúde da Base de Assinaturas</h3>
          <p className="text-xs text-muted-foreground">
            Volume de clínicas ativas, em trial, inadimplentes e canceladas.
          </p>
        </div>

        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusBars} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
              <Tooltip formatter={(val: any) => [`${val} clínica(s)`, "Volume"]} />
              <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                {statusBars.map((entry, index) => (
                  <Cell key={`bar-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

