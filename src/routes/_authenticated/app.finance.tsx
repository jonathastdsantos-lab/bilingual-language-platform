import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Wallet, Receipt, Award, Lock, Clock, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/services/supabase";
import { useClinic } from "@/lib/clinic";
import { useT } from "@/lib/i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  fetchFinancialEntries,
  fetchCashClosings,
  calculateCashFlowSummary,
  calculateProfessionalCommissions,
} from "@/modules/finance";
import { fetchDentalInsurances } from "@/modules/clinics";
import { fetchTissGuides } from "@/modules/tiss";
import { CashFlowKpiCards } from "@/components/finance/CashFlowKpiCards";
import { FinancialEntriesPanel } from "@/components/finance/FinancialEntriesPanel";
import {
  ProfessionalCommissionsPanel,
  CashClosingPanel,
} from "@/components/finance/CommissionsAndClosingPanel";
import { TissGuidesPanel } from "@/components/finance/TissGuidesPanel";
import { AdvancedCommissionsPanel } from "@/components/finance/AdvancedCommissionsPanel";
import type { CashClosing, FinancialEntry } from "@/types";

export const Route = createFileRoute("/_authenticated/app/finance")({
  head: () => ({
    meta: [
      { title: "Financeiro — SondaPro" },
      {
        name: "description",
        content: "Gestão financeira odontológica, contas a receber, contas a pagar, comissões e fechamento de caixa.",
      },
    ],
  }),
  component: FinancePage,
});

interface PatientOption {
  id: string;
  full_name: string;
}

interface ProfessionalOption {
  id: string;
  name: string;
  specialty: string | null;
  commission_pct: number;
}

function FinancePage() {
  const { t } = useT();
  const { clinicId, clinicName, activeUnitId, hasPermission } = useClinic();

  const canView = hasPermission("financial.view");
  const canWrite = hasPermission("financial.write");

  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [closings, setClosings] = useState<CashClosing[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: tissGuides = [] } = useQuery({
    queryKey: ["tissGuides", clinicId],
    enabled: canView && !!clinicId,
    queryFn: () => fetchTissGuides(clinicId),
  });

  const { data: insurances = [] } = useQuery({
    queryKey: ["dentalInsurances", clinicId],
    enabled: canView && !!clinicId,
    queryFn: () => fetchDentalInsurances(clinicId),
  });

  const loadFinanceData = useCallback(async () => {
    if (!clinicId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [entriesData, closingsData, patientsRes, profsRes] = await Promise.all([
        fetchFinancialEntries(clinicId),
        fetchCashClosings(clinicId),
        supabase
          .from("patients")
          .select("id, full_name")
          .eq("clinic_id", clinicId)
          .order("full_name", { ascending: true }),
        supabase
          .from("professionals")
          .select("id, name, specialty, commission_pct")
          .eq("clinic_id", clinicId)
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);

      if (patientsRes.error) {
        toast.error(patientsRes.error.message);
      }
      if (profsRes.error) {
        toast.error(profsRes.error.message);
      }

      setEntries(entriesData);
      setClosings(closingsData);
      setPatients((patientsRes.data ?? []) as PatientOption[]);
      setProfessionals((profsRes.data ?? []) as ProfessionalOption[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [clinicId, canView, t]);

  useEffect(() => {
    void loadFinanceData();
  }, [loadFinanceData]);

  const scopedEntries = useMemo(() => {
    if (!activeUnitId || activeUnitId === "all") return entries;
    return entries.filter((e) => !e.unit_id || e.unit_id === activeUnitId);
  }, [entries, activeUnitId]);

  const summary = useMemo(
    () => calculateCashFlowSummary(scopedEntries),
    [scopedEntries]
  );

  const commissions = useMemo(
    () => calculateProfessionalCommissions(scopedEntries, professionals),
    [scopedEntries, professionals]
  );

  if (!canView) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        {t("common.noPermission")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">
                {t("fin.title")}
              </h1>
              <p className="text-xs text-muted-foreground">{t("fin.subtitle")}</p>
            </div>
          </div>
        </div>

        <Badge variant="outline" className="w-fit gap-1.5 px-2.5 py-1 text-xs">
          <Clock className="h-3.5 w-3.5 text-primary" />
          {t("dash.timezoneBadge")}
        </Badge>
      </div>

      {/* Cash Flow KPIs */}
      <CashFlowKpiCards summary={summary} />

      {loading ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      ) : (
        <Tabs defaultValue="entries" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:grid-cols-4">
            <TabsTrigger value="entries" className="gap-2">
              <Receipt className="h-4 w-4" />
              {t("fin.tabEntries")} ({scopedEntries.length})
            </TabsTrigger>
            <TabsTrigger value="tiss" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Guias TISS / GTO ({tissGuides.length})
            </TabsTrigger>
            <TabsTrigger value="commissions" className="gap-2">
              <Award className="h-4 w-4" />
              {t("fin.tabCommissions")} ({commissions.length})
            </TabsTrigger>
            <TabsTrigger value="closing" className="gap-2">
              <Lock className="h-4 w-4" />
              {t("fin.tabClosing")} ({closings.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entries">
            <FinancialEntriesPanel
              clinicId={clinicId}
              unitId={activeUnitId === "all" ? null : activeUnitId}
              canWrite={canWrite}
              entries={scopedEntries}
              patients={patients}
              professionals={professionals.map((p) => ({ id: p.id, name: p.name }))}
              onRefresh={loadFinanceData}
            />
          </TabsContent>

          <TabsContent value="tiss">
            <TissGuidesPanel
              clinicId={clinicId}
              clinicName={clinicName}
              guides={tissGuides}
              insurances={insurances}
              patients={patients as any}
              professionals={professionals as any}
              canWrite={canWrite}
            />
          </TabsContent>

          <TabsContent value="commissions" className="space-y-6">
            <AdvancedCommissionsPanel
              clinicId={clinicId}
              clinicName={clinicName}
              professionals={professionals}
              canManage={canWrite}
            />
            <div className="border-t pt-4">
              <h3 className="text-sm font-bold text-navy mb-3">Estimativa de Comissões por Receitas Realizadas</h3>
              <ProfessionalCommissionsPanel commissions={commissions} />
            </div>
          </TabsContent>

          <TabsContent value="closing">
            <CashClosingPanel
              clinicId={clinicId}
              canWrite={canWrite}
              entries={scopedEntries}
              closings={closings}
              onRefresh={loadFinanceData}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
