import { useState } from "react";
import { toast } from "sonner";
import { Award, Lock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT, formatBRL } from "@/lib/i18n";
import { toSaoPauloDateKey } from "@/utils/timezone";
import { createCashClosing } from "@/modules/finance";
import type {
  CashClosing,
  FinancialEntry,
  ProfessionalCommissionSummary,
} from "@/types";

interface CommissionsPanelProps {
  commissions: ProfessionalCommissionSummary[];
}

export function ProfessionalCommissionsPanel({ commissions }: CommissionsPanelProps) {
  const { t, dateLocale } = useT();

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <Award className="h-4 w-4 text-primary" />
          {t("fin.commTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {commissions.length === 0 ? (
          <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
            {t("common.none")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ag.professional")}</TableHead>
                  <TableHead className="text-right">{t("set.commission")}</TableHead>
                  <TableHead className="text-right">Base Recebida (R$)</TableHead>
                  <TableHead className="text-right">Base em Aberto (R$)</TableHead>
                  <TableHead className="text-right">{t("fin.commRealized")}</TableHead>
                  <TableHead className="text-right">{t("fin.commPending")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.map((row) => (
                  <TableRow key={row.professionalId}>
                    <TableCell className="font-semibold">{row.professionalName}</TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      {row.commissionPct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      {formatBRL(row.realizedRevenue, dateLocale)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatBRL(row.pendingRevenue, dateLocale)}
                    </TableCell>
                    <TableCell className="text-right font-display text-sm font-bold text-emerald-700">
                      {formatBRL(row.realizedCommission, dateLocale)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium text-amber-700">
                      {formatBRL(row.pendingCommission, dateLocale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CashClosingPanelProps {
  clinicId: string;
  canWrite: boolean;
  entries: FinancialEntry[];
  closings: CashClosing[];
  onRefresh: () => void;
}

export function CashClosingPanel({
  clinicId,
  canWrite,
  entries,
  closings,
  onRefresh,
}: CashClosingPanelProps) {
  const { t, dateLocale } = useT();
  const [closingDate, setClosingDate] = useState(toSaoPauloDateKey(new Date()));
  const [closingNotes, setClosingNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Calculate paid inflows and outflows on the chosen date
  const dayPaidEntries = entries.filter((entry) => {
    if (entry.status !== "paid") return false;
    const paidDay = entry.paid_at ? entry.paid_at.slice(0, 10) : entry.due_date;
    return paidDay === closingDate;
  });

  const dayIncome = dayPaidEntries
    .filter((e) => e.entry_type === "income")
    .reduce((acc, e) => acc + Number(e.amount), 0);
  const dayExpense = dayPaidEntries
    .filter((e) => e.entry_type === "expense")
    .reduce((acc, e) => acc + Number(e.amount), 0);
  const dayNet = Math.round((dayIncome - dayExpense) * 100) / 100;

  async function handleCloseCash(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setBusy(true);
    try {
      await createCashClosing({
        clinicId,
        closingDate,
        totalIncome: Math.round(dayIncome * 100) / 100,
        totalExpense: Math.round(dayExpense * 100) / 100,
        ...(closingNotes.trim() ? { notes: closingNotes.trim() } : {}),
      });
      toast.success(t("common.saved"));
      setClosingNotes("");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {canWrite && (
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Lock className="h-4 w-4 text-primary" />
              {t("fin.closingTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCloseCash} className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">{t("fin.closingDate")}</Label>
                <Input
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  required
                />
              </div>

              <div className="rounded-lg border bg-emerald-50/60 p-3">
                <div className="text-[11px] font-medium text-emerald-800">
                  Entradas Quitadas no Dia
                </div>
                <div className="mt-1 font-display text-base font-extrabold text-emerald-700">
                  {formatBRL(dayIncome, dateLocale)}
                </div>
              </div>

              <div className="rounded-lg border bg-rose-50/60 p-3">
                <div className="text-[11px] font-medium text-rose-800">
                  Saídas Quitadas no Dia
                </div>
                <div className="mt-1 font-display text-base font-extrabold text-rose-700">
                  {formatBRL(dayExpense, dateLocale)}
                </div>
              </div>

              <div className="rounded-lg border bg-sky-50/60 p-3">
                <div className="text-[11px] font-medium text-sky-900">
                  Saldo Apurado no Dia
                </div>
                <div className="mt-1 font-display text-base font-extrabold text-sky-800">
                  {formatBRL(dayNet, dateLocale)}
                </div>
              </div>

              <div className="space-y-1 sm:col-span-3">
                <Label className="text-xs">{t("ag.notes")}</Label>
                <Input
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="Conferência de comprovantes PIX, cartões e numerário em espécie..."
                />
              </div>

              <div className="flex items-end justify-end">
                <Button type="submit" variant="hero" className="w-full" disabled={busy}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  {t("fin.closeCashBtn")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">{t("fin.closingHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {closings.length === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              {t("common.none")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("fin.closingDate")}</TableHead>
                    <TableHead className="text-right">{t("fin.kpi.received")}</TableHead>
                    <TableHead className="text-right">{t("fin.kpi.paidExpenses")}</TableHead>
                    <TableHead className="text-right">{t("fin.kpi.netBalance")}</TableHead>
                    <TableHead>{t("ag.notes")}</TableHead>
                    <TableHead>{t("ag.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closings.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.closing_date.split("-").reverse().join("/")}
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-700">
                        {formatBRL(Number(c.total_income), dateLocale)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-rose-700">
                        {formatBRL(Number(c.total_expense), dateLocale)}
                      </TableCell>
                      <TableCell className="text-right font-display font-bold text-sky-800">
                        {formatBRL(Number(c.net_balance), dateLocale)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.notes ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          Auditado
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
