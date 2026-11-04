import { z } from "zod";
import { assertClinicScope, normalizeSupabaseError, supabase } from "@/services/supabase";

export const appointmentFormSchema = z
  .object({
    patient_id: z.string().uuid("Selecione um paciente válido."),
    professional_id: z.string().uuid("Selecione um profissional válido."),
    room_id: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
    start: z.string().regex(/^\d{2}:\d{2}$/, "Horário inicial inválido."),
    end: z.string().regex(/^\d{2}:\d{2}$/, "Horário final inválido."),
    procedure: z.string().max(200).optional(),
    price: z.string().optional(),
    status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (data) => {
      const s = new Date(`${data.date}T${data.start}`);
      const e = new Date(`${data.date}T${data.end}`);
      return !Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && e > s;
    },
    { message: "O horário de término deve ser posterior ao horário de início." },
  );

export async function listClinicAppointmentsInRange(params: {
  clinicId: string;
  startIso: string;
  endIso: string;
  professionalId?: string;
}) {
  assertClinicScope(params.clinicId);
  let q = supabase
    .from("appointments")
    .select("*,patients(full_name,allergies),professionals(name,color)")
    .eq("clinic_id", params.clinicId)
    .gte("starts_at", params.startIso)
    .lt("starts_at", params.endIso)
    .order("starts_at");

  if (params.professionalId && params.professionalId !== "all") {
    q = q.eq("professional_id", params.professionalId);
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
  return data ?? [];
}

