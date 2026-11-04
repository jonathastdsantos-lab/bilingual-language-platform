import { Clock } from "lucide-react";
import { useT, type TKey } from "@/lib/i18n";
import type { DashboardPeriod } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PERIODS: DashboardPeriod[] = ["today", "7d", "month", "30d", "90d"];

export function DashboardFilterBar({
  clinicName,
  period,
  onPeriodChange,
  professionalId,
  onProfessionalChange,
  professionals,
}: {
  clinicName: string;
  period: DashboardPeriod;
  onPeriodChange: (p: DashboardPeriod) => void;
  professionalId: string;
  onProfessionalChange: (id: string) => void;
  professionals: Array<{ id: string; name: string }>;
}) {
  const { t } = useT();

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">{clinicName}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-medium text-accent-foreground">
            <Clock className="h-3 w-3" />
            {t("dash.timezoneBadge")}
          </span>
        </div>
        <h1 className="mt-1 text-2xl font-extrabold text-navy md:text-3xl">{t("dash.title")}</h1>
        <p className="text-xs text-muted-foreground">{t("dash.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={professionalId} onValueChange={onProfessionalChange}>
          <SelectTrigger className="h-9 w-48 text-xs">
            <SelectValue placeholder={t("ag.all")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("ag.all")}</SelectItem>
            {professionals.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="inline-flex flex-wrap rounded-xl border bg-muted/60 p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPeriodChange(p)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                period === p
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`dash.period.${p}` as TKey)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

