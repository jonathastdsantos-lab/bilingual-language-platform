import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Smile,
  Plus,
  Edit3,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Activity,
  Layers,
  Sparkles,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  fetchOrthodonticTreatment,
  saveOrthodonticTreatment,
  fetchOrthodonticMaintenances,
  recordOrthodonticMaintenance,
  calculateOrthodonticProgress,
  ARCHWIRE_CATALOG,
  BRACKET_PRESCRIPTIONS,
  APPLIANCE_TYPES,
  ELASTICS_CATALOG,
} from "@/modules/orthodontics";
import type {
  OrthodonticTreatment,
  OrthodonticMaintenance,
  OrthodonticTreatmentStatus,
  HygieneScore,
} from "@/types";

interface OrthodonticsRecordPanelProps {
  clinicId: string;
  patientId: string;
  patientName: string;
  canWrite: boolean;
}

export function OrthodonticsRecordPanel({
  clinicId,
  patientId,
  patientName,
  canWrite,
}: OrthodonticsRecordPanelProps) {
  const qc = useQueryClient();

  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);

  // Estados da Ficha do Tratamento
  const [diagnosis, setDiagnosis] = useState("");
  const [applianceType, setApplianceType] = useState("Metálico Convencional");
  const [prescription, setPrescription] = useState("Roth .022");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(
    () => new Date().toISOString().split("T")[0] || ""
  );
  const [durationMonths, setDurationMonths] = useState(24);
  const [monthlyFee, setMonthlyFee] = useState(150);
  const [treatmentStatus, setTreatmentStatus] =
    useState<OrthodonticTreatmentStatus>("active");

  // Estados de Nova Sessão de Manutenção
  const [upperArchwire, setUpperArchwire] = useState("0.014 NiTi Termoativado");
  const [lowerArchwire, setLowerArchwire] = useState("0.014 NiTi Termoativado");
  const [elastics, setElastics] = useState("Nenhum elástico intermaxilar");
  const [bracketsReplaced, setBracketsReplaced] = useState("");
  const [proceduresPerformed, setProceduresPerformed] = useState("");
  const [hygieneScore, setHygieneScore] = useState<HygieneScore>("good");
  const [nextStepPlan, setNextStepPlan] = useState("");
  const [nextApptDate, setNextApptDate] = useState("");

  // Consulta Ficha Ortodôntica do Paciente
  const { data: treatment, isLoading: isLoadingTreatment } = useQuery({
    queryKey: ["orthodonticTreatment", clinicId, patientId],
    queryFn: async () => {
      const data = await fetchOrthodonticTreatment(clinicId, patientId);
      if (data) {
        setDiagnosis(data.diagnosis);
        setApplianceType(data.appliance_type);
        setPrescription(data.bracket_prescription);
        setGoal(data.treatment_goal || "");
        setStartDate(data.start_date);
        setDurationMonths(data.estimated_duration_months);
        setMonthlyFee(Number(data.monthly_fee) || 150);
        setTreatmentStatus(data.status);
      }
      return data;
    },
  });

  // Consulta Manutenções
  const { data: maintenances = [], isLoading: isLoadingMaintenances } = useQuery({
    queryKey: ["orthodonticMaintenances", treatment?.id],
    queryFn: () => (treatment ? fetchOrthodonticMaintenances(treatment.id) : []),
    enabled: Boolean(treatment?.id),
  });

  // Mutação para Salvar Ficha de Tratamento
  const saveTreatmentMutation = useMutation({
    mutationFn: async () => {
      return await saveOrthodonticTreatment(clinicId, {
        patient_id: patientId,
        diagnosis: diagnosis.trim() || "Tratamento Ortodôntico Corretivo",
        appliance_type: applianceType,
        bracket_prescription: prescription,
        treatment_goal: goal.trim() || null,
        start_date: startDate,
        estimated_duration_months: Number(durationMonths) || 24,
        monthly_fee: Number(monthlyFee) || 150,
        status: treatmentStatus,
      });
    },
    onSuccess: () => {
      toast.success("Ficha ortodôntica salva com sucesso!");
      setTreatmentModalOpen(false);
      qc.invalidateQueries({
        queryKey: ["orthodonticTreatment", clinicId, patientId],
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Mutação para Registrar Manutenção
  const recordMaintenanceMutation = useMutation({
    mutationFn: async () => {
      if (!treatment) throw new Error("Ficha de tratamento inexistente.");
      return await recordOrthodonticMaintenance(clinicId, {
        treatment_id: treatment.id,
        patient_id: patientId,
        maintenance_number: maintenances.length + 1,
        maintenance_date: new Date().toISOString().split("T")[0] || "",
        upper_archwire: upperArchwire,
        lower_archwire: lowerArchwire,
        elastics_used: elastics,
        brackets_replaced: bracketsReplaced.trim() || null,
        procedures_performed:
          proceduresPerformed.trim() || "Troca de borrachinhas e alinhamento",
        patient_hygiene_score: hygieneScore,
        next_step_plan: nextStepPlan.trim() || null,
        next_appointment_date: nextApptDate || null,
      });
    },
    onSuccess: () => {
      toast.success("Sessão de manutenção registrada!");
      setMaintenanceModalOpen(false);
      setProceduresPerformed("");
      setBracketsReplaced("");
      qc.invalidateQueries({
        queryKey: ["orthodonticMaintenances", treatment?.id],
      });
      qc.invalidateQueries({
        queryKey: ["orthodonticTreatment", clinicId, patientId],
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const progress = treatment
    ? calculateOrthodonticProgress(treatment, maintenances.length)
    : null;

  const fmtDate = (iso: string) => {
    if (!iso) return "-";
    const datePart = iso.split("T")[0] || "";
    const parts = datePart.split("-");
    const y = parts[0] || "";
    const m = parts[1] || "";
    const d = parts[2] || "";
    return d && m && y ? `${d}/${m}/${y}` : iso;
  };

  if (isLoadingTreatment) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground">
        Carregando prontuário ortodôntico...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* CARD DO TRATAMENTO / APARELHO ATUAL */}
      {treatment ? (
        <div className="rounded-3xl border-2 border-teal/20 bg-gradient-to-br from-teal/5 via-white to-slate-50 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal text-white shadow-md">
                <Smile className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-navy">
                    {treatment.appliance_type}
                  </h3>
                  <Badge className="bg-teal/15 text-teal font-bold text-[10px]">
                    Prescrição {treatment.bracket_prescription}
                  </Badge>
                  <Badge
                    className={
                      treatment.status === "active"
                        ? "bg-emerald-500/15 text-emerald-800"
                        : "bg-slate-200 text-slate-700"
                    }
                  >
                    {treatment.status === "active"
                      ? "Em Tratamento Ativo"
                      : treatment.status === "retention"
                      ? "Contenção"
                      : "Concluído"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  <strong>Diagnóstico:</strong> {treatment.diagnosis}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canWrite && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTreatmentModalOpen(true)}
                    className="gap-1.5 text-xs font-semibold"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Editar Ficha
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => setMaintenanceModalOpen(true)}
                    className="bg-teal hover:bg-teal-600 text-white font-bold gap-1.5 text-xs shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Nova Manutenção
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Arcos Vigentes & Indicadores de Tempo */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border bg-white p-3.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Fio Superior Atual
              </span>
              <div className="text-sm font-extrabold text-navy mt-1">
                {treatment.upper_current_arch || "Não informado"}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-3.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Fio Inferior Atual
              </span>
              <div className="text-sm font-extrabold text-navy mt-1">
                {treatment.lower_current_arch || "Não informado"}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-3.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Início & Previsão
              </span>
              <div className="text-sm font-bold text-slate-800 mt-1">
                {fmtDate(treatment.start_date)} ({treatment.estimated_duration_months} meses)
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-3.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Sessões Realizadas
              </span>
              <div className="text-sm font-extrabold text-teal mt-1">
                {maintenances.length} manutenções
              </div>
            </div>
          </div>

          {/* Barra de Progresso Estimada */}
          {progress && (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>Progresso do Tratamento:</span>
                <span>
                  {progress.elapsedMonths} meses decorridos • {maintenances.length} de {treatment.estimated_duration_months} sessões previstas
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal to-navy rounded-full transition-all duration-500"
                  style={{ width: `${progress.progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center space-y-3">
          <Smile className="h-10 w-10 text-slate-300 mx-auto" />
          <div>
            <h3 className="text-base font-bold text-navy">
              Nenhum Tratamento Ortodôntico Ativo
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Inicie a ficha ortodôntica para acompanhar a troca de fios, elásticos e evolução do aparelho.
            </p>
          </div>
          {canWrite && (
            <Button
              onClick={() => setTreatmentModalOpen(true)}
              className="bg-teal hover:bg-teal-600 text-white font-bold gap-1.5 text-xs"
            >
              <Plus className="h-4 w-4" />
              Iniciar Tratamento Ortodôntico
            </Button>
          )}
        </div>
      )}

      {/* TIMELINE / HISTÓRICO DE MANUTENÇÕES */}
      {treatment && (
        <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
          <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
            <h4 className="font-bold text-navy text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal" />
              Histórico Cronológico de Manutenções Ortodônticas
            </h4>
            <span className="text-xs text-muted-foreground">
              {maintenances.length} sessões registradas
            </span>
          </div>

          {isLoadingMaintenances ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Carregando manutenções...
            </div>
          ) : maintenances.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Nenhuma sessão de manutenção registrada ainda. Clique em "Nova Manutenção".
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {maintenances.map((m) => (
                <div key={m.id} className="p-4 hover:bg-slate-50/50 transition-colors space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal/10 font-bold text-teal text-[11px]">
                        #{m.maintenance_number}
                      </span>
                      <strong className="text-navy text-sm font-bold">
                        {fmtDate(m.maintenance_date)}
                      </strong>
                      <Badge
                        className={
                          m.patient_hygiene_score === "excellent"
                            ? "bg-emerald-500/10 text-emerald-800"
                            : m.patient_hygiene_score === "good"
                            ? "bg-teal/10 text-teal"
                            : "bg-amber-500/10 text-amber-800"
                        }
                      >
                        Higiene: {m.patient_hygiene_score === "excellent" ? "Excelente" : m.patient_hygiene_score === "good" ? "Boa" : "Regular"}
                      </Badge>
                    </div>

                    {m.next_appointment_date && (
                      <span className="text-slate-500 text-[11px]">
                        Próxima sessão: <strong>{fmtDate(m.next_appointment_date)}</strong>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border">
                    <div>
                      <span className="text-slate-500">Arco Superior:</span>
                      <div className="font-semibold text-slate-800">{m.upper_archwire || "-"}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Arco Inferior:</span>
                      <div className="font-semibold text-slate-800">{m.lower_archwire || "-"}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Elásticos:</span>
                      <div className="font-semibold text-slate-800">{m.elastics_used || "Nenhum"}</div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-700">
                    <strong>Procedimentos Realizados:</strong> {m.procedures_performed}
                  </div>

                  {m.brackets_replaced && (
                    <div className="text-xs text-rose-700 bg-rose-50/60 p-2 rounded-lg border border-rose-100">
                      <strong>Peças / Braquetes Recimentados:</strong> {m.brackets_replaced}
                    </div>
                  )}

                  {m.next_step_plan && (
                    <div className="text-xs text-slate-500">
                      <em>Plano próxima consulta: {m.next_step_plan}</em>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: FICHA DO TRATAMENTO ORTODÔNTICO */}
      <Dialog open={treatmentModalOpen} onOpenChange={setTreatmentModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-navy">
              <Smile className="h-5 w-5 text-teal" />
              <span>Ficha de Tratamento Ortodôntico — {patientName}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Diagnóstico Ortodôntico *</Label>
              <Input
                placeholder="Ex: Classe II divisão 1, mordida profunda e apinhamento inferior"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Tipo de Aparelho</Label>
                <Select value={applianceType} onValueChange={setApplianceType}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPLIANCE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Prescrição dos Braquetes</Label>
                <Select value={prescription} onValueChange={setPrescription}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BRACKET_PRESCRIPTIONS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Data de Instalação</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Duração Estimada (meses)</Label>
                <Input
                  type="number"
                  min={6}
                  max={60}
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(Number(e.target.value))}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Objetivo do Tratamento</Label>
              <Textarea
                rows={2}
                placeholder="Ex: Alinhamento, nivelamento, fechamento de diastemas e correção de guia canino."
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTreatmentModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => saveTreatmentMutation.mutate()}
              disabled={saveTreatmentMutation.isPending}
              className="bg-teal hover:bg-teal-600 text-white font-bold"
            >
              {saveTreatmentMutation.isPending ? "Salvando..." : "Salvar Tratamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: NOVA SESSÃO DE MANUTENÇÃO */}
      <Dialog open={maintenanceModalOpen} onOpenChange={setMaintenanceModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-navy">
              <Activity className="h-5 w-5 text-teal" />
              <span>Registrar Manutenção Ortodôntica #{maintenances.length + 1}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Arco Superior (Fio)</Label>
                <Select value={upperArchwire} onValueChange={setUpperArchwire}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ARCHWIRE_CATALOG.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Arco Inferior (Fio)</Label>
                <Select value={lowerArchwire} onValueChange={setLowerArchwire}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ARCHWIRE_CATALOG.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-bold text-slate-700">Elásticos Intermaxilares</Label>
                <Select value={elastics} onValueChange={setElastics}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ELASTICS_CATALOG.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-bold text-slate-700">Braquetes / Tubos Recimentados (opcional)</Label>
                <Input
                  placeholder="Ex: Recimentado braquete no dente 12 e botão lingual no 36"
                  value={bracketsReplaced}
                  onChange={(e) => setBracketsReplaced(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-bold text-slate-700">Procedimentos Realizados *</Label>
                <Textarea
                  rows={2}
                  placeholder="Ex: Troca de ligaduras superiores e inferiores, ativação de amarrilho conjugado de canino a canino."
                  value={proceduresPerformed}
                  onChange={(e) => setProceduresPerformed(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Higiene do Paciente</Label>
                <Select
                  value={hygieneScore}
                  onValueChange={(v: any) => setHygieneScore(v)}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excellent">Excelente (Sem placa/gengivite)</SelectItem>
                    <SelectItem value="good">Boa (Leve acúmulo)</SelectItem>
                    <SelectItem value="regular">Regular (Gengiva inflamada)</SelectItem>
                    <SelectItem value="poor">Insuficiente (Higiene crítica)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Próxima Consulta (Data Prevista)</Label>
                <Input
                  type="date"
                  value={nextApptDate}
                  onChange={(e) => setNextApptDate(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-bold text-slate-700">Planejamento Próximo Passo</Label>
                <Input
                  placeholder="Ex: Evoluir para arco 19x25 aço e iniciar mecânica de elásticos Classe II"
                  value={nextStepPlan}
                  onChange={(e) => setNextStepPlan(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMaintenanceModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => recordMaintenanceMutation.mutate()}
              disabled={recordMaintenanceMutation.isPending}
              className="bg-teal hover:bg-teal-600 text-white font-bold"
            >
              {recordMaintenanceMutation.isPending ? "Registrando..." : "Registrar Manutenção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

