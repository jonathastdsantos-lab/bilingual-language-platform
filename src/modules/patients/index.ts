import { z } from "zod";
import { assertClinicScope, normalizeSupabaseError, supabase } from "@/services/supabase";
import { isValidCPF } from "@/utils/validators";

export const patientFormSchema = z.object({
  full_name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres.").max(150),
  cpf: z
    .string()
    .trim()
    .optional()
    .refine((val) => !val || val.replace(/\D/g, "").length === 0 || isValidCPF(val), {
      message: "CPF inválido.",
    }),
  email: z.string().trim().email("E-mail inválido.").max(255).or(z.literal("")).optional(),
  birth_date: z.string().optional(),
  phone: z.string().trim().max(40).optional(),
  whatsapp: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  allergies: z.string().trim().max(2000).optional(),
  anamnesis: z.string().trim().max(2000).optional(),
  clinical_notes: z.string().trim().max(2000).optional(),
});

export async function listClinicPatients(clinicId: string, searchQuery = "") {
  assertClinicScope(clinicId);
  let qry = supabase.from("patients").select("*").eq("clinic_id", clinicId).order("full_name").limit(200);
  const s = searchQuery.trim().replace(/[%,()]/g, "");
  if (s) {
    qry = qry.or(`full_name.ilike.%${s}%,cpf.ilike.%${s.replace(/\D/g, "") || s}%,phone.ilike.%${s}%`);
  }
  const { data, error } = await qry;
  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
  return data ?? [];
}

