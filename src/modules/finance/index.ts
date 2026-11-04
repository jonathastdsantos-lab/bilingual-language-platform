import type { AttendanceIndicators, FinancialIndicators } from "@/types";
import { toSaoPauloDateKey } from "@/utils/timezone";

export interface RawAppointmentMetricRow {
  starts_at: string;
  status: string;
  price: number | string;
  professional_id: string;
}

export interface ProfessionalInfo {
  id: string;
  name: string;
  color: string;
  commission_pct?: number | string;
}

/**
 * Calcula os indicadores financeiros reais a partir das consultas do período.
 * Não utiliza dados fictícios: quando não há consultas, retorna zeros exatos.
 */
export function calculateFinancialIndicators(
  appointments: RawAppointmentMetricRow[],
  professionals: ProfessionalInfo[],
  periodStart: Date,
  periodEnd: Date,
  now: Date = new Date(),
): FinancialIndicators {
  const todayKey = toSaoPauloDateKey(now);
  const profCommissionMap = new Map<string, number>();
  for (const p of professionals) {
    profCommissionMap.set(p.id, Math.max(0, Math.min(100, Number(p.commission_pct) || 0)));
  }

  let revenueToday = 0;
  let revenuePeriod = 0;
  let projectedRevenuePeriod = 0;
  let estimatedCommissions = 0;
  let completedCount = 0;

  for (const appt of appointments) {
    const dt = new Date(appt.starts_at);
    const price = Math.max(0, Number(appt.price) || 0);
    const apptDateKey = toSaoPauloDateKey(appt.starts_at);

    if (appt.status === "completed" && apptDateKey === todayKey) {
      revenueToday += price;
    }

    if (dt >= periodStart && dt <= periodEnd) {
      if (appt.status === "completed") {
        revenuePeriod += price;
        completedCount += 1;
        const pct = profCommissionMap.get(appt.professional_id) ?? 0;
        estimatedCommissions += (price * pct) / 100;
      } else if (appt.status === "scheduled" || appt.status === "confirmed") {
        projectedRevenuePeriod += price;
      }
    }
  }

  const averageTicket = completedCount > 0 ? revenuePeriod / completedCount : 0;

  return {
    revenueToday,
    revenuePeriod,
    projectedRevenuePeriod,
    averageTicket,
    estimatedCommissions,
    completedCount,
  };
}

/**
 * Calcula os indicadores de atendimento reais no período selecionado.
 */
export function calculateAttendanceIndicators(
  appointments: RawAppointmentMetricRow[],
  newPatientsCount: number,
  periodStart: Date,
  periodEnd: Date,
): AttendanceIndicators {
  const inPeriod = appointments.filter((a) => {
    const dt = new Date(a.starts_at);
    return dt >= periodStart && dt <= periodEnd;
  });

  const scheduledCount = inPeriod.filter((a) => a.status === "scheduled").length;
  const confirmedCount = inPeriod.filter((a) => a.status === "confirmed").length;
  const completedCount = inPeriod.filter((a) => a.status === "completed").length;
  const cancelledCount = inPeriod.filter((a) => a.status === "cancelled").length;
  const noShowCount = inPeriod.filter((a) => a.status === "no_show").length;
  const totalAppointments = inPeriod.length;

  const nonCancelled = totalAppointments - cancelledCount;
  const completionRatePct = nonCancelled > 0 ? (completedCount / nonCancelled) * 100 : 0;
  const noShowRatePct = nonCancelled > 0 ? (noShowCount / nonCancelled) * 100 : 0;

  return {
    scheduledCount,
    confirmedCount,
    completedCount,
    cancelledCount,
    noShowCount,
    totalAppointments,
    completionRatePct,
    noShowRatePct,
    newPatientsCount,
  };
}

