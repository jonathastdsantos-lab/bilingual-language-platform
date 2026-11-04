import { useT, type TKey } from "@/lib/i18n";
import type { AttendanceIndicators } from "@/types";

export function AppointmentStatusChart({ metrics }: { metrics: AttendanceIndicators }) {
  const { t } = useT();
  const total = metrics.totalAppointments;

  const rows: Array<{ key: TKey; count: number; colorClass: string }> = [
    { key: "status.completed", count: metrics.completedCount, colorClass: "bg-primary" },
    { key: "status.confirmed", count: metrics.confirmedCount, colorClass: "bg-sky-500" },
    { key: "status.scheduled", count: metrics.scheduledCount, colorClass: "bg-indigo-400" },
    { key: "status.cancelled", count: metrics.cancelledCount, colorClass: "bg-amber-500" },
    { key: "status.no_show", count: metrics.noShowCount, colorClass: "bg-destructive" },
  ];

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card">
      <h3 className="font-semibold text-navy">{t("dash.chartStatus")}</h3>
      {total === 0 ? (
        <div className="mt-4 flex h-56 items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          {t("common.none")}
        </div>
      ) : (
        <div className="mt-4 space-y-3.5">
          {rows.map((r) => {
            const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
            return (
              <div key={r.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-navy">{t(r.key)}</span>
                  <span className="text-muted-foreground">
                    {r.count} ({pct}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${r.colorClass}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

