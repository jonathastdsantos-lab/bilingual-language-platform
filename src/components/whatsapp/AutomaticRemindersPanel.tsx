import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BellRing,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  Save,
  MessageCircle,
  Sparkles,
  ExternalLink,
  Calendar,
  User,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchReminderSettings,
  updateReminderSettings,
  fetchUpcomingReminders,
  markReminderSent,
  buildReminderMessage,
  buildWhatsAppReminderUrl,
  DEFAULT_REMINDER_24H_TEMPLATE,
  DEFAULT_REMINDER_2H_TEMPLATE,
} from "@/modules/whatsapp/reminders";
import type {
  WhatsAppReminderSettings,
  UpcomingAppointmentReminder,
  ReminderType,
} from "@/types";

interface AutomaticRemindersPanelProps {
  clinicId: string;
  clinicName: string;
  canManage: boolean;
}

export function AutomaticRemindersPanel({
  clinicId,
  clinicName,
  canManage,
}: AutomaticRemindersPanelProps) {
  const qc = useQueryClient();

  const [enabled24h, setEnabled24h] = useState<boolean>(true);
  const [enabled2h, setEnabled2h] = useState<boolean>(true);
  const [template24h, setTemplate24h] = useState<string>(
    DEFAULT_REMINDER_24H_TEMPLATE
  );
  const [template2h, setTemplate2h] = useState<string>(
    DEFAULT_REMINDER_2H_TEMPLATE
  );

  // Consulta configurações
  const { data: settings } = useQuery({
    queryKey: ["whatsappReminderSettings", clinicId],
    queryFn: async () => {
      const data = await fetchReminderSettings(clinicId);
      setEnabled24h(data.enabled_24h);
      setEnabled2h(data.enabled_2h);
      setTemplate24h(data.template_24h || DEFAULT_REMINDER_24H_TEMPLATE);
      setTemplate2h(data.template_2h || DEFAULT_REMINDER_2H_TEMPLATE);
      return data;
    },
  });

  // Consulta lista de próximas consultas nas próximas 48h
  const { data: upcoming = [], isLoading: isLoadingUpcoming, refetch: refetchUpcoming } =
    useQuery({
      queryKey: ["upcomingReminders", clinicId],
      queryFn: () => fetchUpcomingReminders(clinicId),
      refetchInterval: 60000, // atualiza a cada minuto
    });

  // Mutação para salvar configurações
  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const res = await updateReminderSettings(clinicId, {
        enabled_24h: enabled24h,
        enabled_2h: enabled2h,
        template_24h: template24h.trim(),
        template_2h: template2h.trim(),
      });
      if (!res.success) throw new Error(res.error || "Erro ao salvar preferências.");
    },
    onSuccess: () => {
      toast.success("Configurações de lembretes salvas!");
      qc.invalidateQueries({
        queryKey: ["whatsappReminderSettings", clinicId],
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Mutação para disparar lembrete individual
  const dispatchMutation = useMutation({
    mutationFn: async (params: {
      item: UpcomingAppointmentReminder;
      type: ReminderType;
    }) => {
      const tpl = typeText(params.type);
      const msg = buildReminderMessage(tpl, {
        patientName: params.item.patient_name,
        clinicName,
        startsAt: params.item.starts_at,
        professionalName: params.item.professional_name,
        token: params.item.confirmation_token,
      });

      const url = buildWhatsAppReminderUrl(params.item.patient_phone, msg);
      window.open(url, "_blank");

      await markReminderSent(
        clinicId,
        params.item.appointment_id,
        params.item.patient_id,
        params.type,
        params.item.patient_phone,
        msg
      );
    },
    onSuccess: () => {
      toast.success("Lembrete aberto no WhatsApp e registrado!");
      refetchUpcoming();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const typeText = (type: ReminderType) =>
    type === "24h" ? template24h : template2h;

  const fmtDateTime = (iso: string) => {
    const dt = new Date(iso);
    return `${dt.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    })} às ${dt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  };

  // Contadores
  const pending24h = upcoming.filter(
    (u) => u.reminder_24h.status === "pending"
  ).length;
  const pending2h = upcoming.filter(
    (u) => u.reminder_2h.status === "pending"
  ).length;

  return (
    <div className="space-y-6">
      {/* Banner Superior com Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Consultas Próximas (48h)</span>
            <Calendar className="h-4 w-4 text-teal" />
          </div>
          <div className="text-2xl font-extrabold text-navy mt-1">
            {upcoming.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Agendadas na clínica
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Lembretes 24h Pendentes</span>
            <BellRing className="h-4 w-4 text-sky-600" />
          </div>
          <div className="text-2xl font-extrabold text-navy mt-1">
            {pending24h}
          </div>
          <p className="text-[11px] text-sky-700 font-semibold mt-0.5">
            Véspera do atendimento
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Lembretes 2h Pendentes</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-navy mt-1">
            {pending2h}
          </div>
          <p className="text-[11px] text-amber-700 font-semibold mt-0.5">
            Última hora / saída de casa
          </p>
        </div>
      </div>

      {/* Card de Configuração das Mensagens */}
      <div className="rounded-2xl border bg-card p-5 shadow-card space-y-5">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-teal" />
            <h3 className="font-bold text-navy text-sm">
              Modelos dos Lembretes Automáticos
            </h3>
          </div>
          <div className="text-xs text-muted-foreground">
            Tags disponíveis:{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">
              {"{paciente}"}
            </code>
            ,{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">
              {"{data}"}
            </code>
            ,{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">
              {"{hora}"}
            </code>
            ,{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">
              {"{profissional}"}
            </code>
            ,{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">
              {"{link_confirmacao}"}
            </code>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Lembrete 24h */}
          <div className="rounded-xl border p-4 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-sky-600" />
                <Label className="text-xs font-bold text-slate-800">
                  Lembrete de Véspera (24 horas antes)
                </Label>
              </div>
              <Switch
                checked={enabled24h}
                onCheckedChange={setEnabled24h}
                disabled={!canManage}
              />
            </div>
            <Textarea
              rows={3}
              value={template24h}
              onChange={(e) => setTemplate24h(e.target.value)}
              disabled={!canManage || !enabled24h}
              className="text-xs bg-white"
            />
            <p className="text-[11px] text-muted-foreground">
              Enviado 1 dia antes da consulta com o link seguro para o paciente confirmar presença em 1 clique.
            </p>
          </div>

          {/* Lembrete 2h */}
          <div className="rounded-xl border p-4 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <Label className="text-xs font-bold text-slate-800">
                  Lembrete de Iminência (2 horas antes)
                </Label>
              </div>
              <Switch
                checked={enabled2h}
                onCheckedChange={setEnabled2h}
                disabled={!canManage}
              />
            </div>
            <Textarea
              rows={3}
              value={template2h}
              onChange={(e) => setTemplate2h(e.target.value)}
              disabled={!canManage || !enabled2h}
              className="text-xs bg-white"
            />
            <p className="text-[11px] text-muted-foreground">
              Enviado no dia da consulta para o paciente sair de casa pontualmente e evitar atrasos de cadeira.
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex justify-end pt-2 border-t">
            <Button
              size="sm"
              onClick={() => saveSettingsMutation.mutate()}
              disabled={saveSettingsMutation.isPending}
              className="bg-navy hover:bg-navy-700 text-white font-bold gap-1.5 text-xs"
            >
              <Save className="h-3.5 w-3.5" />
              {saveSettingsMutation.isPending
                ? "Salvando..."
                : "Salvar Modelos de Mensagem"}
            </Button>
          </div>
        )}
      </div>

      {/* Fila Operacional de Lembretes */}
      <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="p-4 border-b bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-navy text-sm flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              Fila Inteligente de Lembretes para os Próximos Atendimentos
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Envio com 1 clique para o WhatsApp do paciente com status em tempo real.
            </p>
          </div>
        </div>

        {isLoadingUpcoming ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Carregando próximas consultas...
          </div>
        ) : upcoming.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              Nenhuma consulta agendada para as próximas 48 horas
            </p>
            <p className="text-xs text-muted-foreground">
              Novos agendamentos aparecerão aqui automaticamente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/70 border-b text-slate-700 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3">Data & Horário</th>
                  <th className="p-3">Paciente</th>
                  <th className="p-3">Celular / WhatsApp</th>
                  <th className="p-3">Procedimento & Dentista</th>
                  <th className="p-3 text-center">Lembrete 24h</th>
                  <th className="p-3 text-center">Lembrete 2h</th>
                  <th className="p-3 text-right">Ações de Disparo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {upcoming.map((item) => (
                  <tr
                    key={item.appointment_id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="p-3 font-semibold text-navy whitespace-nowrap">
                      {fmtDateTime(item.starts_at)}
                    </td>
                    <td className="p-3 font-bold text-slate-800">
                      {item.patient_name}
                    </td>
                    <td className="p-3 font-mono text-slate-600">
                      {item.patient_phone || "Sem telefone"}
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-slate-700">
                        {item.procedure_name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {item.professional_name}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <Badge
                        className={
                          item.reminder_24h.status === "sent"
                            ? "bg-emerald-500/10 text-emerald-700 font-semibold"
                            : "bg-slate-100 text-slate-600 font-semibold"
                        }
                      >
                        {item.reminder_24h.status === "sent"
                          ? "Enviado"
                          : "Pendente"}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Badge
                        className={
                          item.reminder_2h.status === "sent"
                            ? "bg-emerald-500/10 text-emerald-700 font-semibold"
                            : "bg-slate-100 text-slate-600 font-semibold"
                        }
                      >
                        {item.reminder_2h.status === "sent"
                          ? "Enviado"
                          : "Pendente"}
                      </Badge>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          title="Enviar lembrete de véspera (24h)"
                          className={`text-xs h-7 gap-1 ${
                            item.reminder_24h.status === "sent"
                              ? "opacity-60"
                              : "border-sky-500/40 text-sky-700 hover:bg-sky-50"
                          }`}
                          onClick={() =>
                            dispatchMutation.mutate({ item, type: "24h" })
                          }
                          disabled={
                            !item.patient_phone || dispatchMutation.isPending
                          }
                        >
                          <BellRing className="h-3 w-3" />
                          24h
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          title="Enviar lembrete de 2 horas antes"
                          className={`text-xs h-7 gap-1 ${
                            item.reminder_2h.status === "sent"
                              ? "opacity-60"
                              : "border-amber-500/40 text-amber-700 hover:bg-amber-50"
                          }`}
                          onClick={() =>
                            dispatchMutation.mutate({ item, type: "2h" })
                          }
                          disabled={
                            !item.patient_phone || dispatchMutation.isPending
                          }
                        >
                          <Clock className="h-3 w-3" />
                          2h
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

