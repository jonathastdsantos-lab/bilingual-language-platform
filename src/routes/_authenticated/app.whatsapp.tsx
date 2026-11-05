import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  MessageCircle,
  Send,
  CheckCircle2,
  Plus,
  Trash2,
  History,
  FileText,
  Clock,
  BellRing,
} from "lucide-react";
import { AutomaticRemindersPanel } from "@/components/whatsapp/AutomaticRemindersPanel";
import { supabase } from "@/services/supabase";
import { useClinic } from "@/lib/clinic";
import { useT } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatSaoPauloDateTime } from "@/utils/timezone";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  WHATSAPP_CATEGORIES,
  interpolateWhatsappTemplate,
  buildWhatsAppWebUrl,
  fetchWhatsappTemplates,
  createWhatsappTemplate,
  deleteWhatsappTemplate,
  fetchWhatsappDispatchLogs,
  logWhatsappDispatch,
} from "@/modules/whatsapp";
import type {
  WhatsappDispatchLog,
  WhatsappTemplate,
  WhatsappTemplateCategory,
} from "@/types";

export const Route = createFileRoute("/_authenticated/app/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp & Confirmações — SondaPro" },
      {
        name: "description",
        content:
          "Central de comunicação odontológica, confirmação ativa de consultas e templates dinâmicos de WhatsApp.",
      },
    ],
  }),
  component: WhatsappCenterPage,
});

interface AppointmentQueueRow {
  id: string;
  starts_at: string;
  status: string;
  procedure: string | null;
  patient_id: string;
  patients: {
    full_name: string | null;
    phone: string | null;
    whatsapp: string | null;
  } | null;
  professionals: {
    name: string | null;
  } | null;
}

function WhatsappCenterPage() {
  const { t, dateLocale } = useT();
  const { clinicId, clinicName, hasPermission } = useClinic();

  const canManage = hasPermission("whatsapp.manage");

  const [appointments, setAppointments] = useState<AppointmentQueueRow[]>([]);
  const [customTemplates, setCustomTemplates] = useState<WhatsappTemplate[]>([]);
  const [logs, setLogs] = useState<WhatsappDispatchLog[]>([]);
  const [selectedCategory, setSelectedCategory] =
    useState<WhatsappTemplateCategory>("confirmation");
  const [loading, setLoading] = useState(true);

  // New template form state
  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] =
    useState<WhatsappTemplateCategory>("confirmation");
  const [tplBody, setTplBody] = useState("");
  const [busy, setBusy] = useState(false);

  const loadWhatsappData = useCallback(async () => {
    if (!clinicId || !canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [apptsRes, tplsData, logsData] = await Promise.all([
        supabase
          .from("appointments")
          .select(
            "id, starts_at, status, procedure, patient_id, patients(full_name, phone, whatsapp), professionals(name)"
          )
          .eq("clinic_id", clinicId)
          .in("status", ["scheduled", "confirmed"])
          .order("starts_at", { ascending: true })
          .limit(100),
        fetchWhatsappTemplates(clinicId),
        fetchWhatsappDispatchLogs(clinicId),
      ]);

      if (apptsRes.error) {
        toast.error(apptsRes.error.message);
      }

      setAppointments((apptsRes.data ?? []) as unknown as AppointmentQueueRow[]);
      setCustomTemplates(tplsData);
      setLogs(logsData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [clinicId, canManage, t]);

  useEffect(() => {
    void loadWhatsappData();
  }, [loadWhatsappData]);

  const activeTemplateForCategory = useMemo(() => {
    const custom = customTemplates.find((tpl) => tpl.category === selectedCategory);
    if (custom) return custom.body_template;
    const def = DEFAULT_WHATSAPP_TEMPLATES.find(
      (tpl) => tpl.category === selectedCategory
    );
    return def?.body_template ?? DEFAULT_WHATSAPP_TEMPLATES[0]?.body_template ?? "";
  }, [customTemplates, selectedCategory]);

  async function handleSendWhatsApp(appt: AppointmentQueueRow) {
    const rawPhone = appt.patients?.whatsapp || appt.patients?.phone || "";
    const dtFormatted = formatSaoPauloDateTime(appt.starts_at, dateLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const hourFormatted = formatSaoPauloDateTime(appt.starts_at, dateLocale, {
      hour: "2-digit",
      minute: "2-digit",
    });

    const rendered = interpolateWhatsappTemplate(activeTemplateForCategory, {
      paciente: appt.patients?.full_name ?? "Paciente",
      data: dtFormatted,
      hora: hourFormatted,
      profissional: appt.professionals?.name ?? "Dentista",
      procedimento: appt.procedure ?? "Consulta Odontológica",
      clinica: clinicName,
    });

    try {
      const url = buildWhatsAppWebUrl(rawPhone, rendered);
      await logWhatsappDispatch({
        clinicId,
        patientId: appt.patient_id,
        appointmentId: appt.id,
        templateCategory: selectedCategory,
        phoneNumber: rawPhone,
        renderedMessage: rendered,
      });
      window.open(url, "_blank", "noopener,noreferrer");
      void loadWhatsappData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  async function handleMarkConfirmed(appointmentId: string) {
    const { error } = await supabase
      .from("appointments")
      .update({ status: "confirmed" })
      .eq("clinic_id", clinicId)
      .eq("id", appointmentId);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("common.saved"));
    void loadWhatsappData();
  }

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createWhatsappTemplate(clinicId, {
        name: tplName.trim(),
        category: tplCategory,
        body_template: tplBody.trim(),
      });
      toast.success(t("common.saved"));
      setTplName("");
      setTplBody("");
      void loadWhatsappData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    try {
      await deleteWhatsappTemplate(clinicId, id);
      toast.success(t("common.saved"));
      void loadWhatsappData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        {t("common.noPermission")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              {t("wa.title")}
            </h1>
            <p className="text-xs text-muted-foreground">{t("wa.subtitle")}</p>
          </div>
        </div>

        <Badge variant="outline" className="w-fit gap-1.5 px-2.5 py-1 text-xs">
          <Clock className="h-3.5 w-3.5 text-primary" />
          {t("dash.timezoneBadge")}
        </Badge>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      ) : (
        <Tabs defaultValue="queue" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:grid-cols-4">
            <TabsTrigger value="queue" className="gap-2">
              <Send className="h-4 w-4" />
              {t("wa.tabQueue")} ({appointments.length})
            </TabsTrigger>
            <TabsTrigger value="reminders" className="gap-2">
              <BellRing className="h-4 w-4 text-sky-600" />
              Lembretes (24h & 2h)
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="h-4 w-4" />
              {t("wa.tabTemplates")} ({DEFAULT_WHATSAPP_TEMPLATES.length + customTemplates.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              {t("wa.tabHistory")} ({logs.length})
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: FILA DE CONFIRMAÇÃO */}
          <TabsContent value="queue" className="space-y-4">
            <Card className="shadow-card">
              <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="font-display text-base">
                  {t("wa.tabQueue")}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">
                    Modelo ativo:
                  </Label>
                  <Select
                    value={selectedCategory}
                    onValueChange={(v) =>
                      setSelectedCategory(v as WhatsappTemplateCategory)
                    }
                  >
                    <SelectTrigger className="h-8 w-52 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WHATSAPP_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {t(`wa.cat.${cat}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-emerald-50/50 p-3 text-xs text-emerald-950">
                  <span className="font-semibold">Prévia do modelo selecionado: </span>
                  {activeTemplateForCategory}
                </div>

                {appointments.length === 0 ? (
                  <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                    {t("common.none")}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data / Hora</TableHead>
                          <TableHead>{t("ag.patient")}</TableHead>
                          <TableHead>{t("pat.whatsapp")}</TableHead>
                          <TableHead>{t("ag.professional")}</TableHead>
                          <TableHead>{t("ag.procedure")}</TableHead>
                          <TableHead>{t("ag.status")}</TableHead>
                          <TableHead className="text-right">
                            {t("common.actions")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {appointments.map((appt) => {
                          const phone =
                            appt.patients?.whatsapp || appt.patients?.phone || "";
                          return (
                            <TableRow key={appt.id}>
                              <TableCell className="whitespace-nowrap text-xs font-medium">
                                {formatSaoPauloDateTime(appt.starts_at, dateLocale)}
                              </TableCell>
                              <TableCell className="font-semibold">
                                {appt.patients?.full_name ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {phone || "Sem telefone"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {appt.professionals?.name ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {appt.procedure ?? "Consulta"}
                              </TableCell>
                              <TableCell>
                                {appt.status === "confirmed" ? (
                                  <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                                    {t("status.confirmed")}
                                  </Badge>
                                ) : (
                                  <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
                                    {t("status.scheduled")}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={!phone}
                                    className="h-7 gap-1 border-emerald-300 bg-emerald-50/70 px-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                                    onClick={() => handleSendWhatsApp(appt)}
                                  >
                                    <Send className="h-3.5 w-3.5" />
                                    {t("wa.sendBtn")}
                                  </Button>
                                  {appt.status !== "confirmed" && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 gap-1 px-2 text-xs"
                                      onClick={() => handleMarkConfirmed(appt.id)}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                                      {t("wa.confirmBtn")}
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: LEMBRETES AUTOMÁTICOS (24H & 2H) */}
          <TabsContent value="reminders" className="space-y-4">
            <AutomaticRemindersPanel
              clinicId={clinicId}
              clinicName={clinicName}
              canManage={canManage}
            />
          </TabsContent>

          {/* TAB 3: MODELOS DE MENSAGEM */}
          <TabsContent value="templates" className="space-y-6">
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Plus className="h-4 w-4 text-primary" />
                  {t("wa.newTemplate")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleCreateTemplate}
                  className="grid gap-3 sm:grid-cols-3"
                >
                  <div className="space-y-1">
                    <Label className="text-xs">{t("wa.templateName")}</Label>
                    <Input
                      value={tplName}
                      onChange={(e) => setTplName(e.target.value)}
                      placeholder="Ex.: Confirmação Ortodontia"
                      required
                      minLength={2}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{t("fin.category")}</Label>
                    <Select
                      value={tplCategory}
                      onValueChange={(v) =>
                        setTplCategory(v as WhatsappTemplateCategory)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WHATSAPP_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {t(`wa.cat.${cat}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1 sm:col-span-3">
                    <Label className="text-xs">{t("wa.templateBody")}</Label>
                    <div className="flex gap-2">
                      <Input
                        value={tplBody}
                        onChange={(e) => setTplBody(e.target.value)}
                        placeholder="Olá {paciente}, confirmamos sua consulta em {data} às {hora} com Dr(a). {profissional} na {clinica}."
                        required
                        minLength={5}
                      />
                      <Button type="submit" variant="hero" disabled={busy}>
                        {t("common.save")}
                      </Button>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {customTemplates.map((tpl) => (
                <Card key={tpl.id} className="border-primary/30 shadow-card">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-display text-sm font-bold">
                        {tpl.name}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {t(`wa.cat.${tpl.category}`)}
                        </Badge>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDeleteTemplate(tpl.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tpl.body_template}
                    </p>
                  </CardContent>
                </Card>
              ))}

              {DEFAULT_WHATSAPP_TEMPLATES.map((tpl) => (
                <Card key={tpl.category} className="shadow-card">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-display text-sm font-bold">
                        {tpl.name} (Padrão)
                      </div>
                      <Badge variant="secondary">
                        {t(`wa.cat.${tpl.category}`)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tpl.body_template}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* TAB 3: HISTÓRICO DE DISPAROS */}
          <TabsContent value="history">
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">
                  {t("wa.tabHistory")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                    {t("common.none")}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data / Hora</TableHead>
                        <TableHead>{t("ag.patient")}</TableHead>
                        <TableHead>{t("pat.whatsapp")}</TableHead>
                        <TableHead>{t("fin.category")}</TableHead>
                        <TableHead>Mensagem Enviada</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatSaoPauloDateTime(log.created_at, dateLocale)}
                          </TableCell>
                          <TableCell className="font-semibold">
                            {log.patients?.full_name ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            +{log.phone_number}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {t(`wa.cat.${log.template_category}`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                            {log.rendered_message}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

