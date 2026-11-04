import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DollarSign, CalendarCheck, CalendarX, UserPlus, CalendarClock, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinic, PERM } from "@/lib/clinic";
import { useT, formatBRL, type TKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Dashboard — SondaPro" },
      { name: "description", content: "Indicadores da clínica." },
      { property: "og:title", content: "Dashboard — SondaPro" },
      { property: "og:description", content: "Indicadores da clínica." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t, dateLocale } = useT();
  const { clinicId, can, clinicName } = useClinic();
  const allowed = can(PERM.patientsRead);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const from30 = new Date(now); from30.setDate(now.getDate() - 29); from30.setHours(0, 0, 0, 0);
  const rangeStart = from30 < monthStart ? from30 : monthStart;

  const { data } = useQuery({
    queryKey: ["dashboard", clinicId],
    enabled: allowed,
    queryFn: async () => {
      const [a, p, prof, up] = await Promise.all([
        supabase.from("appointments").select("starts_at,status,price,professional_id").eq("clinic_id", clinicId).gte("starts_at", rangeStart.toISOString()).limit(5000),
        supabase.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).gte("created_at", monthStart.toISOString()),
        supabase.from("professionals").select("id,name,color").eq("clinic_id", clinicId),
        supabase.from("appointments").select("id,starts_at,status,procedure,patients(full_name),professionals(name,color)").eq("clinic_id", clinicId).gte("starts_at", now.toISOString()).in("status", ["scheduled", "confirmed"]).order("starts_at").limit(6),
      ]);
      return { appts: a.data ?? [], newPatients: p.count ?? 0, profs: prof.data ?? [], upcoming: up.data ?? [] };
    },
  });

  if (!allowed) return <h1 className="text-3xl font-extrabold text-navy">{clinicName}</h1>;

  const appts = data?.appts ?? [];
  const todayKey = now.toDateString();
  const month = appts.filter((x) => new Date(x.starts_at) >= monthStart);
  const done = (x: { status: string }) => x.status === "completed";
  const revDay = appts.filter((x) => done(x) && new Date(x.starts_at).toDateString() === todayKey).reduce((s, x) => s + Number(x.price), 0);
  const revMonth = month.filter(done).reduce((s, x) => s + Number(x.price), 0);

  const series = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(from30); d.setDate(from30.getDate() + i);
    const v = appts.filter((x) => done(x) && new Date(x.starts_at).toDateString() === d.toDateString()).reduce((s, x) => s + Number(x.price), 0);
    return { d: d.toLocaleDateString(dateLocale, { day: "2-digit", month: "2-digit" }), v };
  });
  const byProf = (data?.profs ?? []).map((p) => ({ name: p.name, n: month.filter((x) => x.professional_id === p.id && done(x)).length }));

  const kpis: { k: TKey; v: string; i: typeof DollarSign }[] = [
    { k: "dash.revenueDay", v: formatBRL(revDay, dateLocale), i: DollarSign },
    { k: "dash.revenueMonth", v: formatBRL(revMonth, dateLocale), i: DollarSign },
    { k: "dash.scheduled", v: String(month.filter((x) => x.status === "scheduled" || x.status === "confirmed").length), i: CalendarClock },
    { k: "dash.completed", v: String(month.filter(done).length), i: CalendarCheck },
    { k: "dash.cancelled", v: String(month.filter((x) => x.status === "cancelled").length), i: CalendarX },
    { k: "dash.noShow", v: String(month.filter((x) => x.status === "no_show").length), i: UserX },
    { k: "dash.newPatients", v: String(data?.newPatients ?? 0), i: UserPlus },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{clinicName}</p>
        <h1 className="text-3xl font-extrabold text-navy">{t("dash.title")}</h1>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        {kpis.map(({ k, v, i: I }, idx) => (
          <div key={k} className={`rounded-2xl border p-4 shadow-card ${idx === 1 ? "bg-brand text-primary-foreground" : "bg-card"}`}>
            <I className={`h-5 w-5 ${idx === 1 ? "" : "text-primary"}`} />
            <p className={`mt-3 text-xs ${idx === 1 ? "opacity-80" : "text-muted-foreground"}`}>{t(k)}</p>
            <p className="mt-1 font-display text-xl font-bold">{v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5 shadow-card xl:col-span-2">
          <h3 className="font-semibold">{t("dash.chartRevenue")}</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="d" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip formatter={(v: number) => formatBRL(v, dateLocale)} />
                <Line type="monotone" dataKey="v" stroke="var(--primary)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-card">
          <h3 className="font-semibold">{t("dash.upcoming")}</h3>
          <ul className="mt-4 space-y-3">
            {(data?.upcoming ?? []).length === 0 && <li className="text-sm text-muted-foreground">{t("common.none")}</li>}
            {(data?.upcoming ?? []).map((u) => (
              <li key={u.id} className="flex items-center gap-3 text-sm">
                <span className="h-8 w-1 rounded-full" style={{ background: u.professionals?.color ?? undefined }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{u.patients?.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.professionals?.name} · {u.procedure}</p>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(u.starts_at).toLocaleString(dateLocale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-card xl:col-span-3">
          <h3 className="font-semibold">{t("dash.chartProf")}</h3>
          <div className="mt-4 h-56">
            <ResponsiveContainer>
              <BarChart data={byProf}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Bar dataKey="n" fill="var(--primary-glow)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
