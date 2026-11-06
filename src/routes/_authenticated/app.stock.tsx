import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Package, ArrowLeftRight, Clock, ShieldCheck } from "lucide-react";
import { supabase } from "@/services/supabase";
import { useClinic } from "@/lib/clinic";
import { useT } from "@/lib/i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  fetchStockItems,
  fetchStockMovements,
  calculateStockSummary,
} from "@/modules/stock";
import { StockKpiCards } from "@/components/stock/StockKpiCards";
import { StockCatalogPanel } from "@/components/stock/StockCatalogPanel";
import { StockMovementsPanel } from "@/components/stock/StockMovementsPanel";
import { AnvisaLotsTraceabilityPanel } from "@/components/stock/AnvisaLotsTraceabilityPanel";
import type { StockItem, StockMovement } from "@/types";

export const Route = createFileRoute("/_authenticated/app/stock")({
  head: () => ({
    meta: [
      { title: "Estoque e Insumos — SondaPro" },
      {
        name: "description",
        content:
          "Controle de estoque odontológico, lotes ANVISA, validades sanitárias e Kardex de movimentações.",
      },
    ],
  }),
  component: StockPage,
});

interface PatientOption {
  id: string;
  full_name: string;
}

interface ProfessionalOption {
  id: string;
  name: string;
}

function StockPage() {
  const { t } = useT();
  const { clinicId, clinicName, activeUnitId, hasPermission } = useClinic();

  const canRead = hasPermission("stock.read");
  const canWrite = hasPermission("stock.write");

  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStockData = useCallback(async () => {
    if (!clinicId || !canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [itemsData, movementsData, patientsRes, profsRes] = await Promise.all([
        fetchStockItems(clinicId),
        fetchStockMovements(clinicId),
        supabase
          .from("patients")
          .select("id, full_name")
          .eq("clinic_id", clinicId)
          .order("full_name", { ascending: true }),
        supabase
          .from("professionals")
          .select("id, name")
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

      setItems(itemsData);
      setMovements(movementsData);
      setPatients((patientsRes.data ?? []) as PatientOption[]);
      setProfessionals((profsRes.data ?? []) as ProfessionalOption[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [clinicId, canRead, t]);

  useEffect(() => {
    void loadStockData();
  }, [loadStockData]);

  const scopedItems = useMemo(() => {
    if (!activeUnitId || activeUnitId === "all") return items;
    return items.filter((item) => !item.unit_id || item.unit_id === activeUnitId);
  }, [items, activeUnitId]);

  const scopedMovements = useMemo(() => {
    if (!activeUnitId || activeUnitId === "all") return movements;
    return movements.filter((mov) => !mov.unit_id || mov.unit_id === activeUnitId);
  }, [movements, activeUnitId]);

  const summary = useMemo(
    () => calculateStockSummary(scopedItems),
    [scopedItems]
  );

  if (!canRead) {
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
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">
                {t("stk.title")}
              </h1>
              <p className="text-xs text-muted-foreground">{t("stk.subtitle")}</p>
            </div>
          </div>
        </div>

        <Badge variant="outline" className="w-fit gap-1.5 px-2.5 py-1 text-xs">
          <Clock className="h-3.5 w-3.5 text-primary" />
          {t("dash.timezoneBadge")}
        </Badge>
      </div>

      {/* Stock Summary KPIs */}
      <StockKpiCards summary={summary} />

      {loading ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      ) : (
        <Tabs defaultValue="catalog" className="space-y-4">
          <TabsList className="grid w-full grid-cols-1 sm:w-auto sm:grid-cols-3">
            <TabsTrigger value="catalog" className="gap-2">
              <Package className="h-4 w-4" />
              {t("stk.tabCatalog")} ({scopedItems.length})
            </TabsTrigger>
            <TabsTrigger value="anvisa-lots" className="gap-2 font-bold text-teal">
              <ShieldCheck className="h-4 w-4" />
              Lotes & ANVISA ({scopedItems.filter((i) => Boolean(i.batch_number)).length})
            </TabsTrigger>
            <TabsTrigger value="movements" className="gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              {t("stk.tabMovements")} ({scopedMovements.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="catalog">
            <StockCatalogPanel
              clinicId={clinicId}
              unitId={activeUnitId === "all" ? null : activeUnitId}
              canWrite={canWrite}
              items={scopedItems}
              onRefresh={loadStockData}
            />
          </TabsContent>

          <TabsContent value="anvisa-lots">
            <AnvisaLotsTraceabilityPanel
              clinicId={clinicId}
              clinicName={clinicName}
              items={scopedItems}
              movements={scopedMovements}
              patients={patients}
              professionals={professionals}
            />
          </TabsContent>

          <TabsContent value="movements">
            <StockMovementsPanel
              clinicId={clinicId}
              unitId={activeUnitId === "all" ? null : activeUnitId}
              canWrite={canWrite}
              items={scopedItems}
              movements={scopedMovements}
              professionals={professionals}
              patients={patients}
              onRefresh={loadStockData}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

