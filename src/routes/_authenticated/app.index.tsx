import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { supabase, normalizeSupabaseError } from "@/services/supabase";
import { buildAdministrativeAlerts } from "@/services/notifications";
import { calculateAttendanceIndicators, calculateFinancialIndicators } from "@/modules/finance";
import { useClinic } from "@/lib/clinic";
import { useT } from "@/lib/i18n";
import type { DashboardPeriod } from "@/types";
import { getDashboardPeriodRange, toSaoPauloDateKey } from "@/utils/timezone";
import { DashboardFilterBar } from "@/components/dashboard/DashboardFilterBar";
import { FinancialKpiCards } from "@/components/dashboard/FinancialKpiCards";
import { AttendanceKpiCards } from "@/components/dashboard/AttendanceKpiCards";
import { UpcomingAppointmentsCard } from "@/components/dashboard/UpcomingAppointmentsCard";
import { AdminAlertsCard } from "@/components/dashboard/AdminAlertsCard";
import { EmptyDashboardState } from "@/components/dashboard/EmptyDashboardState";
import { RevenueTrendChart } from "@/components/charts/RevenueTrendChart";
import { ProfessionalsBarChart } from "@/components/charts/ProfessionalsBarChart";
import { AppointmentStatusChart } from "@/components/charts/AppointmentStatusChart";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Dashboard — SondaPro" },
      { name: "description", content: "Indicadores gerenciais da clínica." },
      { property: "og:title", content: "Dashboard — SondaPro" },
      { property: "og:description", content: "Indicadores gerenciais da clínica." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t, dateLocale } = useT();
  const { clinicId, clinicName, hasPermission, units } = useClinic();
  const [period, setPeriod] = useState<DashboardPeriod>("30d");
  const [profFilter, setProfFilter] = useState<string>("all");

  const canViewDashboard = hasPermission("dashboard.view");
  const canReadAppointments = hasPermission("appointments.read");
  const canViewFinancial = hasPermission("financial.view");

  const now = useMemo(() => new Date(), []);
  const { start: periodStart, end: periodEnd, daysCount } = useMemo(
    () => getDashboardPeriodRange(period, now),
    [period, now],
  );

  const queryStartIso = useMemo(() => {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    return (periodStart < todayStart ? periodStart : todayStart).toISOString();
  }, [periodStart, now]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", clinicId, period, queryStartIso],
    enabled: canViewDashboard && canReadAppointments,
    queryFn: async () => {
      const [apptsRes, patientsRes, profsRes, roomsRes, upcomingRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("id,starts_at,status,price,professional_id,patients(full_name,allergies)")
          .eq("clinic_id", clinicId)
          .gte("starts_at", queryStartIso)
          .limit(5000),
        supabase
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", clinicId)
          .gte("created_at", periodStart.toISOString())
          .lte("created_at", periodEnd.toISOString()),
        supabase
          .from("professionals")
          .select("id,name,color,commission_pct,active")
          .eq("clinic_id", clinicId)
          .order("name"),
        supabase.from("rooms").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId),
        supabase
          .from("appointments")
          .select("id,starts_at,status,procedure,patients(full_name,allergies),professionals(name,color)")
          .eq("clinic_id", clinicId)
          .gte("starts_at", now.toISOString())
          .in("status", ["scheduled", "confirmed"])
          .order("starts_at")
          .limit(6),
      ]);

      const firstError = apptsRes.error || patientsRes.error || profsRes.error || roomsRes.error || upcomingRes.error;
      if (firstError) {
        throw new Error(normalizeSupabaseError(firstError).message);
      }

      return {
        appts: apptsRes.data ?? [],
        newPatients: patientsRes.count ?? 0,
        profs: profsRes.data ?? [],
        roomsCount: roomsRes.count ?? 0,
        upcoming: upcomingRes.data ?? [],
      };
    },
  });

  if (!canViewDashboard || !canReadAppointments) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-extrabold text-navy">{clinicName}</h1>
        <p className="text-sm text-muted-foreground">{t("common.noPermission")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <span>{(error as Error).message}</span>
      </div>
    );
  }

  const allProfs = data?.profs ?? [];
  const rawAppts = data?.appts ?? [];
  const filteredAppts =
    profFilter === "all" ? rawAppts : rawAppts.filter((a) => a.professional_id === profFilter);

  const financialMetrics = calculateFinancialIndicators(
    filteredAppts,
    allProfs,
    periodStart,
    periodEnd,
    now,
  );

  const attendanceMetrics = calculateAttendanceIndicators(
    filteredAppts,
    data?.newPatients ?? 0,
    periodStart,
    periodEnd,
  );

  const revenueSeries = Array.from({ length: Math.min(daysCount, 90) }, (_, idx) => {
    const dayDate = new Date(periodStart);
    dayDate.setDate(periodStart.getDate() + idx);
    const dayKey = toSaoPauloDateKey(dayDate);

    let completedRevenue = 0;
    let projectedRevenue = 0;
    for (const appt of filteredAppts) {
      if (toSaoPauloDateKey(appt.starts_at) === dayKey) {
        const price = Math.max(0, Number(appt.price) || 0);
        if (appt.status === "completed") completedRevenue += price;
        else if (appt.status === "scheduled" || appt.status === "confirmed") projectedRevenue += price;
      }
    }

    return {
      dateLabel: dayDate.toLocaleDateString(dateLocale, { day: "2-digit", month: "2-digit" }),
      completedRevenue,
      projectedRevenue,
    };
  });

  const byProfessional = allProfs.map((p) => {
    const profAppts = rawAppts.filter((a) => {
      const dt = new Date(a.starts_at);
      return a.professional_id === p.id && dt >= periodStart && dt <= periodEnd;
    });
    return {
      name: p.name,
      completedCount: profAppts.filter((a) => a.status === "completed").length,
      scheduledCount: profAppts.filter((a) => a.status === "scheduled" || a.status === "confirmed").length,
    };
  });

  const adminAlerts = buildAdministrativeAlerts(
    {
      professionalsCount: allProfs.filter((p) => p.active !== false).length,
      roomsCount: data?.roomsCount ?? 0,
      unitsCount: units.length,
      appointments: filteredAppts,
      noShowRatePct: attendanceMetrics.noShowRatePct,
    },
    now,
  );

  const isEmptyPeriod = !isLoading && attendanceMetrics.totalAppointments === 0 && (data?.newPatients ?? 0) === 0;

  return (
    <div className="space-y-6">
      <DashboardFilterBar
        clinicName={clinicName}
        period={period}
        onPeriodChange={setPeriod}
        professionalId={profFilter}
        onProfessionalChange={setProfFilter}
        professionals={allProfs}
      />

      {isEmptyPeriod && (
        <EmptyDashboardState
          canManageSettings={hasPermission("settings.manage")}
          canWritePatients={hasPermission("patients.write")}
        />
      )}

      <FinancialKpiCards
        metrics={financialMetrics}
        canViewFinancial={canViewFinancial}
        dateLocale={dateLocale}
      />

      <AttendanceKpiCards metrics={attendanceMetrics} />

      <div className="grid gap-6 xl:grid-cols-3">
        {canViewFinancial && <RevenueTrendChart data={revenueSeries} dateLocale={dateLocale} />}
        <UpcomingAppointmentsCard items={data?.upcoming ?? []} dateLocale={dateLocale} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <ProfessionalsBarChart data={byProfessional} />
        <AppointmentStatusChart metrics={attendanceMetrics} />
      </div>

      <AdminAlertsCard alerts={adminAlerts} />
    </div>
  );
}
