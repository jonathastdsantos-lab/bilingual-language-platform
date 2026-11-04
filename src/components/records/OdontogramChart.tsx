import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  ADULT_LOWER_LEFT,
  ADULT_LOWER_RIGHT,
  ADULT_UPPER_LEFT,
  ADULT_UPPER_RIGHT,
  CHILD_LOWER_LEFT,
  CHILD_LOWER_RIGHT,
  CHILD_UPPER_LEFT,
  CHILD_UPPER_RIGHT,
  CONDITION_COLORS,
  TOOTH_CONDITIONS,
  TOOTH_SURFACES,
  aggregateOdontogramState,
  createOdontogramEntry,
  deleteOdontogramEntry,
  type AggregatedToothState,
} from "@/modules/records";
import { useT, type TKey } from "@/lib/i18n";
import type { OdontogramEntry, ToothConditionStatus, ToothSurface } from "@/types";
import { formatSaoPauloDateTime } from "@/utils/timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

function ToothSvg({
  toothNumber,
  isRightQuadrant,
  state,
  selected,
  onSelectTooth,
  onSelectSurface,
}: {
  toothNumber: number;
  isRightQuadrant: boolean;
  state: AggregatedToothState | undefined;
  selected: boolean;
  onSelectTooth: (tooth: number) => void;
  onSelectSurface: (tooth: number, surface: ToothSurface) => void;
}) {
  const whole = state?.wholeCondition ?? "healthy";
  const surf = state?.surfaces ?? { O: "healthy", M: "healthy", D: "healthy", V: "healthy", L: "healthy" };

  // Na arcada direita (Q1, Q4, Q5, Q8), a face Mesial fica à esquerda do centro (direita na tela)
  const leftSurface: Exclude<ToothSurface, "W"> = isRightQuadrant ? "D" : "M";
  const rightSurface: Exclude<ToothSurface, "W"> = isRightQuadrant ? "M" : "D";

  const colorOf = (s: Exclude<ToothSurface, "W">) => {
    const cond = surf[s] !== "healthy" ? surf[s] : whole !== "healthy" ? whole : "healthy";
    return CONDITION_COLORS[cond];
  };

  const isMissing = whole === "missing";
  const isEndo = whole === "endodontics";
  const isCrown = whole === "crown";
  const isImplant = whole === "implant";

  return (
    <div
      onClick={() => onSelectTooth(toothNumber)}
      className={cn(
        "group flex cursor-pointer flex-col items-center rounded-xl border p-1.5 transition-all",
        selected
          ? "border-primary bg-accent/70 ring-2 ring-primary/30"
          : "border-border/70 bg-card hover:border-primary/50 hover:bg-muted/40",
      )}
    >
      <span className={cn("mb-1 text-[11px] font-bold", selected ? "text-primary" : "text-navy")}>
        {toothNumber}
      </span>

      <svg viewBox="0 0 44 44" className="h-10 w-10 overflow-visible">
        {/* Vestibular (Topo) */}
        <polygon
          points="4,4 40,4 31,13 13,13"
          fill={colorOf("V")}
          stroke="#1e293b"
          strokeWidth="1.2"
          onClick={(e) => {
            e.stopPropagation();
            onSelectSurface(toothNumber, "V");
          }}
          className="cursor-pointer transition-opacity hover:opacity-80"
        />
        {/* Lingual / Palatina (Base) */}
        <polygon
          points="13,31 31,31 40,40 4,40"
          fill={colorOf("L")}
          stroke="#1e293b"
          strokeWidth="1.2"
          onClick={(e) => {
            e.stopPropagation();
            onSelectSurface(toothNumber, "L");
          }}
          className="cursor-pointer transition-opacity hover:opacity-80"
        />
        {/* Lateral Esquerda (Distal ou Mesial conforme quadrante) */}
        <polygon
          points="4,4 13,13 13,31 4,40"
          fill={colorOf(leftSurface)}
          stroke="#1e293b"
          strokeWidth="1.2"
          onClick={(e) => {
            e.stopPropagation();
            onSelectSurface(toothNumber, leftSurface);
          }}
          className="cursor-pointer transition-opacity hover:opacity-80"
        />
        {/* Lateral Direita (Mesial ou Distal conforme quadrante) */}
        <polygon
          points="31,13 40,4 40,40 31,31"
          fill={colorOf(rightSurface)}
          stroke="#1e293b"
          strokeWidth="1.2"
          onClick={(e) => {
            e.stopPropagation();
            onSelectSurface(toothNumber, rightSurface);
          }}
          className="cursor-pointer transition-opacity hover:opacity-80"
        />
        {/* Oclusal / Incisal (Centro) */}
        <rect
          x="13"
          y="13"
          width="18"
          height="18"
          fill={colorOf("O")}
          stroke="#1e293b"
          strokeWidth="1.2"
          onClick={(e) => {
            e.stopPropagation();
            onSelectSurface(toothNumber, "O");
          }}
          className="cursor-pointer transition-opacity hover:opacity-80"
        />

        {/* Marcações de Condição Global (Ausente, Canal, Coroa, Implante) */}
        {isMissing && (
          <g stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round">
            <line x1="3" y1="3" x2="41" y2="41" />
            <line x1="41" y1="3" x2="3" y2="41" />
          </g>
        )}
        {isCrown && (
          <circle cx="22" cy="22" r="19" fill="none" stroke="#06b6d4" strokeWidth="2.5" />
        )}
        {isEndo && (
          <line x1="22" y1="2" x2="22" y2="42" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" />
        )}
        {isImplant && (
          <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#0f172a">
            IMP
          </text>
        )}
      </svg>

      <span className="mt-1 h-1.5 w-1.5 rounded-full" style={{ background: CONDITION_COLORS[whole] }} />
    </div>
  );
}

export function OdontogramChart({
  clinicId,
  patientId,
  entries,
  professionals,
  canWrite,
  selectedTooth,
  onSelectTooth,
  dateLocale,
}: {
  clinicId: string;
  patientId: string;
  entries: OdontogramEntry[];
  professionals: Array<{ id: string; name: string }>;
  canWrite: boolean;
  selectedTooth: number | null;
  onSelectTooth: (tooth: number | null) => void;
  dateLocale: string;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [dentition, setDentition] = useState<"adult" | "child">("adult");
  const [surface, setSurface] = useState<ToothSurface>("W");
  const [condition, setCondition] = useState<ToothConditionStatus>("caries");
  const [professionalId, setProfessionalId] = useState<string>(professionals[0]?.id ?? "none");
  const [procedure, setProcedure] = useState("");
  const [notes, setNotes] = useState("");

  const stateMap = aggregateOdontogramState(entries);

  const upperRight = dentition === "adult" ? ADULT_UPPER_RIGHT : CHILD_UPPER_RIGHT;
  const upperLeft = dentition === "adult" ? ADULT_UPPER_LEFT : CHILD_UPPER_LEFT;
  const lowerRight = dentition === "adult" ? ADULT_LOWER_RIGHT : CHILD_LOWER_RIGHT;
  const lowerLeft = dentition === "adult" ? ADULT_LOWER_LEFT : CHILD_LOWER_LEFT;

  const activeTooth = selectedTooth ?? (dentition === "adult" ? 11 : 51);

  const addMutation = useMutation({
    mutationFn: async () => {
      await createOdontogramEntry(clinicId, {
        patient_id: patientId,
        professional_id: professionalId !== "none" ? professionalId : null,
        tooth_number: activeTooth,
        surface,
        condition,
        procedure,
        notes,
      });
    },
    onSuccess: () => {
      toast.success(t("common.saved"));
      setProcedure("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["odontogram", clinicId, patientId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handleDelete(id: string) {
    if (!confirm(t("common.delete") + "?")) return;
    try {
      await deleteOdontogramEntry(clinicId, id);
      toast.success(t("common.saved"));
      qc.invalidateQueries({ queryKey: ["odontogram", clinicId, patientId] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const visibleHistory = selectedTooth ? entries.filter((e) => e.tooth_number === selectedTooth) : entries;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => {
                setDentition("adult");
                onSelectTooth(11);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                dentition === "adult" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {t("rec.dentitionAdult")}
            </button>
            <button
              type="button"
              onClick={() => {
                setDentition("child");
                onSelectTooth(51);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                dentition === "child" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {t("rec.dentitionChild")}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {TOOTH_CONDITIONS.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-[11px]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CONDITION_COLORS[c] }} />
                {t(`rec.cond.${c}` as TKey)}
              </span>
            ))}
          </div>
        </div>

        {/* Arcada Superior */}
        <div className="mt-6 space-y-2">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("rec.upperArch")}
          </p>
          <div className="overflow-x-auto pb-2">
            <div className="mx-auto flex min-w-max items-center justify-center gap-3">
              <div className="flex gap-1.5">
                {upperRight.map((tooth) => (
                  <ToothSvg
                    key={tooth}
                    toothNumber={tooth}
                    isRightQuadrant={true}
                    state={stateMap[tooth]}
                    selected={activeTooth === tooth}
                    onSelectTooth={(n) => onSelectTooth(n)}
                    onSelectSurface={(n, s) => {
                      onSelectTooth(n);
                      setSurface(s);
                    }}
                  />
                ))}
              </div>
              <div className="h-14 w-0.5 bg-primary/30" />
              <div className="flex gap-1.5">
                {upperLeft.map((tooth) => (
                  <ToothSvg
                    key={tooth}
                    toothNumber={tooth}
                    isRightQuadrant={false}
                    state={stateMap[tooth]}
                    selected={activeTooth === tooth}
                    onSelectTooth={(n) => onSelectTooth(n)}
                    onSelectSurface={(n, s) => {
                      onSelectTooth(n);
                      setSurface(s);
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Arcada Inferior */}
        <div className="mt-4 space-y-2 border-t pt-4">
          <div className="overflow-x-auto pb-2">
            <div className="mx-auto flex min-w-max items-center justify-center gap-3">
              <div className="flex gap-1.5">
                {lowerRight.map((tooth) => (
                  <ToothSvg
                    key={tooth}
                    toothNumber={tooth}
                    isRightQuadrant={true}
                    state={stateMap[tooth]}
                    selected={activeTooth === tooth}
                    onSelectTooth={(n) => onSelectTooth(n)}
                    onSelectSurface={(n, s) => {
                      onSelectTooth(n);
                      setSurface(s);
                    }}
                  />
                ))}
              </div>
              <div className="h-14 w-0.5 bg-primary/30" />
              <div className="flex gap-1.5">
                {lowerLeft.map((tooth) => (
                  <ToothSvg
                    key={tooth}
                    toothNumber={tooth}
                    isRightQuadrant={false}
                    state={stateMap[tooth]}
                    selected={activeTooth === tooth}
                    onSelectTooth={(n) => onSelectTooth(n)}
                    onSelectSurface={(n, s) => {
                      onSelectTooth(n);
                      setSurface(s);
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("rec.lowerArch")}
          </p>
        </div>
      </div>

      {/* Formulário de Registro no Dente/Face Selecionado */}
      {canWrite && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate();
          }}
          className="rounded-2xl border bg-card p-5 shadow-card"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-navy">
              {t("rec.addOdontogram")} — {t("rec.selectedTooth")}: <span className="text-primary">#{activeTooth}</span>
            </h3>
            {selectedTooth && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onSelectTooth(null)}>
                {t("rec.clearToothFilter")}
              </Button>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label>{t("rec.surface")}</Label>
              <Select value={surface} onValueChange={(v) => setSurface(v as ToothSurface)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOOTH_SURFACES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`rec.surface.${s}` as TKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("rec.condition")}</Label>
              <Select value={condition} onValueChange={(v) => setCondition(v as ToothConditionStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOOTH_CONDITIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`rec.cond.${c}` as TKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <div className="space-y-1.5">
              <Label>{t("ag.procedure")}</Label>
              <Input
                value={procedure}
                onChange={(e) => setProcedure(e.target.value)}
                placeholder="Ex.: Restauração em resina"
                maxLength={200}
              />
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label>{t("ag.notes")}</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
              </div>
              <Button variant="hero" disabled={addMutation.isPending}>
                {t("common.save")}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Histórico de Registros do Odontograma */}
      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-navy">
            {t("rec.odontogramHistory")} {selectedTooth ? `(#${selectedTooth})` : `(${t("rec.allTeeth")})`}
          </h3>
          <span className="text-xs text-muted-foreground">{visibleHistory.length}</span>
        </div>

        <ul className="mt-4 divide-y text-sm">
          {visibleHistory.length === 0 && <li className="py-3 text-muted-foreground">{t("common.none")}</li>}
          {visibleHistory.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-extrabold text-white"
                  style={{ background: CONDITION_COLORS[item.condition] }}
                >
                  {item.tooth_number}
                </span>
                <div>
                  <p className="font-semibold text-navy">
                    {t(`rec.cond.${item.condition}` as TKey)} · {t(`rec.surface.${item.surface}` as TKey)}
                    {item.procedure ? ` — ${item.procedure}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.professionals?.name ?? "—"} {item.notes ? `· ${item.notes}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatSaoPauloDateTime(item.created_at, dateLocale)}
                </span>
                {canWrite && (
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

