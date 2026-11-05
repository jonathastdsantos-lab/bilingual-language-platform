import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Bell,
  Smartphone,
  CheckCircle2,
  CalendarPlus,
  UserCheck,
  CalendarX,
  Moon,
  Send,
  Save,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchWhatsappSettings,
  saveWhatsappSettings,
  fetchWhatsappOwnerAlerts,
  triggerOwnerAlert,
} from "@/modules/whatsapp/connection";
import type { WhatsappSettings, WhatsappOwnerAlert } from "@/types";

interface Props {
  clinicId: string;
}

export function WhatsappOwnerAlertsPanel({ clinicId }: Props) {
  const [settings, setSettings] = useState<WhatsappSettings | null>(null);
  const [alerts, setAlerts] = useState<WhatsappOwnerAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingAlert, setTestingAlert] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [sData, aData] = await Promise.all([
          fetchWhatsappSettings(clinicId),
          fetchWhatsappOwnerAlerts(clinicId),
        ]);
        setSettings(sData);
        setAlerts(aData);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao carregar alertas do dono.");
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
      toast.success("Configurações de alerta salvas com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar alertas.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestAlert() {
    if (!settings?.owner_phone) {
      toast.error("Por favor, preencha o número de WhatsApp do Dono antes de testar.");
      return;
    }
    setTestingAlert(true);
    try {
      const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const testMsg = `🧪 *Teste de Alerta SondaPro (${now})*\nSeu WhatsApp está pronto para receber notificações em tempo real da clínica!`;
      await triggerOwnerAlert(clinicId, "daily_summary", testMsg);
      toast.success("Alerta de teste enviado com sucesso para seu WhatsApp!");
      const updatedAlerts = await fetchWhatsappOwnerAlerts(clinicId);
      setAlerts(updatedAlerts);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar teste.");
    } finally {
      setTestingAlert(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Carregando painel de alertas do dono...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">
                  Alertas para o Dono — Receba no seu WhatsApp
                </CardTitle>
                <CardDescription className="text-xs">
                  Receba no seu próprio celular notificações instantâneas sobre a rotina clínica e financeira.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold">Ativar Alertas no Celular do Dono</Label>
              <Switch
                checked={settings.owner_alerts_enabled}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, owner_alerts_enabled: checked })
                }
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Telefone do Proprietário */}
          <div className="rounded-2xl border bg-muted/20 p-4 space-y-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-primary" />
                  Número do WhatsApp do Dono / Gestor:
                </Label>
                <Input
                  value={settings.owner_phone || ""}
                  onChange={(e) => setSettings({ ...settings, owner_phone: e.target.value })}
                  placeholder="Ex.: +55 (11) 99887-7665"
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Número que receberá as mensagens em tempo real da clínica.
                </p>
              </div>

              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={testingAlert || !settings.owner_phone}
                  className="h-10 gap-1.5 text-xs w-full sm:w-auto"
                  onClick={handleTestAlert}
                >
                  <Send className="h-3.5 w-3.5 text-emerald-600" />
                  {testingAlert ? "Enviando..." : "Enviar Alerta de Teste para meu WhatsApp"}
                </Button>
              </div>
            </div>
          </div>

          {/* Opções de Alertas Individuais */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tipos de Alerta Habilitados
            </h4>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* 1. Novo Agendamento */}
              <div className="flex items-center justify-between rounded-xl border bg-card p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-700">
                    <CalendarPlus className="h-4 w-4" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold cursor-pointer">
                      Novo Agendamento Criado
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Avisa quando uma nova consulta for marcada pela recepção.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.alert_on_new_booking}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, alert_on_new_booking: checked })
                  }
                />
              </div>

              {/* 2. Confirmação de Paciente */}
              <div className="flex items-center justify-between rounded-xl border bg-card p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold cursor-pointer">
                      Confirmação de Presença
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Notifica quando o paciente confirmar pelo WhatsApp.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.alert_on_patient_confirm}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, alert_on_patient_confirm: checked })
                  }
                />
              </div>

              {/* 3. Cancelamento */}
              <div className="flex items-center justify-between rounded-xl border bg-card p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-700">
                    <CalendarX className="h-4 w-4" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold cursor-pointer">
                      Cancelamento de Consulta
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Aviso imediato para que a equipe possa liberar ou encaixar.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.alert_on_cancellation}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, alert_on_cancellation: checked })
                  }
                />
              </div>

              {/* 4. Resumo Noturno */}
              <div className="flex items-center justify-between rounded-xl border bg-card p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-700">
                    <Moon className="h-4 w-4" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold cursor-pointer">
                      Resumo Noturno (DRE & Fechamento)
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Receba às {settings.daily_summary_time || "19:00"} o faturamento do dia e agenda de amanhã.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.alert_daily_summary}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, alert_daily_summary: checked })
                  }
                />
              </div>
            </div>
          </div>

          {/* Salvar Botão */}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="hero"
              disabled={saving}
              className="gap-2"
              onClick={handleSave}
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar Configurações de Alertas"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Histórico dos Últimos Alertas Disparados para o Dono */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Histórico de Alertas Recebidos ({alerts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 text-center text-xs text-muted-foreground">
              Nenhum alerta disparado para o dono ainda. Clique em "Enviar Alerta de Teste" acima para experimentar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Horário</TableHead>
                    <TableHead>Tipo de Alerta</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Mensagem Enviada</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell className="text-xs font-mono whitespace-nowrap">
                        {new Date(alert.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        {alert.alert_type === "new_booking" && (
                          <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100 border-sky-200 text-[10px]">
                            Novo Agendamento
                          </Badge>
                        )}
                        {alert.alert_type === "confirmed" && (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 text-[10px]">
                            Confirmado
                          </Badge>
                        )}
                        {alert.alert_type === "cancelled" && (
                          <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 border-rose-200 text-[10px]">
                            Cancelamento
                          </Badge>
                        )}
                        {alert.alert_type === "daily_summary" && (
                          <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 border-purple-200 text-[10px]">
                            Resumo Noturno
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-medium">
                        {alert.recipient_phone}
                      </TableCell>
                      <TableCell className="text-xs font-mono whitespace-pre-wrap max-w-md bg-muted/30 rounded p-2 my-1">
                        {alert.message}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 text-[10px] gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Enviado
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

