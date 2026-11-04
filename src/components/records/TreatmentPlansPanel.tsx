import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Plus } from "lucide-react";
import {
  ALL_VALID_FDI_TEETH,
  TOOTH_SURFACES,
  TREATMENT_PLAN_STATUSES,
  addTreatmentPlanItem,
  calculateTreatmentPlanSummary,
  createTreatmentPlan,
  updateTreatmentPlanItemStatus,
  updateTreatmentPlanStatus,
} from "@/modules/records";
import { useT, type TKey } from "@/lib/i18n";
import type { ToothSurface, TreatmentPlan, TreatmentPlanItem, TreatmentPlanStatus } from "@/types";
import { formatCurrencyBRL } from "@/utils/timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function TreatmentPlansPanel({
  clinicId,
  patientId,
  plans,
  items,
  professionals,
  canWrite,
  dateLocale,
}: {
  clinicId: string;
  patientId: string;
  plans: TreatmentPlan[];
  items: TreatmentPlanItem[];
  professionals: Array<{ id: string; name: string }>;
  canWrite: boolean;
  dateLocale: string;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [professionalId, setProfessionalId] = useState<string>(professionals[0]?.id ?? "none");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");

  const [itemDrafts, setItemDrafts] = useState<
    Record<string, { tooth: string; surface: ToothSurface; procedure: string; price: string }>
  >({});

  const createPlanMut = useMutation({
    mutationFn: async () => {
      await createTreatmentPlan(clinicId, {
        patient_id: patientId,
        professional_id: professionalId !== "none" ? professionalId : null,
        title,
        discount_amount: Math.max(0, Number(discount.replace(",", ".")) || 0),
        notes,
      });
    },
    onSuccess: () => {
      toast.success(t("common.saved"));
      setTitle("");
      setDiscount("0");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["treatmentPlans", clinicId, patientId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handlePlanStatusChange(planId: string, status: TreatmentPlanStatus) {
    try {
      await updateTreatmentPlanStatus(clinicId, planId, status);
      toast.success(t("common.saved"));
      qc.invalidateQueries({ queryKey: ["treatmentPlans", clinicId, patientId] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleAddItem(planId: string, e: React.FormEvent) {
    e.preventDefault();
    const draft = itemDrafts[planId] ?? { tooth: "none", surface: "W" as ToothSurface, procedure: "", price: "0" };
    try {
      await addTreatmentPlanItem(clinicId, {
        plan_id: planId,
        tooth_number: draft.tooth !== "none" ? Number(draft.tooth) : null,
        surface: draft.surface,
        procedure_name: draft.procedure,
        price: Math.max(0, Number(draft.price.replace(",", ".")) || 0),
      });
      toast.success(t("common.saved"));
      setItemDrafts((prev) => ({
        ...prev,
        [planId]: { tooth: "none", surface: "W", procedure: "", price: "0" },
      }));
      qc.invalidateQueries({ queryKey: ["treatmentPlans", clinicId, patientId] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleItemStatus(itemId: string, status: "planned" | "completed" | "cancelled") {
    try {
      await updateTreatmentPlanItemStatus(clinicId, itemId, status);
      toast.success(t("common.saved"));
      qc.invalidateQueries({ queryKey: ["treatmentPlans", clinicId, patientId] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {canWrite && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createPlanMut.mutate();
          }}
          className="rounded-2xl border bg-card p-5 shadow-card"
        >
          <h3 className="font-semibold text-navy">{t("rec.newPlan")}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("rec.planTitle")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={160} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("ag.professional")}</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {professionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label>{t("rec.planDiscount")}</Label>
                <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <Button variant="hero" disabled={createPlanMut.isPending}>
                <Plus className="h-4 w-4" />
                {t("common.add")}
              </Button>
            </div>
          </div>
        </form>
      )}

      {plans.length === 0 ? (
        <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
          {t("common.none")}
        </div>
      ) : (
        plans.map((plan) => {
          const planItems = items.filter((i) => i.plan_id === plan.id);
          const summary = calculateTreatmentPlanSummary(plan, planItems);
          const draft = itemDrafts[plan.id] ?? {
            tooth: "none",
            surface: "W" as ToothSurface,
            procedure: "",
            price: "0",
          };

          return (
            <div key={plan.id} className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                <div>
                  <h4 className="text-lg font-extrabold text-navy">{plan.title}</h4>
                  <p className="text-xs text-muted-foreground">
                    {t("ag.professional")}: {plan.professionals?.name ?? "—"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {canWrite ? (
                    <Select
                      value={plan.status}
                      onValueChange={(v) => handlePlanStatusChange(plan.id, v as TreatmentPlanStatus)}
                    >
                      <SelectTrigger className="h-8 w-40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TREATMENT_PLAN_STATUSES.map((st) => (
                          <SelectItem key={st} value={st}>
                            {t(`rec.planStatus.${st}` as TKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">
                      {t(`rec.planStatus.${plan.status}` as TKey)}
                    </span>
                  )}
                </div>
              </div>

              {/* Resumo Financeiro do Orçamento */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="text-[11px] text-muted-foreground">{t("rec.subtotal")}</p>
                  <p className="font-display text-base font-bold text-navy">
                    {formatCurrencyBRL(summary.subtotal, dateLocale)}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="text-[11px] text-muted-foreground">{t("rec.discount")}</p>
                  <p className="font-display text-base font-bold text-amber-700">
                    - {formatCurrencyBRL(summary.discount, dateLocale)}
                  </p>
                </div>
                <div className="rounded-xl bg-primary/10 p-3">
                  <p className="text-[11px] font-semibold text-primary">{t("rec.netTotal")}</p>
                  <p className="font-display text-base font-extrabold text-navy">
                    {formatCurrencyBRL(summary.netTotal, dateLocale)}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-500/10 p-3">
                  <p className="text-[11px] font-semibold text-emerald-700">
                    {t("rec.completedTotal")} ({summary.progressPct}%)
                  </p>
                  <p className="font-display text-base font-bold text-emerald-800">
                    {formatCurrencyBRL(summary.completedTotal, dateLocale)}
                  </p>
                </div>
              </div>

              {/* Lista de Itens do Plano */}
              <ul className="divide-y text-sm">
                {planItems.length === 0 && <li className="py-2 text-muted-foreground">{t("common.none")}</li>}
                {planItems.map((it) => (
                  <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <div className="flex items-center gap-2">
                      {it.tooth_number && (
                        <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
                          #{it.tooth_number} ({it.surface})
                        </span>
                      )}
                      <span className={it.status === "completed" ? "font-medium text-emerald-700" : "font-medium text-navy"}>
                        {it.procedure_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{formatCurrencyBRL(Number(it.price), dateLocale)}</span>
                      {canWrite && it.status === "planned" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => handleItemStatus(it.id, "completed")}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          {t("rec.markDone")}
                        </Button>
                      )}
                      {it.status === "completed" && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          {t("status.completed")}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Adicionar Procedimento ao Plano */}
              {canWrite && (
                <form
                  onSubmit={(e) => handleAddItem(plan.id, e)}
                  className="grid gap-2 border-t pt-3 sm:grid-cols-[110px_130px_1fr_130px_auto] sm:items-end"
                >
                  <div className="space-y-1">
                    <Label className="text-xs">{t("rec.selectedTooth")}</Label>
                    <Select
                      value={draft.tooth}
                      onValueChange={(v) => setItemDrafts((p) => ({ ...p, [plan.id]: { ...draft, tooth: v } }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {ALL_VALID_FDI_TEETH.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            #{n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{t("rec.surface")}</Label>
                    <Select
                      value={draft.surface}
                      onValueChange={(v) =>
                        setItemDrafts((p) => ({ ...p, [plan.id]: { ...draft, surface: v as ToothSurface } }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TOOTH_SURFACES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{t("ag.procedure")}</Label>
                    <Input
                      className="h-8 text-xs"
                      required
                      value={draft.procedure}
                      onChange={(e) =>
                        setItemDrafts((p) => ({ ...p, [plan.id]: { ...draft, procedure: e.target.value } }))
                      }
                      placeholder={t("rec.addItem")}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{t("ag.price")}</Label>
                    <Input
                      className="h-8 text-xs"
                      inputMode="decimal"
                      value={draft.price}
                      onChange={(e) =>
                        setItemDrafts((p) => ({ ...p, [plan.id]: { ...draft, price: e.target.value } }))
                      }
                    />
                  </div>

                  <Button variant="outline" size="sm" className="h-8">
                    <Plus className="h-3.5 w-3.5" />
                    {t("common.add")}
                  </Button>
                </form>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

