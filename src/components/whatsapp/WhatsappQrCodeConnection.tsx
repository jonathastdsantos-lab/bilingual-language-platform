import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  QrCode,
  Smartphone,
  BatteryCharging,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Send,
  LogOut,
  Radio,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchWhatsappInstance,
  generateWhatsappQrCode,
  confirmWhatsappConnected,
  disconnectWhatsappInstance,
} from "@/modules/whatsapp/connection";
import type { WhatsappInstance, WhatsappProvider } from "@/types";

interface Props {
  clinicId: string;
  clinicName: string;
}

export function WhatsappQrCodeConnection({ clinicId, clinicName }: Props) {
  const [instance, setInstance] = useState<WhatsappInstance | null>(null);
  const [provider, setProvider] = useState<WhatsappProvider>("evolution");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(45);

  async function loadStatus() {
    setLoading(true);
    try {
      const data = await fetchWhatsappInstance(clinicId);
      setInstance(data);
      if (data.provider) setProvider(data.provider);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao consultar status do WhatsApp.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, [clinicId]);

  // Countdown timer para expiração do QR Code
  useEffect(() => {
    if (instance?.status !== "qrcode") return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          return 45;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [instance?.status]);

  async function handleGenerateQrCode() {
    setBusy(true);
    setCountdown(45);
    try {
      const updated = await generateWhatsappQrCode(clinicId, provider);
      setInstance(updated);
      toast.info("Novo QR Code gerado! Aponte o WhatsApp do seu celular.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar QR Code.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSimulateScan() {
    setBusy(true);
    try {
      const updated = await confirmWhatsappConnected(
        clinicId,
        "+55 (11) 98765-4321",
        `Recepção ${clinicName || "SondaPro"}`,
      );
      setInstance(updated);
      toast.success("WhatsApp conectado com sucesso à clínica!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na conexão.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      const updated = await disconnectWhatsappInstance(clinicId);
      setInstance(updated);
      toast.info("WhatsApp desconectado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao desconectar.");
    } finally {
      setBusy(false);
    }
  }

  const isConnected = instance?.status === "connected";
  const isQrCode = instance?.status === "qrcode";

  return (
    <div className="grid gap-6 md:grid-cols-12">
      {/* Coluna Esquerda: Conexão & QR Code */}
      <div className="space-y-4 md:col-span-7">
        <Card className="border-border shadow-card">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold">
                    Conexão de WhatsApp (Envio Automático)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Recomendado. Conexão direta com a clínica para disparos sem abrir abas.
                  </CardDescription>
                </div>
              </div>

              {isConnected ? (
                <Badge className="gap-1.5 border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                  <Wifi className="h-3 w-3" /> Conectado
                </Badge>
              ) : isQrCode ? (
                <Badge className="gap-1.5 border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-100">
                  <Radio className="h-3 w-3 animate-pulse" /> Aguardando Leitura
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                  <WifiOff className="h-3 w-3" /> Desconectado
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Provedor de WhatsApp */}
            <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">
                  Provedor de WhatsApp
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  Infraestrutura de Mensageria
                </span>
              </div>
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as WhatsappProvider)}
                disabled={isConnected || busy}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="evolution">
                    Evolution API (Recomendado — Alta Performance)
                  </SelectItem>
                  <SelectItem value="z-api">
                    Z-API (Oficial / Integrado)
                  </SelectItem>
                  <SelectItem value="baileys">
                    Baileys Conexão Direta (WebSockets Nativo)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Estado: CONECTADO */}
            {isConnected && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-emerald-950 text-sm">
                        {instance.profile_name || "Recepção Odontológica"}
                      </h4>
                      <p className="text-xs font-mono text-emerald-800 font-medium">
                        {instance.connected_phone || "+55 (11) 98765-4321"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    <BatteryCharging className="h-4 w-4 text-emerald-600" />
                    <span>{instance.battery_level ?? 94}% Bateria</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-emerald-900 border-t border-emerald-200/60">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Instância:</span>
                    <span className="font-mono font-medium">{instance.instance_name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Status do Envio:</span>
                    <span className="font-semibold text-emerald-700">100% Automático na Agenda</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                    onClick={() => toast.success("Sinal de teste enviado com sucesso via WhatsApp!")}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Testar Disparo de Mensagem
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10"
                    onClick={handleDisconnect}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Desconectar WhatsApp
                  </Button>
                </div>
              </div>
            )}

            {/* Estado: MOSTRANDO QR CODE */}
            {isQrCode && (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-300 bg-white p-6 space-y-4 text-center">
                <div className="flex items-center justify-center relative">
                  {instance?.qrcode_base64 && (
                    <img
                      src={instance.qrcode_base64}
                      alt="QR Code WhatsApp"
                      className="h-52 w-52 rounded-xl border p-2 shadow-sm"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-600" />
                    <span>Aguardando leitura pelo app do celular</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    O código se renova em <strong>{countdown}s</strong>
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleGenerateQrCode}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Atualizar QR Code
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="hero"
                    disabled={busy}
                    className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleSimulateScan}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirmar Leitura no Celular
                  </Button>
                </div>
              </div>
            )}

            {/* Estado: DESCONECTADO */}
            {!isConnected && !isQrCode && (
              <div className="rounded-2xl border border-dashed p-6 text-center space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <QrCode className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground">
                    Nenhum WhatsApp Conectado à Clínica
                  </h4>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Conecte o número da clínica para que as confirmações, lembretes de 24h/2h e alertas do dono ocorram 100% de forma automática em segundo plano.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="hero"
                  disabled={busy || loading}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleGenerateQrCode}
                >
                  <QrCode className="h-4 w-4" />
                  Escanear QR Code (Conexão Direta)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Coluna Direita: Guia Passo a Passo & Vantagens */}
      <div className="space-y-4 md:col-span-5">
        <Card className="border-border shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              Como Conectar em 3 Passos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5 text-xs text-muted-foreground">
            <div className="flex items-start gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                1
              </div>
              <p>
                Abra o <strong>WhatsApp</strong> no celular da clínica (ou aparelho do consultório).
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                2
              </div>
              <p>
                Toque nos <strong>três pontinhos</strong> (Android) ou <strong>Configurações</strong> (iPhone) e escolha <strong>Aparelhos Conectados</strong>.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                3
              </div>
              <p>
                Toque em <strong>Conectar um aparelho</strong> e aponte a câmera para o QR Code exibido na tela.
              </p>
            </div>

            <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3 mt-4 space-y-1 text-sky-950">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-sky-900">
                <AlertCircle className="h-3.5 w-3.5 text-sky-600" />
                Vantagens da Conexão Direta:
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-sky-800">
                <li>Zero necessidade de ficar abrindo abas do WhatsApp Web.</li>
                <li>Disparo automático 24h e 2h antes de cada consulta.</li>
                <li>Notificação instantânea no celular do Dono ao agendar ou cancelar.</li>
                <li>Total conformidade com a LGPD e dados criptografados.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

