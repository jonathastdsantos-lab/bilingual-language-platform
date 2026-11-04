import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { useT } from "@/lib/i18n";
import { formatCurrencyBRL } from "@/utils/timezone";

export interface RevenueSeriesPoint {
  dateLabel: string;
  completedRevenue: number;
  projectedRevenue: number;
}

export function RevenueTrendChart({
  data,
  dateLocale,
}: {
  data: RevenueSeriesPoint[];
  dateLocale: string;
}) {
  const { t } = useT();
  const hasAnyValue = data.some((d) => d.completedRevenue > 0 || d.projectedRevenue > 0);

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card xl:col-span-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-navy">{t("dash.chartRevenue")}</h3>
      </div>

      {!hasAnyValue ? (
        <div className="mt-4 flex h-64 items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          {t("common.none")}
        </div>
      ) : (
        <div className="mt-4 h-64">
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="dateLabel" fontSize={11} stroke="var(--muted-foreground)" />
              <YAxis fontSize={11} stroke="var(--muted-foreground)" />
              <Tooltip formatter={(v: number) => formatCurrencyBRL(v, dateLocale)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="completedRevenue"
                name={t("dash.completed")}
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="projectedRevenue"
                name={t("dash.scheduled")}
                stroke="var(--primary-glow)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

