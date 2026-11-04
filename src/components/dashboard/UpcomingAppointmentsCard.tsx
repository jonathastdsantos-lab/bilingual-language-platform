import { Link } from "@tanstack/react-router";
import { CalendarDays, ArrowRight } from "lucide-react";
import { useT, type TKey } from "@/lib/i18n";
import { formatSaoPauloDateTime } from "@/utils/timezone";
import { Button } from "@/components/ui/button";

export interface UpcomingItem {
  id: string;
  starts_at: string;
  status: string;
  procedure: string | null;
  patients: { full_name: string | null; allergies?: string | null } | null;
  professionals: { name: string | null; color: string | null } | null;
}

export function UpcomingAppointmentsCard({
  items,
  dateLocale,
}: {
  items: UpcomingItem[];
  dateLocale: string;
}) {
  const { t } = useT();

  return (
    <div className="flex flex-col justify-between rounded-2xl border bg-card p-5 shadow-card">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-navy">{t("dash.upcoming")}</h3>
          <CalendarDays className="h-4 w-4 text-primary" />
        </div>

        {items.length === 0 ? (
          <div className="my-8 rounded-xl border border-dashed bg-muted/30 p-6 text-center">
            <p className="text-sm font-medium text-muted-foreground">{t("common.none")}</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {items.map((u) => (
              <li
                key={u.id}
                className="flex items-center gap-3 rounded-xl border bg-background/60 p-2.5 text-sm transition-colors hover:bg-muted/40"
              >
                <span
                  className="h-9 w-1.5 shrink-0 rounded-full"
                  style={{ background: u.professionals?.color ?? "var(--primary)" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-navy">{u.patients?.full_name}</p>
                    {u.patients?.allergies && (
                      <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                        !
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.professionals?.name} · {u.procedure || t(`status.${u.status}` as TKey)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="block text-xs font-semibold text-navy">
                    {formatSaoPauloDateTime(u.starts_at, dateLocale)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {t(`status.${u.status}` as TKey)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 pt-2">
        <Button variant="outline" size="sm" className="w-full justify-between" asChild>
          <Link to="/app/agenda">
            <span>{t("dash.viewFullAgenda")}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

