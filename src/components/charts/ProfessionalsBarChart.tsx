import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useT } from "@/lib/i18n";

export interface ProfessionalChartPoint {
  name: string;
  completedCount: number;
  scheduledCount: number;
}

export function ProfessionalsBarChart({ data }: { data: ProfessionalChartPoint[] }) {
  const { t } = useT();
  const hasData = data.length > 0 && data.some((d) => d.completedCount > 0 || d.scheduledCount > 0);

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card xl:col-span-2">
      <h3 className="font-semibold text-navy">{t("dash.chartProf")}</h3>
      {!hasData ? (
        <div className="mt-4 flex h-56 items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          {t("common.none")}
        </div>
      ) : (
        <div className="mt-4 h-56">
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" fontSize={11} stroke="var(--muted-foreground)" />
              <YAxis allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
              <Tooltip />
              <Bar dataKey="completedCount" name={t("status.completed")} fill="var(--primary)" radius={[6, 6, 0, 0]} />
              <Bar
                dataKey="scheduledCount"
                name={t("status.scheduled")}
                fill="var(--primary-glow)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

