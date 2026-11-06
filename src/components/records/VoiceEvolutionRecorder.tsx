import { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Sparkles,
  Square,
  Wand2,
  CheckCircle2,
  Volume2,
  RotateCcw,
  FileCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  formatClinicalEvolutionWithAI,
  VOICE_EVOLUTION_EXAMPLES,
  type FormattedEvolutionResult,
  type VoiceEvolutionTemplate,
} from "@/modules/records/voice-evolution";
import { toast } from "sonner";

interface VoiceEvolutionRecorderProps {
  patientName?: string | undefined;
  professionalName?: string | undefined;
  onApplyFormattedEvolution: (result: FormattedEvolutionResult) => void;
}

export function VoiceEvolutionRecorder({
  patientName,
  professionalName,
  onApplyFormattedEvolution,
}: VoiceEvolutionRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [spokenText, setSpokenText] = useState("");
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [parsedResult, setParsedResult] = useState<FormattedEvolutionResult | null>(null);
  const [showExamples, setShowExamples] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Timer de gravação
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // Inicializa a SpeechRecognition API do navegador se disponível
  const startRecording = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.info(
        "Seu navegador não suporta reconhecimento de fala nativo direto. Você pode digitar ou colar o áudio abaixo, ou clicar em um dos exemplos!",
        { duration: 5000 }
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.continuous = true;
      recognition.interimResults = true;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + " ";
        }
        setSpokenText(transcript.trim());
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
          toast.error("Permissão de microfone negada. Autorize o microfone no navegador.");
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
      toast.info("Microfone ativado! Fale naturalmente o atendimento clínico...");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível iniciar a gravação de áudio.");
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsRecording(false);
  };

  // Processa o texto com IA Odontológica
  const processWithAI = (textToProcess?: string) => {
    const text = (textToProcess || spokenText).trim();
    if (!text) {
      toast.warning("Fale ou digite o relato clínico antes de formatar com a IA.");
      return;
    }

    setIsProcessingAI(true);
    setTimeout(() => {
      const result = formatClinicalEvolutionWithAI(text, {
        patientName,
        professionalName,
      });
      setParsedResult(result);
      setIsProcessingAI(false);
      toast.success("Evolução estruturada com sucesso no padrão TUSS e CFO!");
    }, 600);
  };

  // Carrega exemplo pronto de demonstração
  const loadExample = (ex: VoiceEvolutionTemplate) => {
    setSpokenText(ex.rawDictation);
    processWithAI(ex.rawDictation);
    toast.success(`Exemplo carregado: ${ex.label}`);
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainingSecs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/5 via-primary/5 to-transparent p-5 shadow-sm space-y-4">
      {/* Cabeçalho do Gravador */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-500 text-white shadow-md shadow-sky-500/20">
            <Mic className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-extrabold text-navy text-sm">
                Evolução Clínica por Áudio / Voz (Whisper + IA Odontológica)
              </h4>
              <Badge className="bg-sky-600 text-white text-[10px] px-1.5 py-0 font-bold uppercase tracking-wider">
                TUSS · CFO
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Aperte o microfone, relate o procedimento e a IA formata a evolução técnica em segundos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-sky-700 hover:text-sky-800 hover:bg-sky-100/60 dark:text-sky-300 gap-1 font-semibold"
            onClick={() => setShowExamples(!showExamples)}
          >
            {showExamples ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Exemplos de Ditado Odontológico
          </Button>
        </div>
      </div>

      {/* Drawer de Exemplos de Demonstração / Teste Imediato */}
      {showExamples && (
        <div className="p-3.5 rounded-xl border border-sky-200 dark:border-sky-900 bg-card space-y-2 animate-in fade-in">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Clique em um exemplo para testar a transcrição e formatação automática:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {VOICE_EVOLUTION_EXAMPLES.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => loadExample(ex)}
                className="p-2.5 rounded-lg border text-left bg-muted/20 hover:bg-sky-50 dark:hover:bg-sky-950/40 hover:border-sky-400 transition text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-navy truncate">{ex.label}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-slate-300">
                    {ex.specialty}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2 italic">
                  "{ex.rawDictation}"
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Área Central: Botão de Gravação + Ondas + Campo de Transcrição */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Botão de Gravação de Voz Principal */}
          {isRecording ? (
            <Button
              type="button"
              variant="destructive"
              onClick={stopRecording}
              className="h-12 px-5 font-bold gap-2 animate-pulse shadow-md"
            >
              <Square className="h-4 w-4 fill-current" />
              <span>Parar Gravação ({formatTimer(recordingSeconds)})</span>
            </Button>
          ) : (
            <Button
              type="button"
              onClick={startRecording}
              className="h-12 px-6 font-black bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 text-white shadow-md shadow-sky-600/20 gap-2.5"
            >
              <Mic className="h-5 w-5" />
              <span>Gravar Atendimento por Voz</span>
            </Button>
          )}

          {/* Botão Formatar com IA */}
          <Button
            type="button"
            variant="outline"
            disabled={!spokenText || isRecording || isProcessingAI}
            onClick={() => processWithAI()}
            className="h-12 border-sky-500/40 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 font-bold gap-2"
          >
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span>{isProcessingAI ? "Formatando com IA..." : "Formatar com IA Odontológica"}</span>
          </Button>

          {spokenText && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-12 w-12 text-slate-400 hover:text-destructive shrink-0"
              onClick={() => {
                setSpokenText("");
                setParsedResult(null);
              }}
              title="Limpar relato"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Campo do Áudio Transcrito */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-500 flex items-center justify-between">
            <span>Relato Falado pelo Cirurgião-Dentista (Transcrição em Tempo Real):</span>
            {spokenText && (
              <span className="text-emerald-600 font-bold text-[10px] flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Transcrito
              </span>
            )}
          </label>
          <Textarea
            value={spokenText}
            onChange={(e) => setSpokenText(e.target.value)}
            placeholder="Exemplo: Paciente compareceu para manutenção ortodôntica. Trocado arco superior para 0.16 termoativado, instalada mecânica de elásticos intermaxilares classe II lado direito. Boa higiene bucal, retorno em 30 dias."
            rows={2}
            className="text-xs bg-card/80 border-slate-300 dark:border-slate-800"
          />
        </div>
      </div>

      {/* Card da Evolução Estruturada pela IA (Padrão TUSS & CFO) */}
      {parsedResult && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3 animate-in fade-in">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/20 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
                ✓
              </span>
              <div>
                <h5 className="text-xs font-black text-navy">{parsedResult.title}</h5>
                <span className="text-[10px] text-muted-foreground">
                  Categoria: {parsedResult.procedureCategory} {parsedResult.tussCode && `· TUSS ${parsedResult.tussCode}`}
                </span>
              </div>
            </div>

            {parsedResult.toothNumber && (
              <Badge className="bg-primary text-white text-xs font-bold">
                Dente FDI #{parsedResult.toothNumber}
              </Badge>
            )}
          </div>

          {/* Visualização da Evolução Formatada */}
          <div className="bg-card rounded-lg p-3 border text-xs whitespace-pre-wrap font-sans text-slate-800 dark:text-slate-200 space-y-1 leading-relaxed">
            {parsedResult.formattedContent}
          </div>

          {/* Botão de Ação: 1 Clique para Salvar / Aplicar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
              Pronto para registro oficial no prontuário do paciente
            </span>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 text-xs h-9 shadow-sm"
              onClick={() => onApplyFormattedEvolution(parsedResult)}
            >
              <FileCheck className="w-4 h-4" />
              Transferir para o Prontuário com 1 Clique
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
