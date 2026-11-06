import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Copy, ExternalLink, Globe, Megaphone, PackageMinus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { STANDARD_TUSS_PROCEDURES, fetchProcedureCatalog } from "@/modules/clinics";
import { fetchStockItems, recordStockMovement } from "@/modules/stock";
import { generateBookingLink } from "@/modules/online-booking";
import { useClinic } from "@/lib/clinic";
import { useT, type TKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CallPatientModal } from "@/components/waiting-room/CallPatientModal";
import { dispatchAppointmentNotification } from "@/modules/whatsapp/connection";
import { dismissWaitingRoomCallForPatient } from "@/modules/waiting-room";

type Status = Database["public"]["Enums"]["appointment_status"];
const STATUSES: Status[] = ["scheduled", "confirmed", "completed", "cancelled", "no_show"];

export const Route = createFileRoute("/_authenticated/app/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda — SondaPro" },
      { name: "description", content: "Agenda de consultas." },
      { property: "og:title", content: "Agenda — SondaPro" },
      { property: "og:description", content: "Agenda de consultas." },
    ],
  }),
  component: Agenda,
});

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

type FormState = {
  id?: string;
  patient_id: string;
  professional_id: string;
  room_id: string;
  date: string;
  start: string;
  end: string;
  procedure: string;
  price: string;
  status: Status;
  notes: string;
};

function Agenda() {
  const { t, dateLocale } = useT();
  const { clinicId, clinicName, activeUnitId, hasPermission } = useClinic();
  const qc = useQueryClient();
  const canRead = hasPermission("appointments.read");
  const canWrite = hasPermission("appointments.write");
  const canStockWrite = hasPermission("stock.write");
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [prof, setProf] = useState("all");
  const [form, setForm] = useState<FormState | null>(null);
  const [kitItemId, setKitItemId] = useState<string>("none");
  const [kitQty, setKitQty] = useState<string>("1");
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [patientToCall, setPatientToCall] = useState<{ id?: string | undefined; name: string; profId?: string | undefined; roomId?: string | undefined } | null>(null);
  const [bookingLinkModalOpen, setBookingLinkModalOpen] = useState(false);

  const clinicInfoQuery = useQuery({
    queryKey: ["clinicSlugInfo", clinicId],
    enabled: canRead,
    queryFn: async () => {
      const { data } = await supabase.from("clinics").select("name, slug").eq("id", clinicId).single();
      return data;
    },
  });
  const publicBookingUrl = generateBookingLink(clinicInfoQuery.data?.slug || clinicId);

  const stockItemsQuery = useQuery({
    queryKey: ["stockItems", clinicId],
    enabled: canRead && canStockWrite,
    queryFn: () => fetchStockItems(clinicId),
  });
  const availableStockItems = (stockItemsQuery.data ?? []).filter((i) => Number(i.current_quantity) > 0);

  const catalogQuery = useQuery({
    queryKey: ["procedureCatalog", clinicId],
    enabled: canRead,
    queryFn: () => fetchProcedureCatalog(clinicId),
  });
  const catalogOptions =
    (catalogQuery.data ?? []).length > 0
      ? (catalogQuery.data ?? []).map((c) => ({
        key: c.id,
        label: `${c.tuss_code ? `[${c.tuss_code}] ` : ""}${c.name}`,
        price: Number(c.base_price) || 0,
        duration: Number(c.default_duration_minutes) || 60,
      }))
      : STANDARD_TUSS_PROCEDURES.map((c) => ({
        key: c.tuss_code,
        label: `[${c.tuss_code}] ${c.name}`,
        price: c.base_price,
        duration: c.default_duration_minutes,
      }));

  const consumeStockMut = useMutation({
    mutationFn: async () => {
      if (!form || kitItemId === "none") return;
      const item = availableStockItems.find((i) => i.id === kitItemId);
      if (!item) throw new Error("Selecione um insumo válido com saldo em estoque.");
      const qty = Math.max(0.01, Number(kitQty.replace(",", ".")) || 1);
      await recordStockMovement(clinicId, item, {
        item_id: item.id,
        movement_type: "out",
        quantity: qty,
        reason: `Consumo clínico no atendimento${form.procedure ? ` (${form.procedure})` : ""}`,
        patient_id: form.patient_id || null,
        professional_id: form.professional_id || null,
      });
    },
    onSuccess: () => {
      toast.success("Baixa de insumo registrada no Kardex do Estoque!");
      setKitItemId("none");
      setKitQty("1");
      qc.invalidateQueries({ queryKey: ["stockItems", clinicId] });
      qc.invalidateQueries({ queryKey: ["stockMovements", clinicId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const [start, end, days] = useMemo(() => {
    const s = new Date(cursor);
    if (view === "week") s.setDate(s.getDate() - s.getDay());
    if (view === "month") {
      s.setDate(1);
      s.setDate(1 - s.getDay());
    }
    const n = view === "day" ? 1 : view === "week" ? 7 : 42;
    const list = Array.from({ length: n }, (_, i) => {
      const d = new Date(s);
      d.setDate(s.getDate() + i);
      return d;
    });
    const e = new Date(s);
    e.setDate(s.getDate() + n);
    return [s, e, list];
  }, [cursor, view]);

  const refs = useQuery({
    queryKey: ["agendaRefs", clinicId],
    enabled: canRead,
    queryFn: async () => {
      const [p, pr, r] = await Promise.all([
        supabase.from("patients").select("id,full_name,phone,whatsapp").eq("clinic_id", clinicId).order("full_name").limit(1000),
        supabase.from("professionals").select("id,name,color").eq("clinic_id", clinicId).eq("active", true).order("name"),
        supabase.from("rooms").select("id,name").eq("clinic_id", clinicId).order("name"),
      ]);
      const firstErr = p.error || pr.error || r.error;
      if (firstErr) throw firstErr;
      return { patients: p.data ?? [], profs: pr.data ?? [], rooms: r.data ?? [] };
    },
  });

  const { data: appts = [] } = useQuery({
    queryKey: ["appointments", clinicId, start.toISOString(), end.toISOString(), prof],
    enabled: canRead,
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("*,patients(full_name),professionals(name,color)")
        .eq("clinic_id", clinicId)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at");
      if (prof !== "all") q = q.eq("professional_id", prof);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const s = new Date(`${f.date}T${f.start}`),
        e = new Date(`${f.date}T${f.end}`);
      if (!f.patient_id || !f.professional_id || isNaN(s.getTime()) || e <= s) throw new Error(t("common.error"));
      const isNew = !f.id;
      const row = {
        clinic_id: clinicId,
        patient_id: f.patient_id,
        professional_id: f.professional_id,
        room_id: f.room_id && f.room_id !== "none" ? f.room_id : null,
        starts_at: s.toISOString(),
        ends_at: e.toISOString(),
        procedure: f.procedure.trim().slice(0, 200) || null,
        price: Math.max(0, Number(f.price.replace(",", ".")) || 0),
        status: f.status,
        notes: f.notes.trim().slice(0, 2000) || null,
      };
      const { error } = f.id
        ? await supabase.from("appointments").update(row).eq("clinic_id", clinicId).eq("id", f.id)
        : await supabase.from("appointments").insert(row);
      if (error) throw new Error(error.code === "23P01" ? t("ag.conflict") : error.message);

      // Automatização Sala de Espera / TV: Se a consulta for marcada como atendida ou confirmada,
      // encerra a chamada em destaque na TV da recepção imediatamente, voltando aos banners e mantendo no histórico lateral
      const patientObj = refs.data?.patients.find((p) => p.id === f.patient_id);
      if (f.status === "completed" || f.status === "confirmed") {
        void dismissWaitingRoomCallForPatient(
          clinicId,
          patientObj?.full_name || f.patient_id,
          f.status === "completed" ? "completed" : "in_attendance",
        );
      }

      // Disparo inteligente de WhatsApp (Automático ou Manual Web) e Alertas do Dono
      const profObj = refs.data?.profs.find((pr) => pr.id === f.professional_id);
      const eventType = isNew
        ? "booked"
        : f.status === "cancelled"
          ? "cancelled"
          : f.status === "confirmed"
            ? "confirmed"
            : "booked";

      // Dispara em background
      void dispatchAppointmentNotification(
        clinicId,
        {
          patientName: patientObj?.full_name || "Paciente",
          patientPhone:
            (patientObj as { whatsapp?: string; phone?: string } | undefined)?.whatsapp ||
            (patientObj as { whatsapp?: string; phone?: string } | undefined)?.phone ||
            "",
          startsAt: s.toISOString(),
          professionalName: profObj?.name || "Dentista",
          procedure: f.procedure || "Consulta Odontológica",
          clinicName,
        },
        eventType,
      )
        .then((res) => {
          if (res.mode === "automatic") {
            toast.info("WhatsApp: Notificação automática disparada!");
          } else if (res.mode === "manual_web" && res.url) {
            toast("Mensagem de WhatsApp gerada para a consulta", {
              action: {
                label: "Abrir WhatsApp Web",
                onClick: () => window.open(res.url, "_blank", "noopener,noreferrer"),
              },
            });
          }
        })
        .catch((err) => {
          console.warn("dispatchAppointmentNotification warning:", err);
        });
    },
    onSuccess: () => {
      toast.success(t("common.saved"));
      setForm(null);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canRead) return <p className="text-muted-foreground">{t("common.noPermission")}</p>;

  function openNew(d: Date, hour = 9) {
    if (!canWrite) return;
    const r = refs.data;
    if (!r || r.patients.length === 0 || r.profs.length === 0) {
      toast.error(t("ag.needSetup"));
      return;
    }
    setForm({
      patient_id: "",
      professional_id: prof !== "all" ? prof : (r.profs[0]?.id ?? ""),
      room_id: "none",
      date: ymd(d),
      start: `${pad(hour)}:00`,
      end: `${pad(hour + 1)}:00`,
      procedure: "",
      price: "0",
      status: "scheduled",
      notes: "",
    });
  }
  function openEdit(a: (typeof appts)[number]) {
    if (!canWrite) return;
    const s = new Date(a.starts_at),
      e = new Date(a.ends_at);
    setForm({
      id: a.id,
      patient_id: a.patient_id,
      professional_id: a.professional_id,
      room_id: a.room_id ?? "none",
      date: ymd(s),
      start: hm(s),
      end: hm(e),
      procedure: a.procedure ?? "",
      price: String(a.price),
      status: a.status,
      notes: a.notes ?? "",
    });
  }
  function shift(dir: number) {
    const d = new Date(cursor);
    if (view === "day") d.setDate(d.getDate() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setMonth(d.getMonth() + dir);
    setCursor(d);
  }

  const HOURS = Array.from({ length: 13 }, (_, i) => i + 7);
  const dayAppts = (d: Date) => appts.filter((a) => new Date(a.starts_at).toDateString() === d.toDateString());
  const Chip = ({ a }: { a: (typeof appts)[number] }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        openEdit(a);
      }}
      className={cn(
        "w-full truncate rounded-md border-l-4 bg-accent px-1.5 py-1 text-left text-xs",
        (a.status === "cancelled" || a.status === "no_show") && "line-through opacity-50",
      )}
      style={{ borderLeftColor: a.professionals?.color ?? undefined }}
    >
      <b>{hm(new Date(a.starts_at))}</b> {a.patients?.full_name}
    </button>
  );

  const title =
    view === "month"
      ? cursor.toLocaleDateString(dateLocale, { month: "long", year: "numeric" })
      : view === "day"
        ? cursor.toLocaleDateString(dateLocale, { dateStyle: "full" })
        : `${(days[0] ?? cursor).toLocaleDateString(dateLocale, { day: "2-digit", month: "short" })} – ${(days[6] ?? cursor).toLocaleDateString(dateLocale, { day: "2-digit", month: "short", year: "numeric" })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-3xl font-extrabold text-navy">{t("ag.title")}</h1>
        <Select value={prof} onValueChange={setProf}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("ag.all")}</SelectItem>
            {(refs.data?.profs ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="inline-flex rounded-lg border bg-card p-0.5">
          {(["day", "week", "month"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {t(`ag.${v}` as TKey)}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          className="gap-2 text-teal border-teal/30 hover:bg-teal/5 font-medium"
          onClick={() => setBookingLinkModalOpen(true)}
        >
          <Globe className="h-4 w-4 text-teal" />
          <span>Agendamento Online</span>
        </Button>
        {canWrite && (
          <Button variant="hero" onClick={() => openNew(cursor)}>
            <Plus />
            {t("ag.new")}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => shift(-1)}>
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            setCursor(d);
          }}
        >
          {t("ag.today")}
        </Button>
        <Button variant="outline" size="icon" onClick={() => shift(1)}>
          <ChevronRight />
        </Button>
        <span className="ml-2 font-semibold capitalize">{title}</span>
      </div>

      {view === "month" ? (
        <div className="grid grid-cols-7 overflow-hidden rounded-2xl border bg-card shadow-card">
          {days.slice(0, 7).map((d) => (
            <div
              key={d.toISOString()}
              className="border-b bg-muted p-2 text-center text-xs font-semibold uppercase text-muted-foreground"
            >
              {d.toLocaleDateString(dateLocale, { weekday: "short" })}
            </div>
          ))}
          {days.map((d) => (
            <div
              key={d.toISOString()}
              onClick={() => openNew(d)}
              className={cn(
                "min-h-24 cursor-pointer border-b border-r p-1.5 hover:bg-muted/40",
                d.getMonth() !== cursor.getMonth() && "opacity-40",
              )}
            >
              <p className={cn("mb-1 text-xs font-semibold", d.toDateString() === new Date().toDateString() && "text-primary")}>
                {d.getDate()}
              </p>
              <div className="space-y-1">
                {dayAppts(d)
                  .slice(0, 3)
                  .map((a) => (
                    <Chip key={a.id} a={a} />
                  ))}
                {dayAppts(d).length > 3 && <p className="text-[10px] text-muted-foreground">+{dayAppts(d).length - 3}</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
          <div className="grid min-w-[700px]" style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)` }}>
            <div className="border-b bg-muted" />
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className={cn(
                  "border-b border-l bg-muted p-2 text-center text-xs font-semibold",
                  d.toDateString() === new Date().toDateString() && "text-primary",
                )}
              >
                {d.toLocaleDateString(dateLocale, { weekday: "short", day: "2-digit" })}
              </div>
            ))}
            {HOURS.map((h) => (
              <div key={h} className="contents">
                <div className="border-b p-1 text-right text-[11px] text-muted-foreground">{pad(h)}:00</div>
                {days.map((d) => (
                  <div
                    key={d.toISOString() + h}
                    onClick={() => openNew(d, h)}
                    className="min-h-14 cursor-pointer space-y-1 border-b border-l p-1 hover:bg-muted/40"
                  >
                    {dayAppts(d)
                      .filter((a) => new Date(a.starts_at).getHours() === h)
                      .map((a) => (
                        <Chip key={a.id} a={a} />
                      ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? t("common.edit") : t("ag.new")}</DialogTitle>
          </DialogHeader>
          {form && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(form);
              }}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("ag.patient")}</Label>
                <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {refs.data?.patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("ag.professional")}</Label>
                <Select value={form.professional_id} onValueChange={(v) => setForm({ ...form, professional_id: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {refs.data?.profs.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("ag.room")}</Label>
                <Select value={form.room_id} onValueChange={(v) => setForm({ ...form, room_id: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {refs.data?.rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("ag.date")}</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label>{t("ag.start")}</Label>
                <Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label>{t("ag.end")}</Label>
                <Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} required />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Catálogo TUSS / Tabela de Honorários (Preenchimento Rápido)</Label>
                <Select
                  value="none"
                  onValueChange={(val) => {
                    const chosen = catalogOptions.find((c) => c.key === val);
                    if (!chosen) return;
                    const [hStr, mStr] = form.start.split(":");
                    const startMinutes = (Number(hStr) || 9) * 60 + (Number(mStr) || 0);
                    const endMinutes = Math.min(23 * 60 + 59, startMinutes + chosen.duration);
                    const newEnd = `${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}`;
                    setForm({
                      ...form,
                      procedure: chosen.label,
                      price: String(chosen.price),
                      end: newEnd,
                    });
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecionar procedimento da Tabela TUSS / Clínica..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecionar procedimento da Tabela TUSS / Clínica...</SelectItem>
                    {catalogOptions.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label} — R$ {c.price.toFixed(2)} ({c.duration} min)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("ag.procedure")}</Label>
                <Input value={form.procedure} maxLength={200} onChange={(e) => setForm({ ...form, procedure: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("ag.price")}</Label>
                <Input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("ag.status")}</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`status.${s}` as TKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("ag.notes")}</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              {form.id && canStockWrite && availableStockItems.length > 0 && (
                <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:col-span-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-navy">
                    <PackageMinus className="h-3.5 w-3.5 text-primary" />
                    Baixa Rápida de Kit Clínico / Insumo no Kardex
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_90px_auto] sm:items-end">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Insumo utilizado</Label>
                      <Select value={kitItemId} onValueChange={setKitItemId}>
                        <SelectTrigger className="h-8 bg-card text-xs">
                          <SelectValue placeholder="Selecione o material..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione o material...</SelectItem>
                          {availableStockItems.map((it) => (
                            <SelectItem key={it.id} value={it.id}>
                              {it.name} (Saldo: {it.current_quantity} {it.unit_measure})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Qtd.</Label>
                      <Input
                        className="h-8 bg-card text-xs"
                        inputMode="decimal"
                        value={kitQty}
                        onChange={(e) => setKitQty(e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-semibold"
                      disabled={kitItemId === "none" || consumeStockMut.isPending}
                      onClick={() => consumeStockMut.mutate()}
                    >
                      Baixar no Estoque
                    </Button>
                  </div>
                </div>
              )}

              <DialogFooter className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                {form.id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs border-sky-300 text-sky-700 hover:bg-sky-50 mr-auto"
                    onClick={() => {
                      const pat = refs.data?.patients.find((p) => p.id === form.patient_id);
                      setPatientToCall({
                        id: form.patient_id,
                        name: pat?.full_name || "",
                        profId: form.professional_id,
                        roomId: form.room_id !== "none" ? form.room_id : undefined,
                      });
                      setCallModalOpen(true);
                    }}
                  >
                    <Megaphone className="h-4 w-4 text-sky-600" />
                    <span>Chamar Paciente na TV</span>
                  </Button>
                )}
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setForm(null)}>
                    {t("common.cancel")}
                  </Button>
                  <Button variant="hero" disabled={save.isPending}>
                    {t("common.save")}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Chamada para a TV */}
      <CallPatientModal
        open={callModalOpen}
        onOpenChange={setCallModalOpen}
        clinicId={clinicId}
        unitId={activeUnitId}
        patientId={patientToCall?.id}
        defaultPatientName={patientToCall?.name}
        professionals={refs.data?.profs ?? []}
        rooms={refs.data?.rooms ?? []}
        defaultProfessionalId={patientToCall?.profId}
        defaultRoomId={patientToCall?.roomId}
      />

      {/* Modal do Link de Agendamento Online */}
      <Dialog open={bookingLinkModalOpen} onOpenChange={setBookingLinkModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-navy">
              <Globe className="h-5 w-5 text-teal" />
              <span>Link de Agendamento Online</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Envie este link para pacientes pelo WhatsApp ou coloque no perfil do Instagram. Eles poderão escolher o procedimento, dentista e horário disponível.
            </p>

            <div className="rounded-2xl border border-teal/20 bg-teal/5 p-4 space-y-3">
              <Label className="text-xs font-bold text-slate-700">Link Direto da Clínica:</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={publicBookingUrl}
                  className="font-mono text-xs bg-white text-navy select-all"
                />
                <Button
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(publicBookingUrl);
                    toast.success("Link de agendamento copiado!");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-slate-50 p-3 text-xs text-slate-600">
              💡 <strong>Dica:</strong> Você pode personalizar procedimentos e horários de atendimento na aba <em>Configurações &rarr; Agendamento Online</em>.
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              asChild
              className="bg-teal hover:bg-teal-600 text-white gap-2"
            >
              <a href={publicBookingUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                <span>Testar Página Pública</span>
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
