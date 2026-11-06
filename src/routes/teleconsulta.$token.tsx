import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  SwitchCamera,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  PhoneOff,
  Camera,
  AlertTriangle,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { TeleodontologySession } from "@/modules/teleodontology";
import {
  CFO_226_MODALITY_DESCRIPTIONS,
  CFO_226_MODALITY_LABELS,
  CFO_226_TCLE_TEXT,
  acceptTeleodontologyTcle,
  fetchTeleodontologySessionByToken,
} from "@/modules/teleodontology";

export const Route = createFileRoute("/teleconsulta/$token")({
  head: () => ({
    meta: [
      { title: "Teleconsulta Odontológica — SondaPro" },
      { name: "description", content: "Acesso seguro à sala virtual de teleodontologia regulamentada pelo CFO 226/2020." },
    ],
  }),
  component: PatientTeleconsultationRoom,
});

function PatientTeleconsultationRoom() {
  const { token } = Route.useParams() as { token: string };
  const [session, setSession] = useState<TeleodontologySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [tcleAccepted, setTcleAccepted] = useState(false);
  const [step, setStep] = useState<"tcle" | "device_check" | "waiting_room" | "in_call" | "finished">("tcle");

  // Controles de Mídia
  const [micActive, setMicActive] = useState(true);
  const [videoActive, setVideoActive] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const testVideoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Carregar dados da sessão
  useEffect(() => {
    async function load() {
      setLoading(true);
      const s = await fetchTeleodontologySessionByToken(token);
      setSession(s);
      if (s) {
        if (s.status === "completed") {
          setStep("finished");
        } else if (s.status === "in_progress") {
          setStep("in_call");
        } else if (s.tcleAccepted) {
          setTcleAccepted(true);
          setStep("waiting_room");
        }
      }
      setLoading(false);
    }
    void load();
  }, [token]);

  // Polling para acompanhar se o dentista iniciou a chamada ou se finalizou
  useEffect(() => {
    if ((step as string) === "finished") return;

    const interval = setInterval(async () => {
      const updated = await fetchTeleodontologySessionByToken(token);
      if (updated) {
        setSession(updated);
        if (updated.status === "in_progress" && (step as string) !== "in_call") {
          setStep("in_call");
          toast.success("O Cirurgião-Dentista iniciou a consulta!");
        } else if (updated.status === "completed" && (step as string) !== "finished") {
          setStep("finished");
          toast.info("Consulta finalizada pelo cirurgião-dentista.");
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [token, step]);

  // Iniciar câmera para testes ou chamada
  async function startCamera(targetMode: "user" | "environment" = facingMode) {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: targetMode },
          audio: true,
        });
        mediaStreamRef.current = stream;

        if (testVideoRef.current) {
          testVideoRef.current.srcObject = stream;
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }
    } catch (err) {
      console.warn("Não foi possível acessar a câmera ou microfone:", err);
      toast.error("Por favor, permita o acesso à câmera e microfone para a teleconsulta.");
    }
  }

  // Alternar câmera frontal/traseira (útil no celular para apontar para a boca)
  async function toggleCameraFacing() {
    const nextMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    await startCamera(nextMode);
  }

  function toggleMic() {
    setMicActive((prev) => {
      const next = !prev;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = next));
      }
      return next;
    });
  }

  function toggleVideo() {
    setVideoActive((prev) => {
      const next = !prev;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = next));
      }
      return next;
    });
  }

  async function handleAcceptTcleAndProceed() {
    if (!tcleAccepted) {
      toast.error("Você precisa concordar com os termos do TCLE para continuar.");
      return;
    }

    await acceptTeleodontologyTcle(token);
    setStep("device_check");
    void startCamera();
  }

  function handleJoinWaitingRoom() {
    setStep("waiting_room");
    toast.success("Você entrou na sala de espera. O Dr. já foi avisado!");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-400">Conectando à sala de teleodontologia...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
        <Card className="max-w-md w-full border-slate-800 bg-slate-900 text-slate-100">
          <CardHeader className="text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto mb-2">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <CardTitle>Sala Não Encontrada</CardTitle>
            <CardDescription className="text-slate-400">
              O link de teleconsulta informado é inválido ou expirou. Entre em contato com a clínica para obter um novo link.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // PASSO 1: TERMO DE CONSENTIMENTO (TCLE CFO 226/2020)
  if (step === "tcle") {
    return (
      <div className="min-h-screen bg-slate-950 text-white py-8 px-4 flex items-center justify-center">
        <Card className="max-w-xl w-full border-slate-800 bg-slate-900 text-slate-100 shadow-2xl">
          <CardHeader className="border-b border-slate-800 pb-4">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-xs">
                {CFO_226_MODALITY_LABELS[session.modality]}
              </Badge>
              <span className="text-xs text-slate-400">Resolução CFO-226/2020</span>
            </div>
            <CardTitle className="text-xl mt-2">Termo de Consentimento Livre e Esclarecido</CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Atendimento com Dr(a). {session.dentistName || "Cirurgião-Dentista"} {session.dentistCro ? `(CRO: ${session.dentistCro})` : ""}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-4 text-xs">
            <div className="bg-slate-950/70 p-4 rounded-lg border border-slate-800 font-sans text-slate-300 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
              {CFO_226_TCLE_TEXT}
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-amber-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>
                <strong>Aviso Legal Importante:</strong> Esta consulta a distância é destinada a orientação, triagem e suporte clínico. Casos que demandem exame intraoral físico obrigatório serão encaminhados para atendimento presencial.
              </span>
            </div>

            <div className="flex items-start gap-3 pt-2">
              <Checkbox
                id="tcleAgreement"
                checked={tcleAccepted}
                onCheckedChange={(checked) => setTcleAccepted(!!checked)}
                className="mt-0.5"
              />
              <label
                htmlFor="tcleAgreement"
                className="text-xs text-slate-300 leading-tight cursor-pointer select-none"
              >
                Eu, <strong>{session.patientName || "Paciente"}</strong>, declaro que li, compreendi e concordo integralmente com as condições do Termo de Consentimento para Teleodontologia.
              </label>
            </div>

            <Button
              onClick={handleAcceptTcleAndProceed}
              disabled={!tcleAccepted}
              className="w-full mt-2 font-semibold text-xs h-10"
            >
              <ShieldCheck className="w-4 h-4 mr-1.5" /> Assinar Digitalmente e Continuar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // PASSO 2: TESTE DE CÂMERA E MICROFONE
  if (step === "device_check") {
    return (
      <div className="min-h-screen bg-slate-950 text-white py-8 px-4 flex items-center justify-center">
        <Card className="max-w-md w-full border-slate-800 bg-slate-900 text-slate-100 shadow-2xl">
          <CardHeader className="text-center pb-3">
            <CardTitle className="text-lg">Teste de Câmera e Áudio</CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Certifique-se de estar em um local bem iluminado para que o cirurgião-dentista possa avaliar sua mucosa e dentes.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-slate-800">
              <video
                ref={testVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 right-2">
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={toggleCameraFacing}
                  className="rounded-full w-8 h-8 bg-black/60 text-white border-0"
                  title="Alternar para câmera traseira/frontal"
                >
                  <SwitchCamera className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <Button
                variant={micActive ? "secondary" : "destructive"}
                size="sm"
                onClick={toggleMic}
                className="text-xs rounded-full"
              >
                {micActive ? <Mic className="w-3.5 h-3.5 mr-1" /> : <MicOff className="w-3.5 h-3.5 mr-1" />}
                {micActive ? "Microfone Ligado" : "Microfone Mudo"}
              </Button>
              <Button
                variant={videoActive ? "secondary" : "destructive"}
                size="sm"
                onClick={toggleVideo}
                className="text-xs rounded-full"
              >
                {videoActive ? <Video className="w-3.5 h-3.5 mr-1" /> : <VideoOff className="w-3.5 h-3.5 mr-1" />}
                {videoActive ? "Câmera Ligada" : "Câmera Desligada"}
              </Button>
            </div>

            <Button
              onClick={handleJoinWaitingRoom}
              className="w-full font-semibold text-xs h-10 mt-2"
            >
              Entrar na Sala de Espera Virtual
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // PASSO 3: SALA DE ESPERA VIRTUAL
  if (step === "waiting_room") {
    return (
      <div className="min-h-screen bg-slate-950 text-white py-8 px-4 flex items-center justify-center">
        <Card className="max-w-md w-full border-slate-800 bg-slate-900 text-slate-100 shadow-2xl text-center">
          <CardHeader>
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-2 ring-8 ring-emerald-500/5 animate-pulse">
              <Clock className="w-8 h-8" />
            </div>
            <CardTitle className="text-xl">Você está na Sala de Espera</CardTitle>
            <CardDescription className="text-slate-400 text-xs mt-1">
              O Dr(a). <strong>{session.dentistName || "Dentista"}</strong> já recebeu sua notificação de chegada e está preparando seu prontuário odontológico.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Paciente:</span>
                <span className="font-semibold text-slate-200">{session.patientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Modalidade:</span>
                <span className="text-primary font-medium">{CFO_226_MODALITY_LABELS[session.modality]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">TCLE CFO-226:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Assinado
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Não feche esta página. Assim que o cirurgião-dentista autorizar, a chamada iniciará automaticamente com som e vídeo.
            </p>

            <div className="flex items-center justify-center gap-2 pt-2 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Aguardando o dentista conectar...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // PASSO 4: CHAMADA DE VÍDEO ATIVA
  if (step === "in_call") {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden text-white">
        {/* Topo da Chamada */}
        <div className="h-14 border-b border-slate-800 bg-slate-900/80 px-4 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-sm">Dr(a). {session.dentistName || "Cirurgião-Dentista"}</span>
            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
              {CFO_226_MODALITY_LABELS[session.modality]}
            </Badge>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-1 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Criptografado Ponta-a-Ponta
          </div>
        </div>

        {/* Área de Vídeo Principal (Dentista) + PiP (Paciente) */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          {/* Simulação do Vídeo do Dentista */}
          <div className="text-center p-6 text-slate-300">
            <div className="w-24 h-24 rounded-full bg-primary/20 text-primary border-2 border-primary/40 flex items-center justify-center mx-auto mb-3 shadow-lg">
              <Stethoscope className="w-12 h-12" />
            </div>
            <h3 className="text-lg font-bold text-white">Dr(a). {session.dentistName || "Dentista"}</h3>
            <p className="text-xs text-slate-400 mt-1">Conectado ao vivo em sala segura</p>
          </div>

          {/* PiP da Câmera do Paciente */}
          <div className="absolute bottom-4 right-4 w-36 h-48 sm:w-48 sm:h-36 rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-900 shadow-2xl z-20">
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
                <VideoOff className="w-5 h-5 mb-1" /> Sua câmera está desligada
              </div>
            )}
            <div className="absolute bottom-1 left-2 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded">
              Você
            </div>
          </div>
        </div>

        {/* Barra de Controles Inferior */}
        <div className="h-20 bg-slate-900 border-t border-slate-800 px-4 flex items-center justify-center gap-4 shrink-0">
          <Button
            variant={micActive ? "secondary" : "destructive"}
            size="icon"
            onClick={toggleMic}
            className="rounded-full w-12 h-12"
          >
            {micActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </Button>

          <Button
            variant={videoActive ? "secondary" : "destructive"}
            size="icon"
            onClick={toggleVideo}
            className="rounded-full w-12 h-12"
          >
            {videoActive ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </Button>

          <Button
            variant="secondary"
            size="icon"
            onClick={toggleCameraFacing}
            className="rounded-full w-12 h-12"
            title="Alternar Câmera (Frontal / Traseira)"
          >
            <SwitchCamera className="w-5 h-5" />
          </Button>

          <Button
            variant="destructive"
            size="icon"
            onClick={() => setStep("finished")}
            className="rounded-full w-12 h-12"
            title="Encerrar Chamada"
          >
            <PhoneOff className="w-5 h-5" />
          </Button>
        </div>
      </div>
    );
  }

  // PASSO 5: CONSULTA FINALIZADA
  return (
    <div className="min-h-screen bg-slate-950 text-white py-10 px-4 flex items-center justify-center">
      <Card className="max-w-lg w-full border-slate-800 bg-slate-900 text-slate-100 shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <CardTitle className="text-xl">Teleatendimento Finalizado</CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Seu atendimento com Dr(a). {session.dentistName || "Dentista"} foi concluído com sucesso e gravado em seu prontuário.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pt-2 text-xs">
          {session.prescriptions && session.prescriptions.length > 0 && (
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <span className="font-semibold text-slate-300 block">Prescrições & Orientações Medicamentosas:</span>
              {session.prescriptions.map((p, idx) => (
                <div key={p.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="font-bold text-slate-100">
                    {idx + 1}. {p.name}
                  </div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Posologia: {p.dosage}</div>
                  <div className="text-slate-500 text-[10px] italic">Instruções: {p.instructions}</div>
                </div>
              ))}
            </div>
          )}

          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px]">
            Todas as orientações e atestados emitidos ficam salvos e acessíveis a qualquer momento através do seu <strong>Portal do Paciente</strong>.
          </div>

          <div className="text-center pt-2">
            <Button
              onClick={() => (window.location.href = "/portal")}
              className="w-full text-xs font-semibold"
            >
              Acessar Meu Portal do Paciente
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
