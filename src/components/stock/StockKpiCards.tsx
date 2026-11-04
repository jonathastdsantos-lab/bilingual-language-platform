import {
  Package,
  DollarSign,
  AlertTriangle,
  PackageX,
  CalendarClock,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useT, formatBRL } from "@/lib/i18n";
import type { StockSummaryIndicators } from "@/types";

interface StockKpiCardsProps {
  summary: StockSummaryIndicators;
}

export function StockKpiCards({ summary }: StockKpiCardsProps) {
  const { t, dateLocale } = useT();

  const cards = [
    {
      label: t("stk.kpi.totalItems"),
      value: String(summary.totalItemsCount),
      icon: Package,
      tone: "text-sky-700 bg-sky-50 border-sky-200",
      valueClass: "text-sky-900",
    },
    {
      label: t("stk.kpi.inventoryValue"),
      value: formatBRL(summary.totalInventoryValueBRL, dateLocale),
      icon: DollarSign,
      tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
      valueClass: "text-emerald-700",
    },
    {
      label: t("stk.kpi.lowStock"),
      value: String(summary.lowStockCount),
      icon: AlertTriangle,
      tone:
        summary.lowStockCount > 0
          ? "text-amber-700 bg-amber-50 border-amber-200"
          : "text-slate-600 bg-slate-50 border-slate-200",
      valueClass: summary.lowStockCount > 0 ? "text-amber-700" : "text-slate-700",
    },
    {
      label: t("stk.kpi.outOfStock"),
      value: String(summary.outOfStockCount),
      icon: PackageX,
      tone:
        summary.outOfStockCount > 0
          ? "text-rose-700 bg-rose-50 border-rose-200"
          : "text-slate-600 bg-slate-50 border-slate-200",
      valueClass: summary.outOfStockCount > 0 ? "text-rose-700" : "text-slate-700",
    },
    {
      label: t("stk.kpi.expiringSoon"),
      value: String(summary.expiringSoonCount),
      icon: CalendarClock,
      tone:
        summary.expiringSoonCount > 0
          ? "text-orange-700 bg-orange-50 border-orange-200"
          : "text-slate-600 bg-slate-50 border-slate-200",
      valueClass: summary.expiringSoonCount > 0 ? "text-orange-700" : "text-slate-700",
    },
    {
      label: t("stk.kpi.expired"),
      value: String(summary.expiredCount),
      icon: ShieldAlert,
      tone:
        summary.expiredCount > 0
          ? "text-red-700 bg-red-50 border-red-200"
          : "text-slate-600 bg-slate-50 border-slate-200",
      valueClass: summary.expiredCount > 0 ? "text-red-700" : "text-slate-700",
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

