import { useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  Send,
  Sparkles,
  Calendar,
  DollarSign,
  AlertTriangle,
  BarChart3,
  CheckCheck,
  Smartphone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { processAssistantCommand } from "@/modules/whatsapp/connection";

interface Props {
  clinicId: string;
  clinicName: string;
}

interface ChatMessage {
  id: string;
  sender: "owner" | "assistant";
  text: string;
  time: string;
}

export function WhatsappOwnerAssistantPanel({ clinicId, clinicName }: Props) {
  const initialTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      sender: "assistant",
      text: `Olá, Dr(a)! Sou seu Assistente Odontológico no WhatsApp da clínica ${clinicName || "SondaPro"}. 🦷\n\nVocê pode me pedir a qualquer hora a agenda do dia, faturamento em tempo real, resumo de faltas ou resumo executivo.`,
      time: initialTime,
    },
  ]);
  const [inputCmd, setInputCmd] = useState("");
  const [thinking, setThinking] = useState(false);

  const quickCommands = [
    { label: "📋 Agenda de Hoje", cmd: "agenda de hoje" },
    { label: "💰 Faturamento Hoje", cmd: "faturamento hoje" },
    { label: "⚠️ Faltas da Semana", cmd: "faltas da semana" },
    { label: "📊 Resumo Executivo", cmd: "resumo executivo" },
  ];

  async function handleSend(cmdText: string) {
    const textToSend = cmdText.trim();
    if (!textToSend || thinking) return;

    const timeStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: "owner",
      text: textToSend,
      time: timeStr,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputCmd("");
    setThinking(true);

    try {
      const res = await processAssistantCommand(clinicId, textToSend);
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "assistant",
        text: res.response,
        time: res.timestamp,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao consultar o assistente.");
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-1.5">
                  Assistente do Dono
                  <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 text-[10px] gap-1">
                    <Sparkles className="h-3 w-3" /> IA & Gestão Ativa
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Interaja diretamente via WhatsApp com seu copiloto executivo para saber números, agenda e finanças sem abrir planilhas.
                </CardDescription>
              </div>
            </div>

            <Badge variant="outline" className="gap-1.5 text-xs text-muted-foreground">
              <Smartphone className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp Direto
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Sugestões de Comandos Rápidos */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Perguntas Rápidas:</span>
            {quickCommands.map((q) => (
              <Button
                key={q.cmd}
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs rounded-full border-muted-foreground/30 hover:border-primary hover:text-primary transition-colors"
                onClick={() => handleSend(q.cmd)}
                disabled={thinking}
              >
                {q.label}
              </Button>
            ))}
          </div>

          {/* Janela de Simulação do Chat WhatsApp */}
          <div className="rounded-2xl border bg-slate-100 dark:bg-slate-900/60 p-4 min-h-[350px] max-h-[500px] overflow-y-auto space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === "owner" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm ${
                    msg.sender === "owner"
                      ? "bg-emerald-600 text-white rounded-br-none"
                      : "bg-white dark:bg-slate-800 text-foreground border rounded-bl-none"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <div
                    className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                      msg.sender === "owner" ? "text-emerald-100" : "text-muted-foreground"
                    }`}
                  >
                    <span>{msg.time}</span>
                    <CheckCheck className={`h-3 w-3 ${msg.sender === "owner" ? "text-sky-300" : "text-sky-500"}`} />
                  </div>
                </div>
              </div>
            ))}

            {thinking && (
              <div className="flex items-start">
                <div className="bg-white dark:bg-slate-800 text-muted-foreground border rounded-2xl rounded-bl-none px-4 py-2 text-xs flex items-center gap-2 shadow-sm">
                  <Bot className="h-3.5 w-3.5 animate-spin text-purple-600" />
                  <span>Consultando dados da clínica...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input de Mensagem */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend(inputCmd);
            }}
            className="flex items-center gap-2"
          >
            <Input
              value={inputCmd}
              onChange={(e) => setInputCmd(e.target.value)}
              placeholder="Ex.: Quantos pacientes faltaram essa semana? / Qual o faturamento de hoje?"
              className="text-xs"
              disabled={thinking}
            />
            <Button
              type="submit"
              variant="hero"
              disabled={thinking || !inputCmd.trim()}
              className="gap-1.5 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Send className="h-4 w-4" />
              Enviar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

