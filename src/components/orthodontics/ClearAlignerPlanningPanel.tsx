import { useState, useMemo } from "react";
import {
  Sparkles,
  Smile,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  MessageCircle,
  Settings,
  Plus,
  Check,
  Layers,
  Activity,
  Sliders,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getAlignerTreatment,
  saveAlignerTreatment,
  advanceToNextPlate,
  calculateAlignerProgress,
  buildAlignerWhatsAppReminderMessage,
  type ClearAlignerTreatment,
  type AlignerBrand,
  type AlignerStatus,
  type IprStep,
} from "@/modules/orthodontics/aligners";
import { buildWhatsAppWebUrl } from "@/modules/whatsapp";

interface ClearAlignerPlanningPanelProps {
  clinicId: string;
  clinicName?: string;
  patientId: string;
  patientName: string;
  patientPhone?: string | undefined;
  canWrite: boolean;
}

export function ClearAlignerPlanningPanel({
  clinicId,
  clinicName = "SondaPro Dental",
  patientId,
  patientName,
  patientPhone,
  canWrite,
}: ClearAlignerPlanningPanelProps) {
  // Carrega ou inicializa a ficha do alinhador
  const [treatment, setTreatment] = useState<ClearAlignerTreatment>(() => {
    const existing = getAlignerTreatment(clinicId, patientId);
    if (existing) return existing;
    return saveAlignerTreatment(clinicId, patientId, {
      patientName,
      brand: "Invisalign",
      totalUpperPlates: 18,
      totalLowerPlates: 14,
      currentPlateNumber: 1,
      deliveredPlatesCount: 4,
      changeFrequencyDays: 10,
      dailyWearHoursGoal: 22,
      status: "in_progress",
    });
  });

  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [iprModalOpen, setIprModalOpen] = useState(false);

  // Estados de Edição do Setup
  const [draftBrand, setDraftBrand] = useState<AlignerBrand>(treatment.brand);
  const [draftUpperPlates, setDraftUpperPlates] = useState(treatment.totalUpperPlates);
  const [draftLowerPlates, setDraftLowerPlates] = useState(treatment.totalLowerPlates);
  const [draftCurrentPlate, setDraftCurrentPlate] = useState(treatment.currentPlateNumber);
  const [draftDeliveredCount, setDraftDeliveredCount] = useState(treatment.deliveredPlatesCount);
  const [draftFrequency, setDraftFrequency] = useState(treatment.changeFrequencyDays);
  const [draftStatus, setDraftStatus] = useState<AlignerStatus>(treatment.status);
  const [draftAttachments, setDraftAttachments] = useState<string>(
    treatment.attachmentsTeeth.join(", ")
  );

  // Novo IPR
  const [newIprStage, setNewIprStage] = useState(4);
  const [newIprRegion, setNewIprRegion] = useState("Entre 31 e 41");
  const [newIprAmount, setNewIprAmount] = useState(0.2);

  // Progresso do Caso
  const progress = useMemo(() => calculateAlignerProgress(treatment), [treatment]);

  // Total de placas do arco mais longo
  const maxPlates = Math.max(treatment.totalUpperPlates, treatment.totalLowerPlates);

  // Avançar para a próxima placa
  const handleAdvancePlate = () => {
    if (!canWrite) return;
    const updated = advanceToNextPlate(clinicId, patientId);
    if (updated) {
      setTreatment(updated);
      toast.success(`Avançado para a Placa nº ${updated.currentPlateNumber}!`);
    }
  };

  // Salvar Alterações do Setup Digital
  const handleSaveSetup = () => {
    const parsedAttachments = draftAttachments
      .split(/[,;\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n >= 11 && n <= 48);

    const updated = saveAlignerTreatment(clinicId, patientId, {
      ...treatment,
      brand: draftBrand,
      totalUpperPlates: draftUpperPlates,
      totalLowerPlates: draftLowerPlates,
      currentPlateNumber: draftCurrentPlate,
      deliveredPlatesCount: draftDeliveredCount,
      changeFrequencyDays: draftFrequency,
      status: draftStatus,
      attachmentsTeeth: parsedAttachments,
    });

    setTreatment(updated);
    setSetupModalOpen(false);
    toast.success("Setup digital do alinhador atualizado com sucesso!");
  };

  // Alternar Status do IPR (Realizado / Pendente)
  const handleToggleIpr = (iprId: string) => {
    if (!canWrite) return;
    const updatedSteps = treatment.iprSteps.map((step) => {
      if (step.id === iprId) {
        return {
          ...step,
          completed: !step.completed,
          completedAt: !step.completed ? new Date().toISOString() : undefined,
        };
      }
      return step;
    });

    const updated = saveAlignerTreatment(clinicId, patientId, {
      ...treatment,
      iprSteps: updatedSteps,
    });
    setTreatment(updated);
    toast.success("Status do IPR atualizado.");
  };

  // Adicionar novo IPR
  const handleAddIpr = () => {
    const newStep: IprStep = {
      id: `ipr_${Date.now()}`,
      stageNumber: newIprStage,
      teethRegion: newIprRegion.trim(),
      amountMm: newIprAmount,
      completed: false,
    };

    const updated = saveAlignerTreatment(clinicId, patientId, {
      ...treatment,
      iprSteps: [...treatment.iprSteps, newStep].sort((a, b) => a.stageNumber - b.stageNumber),
    });
    setTreatment(updated);
    setIprModalOpen(false);
    toast.success("Desgaste Interproximal (IPR) agendado!");
  };

  // Disparar Lembrete no WhatsApp
  const handleSendWhatsAppReminder = () => {
    const phone = patientPhone?.replace(/\D/g, "") || "";
    if (!phone) {
      toast.error("O paciente não possui telefone cadastrado para WhatsApp.");
      return;
    }

    const message = buildAlignerWhatsAppReminderMessage(patientName, clinicName, treatment);
    const url = buildWhatsAppWebUrl(phone, message);
    window.open(url, "_blank");
    toast.success("Lembrete de troca de placa gerado no WhatsApp!");
  };

  return (
    <div className="space-y-6">
      {/* HEADER DO ALINHADOR & CONTROLES */}
      <Card className="border-teal/30 bg-linear-to-r from-teal/5 via-primary/5 to-card shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1 border-teal/40 text-teal font-bold text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  {treatment.brand}
                </Badge>
                <Badge
                  variant={
                    treatment.status === "in_progress"
                      ? "default"
                      : treatment.status === "refinement"
                      ? "secondary"
                      : "outline"
                  }
                  className="text-[11px] font-semibold"
                >
                  {treatment.status === "in_progress"
                    ? "Em Uso Ativo"
                    : treatment.status === "refinement"
                    ? "Fase de Refinamento"
                    : treatment.status === "planning"
                    ? "Planejamento / Setup"
                    : treatment.status === "retention"
                    ? "Contenção"
                    : "Finalizado"}
                </Badge>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black font-display text-navy dark:text-white">
                  Placa {treatment.currentPlateNumber} de {maxPlates}
                </span>
                <span className="text-xs text-muted-foreground">
                  (Superior: {treatment.totalUpperPlates} | Inferior: {treatment.totalLowerPlates})
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  Troca a cada <strong>{treatment.changeFrequencyDays} dias</strong>
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-teal" />
                  Próxima troca: <strong>{new Date(`${treatment.nextChangeDate}T00:00:00`).toLocaleDateString("pt-BR")}</strong>
                </span>
              </div>
            </div>

            {/* AÇÕES RÁPIDAS */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                onClick={handleSendWhatsAppReminder}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Lembrete WhatsApp
              </Button>

              {canWrite && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => {
                      setDraftBrand(treatment.brand);
                      setDraftUpperPlates(treatment.totalUpperPlates);
                      setDraftLowerPlates(treatment.totalLowerPlates);
                      setDraftCurrentPlate(treatment.currentPlateNumber);
                      setDraftDeliveredCount(treatment.deliveredPlatesCount);
                      setDraftFrequency(treatment.changeFrequencyDays);
                      setDraftStatus(treatment.status);
                      setDraftAttachments(treatment.attachmentsTeeth.join(", "));
                      setSetupModalOpen(true);
                    }}
                  >
                    <Settings className="h-3.5 w-3.5 text-primary" />
                    Editar Setup
                  </Button>

                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="gap-1.5 text-xs shadow-xs"
                    onClick={handleAdvancePlate}
                    disabled={treatment.currentPlateNumber >= maxPlates}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Avançar Placa ({treatment.currentPlateNumber + 1})
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* BARRA DE PROGRESSO DO CASO */}
          <div className="mt-5 space-y-1.5">
            <div className="flex justify-between text-xs font-semibold">
              <span>Progresso do Tratamento</span>
              <span className="text-teal font-extrabold">{progress.progressPct}% Concluído</span>
            </div>
            <Progress value={progress.progressPct} className="h-2.5 rounded-full" />
            <div className="flex justify-between text-[11px] text-muted-foreground pt-0.5">
              <span>
                Restam <strong>{progress.platesRemaining} placas</strong> (~{progress.estimatedWeeksRemaining} semanas de tratamento)
              </span>
              <span>Uso diário recomendado: {treatment.dailyWearHoursGoal}h/dia</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AVISO DE ENTREGA DE NOVAS PLACAS */}
      {progress.needsDeliveryWarning && (
        <div className="flex items-center justify-between p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="text-xs">
              <span className="font-bold">Atenção ao Estoque do Paciente: </span>
              O paciente está na placa <strong>{treatment.currentPlateNumber}</strong>, e foram entregues até a placa <strong>{treatment.deliveredPlatesCount}</strong>.
              Agende a consulta para checagem clínica e entrega do próximo lote de placas.
            </div>
          </div>
          <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold text-xs shrink-0">
            Entrega Necessária
          </Badge>
        </div>
      )}

      {/* LINHA DO TEMPO VISUAL DE TODAS AS PLACAS (ALIGNER TRACKER) */}
      <Card className="shadow-xs border-slate-200/80 dark:border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-sm font-bold flex items-center gap-2">
              <Layers className="h-4 w-4 text-teal" />
              Linha do Tempo Visual de Placas (Aligner Tracker)
            </CardTitle>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Concluída
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-teal ring-2 ring-teal/30" /> Em Uso
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Entregue
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200 dark:bg-slate-700" /> No Consultório
              </span>
            </div>
          </div>
          <CardDescription className="text-xs">
            Acompanhe cada placa do planejamento. Clique em qualquer placa para inspecionar ou ajustar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 lg:grid-cols-12 gap-2">
            {Array.from({ length: maxPlates }, (_, i) => {
              const plateNum = i + 1;
              const isPast = plateNum < treatment.currentPlateNumber;
              const isCurrent = plateNum === treatment.currentPlateNumber;
              const isDelivered = plateNum <= treatment.deliveredPlatesCount && !isPast && !isCurrent;

              // Verifica se tem IPR agendado nesta placa
              const hasIpr = treatment.iprSteps.some((step) => step.stageNumber === plateNum);

              let bgClass = "bg-slate-100 dark:bg-slate-800/80 text-muted-foreground border-slate-200 dark:border-slate-800";
              if (isPast) {
                bgClass = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
              } else if (isCurrent) {
                bgClass = "bg-teal text-white border-teal shadow-md ring-2 ring-teal/30 font-extrabold scale-105";
              } else if (isDelivered) {
                bgClass = "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
              }

              return (
                <div
                  key={plateNum}
                  onClick={() => {
                    if (canWrite) {
                      const updated = saveAlignerTreatment(clinicId, patientId, {
                        ...treatment,
                        currentPlateNumber: plateNum,
                      });
                      setTreatment(updated);
                      toast.success(`Placa ativa alterada para ${plateNum}`);
                    }
                  }}
                  className={`relative flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer select-none hover:border-primary/50 ${bgClass}`}
                >
                  <span className="text-[10px] font-semibold">Placa</span>
                  <span className="text-sm font-black font-mono">{plateNum}</span>

                  {isPast && <Check className="h-3 w-3 mt-0.5 text-emerald-600" />}
                  {isCurrent && <span className="text-[9px] uppercase tracking-wider font-bold mt-0.5">Atual</span>}

                  {/* Badge de IPR */}
                  {hasIpr && (
                    <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                      !
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* SEÇÃO DE ATTACHMENTS & DESGASTES INTERPROXIMAIS (IPR) */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* MAPA DE ATTACHMENTS */}
        <Card className="shadow-xs border-slate-200/80 dark:border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-sm font-bold flex items-center gap-2">
              <Smile className="h-4 w-4 text-primary" />
              Mapa de Attachments Instalados
            </CardTitle>
            <CardDescription className="text-xs">
              Dentes com botões de resina composta para ancoragem e movimentação do alinhador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {treatment.attachmentsTeeth.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum attachment configurado.</p>
              ) : (
                treatment.attachmentsTeeth.map((tooth) => (
                  <Badge
                    key={tooth}
                    variant="outline"
                    className="font-mono text-xs font-bold border-teal/40 bg-teal/5 text-teal"
                  >
                    Dente {tooth}
                  </Badge>
                ))
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed pt-2 border-t">
              Instalados com resina de corpo e template termoformado no início do tratamento.
            </p>
          </CardContent>
        </Card>

        {/* CRONOGRAMA DE IPR / STRIPPING */}
        <Card className="shadow-xs border-slate-200/80 dark:border-slate-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-sm font-bold flex items-center gap-2">
                <Activity className="h-4 w-4 text-rose-500" />
                Cronograma de Desgaste (IPR / Stripping)
              </CardTitle>
              {canWrite && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setIprModalOpen(true)}
                >
                  <Plus className="h-3 w-3" />
                  Novo IPR
                </Button>
              )}
            </div>
            <CardDescription className="text-xs">
              Ajustes de espaço interproximal programados por estágio.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Placa</TableHead>
                  <TableHead className="text-xs">Região Interproximal</TableHead>
                  <TableHead className="text-center text-xs">Espessura</TableHead>
                  <TableHead className="text-center text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {treatment.iprSteps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-xs text-muted-foreground">
                      Nenhum IPR programado para este caso.
                    </TableCell>
                  </TableRow>
                ) : (
                  treatment.iprSteps.map((step) => (
                    <TableRow key={step.id}>
                      <TableCell className="font-mono font-bold text-xs">
                        Placa {step.stageNumber}
                      </TableCell>
                      <TableCell className="text-xs">{step.teethRegion}</TableCell>
                      <TableCell className="text-center font-mono font-bold text-xs text-rose-600">
                        {step.amountMm} mm
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          type="button"
                          variant={step.completed ? "default" : "outline"}
                          size="sm"
                          className="h-6 text-[10px] gap-1 px-2"
                          onClick={() => handleToggleIpr(step.id)}
                          disabled={!canWrite}
                        >
                          {step.completed ? (
                            <>
                              <Check className="h-3 w-3" /> Realizado
                            </>
                          ) : (
                            "Pendente"
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* MODAL DE EDIÇÃO DO SETUP DIGITAL */}
      <Dialog open={setupModalOpen} onOpenChange={setSetupModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Configurar Setup de Alinhadores Invisíveis
            </DialogTitle>
            <DialogDescription className="text-xs">
              Defina os parâmetros do planejamento digital, total de placas e trocas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Marca / Sistema do Alinhador</Label>
              <Select value={draftBrand} onValueChange={(v) => setDraftBrand(v as AlignerBrand)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Invisalign">Invisalign</SelectItem>
                  <SelectItem value="Smilink">Smilink</SelectItem>
                  <SelectItem value="SouSmile">SouSmile</SelectItem>
                  <SelectItem value="Compass 3D">Compass 3D</SelectItem>
                  <SelectItem value="Cler Aligner">Clear Aligner</SelectItem>
                  <SelectItem value="In-Office / Laboratório Próprio">In-Office / Laboratório Próprio</SelectItem>
                  <SelectItem value="Outra Marca">Outra Marca</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Total Placas Superiores</Label>
                <Input
                  type="number"
                  value={draftUpperPlates}
                  onChange={(e) => setDraftUpperPlates(Number(e.target.value) || 1)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Total Placas Inferiores</Label>
                <Input
                  type="number"
                  value={draftLowerPlates}
                  onChange={(e) => setDraftLowerPlates(Number(e.target.value) || 1)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Placa Atual em Uso</Label>
                <Input
                  type="number"
                  value={draftCurrentPlate}
                  onChange={(e) => setDraftCurrentPlate(Number(e.target.value) || 1)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Placas Entregues ao Paciente</Label>
                <Input
                  type="number"
                  value={draftDeliveredCount}
                  onChange={(e) => setDraftDeliveredCount(Number(e.target.value) || 1)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Frequência de Troca (Dias)</Label>
                <Select
                  value={String(draftFrequency)}
                  onValueChange={(v) => setDraftFrequency(Number(v))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">A cada 7 dias</SelectItem>
                    <SelectItem value="10">A cada 10 dias (Padrão)</SelectItem>
                    <SelectItem value="14">A cada 14 dias (2 semanas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Fase do Tratamento</Label>
                <Select value={draftStatus} onValueChange={(v) => setDraftStatus(v as AlignerStatus)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">Planejamento / Setup</SelectItem>
                    <SelectItem value="in_progress">Em Uso Ativo</SelectItem>
                    <SelectItem value="refinement">Refinamento</SelectItem>
                    <SelectItem value="retention">Contenção</SelectItem>
                    <SelectItem value="completed">Finalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Dentes com Attachments (separados por vírgula)</Label>
              <Input
                value={draftAttachments}
                onChange={(e) => setDraftAttachments(e.target.value)}
                placeholder="Ex: 13, 14, 23, 24, 34, 44"
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSetupModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="default" size="sm" onClick={handleSaveSetup}>
              Salvar Setup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE ADICIONAR IPR */}
      <Dialog open={iprModalOpen} onOpenChange={setIprModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-rose-500" />
              Programar Desgaste (IPR / Stripping)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Na Placa / Estágio Nº</Label>
              <Input
                type="number"
                value={newIprStage}
                onChange={(e) => setNewIprStage(Number(e.target.value) || 1)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Região Interproximal (Dentes)</Label>
              <Input
                value={newIprRegion}
                onChange={(e) => setNewIprRegion(e.target.value)}
                placeholder="Ex: Entre 31 e 41"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Quantidade de Desgaste (mm)</Label>
              <Select
                value={String(newIprAmount)}
                onValueChange={(v) => setNewIprAmount(Number(v))}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.1">0.1 mm</SelectItem>
                  <SelectItem value="0.2">0.2 mm</SelectItem>
                  <SelectItem value="0.3">0.3 mm</SelectItem>
                  <SelectItem value="0.4">0.4 mm</SelectItem>
                  <SelectItem value="0.5">0.5 mm</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIprModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="default" size="sm" onClick={handleAddIpr}>
              Adicionar IPR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

