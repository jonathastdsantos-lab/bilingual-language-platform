import { DollarSign, TrendingUp, Wallet, Receipt, Percent, Lock } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { FinancialIndicators } from "@/types";
import { formatCurrencyBRL } from "@/utils/timezone";

export function FinancialKpiCards({
  metrics,
  canViewFinancial,
  dateLocale,
}: {
  metrics: FinancialIndicators;
  canViewFinancial: boolean;
  dateLocale: string;
}) {
  const { t } = useT();

  if (!canViewFinancial) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
        <Lock className="h-4 w-4 text-primary" />
        <span>{t("dash.financialRestricted")}</span>
      </div>
    );
  }

  const cards = [
    {
      label: t("dash.revenueDay"),
      value: formatCurrencyBRL(metrics.revenueToday, dateLocale),
      icon: DollarSign,
      highlight: false,
    },
    {
      label: t("dash.revenueMonth"),
      value: formatCurrencyBRL(metrics.revenuePeriod, dateLocale),
      icon: Wallet,
      highlight: true,
    },
    {
      label: t("dash.projectedRevenue"),
      value: formatCurrencyBRL(metrics.projectedRevenuePeriod, dateLocale),
      icon: TrendingUp,
      highlight: false,
    },
    {
      label: t("dash.averageTicket"),
      value: formatCurrencyBRL(metrics.averageTicket, dateLocale),
      icon: Receipt,
      highlight: false,
    },
    {
      label: t("dash.commissions"),
      value: formatCurrencyBRL(metrics.estimatedCommissions, dateLocale),
      icon: Percent,
      highlight: false,
    },
  ];

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        {t("dash.section.financial")}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className={`rounded-2xl border p-4 shadow-card transition-transform ${
                c.highlight ? "bg-brand text-primary-foreground" : "bg-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium ${c.highlight ? "opacity-90" : "text-muted-foreground"}`}>
                  {c.label}
                </span>
                <Icon className={`h-4 w-4 ${c.highlight ? "text-primary-foreground" : "text-primary"}`} />
              </div>
              <p className="mt-3 font-display text-xl font-extrabold">{c.value}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

