import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  ScreenShare,
  PhoneOff,
  ShieldCheck,
  FileText,
  Plus,
  Trash2,
  Printer,
  Clock,
  Sparkles,
  AlertTriangle,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  TeleodontologyPrescriptionItem,
  TeleodontologySession,
} from "@/modules/teleodontology";
import {
  CFO_226_MODALITY_LABELS,
  buildTeleodontologyPrintableHtml,
  saveTeleodontologyClinicalRecord,
  updateTeleodontologyStatus,
} from "@/modules/teleodontology";

interface TeleodontologyVideoRoomModalProps {
  session: TeleodontologySession;
  open: boolean;
  onClose: () => void;
  onSessionUpdated: (updated: TeleodontologySession) => void;
  clinicName: string;
}

export function TeleodontologyVideoRoomModal({
  session,
  open,
  onClose,
  onSessionUpdated,
  clinicName,
}: TeleodontologyVideoRoomModalProps) {
  const [micActive, setMicActive] = useState(true);
  const [videoActive, setVideoActive] = useState(true);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(session.durationSeconds || 0);
  const [clinicalNotes, setClinicalNotes] = useState(session.clinicalNotes || "");
  const [interconsultaNotes, setInterconsultaNotes] = useState(session.interconsultaNotes || "");
  const [prescriptions, setPrescriptions] = useState<TeleodontologyPrescriptionItem[]>(
    session.prescriptions || []
  );
  const [newMedName, setNewMedName] = useState("");
  const [newMedDosage, setNewMedDosage] = useState("");
  const [newMedInstructions, setNewMedInstructions] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Iniciar timer da chamada
  useEffect(() => {
    if (!open) return;

    // Se estiver agendada ou sala de espera, avança para in_progress
    if (session.status !== "in_progress" && session.status !== "completed") {
      void updateTeleodontologyStatus(session.id, "in_progress", {
        startedAt: new Date().toISOString(),
      });
      onSessionUpdated({ ...session, status: "in_progress" });
    }

    const timer = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [open, session]);

  // Inicializar stream de câmera local
  useEffect(() => {
    let active = true;

    async function initCamera() {
      if (!open) return;
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          if (active && localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            mediaStreamRef.current = stream;
          }
        }
      } catch (err) {
        console.warn("Câmera local não disponível no momento:", err);
      }
    }

    void initCamera();

    return () => {
      active = false;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    };
  }, [open]);

  // Alternar microfone
  function toggleMic() {
    setMicActive((prev) => {
      const next = !prev;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = next));
      }
      return next;
    });
  }

  // Alternar vídeo
  function toggleVideo() {
    setVideoActive((prev) => {
      const next = !prev;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = next));
      }
      return next;
    });
  }

  // Compartilhar tela (ex: raio-x, odontograma)
  async function toggleScreenShare() {
    if (isSharingScreen) {
      setIsSharingScreen(false);
      // Volta para a webcam
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          mediaStreamRef.current = stream;
        }
      } catch (err) {
        console.warn(err);
      }
    } else {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          setIsSharingScreen(true);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = screenStream;
          }
          const track = screenStream.getVideoTracks()[0];
          if (track) {
            track.onended = () => {
              setIsSharingScreen(false);
            };
          }
        } else {
          toast.info("Compartilhamento de tela não suportado neste navegador.");
        }
      } catch (err) {
        console.warn("Cancelou compartilhamento de tela", err);
      }
    }
  }

  function handleAddPrescription() {
    if (!newMedName.trim() || !newMedDosage.trim()) {
      toast.error("Informe o nome do medicamento e a posologia.");
      return;
    }

    const newItem: TeleodontologyPrescriptionItem = {
      id: `rx-${Date.now()}`,
      name: newMedName.trim(),
      dosage: newMedDosage.trim(),
      instructions: newMedInstructions.trim() || "Uso conforme orientação clínica verbal.",
    };

    setPrescriptions((prev) => [...prev, newItem]);
    setNewMedName("");
    setNewMedDosage("");
    setNewMedInstructions("");
    toast.success("Medicamento adicionado à prescrição.");
  }

  function handleRemovePrescription(id: string) {
    setPrescriptions((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleSaveClinicalNotes() {
    setSavingNotes(true);
    await saveTeleodontologyClinicalRecord(session.id, {
      clinicalNotes,
      prescriptions,
      interconsultaNotes: session.modality === "teleinterconsulta" ? interconsultaNotes : undefined,
    });
    setSavingNotes(false);
    toast.success("Evolução registrada no prontuário!");
    onSessionUpdated({
      ...session,
      clinicalNotes,
      prescriptions,
      interconsultaNotes,
    });
  }

  async function handleFinishSession() {
    const endedAt = new Date().toISOString();
    await saveTeleodontologyClinicalRecord(session.id, {
      clinicalNotes,
      prescriptions,
      interconsultaNotes: session.modality === "teleinterconsulta" ? interconsultaNotes : undefined,
    });
    await updateTeleodontologyStatus(session.id, "completed", {
      endedAt,
      durationSeconds: secondsElapsed,
    });

    const updated = {
      ...session,
      status: "completed" as const,
      endedAt,
      durationSeconds: secondsElapsed,
      clinicalNotes,
      prescriptions,
      interconsultaNotes,
    };

    onSessionUpdated(updated);
    toast.success("Teleatendimento finalizado e gravado no prontuário!");
    onClose();
  }

  function handlePrintSummary() {
    const html = buildTeleodontologyPrintableHtml({
      clinicName,
      dentistName: session.dentistName || "Cirurgião-Dentista",
      dentistCro: session.dentistCro,
      patientName: session.patientName || "Paciente",
      patientCpf: session.patientCpf,
      session: {
        ...session,
        durationSeconds: secondsElapsed,
        clinicalNotes,
        prescriptions,
        interconsultaNotes,
      },
    });

    const printWin = window.open("", "_blank");
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
    } else {
      toast.error("Permita pop-ups no navegador para emitir o relatório.");
    }
  }

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-background">
        <DialogHeader className="p-4 border-b bg-muted/40 flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base flex items-center gap-2">
                <span>{session.patientName || "Paciente"}</span>
                <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
                  {CFO_226_MODALITY_LABELS[session.modality]}
                </Badge>
              </DialogTitle>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <span>Dr(a). {session.dentistName || "Dentista"}</span>
                <span>•</span>
                <span className="flex items-center gap-1 font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                  <Clock className="w-3.5 h-3.5" /> {formatTimer(secondsElapsed)}
                </span>
                {session.tcleAccepted && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-emerald-600 text-xs">
                      <ShieldCheck className="w-3.5 h-3.5" /> TCLE CFO-226 Aceito
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrintSummary} className="text-xs">
              <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir Prontuário
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleFinishSession}
              className="text-xs font-semibold"
            >
              <PhoneOff className="w-3.5 h-3.5 mr-1" /> Finalizar Consulta
            </Button>
          </div>
        </DialogHeader>

        {/* Corpo principal: Vídeo à esquerda, Prontuário à direita */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Coluna do Vídeo */}
          <div className="flex-1 bg-slate-950 flex flex-col relative min-h-[320px]">
            {/* Área de vídeo remoto (Paciente) */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950">
              <div className="text-center p-6 text-slate-300">
                <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <span className="text-2xl font-bold text-slate-200">
                    {(session.patientName || "P").substring(0, 2).toUpperCase()}
                  </span>
                </div>
                <h4 className="text-lg font-semibold text-white">{session.patientName || "Paciente Conectado"}</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Transmissão ponto-a-ponto com criptografia WebRTC ativa. O paciente visualiza sua câmera e orientações na tela dele.
                </p>
                <div className="mt-3 inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Conexão Estável HD (60fps)
                </div>
              </div>

              {/* PiP da Webcam Local do Dentista */}
              <div className="absolute bottom-4 right-4 w-44 h-32 rounded-xl overflow-hidden border-2 border-slate-700 bg-slate-900 shadow-2xl z-10">
                {videoActive ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                    <VideoOff className="w-6 h-6 mb-1 text-slate-600" />
                    Câmera desativada
                  </div>
                )}
                <div className="absolute bottom-1 left-2 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded">
                  Você (Dentista)
                </div>
              </div>
            </div>

            {/* Barra de Controles de Chamada */}
            <div className="h-16 bg-slate-900 border-t border-slate-800 px-6 flex items-center justify-center gap-3 shrink-0">
              <Button
                variant={micActive ? "secondary" : "destructive"}
                size="icon"
                onClick={toggleMic}
                className="rounded-full w-11 h-11"
                title={micActive ? "Desativar microfone" : "Ativar microfone"}
              >
                {micActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </Button>
              <Button
                variant={videoActive ? "secondary" : "destructive"}
                size="icon"
                onClick={toggleVideo}
                className="rounded-full w-11 h-11"
                title={videoActive ? "Desativar câmera" : "Ativar câmera"}
              >
                {videoActive ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </Button>
              <Button
                variant={isSharingScreen ? "default" : "secondary"}
                size="icon"
                onClick={toggleScreenShare}
                className="rounded-full w-11 h-11"
                title="Compartilhar tela com o paciente (Raio-X / Odontograma)"
              >
                <ScreenShare className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Coluna do Prontuário Eletrônico ao Vivo */}
          <div className="w-full lg:w-[440px] border-l bg-card flex flex-col min-h-0 overflow-hidden">
            <Tabs defaultValue="evolution" className="flex-1 flex flex-col min-h-0">
              <div className="px-4 pt-3 border-b bg-muted/20 shrink-0">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="evolution" className="text-xs">
                    <FileText className="w-3.5 h-3.5 mr-1" /> Prontuário
                  </TabsTrigger>
                  <TabsTrigger value="prescriptions" className="text-xs">
                    <Stethoscope className="w-3.5 h-3.5 mr-1" /> Receituário
                  </TabsTrigger>
                  <TabsTrigger value="guidelines" className="text-xs">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" /> CFO 226/20
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Aba 1: Evolução Clínica */}
              <TabsContent value="evolution" className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto m-0">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Evolução & Conduta da Teleconsulta
                  </label>
                  <Textarea
                    value={clinicalNotes}
                    onChange={(e) => setClinicalNotes(e.target.value)}
                    placeholder="Descreva a queixa relatada pelo paciente, exame visual da mucosa/dentes por vídeo, nível de dor (EVA), conduta orientada e se há indicação de atendimento presencial imediato..."
                    rows={8}
                    className="text-sm resize-none"
                  />
                </div>

                {session.modality === "teleinterconsulta" && (
                  <div>
                    <label className="text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wider block mb-1">
                      Parecer Especializado (Interconsulta entre CDs)
                    </label>
                    <Textarea
                      value={interconsultaNotes}
                      onChange={(e) => setInterconsultaNotes(e.target.value)}
                      placeholder="Parecer do cirurgião-dentista especialista consultado (ex: diagnóstico diferencial de estomatologia, indicação de exodontia de siso incluso, conduta endodôntica)..."
                      rows={4}
                      className="text-sm resize-none bg-teal-50/50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800"
                    />
                  </div>
                )}

                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-2.5 rounded-md flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Atenção:</strong> Se o paciente apresentar dor aguda refratária, edema facial ou sangramento ativo, oriente o comparecimento presencial imediato à clínica.
                  </div>
                </div>

                <div className="mt-auto pt-2">
                  <Button
                    onClick={handleSaveClinicalNotes}
                    disabled={savingNotes}
                    className="w-full text-xs font-semibold"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                    {savingNotes ? "Salvando no Prontuário..." : "Salvar Notas no Prontuário"}
                  </Button>
                </div>
              </TabsContent>

              {/* Aba 2: Prescrições & Receituário */}
              <TabsContent value="prescriptions" className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto m-0">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Adicionar Medicamento / Colutório
                  </label>
                  <Input
                    placeholder="Ex: Amoxicilina 500mg, Dipirona 500mg, Periogard..."
                    value={newMedName}
                    onChange={(e) => setNewMedName(e.target.value)}
                    className="text-xs"
                  />
                  <Input
                    placeholder="Posologia (ex: Tomar 1 comp a cada 8h por 7 dias)"
                    value={newMedDosage}
                    onChange={(e) => setNewMedDosage(e.target.value)}
                    className="text-xs"
                  />
                  <Input
                    placeholder="Instruções adicionais (ex: Ingerir após as refeições)"
                    value={newMedInstructions}
                    onChange={(e) => setNewMedInstructions(e.target.value)}
                    className="text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddPrescription}
                    className="w-full text-xs"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Incluir na Receita
                  </Button>
                </div>

                <div className="border-t pt-3 space-y-2 flex-1 overflow-y-auto">
                  <span className="text-xs font-medium text-muted-foreground">Itens Prescritos:</span>
                  {prescriptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhum medicamento adicionado ainda.</p>
                  ) : (
                    prescriptions.map((p, idx) => (
                      <div
                        key={p.id}
                        className="p-2.5 rounded-lg border bg-muted/30 text-xs flex items-start justify-between gap-2"
                      >
                        <div>
                          <strong className="text-foreground">
                            {idx + 1}. {p.name}
                          </strong>
                          <p className="text-muted-foreground text-[11px] mt-0.5">{p.dosage}</p>
                          <p className="text-muted-foreground text-[10px] italic">{p.instructions}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemovePrescription(p.id)}
                          className="h-6 w-6 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                <Button
                  onClick={handleSaveClinicalNotes}
                  disabled={savingNotes}
                  className="w-full text-xs font-semibold mt-auto"
                >
                  Salvar Prescrições no Prontuário
                </Button>
              </TabsContent>

              {/* Aba 3: Diretrizes Legais CFO */}
              <TabsContent value="guidelines" className="flex-1 p-4 overflow-y-auto m-0 space-y-3 text-xs">
                <div className="p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300">
                  <h5 className="font-bold flex items-center gap-1 mb-1">
                    <ShieldCheck className="w-4 h-4 text-blue-600" /> Resolução CFO 226/2020
                  </h5>
                  <p className="text-[11px] leading-relaxed">
                    Regulamenta o exercício da Odontologia a distância mediado por TICs. O atendimento deve ser registrado com data, hora, tecnologia empregada e número de inscrição no CRO.
                  </p>
                </div>

                <div className="space-y-2">
                  <strong className="block text-foreground font-semibold">Vedações Expressas do CFO:</strong>
                  <ul className="list-disc pl-4 space-y-1 text-muted-foreground text-[11px]">
                    <li>É vedada a consulta para diagnóstico definitivo sem exame presencial prévio quando imperativo.</li>
                    <li>É proibida a comercialização abusiva ou captação de clientes mercantilista.</li>
                    <li>É obrigatório o registro do consentimento do paciente (TCLE) com validade jurídica.</li>
                  </ul>
                </div>

                <div className="p-2.5 rounded bg-muted text-[11px] font-mono text-muted-foreground break-all">
                  Token da Sala: {session.roomToken}<br />
                  Link: {session.roomUrl}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
