import { z } from "zod";
import { supabase } from "@/services/supabase";

export const authCredentialsSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido.").max(255),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres.").max(72),
  name: z.string().trim().max(100).optional(),
});

export async function getAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

