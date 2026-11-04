import type { AdministrativeAlert } from "@/types";
import { toSaoPauloDateKey } from "@/utils/timezone";

export interface AlertInputData {
  professionalsCount: number;
  roomsCount: number;
  unitsCount: number;
  appointments: Array<{
    id: string;
    starts_at: string;
    status: string;
    patients?: { full_name?: string | null; allergies?: string | null } | null;
  }>;
  noShowRatePct: number;
}

/**
 * Gera alertas administrativos reais a partir dos dados efetivos do banco de dados.
 * Não fabrica alertas fictícios: cada alerta reflete uma condição real da clínica.
 */
export function buildAdministrativeAlerts(input: AlertInputData, now: Date = new Date()): AdministrativeAlert[] {
  const alerts: AdministrativeAlert[] = [];
  const todayKey = toSaoPauloDateKey(now);

  if (input.professionalsCount === 0) {
    alerts.push({
      id: "no-professionals",
      severity: "warning",
      titleKey: "alert.noProfessionals.title",
      descriptionKey: "alert.noProfessionals.desc",
      actionRoute: "/app/settings",
      actionLabelKey: "alert.action.configure",
    });
  }

  if (input.roomsCount === 0) {
    alerts.push({
      id: "no-rooms",
      severity: "info",
      titleKey: "alert.noRooms.title",
      descriptionKey: "alert.noRooms.desc",
      actionRoute: "/app/settings",
      actionLabelKey: "alert.action.configure",
    });
  }

  const unconfirmedToday = input.appointments.filter(
    (a) => a.status === "scheduled" && toSaoPauloDateKey(a.starts_at) === todayKey,
  );
  if (unconfirmedToday.length > 0) {
    alerts.push({
      id: "unconfirmed-today",
      severity: "warning",
      titleKey: "alert.unconfirmedToday.title",
      descriptionKey: "alert.unconfirmedToday.desc",
      count: unconfirmedToday.length,
      actionRoute: "/app/agenda",
      actionLabelKey: "alert.action.openAgenda",
    });
  }

  if (input.noShowRatePct >= 15 && input.appointments.length >= 3) {
    alerts.push({
      id: "high-no-show",
      severity: "critical",
      titleKey: "alert.highNoShow.title",
      descriptionKey: "alert.highNoShow.desc",
      count: Math.round(input.noShowRatePct),
      actionRoute: "/app/agenda",
      actionLabelKey: "alert.action.openAgenda",
    });
  }

  const upcomingWithAllergies = input.appointments.filter(
    (a) =>
      (a.status === "scheduled" || a.status === "confirmed") &&
      new Date(a.starts_at) >= now &&
      Boolean(a.patients?.allergies && a.patients.allergies.trim().length > 0),
  );
  if (upcomingWithAllergies.length > 0) {
    alerts.push({
      id: "allergy-attention",
      severity: "critical",
      titleKey: "alert.allergyAttention.title",
      descriptionKey: "alert.allergyAttention.desc",
      count: upcomingWithAllergies.length,
      actionRoute: "/app/patients",
      actionLabelKey: "alert.action.viewPatients",
    });
  }

  return alerts;
}

