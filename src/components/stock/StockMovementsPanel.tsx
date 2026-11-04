import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  AlertOctagon,
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
import { useT } from "@/lib/i18n";
import { formatSaoPauloDateTime } from "@/utils/timezone";
import { recordStockMovement } from "@/modules/stock";
import type { StockItem, StockMovement, StockMovementType } from "@/types";

interface StockMovementsPanelProps {
  clinicId: string;
  unitId: string | null;
  canWrite: boolean;
  items: StockItem[];
  movements: StockMovement[];
  professionals: { id: string; name: string }[];
  patients: { id: string; full_name: string }[];
  onRefresh: () => void;
}

export function StockMovementsPanel({
  clinicId,
  unitId,
  canWrite,
  items,
  movements,
  professionals,
  patients,
  onRefresh,
}: StockMovementsPanelProps) {
  const { t, dateLocale } = useT();

  const [selectedItemId, setSelectedItemId] = useState<string>(items[0]?.id ?? "");
  const [movementType, setMovementType] = useState<StockMovementType>("out");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [professionalId, setProfessionalId] = useState("none");
  const [patientId, setPatientId] = useState("none");
  const [busy, setBusy] = useState(false);

  async function handleRecordMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;

    const targetItem = items.find((i) => i.id === selectedItemId);
    if (!targetItem) {
      toast.error(t("common.error"));
      return;
    }

    setBusy(true);
    try {
      await recordStockMovement(clinicId, targetItem, {
        item_id: targetItem.id,
        movement_type: movementType,
        quantity: Number(quantity) || 0,
        reason: reason.trim(),
        batch_number: batchNumber.trim() || undefined,
        expiration_date: expirationDate || null,
        professional_id: professionalId === "none" ? null : professionalId,
        patient_id: patientId === "none" ? null : patientId,
        unit_id: unitId,
      });
      toast.success(t("common.saved"));
      setQuantity("1");
      setReason("");
      setBatchNumber("");
      setExpirationDate("");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  function renderMovementBadge(type: StockMovementType) {
    switch (type) {
      case "in":
        return (
          <Badge className="gap-1 border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            <ArrowUpCircle className="h-3 w-3" />
            {t("stk.mov.in")}
          </Badge>
        );
      case "out":
        return (
          <Badge className="gap-1 border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-100">
            <ArrowDownCircle className="h-3 w-3" />
            {t("stk.mov.out")}
          </Badge>
        );
      case "adjustment":
        return (
          <Badge className="gap-1 border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
            <RefreshCw className="h-3 w-3" />
            {t("stk.mov.adjustment")}
          </Badge>
        );
      case "expired_loss":
        return (
          <Badge className="gap-1 border-red-200 bg-red-100 text-red-800 hover:bg-red-100">
            <AlertOctagon className="h-3 w-3" />
            {t("stk.mov.expired_loss")}
          </Badge>
        );
    }
  }

  return (
    <div className="space-y-6">
      {canWrite && items.length > 0 && (
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <ArrowLeftRight className="h-4 w-4 text-primary" />
              {t("stk.newMovement")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleRecordMovement}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">{t("stk.name")}</Label>
                <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} (Saldo: {Number(item.current_quantity)} {item.unit_measure})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("stk.movType")}</Label>
                <Select
                  value={movementType}
                  onValueChange={(v) => setMovementType(v as StockMovementType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="out">{t("stk.mov.out")}</SelectItem>
                    <SelectItem value="in">{t("stk.mov.in")}</SelectItem>
                    <SelectItem value="adjustment">{t("stk.mov.adjustment")}</SelectItem>
                    <SelectItem value="expired_loss">{t("stk.mov.expired_loss")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("stk.movQty")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">{t("stk.movReason")}</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: Consumo em cirurgia de implante / NF 4812 Dental Cremer"
                  required
                  minLength={2}
                />
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
                <Label className="text-xs">{t("ag.patient")} (opcional)</Label>
                <Select value={patientId} onValueChange={setPatientId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem vínculo —</SelectItem>
                    {patients.map((pat) => (
                      <SelectItem key={pat.id} value={pat.id}>
                        {pat.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("stk.batch")} (opcional)</Label>
                <Input
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  placeholder="Lote ANVISA"
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

              <div className="flex items-end justify-end sm:col-span-2">
                <Button type="submit" variant="hero" size="sm" disabled={busy}>
                  <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
                  Registrar no Kardex
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">
            {t("stk.tabMovements")} ({movements.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              {t("common.none")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data / Hora</TableHead>
                    <TableHead>{t("stk.name")}</TableHead>
                    <TableHead>{t("stk.movType")}</TableHead>
                    <TableHead className="text-right">Saldo Ant.</TableHead>
                    <TableHead className="text-right">{t("stk.movQty")}</TableHead>
                    <TableHead className="text-right">Saldo Final</TableHead>
                    <TableHead>{t("stk.movReason")}</TableHead>
                    <TableHead>{t("ag.professional")} / {t("ag.patient")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((mov) => (
                    <TableRow key={mov.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatSaoPauloDateTime(mov.created_at, dateLocale)}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {mov.stock_items?.name ?? "Insumo"}
                      </TableCell>
                      <TableCell>{renderMovementBadge(mov.movement_type)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {Number(mov.previous_quantity)}
                      </TableCell>
                      <TableCell className="text-right font-display text-sm font-bold">
                        {mov.movement_type === "in"
                          ? `+${Number(mov.quantity)}`
                          : mov.movement_type === "adjustment"
                            ? `=${Number(mov.quantity)}`
                            : `-${Number(mov.quantity)}`}
                      </TableCell>
                      <TableCell className="text-right font-display text-sm font-extrabold text-primary">
                        {Number(mov.resulting_quantity)}{" "}
                        {mov.stock_items?.unit_measure ?? ""}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate text-xs font-medium">{mov.reason}</div>
                        {mov.batch_number && (
                          <div className="text-[11px] text-muted-foreground">
                            Lote: {mov.batch_number}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {mov.professionals?.name && (
                          <div className="font-medium text-foreground">
                            Dr(a). {mov.professionals.name}
                          </div>
                        )}
                        {mov.patients?.full_name && <div>{mov.patients.full_name}</div>}
                        {!mov.professionals?.name && !mov.patients?.full_name && "—"}
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

