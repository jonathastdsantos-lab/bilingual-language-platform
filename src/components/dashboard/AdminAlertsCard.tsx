import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { useT, type TKey } from "@/lib/i18n";
import type { AdministrativeAlert } from "@/types";
import { Button } from "@/components/ui/button";

export function AdminAlertsCard({ alerts }: { alerts: AdministrativeAlert[] }) {
  const { t } = useT();

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-navy">{t("dash.alertsTitle")}</h3>
        <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-accent-foreground">
          {alerts.length}
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{t("dash.noAlerts")}</span>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {alerts.map((alert) => {
            const Icon =
              alert.severity === "critical"
                ? ShieldAlert
                : alert.severity === "warning"
                  ? AlertTriangle
                  : Info;

            const toneClass =
              alert.severity === "critical"
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : alert.severity === "warning"
                  ? "border-amber-500/30 bg-amber-500/5 text-amber-800"
                  : "border-primary/20 bg-primary/5 text-navy";

            return (
              <li
                key={alert.id}
                className={`flex flex-col justify-between gap-3 rounded-xl border p-3.5 sm:flex-row sm:items-center ${toneClass}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-sm font-bold">
                      {t(alert.titleKey as TKey)}
                      {alert.count !== undefined ? ` (${alert.count})` : ""}
                    </p>
                    <p className="mt-0.5 text-xs opacity-85">{t(alert.descriptionKey as TKey)}</p>
                  </div>
                </div>
                {alert.actionRoute && alert.actionLabelKey && (
                  <Button variant="outline" size="sm" className="shrink-0 bg-card" asChild>
                    <Link to={alert.actionRoute}>{t(alert.actionLabelKey as TKey)}</Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

