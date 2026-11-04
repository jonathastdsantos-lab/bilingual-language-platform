import {
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  Clock,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useT, formatBRL } from "@/lib/i18n";
import type { CashFlowSummary } from "@/types";

interface CashFlowKpiCardsProps {
  summary: CashFlowSummary;
}

export function CashFlowKpiCards({ summary }: CashFlowKpiCardsProps) {
  const { t, dateLocale } = useT();

  const cards = [
    {
      label: t("fin.kpi.received"),
      value: formatBRL(summary.receivedIncome, dateLocale),
      icon: ArrowUpRight,
      tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
      valueClass: "text-emerald-700",
    },
    {
      label: t("fin.kpi.paidExpenses"),
      value: formatBRL(summary.paidExpenses, dateLocale),
      icon: ArrowDownRight,
      tone: "text-rose-700 bg-rose-50 border-rose-200",
      valueClass: "text-rose-700",
    },
    {
      label: t("fin.kpi.netBalance"),
      value: formatBRL(summary.netCashBalance, dateLocale),
      icon: Wallet,
      tone: "text-sky-700 bg-sky-50 border-sky-200",
      valueClass: summary.netCashBalance >= 0 ? "text-sky-800" : "text-rose-700",
    },
    {
      label: t("fin.kpi.pendingReceivables"),
      value: formatBRL(summary.pendingReceivables, dateLocale),
      icon: Clock,
      tone: "text-blue-700 bg-blue-50 border-blue-200",
      valueClass: "text-blue-800",
    },
    {
      label: t("fin.kpi.pendingPayables"),
      value: formatBRL(summary.pendingPayables, dateLocale),
      icon: Receipt,
      tone: "text-amber-700 bg-amber-50 border-amber-200",
      valueClass: "text-amber-800",
    },
    {
      label: t("fin.kpi.overdue"),
      value: formatBRL(summary.overdueReceivables + summary.overduePayables, dateLocale),
      sub: `${summary.overdueCount} título(s) vencido(s)`,
      icon: AlertTriangle,
      tone: summary.overdueCount > 0 ? "text-red-700 bg-red-50 border-red-200" : "text-slate-600 bg-slate-50 border-slate-200",
      valueClass: summary.overdueCount > 0 ? "text-red-700" : "text-slate-700",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${c.tone}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className={`mt-2 font-display text-lg font-extrabold tracking-tight ${c.valueClass}`}>
                {c.value}
              </div>
              {c.sub && (
                <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{c.sub}</div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
