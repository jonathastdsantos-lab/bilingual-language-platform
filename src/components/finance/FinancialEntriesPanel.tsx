import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  CheckCircle2,
  XCircle,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT, formatBRL } from "@/lib/i18n";
import {
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  isEntryOverdue,
  createFinancialEntriesWithInstallments,
  updateFinancialEntryStatus,
  deleteFinancialEntry,
} from "@/modules/finance";
import { toSaoPauloDateKey } from "@/utils/timezone";
import type {
  FinancialEntry,
  FinancialEntryStatus,
  FinancialEntryType,
  PaymentMethod,
} from "@/types";

interface FinancialEntriesPanelProps {
  clinicId: string;
  unitId: string | null;
  canWrite: boolean;
  entries: FinancialEntry[];
  patients: { id: string; full_name: string }[];
  professionals: { id: string; name: string }[];
  onRefresh: () => void;
}

export function FinancialEntriesPanel({
  clinicId,
  unitId,
  canWrite,
  entries,
  patients,
  professionals,
  onRefresh,
}: FinancialEntriesPanelProps) {
  const { t, dateLocale } = useT();
  const todayStr = toSaoPauloDateKey(new Date());

  // Form state
  const [entryType, setEntryType] = useState<FinancialEntryType>("income");
  const [category, setCategory] = useState<string>(INCOME_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [installmentsCount, setInstallmentsCount] = useState("1");
  const [firstDueDate, setFirstDueDate] = useState(todayStr);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [markFirstPaid, setMarkFirstPaid] = useState(true);
  const [patientId, setPatientId] = useState<string>("none");
  const [professionalId, setProfessionalId] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Filter state
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const categories = entryType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  function handleTypeChange(nextType: FinancialEntryType) {
    setEntryType(nextType);
    setCategory(nextType === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
  }

  async function handleCreateEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;

    const amountNum = Number(totalAmount);
    const installmentsNum = Number(installmentsCount) || 1;
    if (!description.trim() || Number.isNaN(amountNum) || amountNum <= 0) {
      toast.error(t("common.error"));
      return;
    }

    setBusy(true);
    try {
      await createFinancialEntriesWithInstallments(clinicId, {
        entry_type: entryType,
        category,
        description: description.trim(),
        total_amount: amountNum,
        installments: installmentsNum,
        first_due_date: firstDueDate,
        payment_method: paymentMethod,
        status: markFirstPaid ? "paid" : "pending",
        patient_id: patientId === "none" ? null : patientId,
        professional_id: professionalId === "none" ? null : professionalId,
        unit_id: unitId,
        notes: notes.trim() || undefined,
      });
      toast.success(t("common.saved"));
      setDescription("");
      setTotalAmount("");
      setInstallmentsCount("1");
      setNotes("");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusChange(entry: FinancialEntry, nextStatus: FinancialEntryStatus) {
    if (!canWrite) return;
    try {
      await updateFinancialEntryStatus(clinicId, entry.id, nextStatus);
      toast.success(t("common.saved"));
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  async function handleDelete(entryId: string) {
    if (!canWrite) return;
    try {
      await deleteFinancialEntry(clinicId, entryId);
      toast.success(t("common.saved"));
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  const filteredEntries = entries.filter((entry) => {
    if (typeFilter !== "all" && entry.entry_type !== typeFilter) return false;
    const effectiveStatus: FinancialEntryStatus = isEntryOverdue(entry)
      ? "overdue"
      : entry.status;
    if (statusFilter !== "all" && effectiveStatus !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDesc = entry.description.toLowerCase().includes(q);
      const matchCat = entry.category.toLowerCase().includes(q);
      const matchPat = (entry.patients?.full_name ?? "").toLowerCase().includes(q);
      const matchProf = (entry.professionals?.name ?? "").toLowerCase().includes(q);
      if (!matchDesc && !matchCat && !matchPat && !matchProf) return false;
    }
    return true;
  });

  function renderStatusBadge(entry: FinancialEntry) {
    const overdue = isEntryOverdue(entry);
    if (entry.status === "paid") {
      return (
        <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
          {t("fin.status.paid")}
        </Badge>
      );
    }
    if (entry.status === "cancelled") {
      return (
        <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-600">
          {t("fin.status.cancelled")}
        </Badge>
      );
    }
    if (overdue) {
      return (
        <Badge className="border-red-200 bg-red-100 text-red-800 hover:bg-red-100">
          {t("fin.status.overdue")}
        </Badge>
      );
    }
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        {t("fin.status.pending")}
      </Badge>
    );
  }

  return (
    <div className="space-y-6">
      {canWrite && (
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Plus className="h-4 w-4 text-primary" />
              {t("fin.newEntry")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateEntry} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">{t("fin.type")}</Label>
                <Select
                  value={entryType}
                  onValueChange={(v) => handleTypeChange(v as FinancialEntryType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">{t("fin.type.income")}</SelectItem>
                    <SelectItem value="expense">{t("fin.type.expense")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("fin.category")}</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">{t("fin.description")}</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex.: Tratamento de Implante Superior / Aluguel do Consultório"
                  required
                  minLength={2}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("fin.amount")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0,00"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("fin.installments")}</Label>
                <Select value={installmentsCount} onValueChange={setInstallmentsCount}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, idx) => idx + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n === 1 ? "À vista (1x)" : `${n}x mensais`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("fin.dueDate")}</Label>
                <Input
                  type="date"
                  value={firstDueDate}
                  onChange={(e) => setFirstDueDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("fin.paymentMethod")}</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((pm) => (
                      <SelectItem key={pm} value={pm}>
                        {t(`fin.pm.${pm}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("ag.patient")} (opcional)</Label>
                <Select value={patientId} onValueChange={setPatientId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem vínculo —</SelectItem>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("ag.professional")} (opcional)</Label>
                <Select value={professionalId} onValueChange={setProfessionalId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem vínculo —</SelectItem>
                    {professionals.map((pr) => (
                      <SelectItem key={pr.id} value={pr.id}>
                        {pr.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("ag.notes")} (opcional)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Comprovante / NF / Observação"
                />
              </div>

              <div className="flex items-end justify-between gap-2 pt-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={markFirstPaid}
                    onChange={(e) => setMarkFirstPaid(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary"
                  />
                  Quitar 1ª parcela hoje
                </label>
                <Button type="submit" variant="hero" size="sm" disabled={busy}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {t("common.add")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <Filter className="h-4 w-4 text-primary" />
            {t("fin.tabEntries")} ({filteredEntries.length})
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`${t("common.search")}...`}
              className="h-8 w-44 text-xs"
            />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder={t("fin.filterType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("fin.allTypes")}</SelectItem>
                <SelectItem value="income">{t("fin.type.income")}</SelectItem>
                <SelectItem value="expense">{t("fin.type.expense")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder={t("fin.filterStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("fin.allStatuses")}</SelectItem>
                <SelectItem value="pending">{t("fin.status.pending")}</SelectItem>
                <SelectItem value="paid">{t("fin.status.paid")}</SelectItem>
                <SelectItem value="overdue">{t("fin.status.overdue")}</SelectItem>
                <SelectItem value="cancelled">{t("fin.status.cancelled")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {filteredEntries.length === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              {t("common.none")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("fin.dueDate")}</TableHead>
                    <TableHead>{t("fin.type")}</TableHead>
                    <TableHead>{t("fin.description")}</TableHead>
                    <TableHead>{t("ag.patient")} / {t("ag.professional")}</TableHead>
                    <TableHead>{t("fin.paymentMethod")}</TableHead>
                    <TableHead className="text-right">{t("fin.amount")}</TableHead>
                    <TableHead>{t("ag.status")}</TableHead>
                    {canWrite && <TableHead className="text-right">{t("common.actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs font-medium">
                        {entry.due_date.split("-").reverse().join("/")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          {entry.entry_type === "income" ? (
                            <ArrowUpCircle className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <ArrowDownCircle className="h-4 w-4 text-rose-600" />
                          )}
                          <span>{entry.category}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate text-sm font-medium">{entry.description}</div>
                        {entry.notes && (
                          <div className="truncate text-xs text-muted-foreground">{entry.notes}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.patients?.full_name && (
                          <div className="font-medium text-foreground">{entry.patients.full_name}</div>
                        )}
                        {entry.professionals?.name && <div>Dr(a). {entry.professionals.name}</div>}
                        {!entry.patients?.full_name && !entry.professionals?.name && "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.payment_method ? t(`fin.pm.${entry.payment_method}`) : "—"}
                      </TableCell>
                      <TableCell
                        className={`whitespace-nowrap text-right font-display text-sm font-bold ${
                          entry.entry_type === "income" ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {entry.entry_type === "expense" ? "- " : "+ "}
                        {formatBRL(Number(entry.amount), dateLocale)}
                      </TableCell>
                      <TableCell>{renderStatusBadge(entry)}</TableCell>
                      {canWrite && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {entry.status !== "paid" && entry.status !== "cancelled" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 border-emerald-200 px-2 text-xs text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleStatusChange(entry, "paid")}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {t("fin.markPaid")}
                              </Button>
                            )}
                            {entry.status !== "cancelled" && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                title={t("fin.cancelEntry")}
                                className="h-7 w-7 text-amber-600 hover:bg-amber-50"
                                onClick={() => handleStatusChange(entry, "cancelled")}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              title={t("common.delete")}
                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(entry.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
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
