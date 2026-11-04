import { Link } from "@tanstack/react-router";
import { CalendarPlus, Settings, UserPlus, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function EmptyDashboardState({
  canManageSettings,
  canWritePatients,
}: {
  canManageSettings: boolean;
  canWritePatients: boolean;
}) {
  const { t } = useT();

  return (
    <div className="rounded-2xl border border-dashed bg-card/80 p-6 text-center shadow-card">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary">
        <Sparkles className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-lg font-bold text-navy">{t("dash.emptyTitle")}</h3>
      <p className="mx-auto mt-1 max-w-xl text-xs text-muted-foreground sm:text-sm">{t("dash.emptyDesc")}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {canManageSettings && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/settings">
              <Settings className="h-4 w-4" />
              {t("dash.emptyCtaSettings")}
            </Link>
          </Button>
        )}
        {canWritePatients && (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/patients" search={{}}>
                <UserPlus className="h-4 w-4" />
                {t("dash.emptyCtaPatients")}
              </Link>
            </Button>
            <Button variant="hero" size="sm" asChild>
              <Link to="/app/agenda">
                <CalendarPlus className="h-4 w-4" />
                {t("dash.emptyCtaAgenda")}
              </Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

