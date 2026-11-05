import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, AlertOctagon, AlertTriangle, CheckCircle2, HeartPulse, ShieldAlert } from "lucide-react";
import {
  ASA_CLASSIFICATIONS,
  evaluateSurgicalRiskAndAsa,
  savePatientStructuredAnamnesis,
} from "@/modules/records";
import type { AsaClassification, PatientStructuredAnamnesis } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface StructuredAnamnesisPanelProps {
  clinicId: string;
  patientId: string;
  anamnesis: PatientStructuredAnamnesis | null;
  professionals: Array<{ id: string; name: string }>;
  canWrite: boolean;
}

export function StructuredAnamnesisPanel({
  clinicId,
  patientId,
  anamnesis,
  professionals,
  canWrite,
}: StructuredAnamnesisPanelProps) {
  const qc = useQueryClient();

  const [professionalId, setProfessionalId] = useState<string>(
    anamnesis?.professional_id ?? professionals[0]?.id ?? "none",
  );
  const [asaOverride, setAsaOverride] = useState<string>("auto");
  const [hasHypertension, setHasHypertension] = useState(false);
  const [hasDiabetes, setHasDiabetes] = useState(false);
  const [hasHeartDisease, setHasHeartDisease] = useState(false);
  const [usesAnticoagulants, setUsesAnticoagulants] = useState(false);
  const [usesBisphosphonates, setUsesBisphosphonates] = useState(false);
  const [hasBleedingDisorder, setHasBleedingDisorder] = useState(false);
  const [isPregnant, setIsPregnant] = useState(false);
  const [allergyAnesthetic, setAllergyAnesthetic] = useState(false);
  const [allergyPenicillin, setAllergyPenicillin] = useState(false);
  const [allergyLatex, setAllergyLatex] = useState(false);
  const [allergyNsaids, setAllergyNsaids] = useState(false);
  const [otherAllergies, setOtherAllergies] = useState("");
  const [currentMedications, setCurrentMedications] = useState("");
  const [hasBruxism, setHasBruxism] = useState(false);
  const [isSmoker, setIsSmoker] = useState(false);
  const [bpSystolic, setBpSystolic] = useState<string>("");
  const [bpDiastolic, setBpDiastolic] = useState<string>("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [clinicalObservations, setClinicalObservations] = useState("");

  useEffect(() => {
    if (!anamnesis) {
      setAsaOverride("auto");
      setHasHypertension(false);
      setHasDiabetes(false);
      setHasHeartDisease(false);
      setUsesAnticoagulants(false);
      setUsesBisphosphonates(false);
      setHasBleedingDisorder(false);
      setIsPregnant(false);
      setAllergyAnesthetic(false);
      setAllergyPenicillin(false);
      setAllergyLatex(false);
      setAllergyNsaids(false);
      setOtherAllergies("");
      setCurrentMedications("");
      setHasBruxism(false);
      setIsSmoker(false);
      setBpSystolic("");
      setBpDiastolic("");
      setChiefComplaint("");
      setClinicalObservations("");
      return;
    }

    setProfessionalId(anamnesis.professional_id ?? professionals[0]?.id ?? "none");
    setAsaOverride(anamnesis.asa_classification);
    setHasHypertension(anamnesis.has_hypertension);
    setHasDiabetes(anamnesis.has_diabetes);
    setHasHeartDisease(anamnesis.has_heart_disease);
    setUsesAnticoagulants(anamnesis.uses_anticoagulants);
    setUsesBisphosphonates(anamnesis.uses_bisphosphonates);
    setHasBleedingDisorder(anamnesis.has_bleeding_disorder);
    setIsPregnant(anamnesis.is_pregnant_or_lactating);
    setAllergyAnesthetic(anamnesis.allergy_local_anesthetic);
    setAllergyPenicillin(anamnesis.allergy_penicillin);
    setAllergyLatex(anamnesis.allergy_latex);
    setAllergyNsaids(anamnesis.allergy_nsaids);
    setOtherAllergies(anamnesis.other_allergies ?? "");
    setCurrentMedications(anamnesis.current_medications ?? "");
    setHasBruxism(anamnesis.has_bruxism);
    setIsSmoker(anamnesis.is_smoker);
    setBpSystolic(anamnesis.blood_pressure_systolic ? String(anamnesis.blood_pressure_systolic) : "");
    setBpDiastolic(anamnesis.blood_pressure_diastolic ? String(anamnesis.blood_pressure_diastolic) : "");
    setChiefComplaint(anamnesis.chief_complaint ?? "");
    setClinicalObservations(anamnesis.clinical_observations ?? "");
  }, [anamnesis, professionals]);

  const sysNum = bpSystolic.trim() ? Number(bpSystolic) : null;
  const diaNum = bpDiastolic.trim() ? Number(bpDiastolic) : null;

  const liveEvaluation = evaluateSurgicalRiskAndAsa({
    has_hypertension: hasHypertension,
    has_diabetes: hasDiabetes,
    has_heart_disease: hasHeartDisease,
    uses_anticoagulants: usesAnticoagulants,
    uses_bisphosphonates: usesBisphosphonates,
    has_bleeding_disorder: hasBleedingDisorder,
    is_pregnant_or_lactating: isPregnant,
    allergy_local_anesthetic: allergyAnesthetic,
    allergy_penicillin: allergyPenicillin,
    allergy_latex: allergyLatex,
    allergy_nsaids: allergyNsaids,
    other_allergies: otherAllergies || null,
    current_medications: currentMedications || null,
    has_bruxism: hasBruxism,
    is_smoker: isSmoker,
    blood_pressure_systolic: sysNum && !isNaN(sysNum) ? sysNum : null,
    blood_pressure_diastolic: diaNum && !isNaN(diaNum) ? diaNum : null,
  });

  const effectiveAsa: AsaClassification =
    asaOverride !== "auto" ? (asaOverride as AsaClassification) : liveEvaluation.recommendedAsa;

  const saveMut = useMutation({
    mutationFn: async () => {
      await savePatientStructuredAnamnesis(clinicId, {
        patient_id: patientId,
        professional_id: professionalId !== "none" ? professionalId : null,
        asa_classification: effectiveAsa,
        has_hypertension: hasHypertension,
        has_diabetes: hasDiabetes,
        has_heart_disease: hasHeartDisease,
        uses_anticoagulants: usesAnticoagulants,
        uses_bisphosphonates: usesBisphosphonates,
        has_bleeding_disorder: hasBleedingDisorder,
        is_pregnant_or_lactating: isPregnant,
        allergy_local_anesthetic: allergyAnesthetic,
        allergy_penicillin: allergyPenicillin,
        allergy_latex: allergyLatex,
        allergy_nsaids: allergyNsaids,
        other_allergies: otherAllergies.trim() || undefined,
        current_medications: currentMedications.trim() || undefined,
        has_bruxism: hasBruxism,
        is_smoker: isSmoker,
        blood_pressure_systolic: sysNum && !isNaN(sysNum) ? sysNum : null,
        blood_pressure_diastolic: diaNum && !isNaN(diaNum) ? diaNum : null,
        chief_complaint: chiefComplaint.trim() || undefined,
        clinical_observations: clinicalObservations.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Anamnese estruturada e classificação de risco cirúrgico salvas no prontuário!");
      qc.invalidateQueries({ queryKey: ["structuredAnamnesis", clinicId, patientId] });
      qc.invalidateQueries({ queryKey: ["clinicalRecords", clinicId, patientId] });
      qc.invalidateQueries({ queryKey: ["recordsRefs", clinicId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Coluna 1: Questionário Estruturado de Saúde & Farmacologia */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
        className="space-y-5 rounded-2xl border bg-card p-5 shadow-card lg:col-span-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-base font-extrabold text-navy">
                Questionário de Anamnese Digital Estruturada
              </h3>
              <p className="text-xs text-muted-foreground">
                Mapeamento sistêmico, farmacológico e alérgico com cálculo automático de risco cirúrgico e ASA.
              </p>
            </div>
          </div>
        </div>

        {/* Sinais Vitais e Profissional Avaliador */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">PA Sistólica (mmHg)</Label>
            <Input
              type="number"
              min={60}
              max={280}
              placeholder="Ex.: 120"
              value={bpSystolic}
              onChange={(e) => setBpSystolic(e.target.value)}
              disabled={!canWrite}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">PA Diastólica (mmHg)</Label>
            <Input
              type="number"
              min={30}
              max={180}
              placeholder="Ex.: 80"
              value={bpDiastolic}
              onChange={(e) => setBpDiastolic(e.target.value)}
              disabled={!canWrite}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Classificação ASA</Label>
            <Select value={asaOverride} onValueChange={setAsaOverride} disabled={!canWrite}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático ({liveEvaluation.recommendedAsa})</SelectItem>
                {ASA_CLASSIFICATIONS.map((asa) => (
                  <SelectItem key={asa} value={asa}>
                    {asa}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Avaliador</Label>
            <Select value={professionalId} onValueChange={setProfessionalId} disabled={!canWrite}>
              <SelectTrigger className="h-9 text-xs">
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
        </div>

        {/* Checklist de Condições Sistêmicas & Risco Cirúrgico */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wide text-navy">
            1. Condições Sistêmicas e Risco Cirúrgico
          </Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              {
                label: "Hipertensão Arterial Sistêmica",
                checked: hasHypertension,
                onChange: setHasHypertension,
              },
              {
                label: "Diabetes Mellitus",
                checked: hasDiabetes,
                onChange: setHasDiabetes,
              },
              {
                label: "Cardiopatia / Prótese Valvar (Risco Endocardite)",
                checked: hasHeartDisease,
                onChange: setHasHeartDisease,
              },
              {
                label: "Uso de Anticoagulantes / Antiagregantes (AAS, Varfarina, Rivaroxabana)",
                checked: usesAnticoagulants,
                onChange: setUsesAnticoagulants,
              },
              {
                label: "Uso de Bisfosfonatos / Antirreabsortivos (Risco Osteonecrose MRONJ)",
                checked: usesBisphosphonates,
                onChange: setUsesBisphosphonates,
              },
              {
                label: "Distúrbio de Coagulação / Hemorragia Prévia",
                checked: hasBleedingDisorder,
                onChange: setHasBleedingDisorder,
              },
              {
                label: "Gestante ou Lactante",
                checked: isPregnant,
                onChange: setIsPregnant,
              },
              {
                label: "Bruxismo / Apertamento Dental (Parafunção)",
                checked: hasBruxism,
                onChange: setHasBruxism,
              },
              {
                label: "Tabagista Ativo",
                checked: isSmoker,
                onChange: setIsSmoker,
              },
            ].map((item) => (
              <label
                key={item.label}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 text-xs transition ${
                  item.checked
                    ? "border-primary/40 bg-primary/10 font-semibold text-navy"
                    : "bg-background text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={!canWrite}
                  onChange={(e) => item.onChange(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Checklist de Alergias Medicamentosas e de Materiais */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wide text-destructive">
            2. Alergias Medicamentosas e Odontológicas
          </Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              {
                label: "Alergia a Anestésico Local / Vasoconstritor",
                checked: allergyAnesthetic,
                onChange: setAllergyAnesthetic,
              },
              {
                label: "Alergia a Penicilina / Amoxicilina",
                checked: allergyPenicillin,
                onChange: setAllergyPenicillin,
              },
              {
                label: "Alergia a AINEs / Dipirona / AAS",
                checked: allergyNsaids,
                onChange: setAllergyNsaids,
              },
              {
                label: "Alergia ao Látex (Luvas / Dique de Borracha)",
                checked: allergyLatex,
                onChange: setAllergyLatex,
              },
            ].map((item) => (
              <label
                key={item.label}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 text-xs transition ${
                  item.checked
                    ? "border-destructive/40 bg-destructive/10 font-bold text-destructive"
                    : "bg-background text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={!canWrite}
                  onChange={(e) => item.onChange(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>

          <div className="grid gap-3 pt-1 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Outras Alergias Conhecidas</Label>
              <Input
                className="h-9 text-xs"
                value={otherAllergies}
                onChange={(e) => setOtherAllergies(e.target.value)}
                disabled={!canWrite}
                placeholder="Ex.: Iodo, Clorexidina, Acrílico..."
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Medicações de Uso Contínuo</Label>
              <Input
                className="h-9 text-xs"
                value={currentMedications}
                onChange={(e) => setCurrentMedications(e.target.value)}
                disabled={!canWrite}
                placeholder="Ex.: Losartana 50mg, Metformina 850mg, Alendronato..."
              />
            </div>
          </div>
        </div>

        {/* Queixa Principal e Observações */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Queixa Principal Odontológica</Label>
            <Textarea
              rows={2}
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              disabled={!canWrite}
              placeholder="Ex.: Sensibilidade ao frio no molar inferior esquerdo."
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Histórico Médico / Observações Cirúrgicas</Label>
            <Textarea
              rows={2}
              value={clinicalObservations}
              onChange={(e) => setClinicalObservations(e.target.value)}
              disabled={!canWrite}
              placeholder="Ex.: Paciente relata ansiedade odontológica; última cirurgia sem intercorrências."
              className="text-xs"
            />
          </div>
        </div>

        {canWrite && (
          <div className="flex justify-end pt-2">
            <Button type="submit" variant="hero" disabled={saveMut.isPending}>
              {saveMut.isPending ? "Salvando Anamnese..." : "Salvar Anamnese e Atualizar Alertas"}
            </Button>
          </div>
        )}
      </form>

      {/* Coluna 2: Painel de Inteligência Clínica — Classificação ASA e Alertas de Risco Cirúrgico */}
      <div className="space-y-4 lg:col-span-5">
        <div className="rounded-2xl border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <h4 className="font-extrabold text-navy">Classificação ASA & Risco Cirúrgico</h4>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                liveEvaluation.overallRiskLevel === "critical"
                  ? "bg-red-600 text-white"
                  : liveEvaluation.overallRiskLevel === "high"
                    ? "bg-destructive/15 text-destructive"
                    : liveEvaluation.overallRiskLevel === "moderate"
                      ? "bg-amber-500/15 text-amber-800"
                      : "bg-emerald-500/15 text-emerald-800"
              }`}
            >
              {effectiveAsa} • Risco{" "}
              {liveEvaluation.overallRiskLevel === "critical"
                ? "Crítico"
                : liveEvaluation.overallRiskLevel === "high"
                  ? "Alto"
                  : liveEvaluation.overallRiskLevel === "moderate"
                    ? "Moderado"
                    : "Baixo (Padrão)"}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {liveEvaluation.alerts.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-bold">Paciente Higído (ASA I) — Sem Restrições Cirúrgicas Relatadas</p>
                  <p className="mt-0.5 text-[11px] text-emerald-700">
                    Nenhuma comorbidade sistêmica, coagulopatia ou alergia medicamentosa sinalizada.
                  </p>
                </div>
              </div>
            ) : (
              liveEvaluation.alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-xl border p-3.5 text-xs ${
                    alert.level === "critical"
                      ? "border-red-400 bg-red-50 text-red-950"
                      : alert.level === "high"
                        ? "border-destructive/40 bg-destructive/10 text-navy"
                        : alert.level === "moderate"
                          ? "border-amber-300 bg-amber-50/80 text-amber-950"
                          : "border-primary/25 bg-primary/5 text-navy"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-extrabold">
                    {alert.level === "critical" ? (
                      <AlertOctagon className="h-4 w-4 shrink-0 text-red-600" />
                    ) : alert.level === "high" ? (
                      <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    )}
                    <span>{alert.title}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed opacity-90">
                    <strong>Conduta Recomendada:</strong> {alert.clinicalRecommendation}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

