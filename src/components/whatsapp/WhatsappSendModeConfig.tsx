import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Sliders,
  Send,
  Zap,
  ExternalLink,
  CheckCircle2,
  CalendarCheck,
  CalendarX,
  ShieldCheck,
  Save,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  fetchWhatsappSettings,
  saveWhatsappSettings,
  fetchWhatsappInstance,
} from "@/modules/whatsapp/connection";
import type { WhatsappSettings, WhatsappSendMode } from "@/types";

interface Props {
  clinicId: string;
}

export function WhatsappSendModeConfig({ clinicId }: Props) {
  const [settings, setSettings] = useState<WhatsappSettings | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [sData, instData] = await Promise.all([
          fetchWhatsappSettings(clinicId),
          fetchWhatsappInstance(clinicId),
        ]);
        setSettings(sData);
        setIsConnected(instData.status === "connected");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao carregar configurações de envio.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [clinicId]);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      await saveWhatsappSettings(clinicId, settings);
      toast.success("Modo de envio atualizado com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar modo de envio.");
    } finally {
      setSaving(false);
    }
  }

  function setSendMode(mode: WhatsappSendMode) {
    if (!settings) return;
    setSettings({ ...settings, send_mode: mode });
  }

  if (loading || !settings) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Carregando configurações de envio...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">
                Modo de Envio na Agenda (Confirmação e Cancelamento)
              </CardTitle>
              <CardDescription className="text-xs">
                Defina como as notificações de consultas agendadas e canceladas devem ser despachadas aos pacientes.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Seletor de Modo: Automático vs Manual */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Opção 1: Automático */}
            <div
              onClick={() => setSendMode("automatic")}
              className={`cursor-pointer rounded-2xl border-2 p-4 transition-all relative ${
                settings.send_mode === "automatic"
                  ? "border-emerald-500 bg-emerald-50/40 shadow-sm"
                  : "border-border hover:border-muted-foreground/30 bg-card"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      settings.send_mode === "automatic"
                        ? "bg-emerald-600 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      Envio Automático
                    </h4>
                    <span className="text-[11px] font-semibold text-emerald-700">
                      Recomendado (Conexão Direta)
                    </span>
                  </div>
                </div>

                {settings.send_mode === "automatic" && (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-[10px]">
                    Selecionado
                  </Badge>
                )}
              </div>

              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                As mensagens são disparadas silenciosamente pelo servidor do WhatsApp conectado, sem precisar abrir abas ou clicar em botões extras na recepção.
              </p>

              {!isConnected && settings.send_mode === "automatic" && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                  ⚠️ <strong>Atenção:</strong> Seu WhatsApp ainda não está conectado via QR Code. Enquanto desconectado, o sistema usará o link do WhatsApp Web como contingência.
                </div>
              )}
            </div>

            {/* Opção 2: Manual Web */}
            <div
              onClick={() => setSendMode("manual_web")}
              className={`cursor-pointer rounded-2xl border-2 p-4 transition-all relative ${
                settings.send_mode === "manual_web"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-muted-foreground/30 bg-card"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      settings.send_mode === "manual_web"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <ExternalLink className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      Envio Manual
                    </h4>
                    <span className="text-[11px] text-muted-foreground">
                      Abre WhatsApp Web
                    </span>
                  </div>
                </div>

                {settings.send_mode === "manual_web" && (
                  <Badge variant="default" className="text-[10px]">
                    Selecionado
                  </Badge>
                )}
              </div>

              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                Ao criar ou alterar uma consulta, o sistema abre uma nova aba no WhatsApp Web com o texto pré-preenchido para que a recepcionista confira e aperte Enviar.
              </p>
            </div>
          </div>

          {/* Gatilhos Automáticos da Agenda */}
          <div className="space-y-4 rounded-2xl border bg-muted/20 p-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Gatilhos de Notificação para o Paciente
            </h4>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border bg-card p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700">
                    <CalendarCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold cursor-pointer">
                      Enviar confirmação imediata ao agendar nova consulta
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      O paciente recebe o link seguro de confirmação e dados da consulta assim que a vaga é salva na agenda.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.auto_send_on_booking}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, auto_send_on_booking: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border bg-card p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-700">
                    <CalendarX className="h-4 w-4" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold cursor-pointer">
                      Enviar aviso de cancelamento ao desmarcar consulta
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Avisa educadamente o paciente que o horário foi desmarcado e disponibiliza o contato da clínica para remarcação.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.auto_send_on_cancel}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, auto_send_on_cancel: checked })
                  }
                />
              </div>
            </div>
          </div>

          {/* Botão Salvar */}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="hero"
              disabled={saving}
              className="gap-2"
              onClick={handleSave}
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar Configurações de Envio"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

