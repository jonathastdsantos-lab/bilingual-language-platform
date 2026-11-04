import { CalendarClock, CalendarCheck, CalendarX, UserX, UserPlus } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { AttendanceIndicators } from "@/types";

export function AttendanceKpiCards({ metrics }: { metrics: AttendanceIndicators }) {
  const { t } = useT();

  const cards = [
    {
      label: t("dash.scheduled"),
      value: String(metrics.scheduledCount + metrics.confirmedCount),
      sub: `${t("status.confirmed")}: ${metrics.confirmedCount}`,
      icon: CalendarClock,
      tone: "text-primary",
    },
    {
      label: t("dash.completed"),
      value: String(metrics.completedCount),
      sub: `${t("dash.completionRate")}: ${metrics.completionRatePct.toFixed(0)}%`,
      icon: CalendarCheck,
      tone: "text-emerald-600",
    },
    {
      label: t("dash.cancelled"),
      value: String(metrics.cancelledCount),
      sub: `${metrics.totalAppointments} total`,
      icon: CalendarX,
      tone: "text-amber-600",
    },
    {
      label: t("dash.noShow"),
      value: String(metrics.noShowCount),
      sub: `${t("dash.noShowRate")}: ${metrics.noShowRatePct.toFixed(0)}%`,
      icon: UserX,
      tone: "text-destructive",
    },
    {
      label: t("dash.newPatients"),
      value: String(metrics.newPatientsCount),
      sub: t("pat.title"),
      icon: UserPlus,
      tone: "text-primary",
    },
  ];

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        {t("dash.section.attendance")}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-2xl border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
                <Icon className={`h-4 w-4 ${c.tone}`} />
              </div>
              <p className="mt-2 font-display text-2xl font-extrabold text-navy">{c.value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{c.sub}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

