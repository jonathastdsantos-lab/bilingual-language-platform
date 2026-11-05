import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Baby,
  Smile,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Sparkles,
  ShieldCheck,
  Milk,
  Clock,
  Printer,
  Save,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import {
  PEDIATRIC_ERUPTION_TIMELINE,
  calculatePediatricCariesRisk,
  fetchPatientPediatricAssessment,
  savePatientPediatricAssessment,
} from "@/modules/records";
import type {
  DentitionStage,
  PediatricCariesRiskLevel,
  PediatricDentalAssessment,
  ToothpasteAmount,
} from "@/types";

interface PediatricDentalPanelProps {
  clinicId: string;
  patientId: string;
  patientBirthDate?: string | null;
  patientName?: string;
  professionals: Array<{ id: string; name: string }>;
  canWrite: boolean;
}

export function PediatricDentalPanel({
  clinicId,
  patientId,
  patientBirthDate,
  patientName,
  professionals,
  canWrite,
}: PediatricDentalPanelProps) {
  const { locale, dateLocale } = useT();
  const isEn = locale === "en";
  const qc = useQueryClient();

  // Calcula idade da criança em anos e meses
  const calculateChildAge = (birthDate?: string | null) => {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    const now = new Date();
    if (isNaN(birth.getTime())) return null;

    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    if (months < 0) {
      years--;
      months += 12;
    }
    return { years, months, totalMonths: years * 12 + months };
  };

  const childAge = calculateChildAge(patientBirthDate);

  // Sugestão da fase da dentição baseada na idade
  const getSuggestedDentition = (ageYears: number): DentitionStage => {
    if (ageYears < 6) return "deciduous";
    if (ageYears <= 12) return "mixed";
    return "permanent";
  };

  // Query: Busca avaliação do paciente
  const { data: assessment, isLoading } = useQuery({
    queryKey: ["pediatric_assessment", clinicId, patientId],
    queryFn: () => fetchPatientPediatricAssessment(clinicId, patientId),
    enabled: !!patientId,
  });

  // State local do formulário
  const [dentitionStage, setDentitionStage] = useState<DentitionStage>("deciduous");
  const [evaluatorId, setEvaluatorId] = useState<string>(professionals[0]?.id ?? "none");

  // Hábitos
  const [pacifierActive, setPacifierActive] = useState(false);
  const [pacifierFrequency, setPacifierFrequency] = useState<"none" | "occasional" | "frequent" | "continuous">("none");
  const [pacifierYears, setPacifierYears] = useState(0);

  const [thumbActive, setThumbActive] = useState(false);
  const [thumbFrequency, setThumbFrequency] = useState<"none" | "occasional" | "frequent" | "continuous">("none");
  const [thumbYears, setThumbYears] = useState(0);

  const [bottleActive, setBottleActive] = useState(false);
  const [bottleSleep, setBottleSleep] = useState(false);
  const [bottleSweetened, setBottleSweetened] = useState(false);

  const [mouthBreathing, setMouthBreathing] = useState(false);
  const [bruxism, setBruxism] = useState(false);
  const [atypicalSwallowing, setAtypicalSwallowing] = useState(false);

  // Higiene & Dieta
  const [brushingDaily, setBrushingDaily] = useState(2);
  const [fluoridePpm, setFluoridePpm] = useState(1100);
  const [toothpasteAmount, setToothpasteAmount] = useState<ToothpasteAmount>("rice_grain");
  const [flossFrequency, setFlossFrequency] = useState<"never" | "rarely" | "weekly" | "daily">("daily");
  const [sugarIntake, setSugarIntake] = useState<"low" | "moderate" | "high">("low");
  const [clinicalNotes, setClinicalNotes] = useState("");

  // Sincroniza estado quando avaliação carregar
  useEffect(() => {
    if (assessment) {
      setDentitionStage(assessment.dentition_stage);
      setEvaluatorId(assessment.evaluator_id || professionals[0]?.id || "none");
      setPacifierActive(assessment.pacifier_habit.active);
      setPacifierFrequency(assessment.pacifier_habit.frequency);
      setPacifierYears(assessment.pacifier_habit.duration_years);
      setThumbActive(assessment.thumb_sucking_habit.active);
      setThumbFrequency(assessment.thumb_sucking_habit.frequency);
      setThumbYears(assessment.thumb_sucking_habit.duration_years);
      setBottleActive(assessment.bottle_feeding_habit.active);
      setBottleSleep(assessment.bottle_feeding_habit.sleep_bottle);
      setBottleSweetened(assessment.bottle_feeding_habit.sweetened);
      setMouthBreathing(assessment.mouth_breathing);
      setBruxism(assessment.bruxism);
      setAtypicalSwallowing(assessment.atypical_swallowing);
      setBrushingDaily(assessment.brushing_frequency_daily);
      setFluoridePpm(assessment.fluoride_ppm);
      setToothpasteAmount(assessment.toothpaste_amount);
      setFlossFrequency(assessment.floss_frequency);
      setSugarIntake(assessment.sugar_intake_frequency);
      setClinicalNotes(assessment.clinical_notes || "");
    } else if (childAge) {
      setDentitionStage(getSuggestedDentition(childAge.years));
      if (childAge.years >= 3) {
        setToothpasteAmount("pea_size");
      }
    }
  }, [assessment, childAge, professionals]);

  // Cálculo reativo do risco de cárie
  const currentRisk: PediatricCariesRiskLevel = calculatePediatricCariesRisk({
    sugar_intake_frequency: sugarIntake,
    bottle_feeding_habit: {
      active: bottleActive,
      sleep_bottle: bottleSleep,
      sweetened: bottleSweetened,
    },
    brushing_frequency_daily: brushingDaily,
    fluoride_ppm: fluoridePpm,
    mouth_breathing: mouthBreathing,
  });

  // Mutation: Salvar Avaliação
  const saveMutation = useMutation({
    mutationFn: async () => {
      return savePatientPediatricAssessment(clinicId, {
        id: assessment?.id,
        patient_id: patientId,
        evaluator_id: evaluatorId !== "none" ? evaluatorId : null,
        dentition_stage: dentitionStage,
        pacifier_habit: {
          active: pacifierActive,
          frequency: pacifierFrequency,
          duration_years: pacifierYears,
        },
        thumb_sucking_habit: {
          active: thumbActive,
          frequency: thumbFrequency,
          duration_years: thumbYears,
        },
        bottle_feeding_habit: {
          active: bottleActive,
          sleep_bottle: bottleSleep,
          sweetened: bottleSweetened,
        },
        mouth_breathing: mouthBreathing,
        bruxism,
        atypical_swallowing: atypicalSwallowing,
        brushing_frequency_daily: brushingDaily,
        fluoride_ppm: fluoridePpm,
        toothpaste_amount: toothpasteAmount,
        floss_frequency: flossFrequency,
        sugar_intake_frequency: sugarIntake,
        clinical_notes: clinicalNotes,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pediatric_assessment", clinicId, patientId] });
      toast.success(
        isEn
          ? "Pediatric assessment saved successfully!"
          : "Avaliação odontopediátrica salva com sucesso!"
      );
    },
    onError: (err: Error) => {
      toast.error(err.message || (isEn ? "Failed to save assessment." : "Erro ao salvar avaliação."));
    },
  });

  const handlePrintTimeline = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cronologia de Erupção Decídua - ${patientName || "Paciente"}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; color: #1e293b; }
          .title { font-size: 20px; font-weight: bold; color: #0284c7; }
          .subtitle { font-size: 13px; color: #64748b; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 15px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
          th { background: #f1f5f9; color: #0f172a; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; }
          .low { background: #dcfce7; color: #166534; }
          .moderate { background: #fef3c7; color: #92400e; }
          .high { background: #fee2e2; color: #991b1b; }
          .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="title">Guia Odontopediátrico de Erupção e Esfoliação Dentária</div>
        <div class="subtitle">
          Paciente: <strong>${patientName || "Paciente"}</strong> | 
          Risco de Cárie: <span class="badge ${currentRisk}">${currentRisk.toUpperCase()}</span> |
          Emissão: ${new Date().toLocaleDateString(dateLocale)}
        </div>
        <table>
          <thead>
            <tr>
              <th>Dente (FDI)</th>
              <th>Nome Anatômico</th>
              <th>Arcada</th>
              <th>Erupção Média</th>
              <th>Queda Esperada (Esfoliação)</th>
            </tr>
          </thead>
          <tbody>
            ${PEDIATRIC_ERUPTION_TIMELINE.map(
              (t) => `
              <tr>
                <td><strong>${t.fdiNumber}</strong></td>
                <td>${t.namePt}</td>
                <td>${t.arch === "upper" ? "Superior" : "Inferior"}</td>
                <td>${t.eruptionAgeMonths}</td>
                <td>${t.exfoliationAgeYears}</td>
              </tr>
            `
            ).join("")}
          </tbody>
        </table>
        <div class="footer">
          SondaPro Odontologia Infantil · Guia Clínico de Orientação Preventiva aos Pais
        </div>
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* 1. Header do Paciente Odontopediátrico */}
      <div className="rounded-2xl border bg-gradient-to-r from-amber-50/70 via-white to-sky-50/60 p-5 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-xs">
              <Baby className="h-6 w-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-navy">
                  {isEn ? "Pediatric Dental Assessment" : "Prontuário Odontopediátrico Especializado"}
                </h3>
                <Badge
                  className={`font-bold capitalize ${
                    currentRisk === "high"
                      ? "bg-red-600 text-white"
                      : currentRisk === "moderate"
                      ? "bg-amber-500 text-white"
                      : "bg-emerald-600 text-white"
                  }`}
                >
                  {isEn ? `Caries Risk: ${currentRisk}` : `Risco de Cárie: ${currentRisk === "high" ? "Alto" : currentRisk === "moderate" ? "Moderado" : "Baixo"}`}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {childAge ? (
                  <>
                    {isEn ? "Age:" : "Idade:"}{" "}
                    <strong>
                      {childAge.years} {isEn ? "years" : "anos"}{" "}
                      {childAge.months > 0 && `e ${childAge.months} ${isEn ? "months" : "meses"}`}
                    </strong>{" "}
                    · {isEn ? "FDI Deciduous System (51-85)" : "Notação FDI Decídua (51 a 85)"}
                  </>
                ) : (
                  isEn ? "Deciduous & Mixed Dentition Protocol" : "Protocolo de Dentição Decídua e Mista"
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs text-slate-700"
              onClick={handlePrintTimeline}
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{isEn ? "Print Eruption Chart" : "Imprimir Cronologia"}</span>
            </Button>
          </div>
        </div>

        {/* Alerta de Mamadeira Noturna Adoçada se ativo */}
        {bottleActive && bottleSleep && bottleSweetened && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <div>
              <strong>Alerta Odontopediátrico Crítico:</strong> Mamadeira noturna com açúcar ou achocolatado associada ao sono.
              Alto risco iminente de <em>Cárie Precoce da Infância (Early Childhood Caries - ECC)</em>.
              Recomenda-se orientação de desmame noturno e higiene imediata pós-ingestão.
            </div>
          </div>
        )}
      </div>

      {/* 2. Formulário de Hábitos & Avaliação Preventiva */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Coluna 1: Hábitos Orais Deletérios */}
        <section className="rounded-2xl border bg-card p-5 shadow-card space-y-4">
          <div className="flex items-center gap-2 border-b pb-3">
            <Baby className="h-4 w-4 text-amber-600" />
            <h4 className="font-bold text-navy text-sm">
              {isEn ? "Oral Habits Assessment" : "Avaliação de Hábitos Deletérios e Parafunções"}
            </h4>
          </div>

          <div className="space-y-4 text-xs">
            {/* Chupeta */}
            <div className="rounded-xl border bg-slate-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-xs flex items-center gap-1.5">
                  <Smile className="h-3.5 w-3.5 text-amber-600" />
                  <span>Uso de Chupeta</span>
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pacifierActive"
                    checked={pacifierActive}
                    onChange={(e) => {
                      setPacifierActive(e.target.checked);
                      if (!e.target.checked) setPacifierFrequency("none");
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                  <label htmlFor="pacifierActive" className="text-xs text-slate-700">Ativo</label>
                </div>
              </div>
              {pacifierActive && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t">
                  <div>
                    <span className="text-[11px] text-muted-foreground">Frequência:</span>
                    <Select value={pacifierFrequency} onValueChange={(v) => setPacifierFrequency(v as "none" | "occasional" | "frequent" | "continuous")}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="occasional">Ocasional (só p/ dormir)</SelectItem>
                        <SelectItem value="frequent">Frequente (várias vezes ao dia)</SelectItem>
                        <SelectItem value="continuous">Contínuo (o dia todo)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground">Duração (anos):</span>
                    <Input
                      type="number"
                      min={0}
                      max={12}
                      className="h-7 text-xs"
                      value={pacifierYears}
                      onChange={(e) => setPacifierYears(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Sucção Digital (Dedo) */}
            <div className="rounded-xl border bg-slate-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-xs">Sucção Digital (Chupar Dedo)</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="thumbActive"
                    checked={thumbActive}
                    onChange={(e) => {
                      setThumbActive(e.target.checked);
                      if (!e.target.checked) setThumbFrequency("none");
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                  <label htmlFor="thumbActive" className="text-xs text-slate-700">Ativo</label>
                </div>
              </div>
              {thumbActive && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t">
                  <div>
                    <span className="text-[11px] text-muted-foreground">Frequência:</span>
                    <Select value={thumbFrequency} onValueChange={(v) => setThumbFrequency(v as "none" | "occasional" | "frequent" | "continuous")}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="occasional">Ocasional (dormir/estresse)</SelectItem>
                        <SelectItem value="frequent">Frequente</SelectItem>
                        <SelectItem value="continuous">Contínuo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground">Duração (anos):</span>
                    <Input
                      type="number"
                      min={0}
                      max={12}
                      className="h-7 text-xs"
                      value={thumbYears}
                      onChange={(e) => setThumbYears(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Mamadeira */}
            <div className="rounded-xl border bg-slate-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-xs flex items-center gap-1.5">
                  <Milk className="h-3.5 w-3.5 text-sky-600" />
                  <span>Uso de Mamadeira</span>
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="bottleActive"
                    checked={bottleActive}
                    onChange={(e) => setBottleActive(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                  <label htmlFor="bottleActive" className="text-xs text-slate-700">Ativo</label>
                </div>
              </div>
              {bottleActive && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t">
                  <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bottleSleep}
                      onChange={(e) => setBottleSleep(e.target.checked)}
                      className="h-3.5 w-3.5 rounded"
                    />
                    <span>Mamadeira Noturna (Dormir)</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bottleSweetened}
                      onChange={(e) => setBottleSweetened(e.target.checked)}
                      className="h-3.5 w-3.5 rounded"
                    />
                    <span className="text-red-700 font-semibold">Com Açúcar / Achocolatado</span>
                  </label>
                </div>
              )}
            </div>

            {/* Outras alterações funcionais */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mouthBreathing}
                  onChange={(e) => setMouthBreathing(e.target.checked)}
                  className="h-3.5 w-3.5 rounded"
                />
                <span>Respiração Bucal</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bruxism}
                  onChange={(e) => setBruxism(e.target.checked)}
                  className="h-3.5 w-3.5 rounded"
                />
                <span>Bruxismo Infantil</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={atypicalSwallowing}
                  onChange={(e) => setAtypicalSwallowing(e.target.checked)}
                  className="h-3.5 w-3.5 rounded"
                />
                <span>Deglutição Atípica</span>
              </label>
            </div>
          </div>
        </section>

        {/* Coluna 2: Higiene, Dieta & Flúor */}
        <section className="rounded-2xl border bg-card p-5 shadow-card space-y-4">
          <div className="flex items-center gap-2 border-b pb-3">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <h4 className="font-bold text-navy text-sm">
              {isEn ? "Hygiene, Diet & Fluoride" : "Higiene Bucal, Dieta e Prevenção"}
            </h4>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Frequência de Escovação / Dia:</Label>
                <Select value={String(brushingDaily)} onValueChange={(v) => setBrushingDaily(Number(v))}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Nenhuma escovação</SelectItem>
                    <SelectItem value="1">1 vez ao dia</SelectItem>
                    <SelectItem value="2">2 vezes ao dia (ideal)</SelectItem>
                    <SelectItem value="3">3 vezes ao dia ou mais</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Concentração de Flúor (ppm):</Label>
                <Select value={String(fluoridePpm)} onValueChange={(v) => setFluoridePpm(Number(v))}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sem Flúor (0 ppm)</SelectItem>
                    <SelectItem value="500">Baixa (500 ppm)</SelectItem>
                    <SelectItem value="1100">Padrão Recomendado (≥ 1100 ppm)</SelectItem>
                    <SelectItem value="1450">Alta (1450 ppm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Quantidade de Pasta:</Label>
                <Select value={toothpasteAmount} onValueChange={(v) => setToothpasteAmount(v as ToothpasteAmount)}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rice_grain">Grão de Arroz Cru (0 a 3 anos)</SelectItem>
                    <SelectItem value="pea_size">Grão de Ervilha (3 a 6 anos)</SelectItem>
                    <SelectItem value="standard">Quantidade Padrão (&gt;6 anos)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Uso de Fio Dental:</Label>
                <Select value={flossFrequency} onValueChange={(v) => setFlossFrequency(v as "never" | "rarely" | "weekly" | "daily")}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Nunca</SelectItem>
                    <SelectItem value="rarely">Raramente</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="daily">Diário (supervisionado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Consumo de Açúcar / Guloseimas entre refeições:</Label>
              <Select value={sugarIntake} onValueChange={(v) => setSugarIntake(v as "low" | "moderate" | "high")}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixo (raramente ou só em datas especiais)</SelectItem>
                  <SelectItem value="moderate">Moderado (1 a 2 vezes ao dia)</SelectItem>
                  <SelectItem value="high">Alto (&gt;3 vezes ao dia ou beliscamento contínuo)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Dentista / Odontopediatra Avaliador:</Label>
              <Select value={evaluatorId} onValueChange={setEvaluatorId}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum selecionado</SelectItem>
                  {professionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Conduta & Observações Clínicas:</Label>
              <Textarea
                rows={2}
                placeholder="Ex: Orientado aos pais redução de sacarose e técnica de escovação com grão de ervilha..."
                className="mt-1 text-xs"
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
              />
            </div>

            {canWrite && (
              <Button
                type="button"
                className="w-full gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold mt-2"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                <Save className="h-4 w-4" />
                <span>{saveMutation.isPending ? "Salvando..." : "Salvar Prontuário Odontopediátrico"}</span>
              </Button>
            )}
          </div>
        </section>
      </div>

      {/* 3. Tabela de Cronologia de Erupção & Esfoliação FDI (51 a 85) */}
      <section className="rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between pb-3 border-b">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-sky-600" />
            <h4 className="font-bold text-navy">
              {isEn ? "FDI Primary Dentition Eruption & Exfoliation Timeline" : "Cronologia de Erupção e Esfoliação dos Dentes Decíduos (51 a 85)"}
            </h4>
          </div>
          <span className="text-xs text-muted-foreground">
            {PEDIATRIC_ERUPTION_TIMELINE.length} {isEn ? "primary teeth" : "dentes decíduos catalogados"}
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-slate-500 font-semibold bg-slate-50/70">
                <th className="py-2 px-3">FDI</th>
                <th className="py-2 px-3">Dente Decíduo (Anatomia)</th>
                <th className="py-2 px-3">Arcada</th>
                <th className="py-2 px-3">Erupção Média (Meses)</th>
                <th className="py-2 px-3">Esfoliação / Queda (Anos)</th>
                <th className="py-2 px-3">Sucessor Permanente</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {PEDIATRIC_ERUPTION_TIMELINE.map((t) => {
                // Cálculo do sucessor permanente
                let successor = "";
                const toothUnit = t.fdiNumber % 10;
                if (t.quadrant === 5) successor = toothUnit <= 3 ? `1${toothUnit}` : toothUnit === 4 ? "14 (1º PM)" : "15 (2º PM)";
                if (t.quadrant === 6) successor = toothUnit <= 3 ? `2${toothUnit}` : toothUnit === 4 ? "24 (1º PM)" : "25 (2º PM)";
                if (t.quadrant === 7) successor = toothUnit <= 3 ? `3${toothUnit}` : toothUnit === 4 ? "34 (1º PM)" : "35 (2º PM)";
                if (t.quadrant === 8) successor = toothUnit <= 3 ? `4${toothUnit}` : toothUnit === 4 ? "44 (1º PM)" : "45 (2º PM)";

                return (
                  <tr key={t.fdiNumber} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 font-mono font-bold text-sky-700">
                      {t.fdiNumber}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">
                      {isEn ? t.nameEn : t.namePt}
                    </td>
                    <td className="py-2.5 px-3 capitalize text-slate-600">
                      {t.arch === "upper" ? (isEn ? "Upper Arch" : "Arcada Superior") : (isEn ? "Lower Arch" : "Arcada Inferior")}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-emerald-700">
                      {t.eruptionAgeMonths}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-amber-700">
                      {t.exfoliationAgeYears}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      Dente {successor}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
