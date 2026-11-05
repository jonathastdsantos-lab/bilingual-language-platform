import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpenCheck, Building2, Clock, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  DENTAL_SPECIALTIES,
  calculateProcedureEconomics,
  createDentalInsurance,
  createProcedureCatalogItem,
  deleteDentalInsurance,
  deleteProcedureCatalogItem,
  fetchDentalInsurances,
  fetchProcedureCatalog,
  seedStandardTussCatalog,
} from "@/modules/clinics";
import { formatCurrencyBRL } from "@/utils/timezone";
import { formatCNPJ } from "@/utils/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ProceduresAndInsurancesPanel({
  clinicId,
  canManage,
  dateLocale,
}: {
  clinicId: string;
  canManage: boolean;
  dateLocale: string;
}) {
  const qc = useQueryClient();

  // Estado do formulário de Procedimento (Tabela TUSS / Honorários)
  const [tussCode, setTussCode] = useState("");
  const [procName, setProcName] = useState("");
  const [specialty, setSpecialty] = useState<string>(DENTAL_SPECIALTIES[0]);
  const [insuranceId, setInsuranceId] = useState<string>("particular");
  const [basePrice, setBasePrice] = useState("200");
  const [materialCost, setMaterialCost] = useState("25");
  const [durationMin, setDurationMin] = useState("45");

  // Estado do formulário de Convênio Odontológico (ANS)
  const [insName, setInsName] = useState("");
  const [ansCode, setAnsCode] = useState("");
  const [insCnpj, setInsCnpj] = useState("");
  const [reimbursementDays, setReimbursementDays] = useState("30");

  const insurancesQuery = useQuery({
    queryKey: ["dentalInsurances", clinicId],
    queryFn: () => fetchDentalInsurances(clinicId),
  });

  const catalogQuery = useQuery({
    queryKey: ["procedureCatalog", clinicId],
    queryFn: () => fetchProcedureCatalog(clinicId),
  });

  const insurances = insurancesQuery.data ?? [];
  const procedures = catalogQuery.data ?? [];

  const createProcMut = useMutation({
    mutationFn: async () => {
      await createProcedureCatalogItem(clinicId, {
        insurance_id: insuranceId !== "particular" ? insuranceId : null,
        tuss_code: tussCode.trim() || undefined,
        name: procName.trim(),
        specialty,
        base_price: Math.max(0, Number(basePrice.replace(",", ".")) || 0),
        estimated_material_cost: Math.max(0, Number(materialCost.replace(",", ".")) || 0),
        default_duration_minutes: Math.max(10, Math.min(480, Number(durationMin) || 60)),
      });
    },
    onSuccess: () => {
      toast.success("Procedimento adicionado ao catálogo da clínica!");
      setTussCode("");
      setProcName("");
      setBasePrice("200");
      setMaterialCost("25");
      setDurationMin("45");
      qc.invalidateQueries({ queryKey: ["procedureCatalog", clinicId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const seedTussMut = useMutation({
    mutationFn: () => seedStandardTussCatalog(clinicId),
    onSuccess: () => {
      toast.success("Tabela TUSS Odontológica padrão importada com sucesso!");
      qc.invalidateQueries({ queryKey: ["procedureCatalog", clinicId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteProcMut = useMutation({
    mutationFn: (id: string) => deleteProcedureCatalogItem(clinicId, id),
    onSuccess: () => {
      toast.success("Procedimento removido do catálogo.");
      qc.invalidateQueries({ queryKey: ["procedureCatalog", clinicId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createInsMut = useMutation({
    mutationFn: async () => {
      await createDentalInsurance(clinicId, {
        name: insName.trim(),
        ans_code: ansCode.trim() || undefined,
        cnpj: insCnpj.trim() || undefined,
        reimbursement_days: Math.max(0, Math.min(180, Number(reimbursementDays) || 30)),
      });
    },
    onSuccess: () => {
      toast.success("Convênio odontológico cadastrado com sucesso!");
      setInsName("");
      setAnsCode("");
      setInsCnpj("");
      setReimbursementDays("30");
      qc.invalidateQueries({ queryKey: ["dentalInsurances", clinicId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteInsMut = useMutation({
    mutationFn: (id: string) => deleteDentalInsurance(clinicId, id),
    onSuccess: () => {
      toast.success("Convênio removido.");
      qc.invalidateQueries({ queryKey: ["dentalInsurances", clinicId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      {/* Seção 1: Catálogo de Procedimentos (Tabela TUSS / Honorários da Clínica) */}
      <div className="rounded-2xl border bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold text-navy">
                Catálogo de Procedimentos (Tabela TUSS & Honorários da Clínica)
              </h2>
              <p className="text-xs text-muted-foreground">
                Padronize valores base, tempo médio de cadeira e custo estimado de insumos para preenchimento automático na Agenda e Orçamentos.
              </p>
            </div>
          </div>

          {canManage && procedures.length === 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-primary/30 text-xs font-semibold text-primary hover:bg-primary/10"
              disabled={seedTussMut.isPending}
              onClick={() => seedTussMut.mutate()}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Importar Tabela TUSS Padrão (10 Procedimentos)
            </Button>
          )}
        </div>

        {canManage && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createProcMut.mutate();
            }}
            className="mt-4 grid gap-3 border-b pb-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="space-y-1">
              <Label className="text-xs">Código TUSS (Opcional)</Label>
              <Input
                className="h-9 text-xs"
                value={tussCode}
                onChange={(e) => setTussCode(e.target.value)}
                placeholder="Ex.: 81000065"
                maxLength={20}
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Nome do Procedimento *</Label>
              <Input
                className="h-9 text-xs"
                required
                minLength={2}
                maxLength={200}
                value={procName}
                onChange={(e) => setProcName(e.target.value)}
                placeholder="Ex.: Restauração em Resina Composta (2 faces)"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Especialidade</Label>
              <Select value={specialty} onValueChange={setSpecialty}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DENTAL_SPECIALTIES.map((sp) => (
                    <SelectItem key={sp} value={sp}>
                      {sp}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Tabela / Convênio</Label>
              <Select value={insuranceId} onValueChange={setInsuranceId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="particular">Particular (Tabela da Clínica)</SelectItem>
                  {insurances.map((ins) => (
                    <SelectItem key={ins.id} value={ins.id}>
                      Convênio: {ins.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Honorário Base (R$)</Label>
              <Input
                className="h-9 text-xs"
                inputMode="decimal"
                required
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Custo Estimado Material (R$)</Label>
              <Input
                className="h-9 text-xs"
                inputMode="decimal"
                value={materialCost}
                onChange={(e) => setMaterialCost(e.target.value)}
              />
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Tempo Cadeira (min)</Label>
                <Input
                  className="h-9 text-xs"
                  type="number"
                  min={10}
                  max={480}
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                />
              </div>
              <Button type="submit" variant="hero" className="h-9" disabled={createProcMut.isPending}>
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>
          </form>
        )}

        <div className="mt-4 overflow-x-auto">
          {procedures.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum procedimento cadastrado na tabela da clínica ainda.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-[11px] uppercase text-muted-foreground">
                  <th className="pb-2 font-semibold">TUSS</th>
                  <th className="pb-2 font-semibold">Procedimento / Especialidade</th>
                  <th className="pb-2 font-semibold">Tabela</th>
                  <th className="pb-2 font-semibold">Cadeira</th>
                  <th className="pb-2 text-right font-semibold">Honorário</th>
                  <th className="pb-2 text-right font-semibold">Custo Mat.</th>
                  <th className="pb-2 text-right font-semibold">Margem Bruta</th>
                  {canManage && <th className="pb-2 text-right font-semibold">Ação</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {procedures.map((proc) => {
                  const econ = calculateProcedureEconomics(proc);
                  return (
                    <tr key={proc.id} className="hover:bg-muted/30">
                      <td className="py-2.5 font-mono text-[11px] font-semibold text-primary">
                        {proc.tuss_code ?? "—"}
                      </td>
                      <td className="py-2.5">
                        <div className="font-semibold text-navy">{proc.name}</div>
                        <div className="text-[11px] text-muted-foreground">{proc.specialty}</div>
                      </td>
                      <td className="py-2.5">
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                          {proc.dental_insurances?.name ?? "Particular"}
                        </span>
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {proc.default_duration_minutes} min
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-bold text-navy">
                        {formatCurrencyBRL(econ.basePrice, dateLocale)}
                      </td>
                      <td className="py-2.5 text-right text-amber-700">
                        {formatCurrencyBRL(econ.materialCost, dateLocale)}
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="font-bold text-emerald-700">
                          {formatCurrencyBRL(econ.netMargin, dateLocale)} ({econ.marginPct}%)
                        </span>
                      </td>
                      {canManage && (
                        <td className="py-2.5 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => deleteProcMut.mutate(proc.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Seção 2: Cadastro de Convênios Odontológicos (ANS) */}
      <div className="rounded-2xl border bg-card p-6 shadow-card">
        <div className="flex items-center gap-2 border-b pb-3">
          <Building2 className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold text-navy">Convênios e Planos Odontológicos Atendidos (ANS)</h2>
            <p className="text-xs text-muted-foreground">
              Cadastre as operadoras odontológicas atendidas pela clínica e seus prazos médios de repasse.
            </p>
          </div>
        </div>

        {canManage && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createInsMut.mutate();
            }}
            className="mt-4 grid gap-3 border-b pb-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="space-y-1">
              <Label className="text-xs">Nome da Operadora / Convênio *</Label>
              <Input
                className="h-9 text-xs"
                required
                minLength={2}
                value={insName}
                onChange={(e) => setInsName(e.target.value)}
                placeholder="Ex.: Amil Dental / Bradesco Dental / OdontoPrev"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Registro ANS (Opcional)</Label>
              <Input
                className="h-9 text-xs"
                value={ansCode}
                onChange={(e) => setAnsCode(e.target.value)}
                placeholder="Ex.: 326305"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">CNPJ da Operadora (Opcional)</Label>
              <Input
                className="h-9 text-xs"
                value={insCnpj}
                onChange={(e) => setInsCnpj(formatCNPJ(e.target.value))}
                placeholder="00.000.000/0001-00"
              />
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Prazo Repasse (dias)</Label>
                <Input
                  className="h-9 text-xs"
                  type="number"
                  min={0}
                  max={180}
                  value={reimbursementDays}
                  onChange={(e) => setReimbursementDays(e.target.value)}
                />
              </div>
              <Button type="submit" variant="hero" className="h-9" disabled={createInsMut.isPending}>
                <Plus className="h-4 w-4" />
                Cadastrar
              </Button>
            </div>
          </form>
        )}

        <ul className="mt-3 divide-y text-sm">
          {insurances.length === 0 ? (
            <li className="py-4 text-center text-xs text-muted-foreground">
              Nenhum convênio odontológico cadastrado (atendimento 100% Particular).
            </li>
          ) : (
            insurances.map((ins) => (
              <li key={ins.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div>
                  <span className="font-semibold text-navy">{ins.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {ins.ans_code ? `ANS: ${ins.ans_code} • ` : ""}
                    {ins.cnpj ? `CNPJ: ${formatCNPJ(ins.cnpj)} • ` : ""}
                    Repasse médio: {ins.reimbursement_days} dias
                  </span>
                </div>
                {canManage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => deleteInsMut.mutate(ins.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

