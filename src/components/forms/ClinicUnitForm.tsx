import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Trash2 } from "lucide-react";
import { createClinicUnit, deleteClinicUnit } from "@/modules/clinics";
import { useT } from "@/lib/i18n";
import type { ClinicUnit } from "@/types";
import { formatCNPJ } from "@/utils/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClinicUnitForm({
  clinicId,
  units,
}: {
  clinicId: string;
  units: ClinicUnit[];
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createClinicUnit({
        clinicId,
        name,
        cnpj,
        phone,
        city,
        state: stateUf,
        isMain: units.length === 0,
      });
      setName("");
      setCnpj("");
      setPhone("");
      setCity("");
      setStateUf("");
      toast.success(t("common.saved"));
      qc.invalidateQueries({ queryKey: ["clinicUnits", clinicId] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(unitId: string) {
    if (!confirm(t("common.delete") + "?")) return;
    try {
      await deleteClinicUnit(clinicId, unitId);
      toast.success(t("common.saved"));
      qc.invalidateQueries({ queryKey: ["clinicUnits", clinicId] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-navy">{t("set.units")}</h3>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-6 sm:items-end">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("set.unitName")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("set.unitCnpj")}</Label>
          <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" />
        </div>
        <div className="space-y-1.5">
          <Label>{t("set.unitPhone")}</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("set.unitCity")}</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="flex items-end gap-2">
          <div className="w-16 space-y-1.5">
            <Label>{t("set.unitState")}</Label>
            <Input maxLength={2} value={stateUf} onChange={(e) => setStateUf(e.target.value.toUpperCase())} />
          </div>
          <Button variant="hero" disabled={busy} className="flex-1">
            {t("common.add")}
          </Button>
        </div>
      </form>

      <ul className="mt-4 divide-y text-sm">
        {units.length === 0 && <li className="py-2 text-muted-foreground">{t("common.none")}</li>}
        {units.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-navy">{u.name}</span>
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                  {u.is_main ? t("set.unitMain") : t("set.unitBranch")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {[u.cnpj ? formatCNPJ(u.cnpj) : null, u.phone, [u.city, u.state].filter(Boolean).join("/")]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            </div>
            {!u.is_main && (
              <Button variant="ghost" size="icon" onClick={() => handleDelete(u.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

