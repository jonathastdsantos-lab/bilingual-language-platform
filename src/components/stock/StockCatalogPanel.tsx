import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Filter,
  ArrowUpCircle,
  ArrowDownCircle,
  Trash2,
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
  STOCK_CATEGORIES,
  STOCK_UNITS,
  evaluateStockItemStatus,
  createStockItem,
  recordStockMovement,
  deleteStockItem,
} from "@/modules/stock";
import type { StockAlertStatus, StockItem } from "@/types";

interface StockCatalogPanelProps {
  clinicId: string;
  unitId: string | null;
  canWrite: boolean;
  items: StockItem[];
  onRefresh: () => void;
}

export function StockCatalogPanel({
  clinicId,
  unitId,
  canWrite,
  items,
  onRefresh,
}: StockCatalogPanelProps) {
  const { t, dateLocale } = useT();

  // New Item Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(STOCK_CATEGORIES[0]);
  const [sku, setSku] = useState("");
  const [unitMeasure, setUnitMeasure] = useState<string>("un");
  const [currentQty, setCurrentQty] = useState("10");
  const [minQty, setMinQty] = useState("5");
  const [unitCost, setUnitCost] = useState("0");
  const [supplier, setSupplier] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [busy, setBusy] = useState(false);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;

    setBusy(true);
    try {
      await createStockItem(clinicId, {
        name: name.trim(),
        category,
        sku: sku.trim() || undefined,
        unit_measure: unitMeasure,
        current_quantity: Number(currentQty) || 0,
        min_quantity: Number(minQty) || 0,
        unit_cost: Number(unitCost) || 0,
        supplier: supplier.trim() || undefined,
        batch_number: batchNumber.trim() || undefined,
        expiration_date: expirationDate || null,
        storage_location: storageLocation.trim() || undefined,
        unit_id: unitId,
      });
      toast.success(t("common.saved"));
      setName("");
      setSku("");
      setCurrentQty("10");
      setMinQty("5");
      setUnitCost("0");
      setSupplier("");
      setBatchNumber("");
      setExpirationDate("");
      setStorageLocation("");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickMovement(item: StockItem, direction: "in" | "out") {
    if (!canWrite) return;
    try {
      await recordStockMovement(clinicId, item, {
        item_id: item.id,
        movement_type: direction,
        quantity: 1,
        reason:
          direction === "in"
            ? "Reposição rápida (+1)"
            : "Consumo clínico rápido (-1)",
        unit_id: unitId,
      });
      toast.success(t("common.saved"));
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!canWrite) return;
    try {
      await deleteStockItem(clinicId, itemId);
      toast.success(t("common.saved"));
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  function renderAlertBadge(status: StockAlertStatus) {
    switch (status) {
      case "expired":
        return (
          <Badge className="border-red-200 bg-red-100 text-red-800 hover:bg-red-100">
            {t("stk.status.expired")}
          </Badge>
        );
      case "out_of_stock":
        return (
          <Badge className="border-rose-200 bg-rose-100 text-rose-800 hover:bg-rose-100">
            {t("stk.status.out_of_stock")}
          </Badge>
        );
      case "expiring_soon":
        return (
          <Badge className="border-orange-200 bg-orange-100 text-orange-800 hover:bg-orange-100">
            {t("stk.status.expiring_soon")}
          </Badge>
        );
      case "low_stock":
        return (
          <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
            {t("stk.status.low_stock")}
          </Badge>
        );
      case "ok":
      default:
        return (
          <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            {t("stk.status.ok")}
          </Badge>
        );
    }
  }

  const filteredItems = items.filter((item) => {
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    const st = evaluateStockItemStatus(item);
    if (statusFilter !== "all" && st !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchSku = (item.sku ?? "").toLowerCase().includes(q);
      const matchBatch = (item.batch_number ?? "").toLowerCase().includes(q);
      const matchSup = (item.supplier ?? "").toLowerCase().includes(q);
      if (!matchName && !matchSku && !matchBatch && !matchSup) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {canWrite && (
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Plus className="h-4 w-4 text-primary" />
              {t("stk.newItem")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleCreateItem}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">{t("stk.name")}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Resina Filtek Z350 XT A2 / Anestésico Lidocaína 2%"
                  required
                  minLength={2}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("stk.category")}</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STOCK_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("stk.unitMeasure")}</Label>
                <Select value={unitMeasure} onValueChange={setUnitMeasure}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STOCK_UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("stk.currentQty")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={currentQty}
                  onChange={(e) => setCurrentQty(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("stk.minQty")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={minQty}
                  onChange={(e) => setMinQty(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("stk.unitCost")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("stk.sku")} (opcional)</Label>
                <Input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Ex.: 3M-Z350-A2"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("stk.batch")} (opcional)</Label>
                <Input
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  placeholder="Ex.: LOTE-2026-88B"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("stk.expiration")} (opcional)</Label>
                <Input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("stk.supplier")} (opcional)</Label>
                <Input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Ex.: Dental Cremer / Surya Dental"
                />
              </div>

              <div className="flex items-end justify-between gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">{t("stk.location")} (opcional)</Label>
                  <Input
                    value={storageLocation}
                    onChange={(e) => setStorageLocation(e.target.value)}
                    placeholder="Armário 02 / Gaveta B"
                  />
                </div>
                <Button type="submit" variant="hero" size="sm" disabled={busy}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
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
            {t("stk.tabCatalog")} ({filteredItems.length})
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`${t("common.search")}...`}
              className="h-8 w-44 text-xs"
            />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {STOCK_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="ok">{t("stk.status.ok")}</SelectItem>
                <SelectItem value="low_stock">{t("stk.status.low_stock")}</SelectItem>
                <SelectItem value="out_of_stock">{t("stk.status.out_of_stock")}</SelectItem>
                <SelectItem value="expiring_soon">{t("stk.status.expiring_soon")}</SelectItem>
                <SelectItem value="expired">{t("stk.status.expired")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              {t("common.none")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("stk.name")}</TableHead>
                    <TableHead>{t("stk.category")}</TableHead>
                    <TableHead>{t("stk.batch")} / {t("stk.expiration")}</TableHead>
                    <TableHead className="text-right">{t("stk.currentQty")}</TableHead>
                    <TableHead className="text-right">{t("stk.minQty")}</TableHead>
                    <TableHead className="text-right">{t("stk.unitCost")}</TableHead>
                    <TableHead>{t("ag.status")}</TableHead>
                    {canWrite && <TableHead className="text-right">{t("common.actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const status = evaluateStockItemStatus(item);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-semibold">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {[item.sku, item.supplier, item.storage_location]
                              .filter(Boolean)
                              .join(" • ") || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{item.category}</TableCell>
                        <TableCell className="text-xs">
                          <div>{item.batch_number ? `Lote: ${item.batch_number}` : "—"}</div>
                          {item.expiration_date && (
                            <div className="text-muted-foreground">
                              Val.: {item.expiration_date.split("-").reverse().join("/")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-display text-sm font-bold">
                          {Number(item.current_quantity)} {item.unit_measure}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {Number(item.min_quantity)} {item.unit_measure}
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium">
                          {formatBRL(Number(item.unit_cost), dateLocale)}
                        </TableCell>
                        <TableCell>{renderAlertBadge(status)}</TableCell>
                        {canWrite && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 border-emerald-200 px-2 text-xs text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleQuickMovement(item, "in")}
                              >
                                <ArrowUpCircle className="h-3.5 w-3.5" />
                                {t("stk.quickIn")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={Number(item.current_quantity) < 1}
                                className="h-7 gap-1 border-rose-200 px-2 text-xs text-rose-700 hover:bg-rose-50"
                                onClick={() => handleQuickMovement(item, "out")}
                              >
                                <ArrowDownCircle className="h-3.5 w-3.5" />
                                {t("stk.quickOut")}
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                title={t("common.delete")}
                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteItem(item.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

