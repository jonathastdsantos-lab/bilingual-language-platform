import { assertClinicScope, normalizeSupabaseError, supabase } from "@/services/supabase";
import type { ClinicUnit } from "@/types";
import { isValidCNPJ } from "@/utils/validators";

/**
 * Lista as unidades (Matriz e Filiais) da clínica ativa.
 */
export async function fetchClinicUnits(clinicId: string): Promise<ClinicUnit[]> {
  assertClinicScope(clinicId);
  const client = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts?: { ascending?: boolean }) => Promise<{ data: ClinicUnit[] | null; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await client
    .from("clinic_units")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("is_main", { ascending: false });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) {
      return [];
    }
    throw new Error(norm.message);
  }

  return data ?? [];
}

/**
 * Cria uma nova unidade (Matriz ou Filial) vinculada à clínica ativa.
 */
export async function createClinicUnit(input: {
  clinicId: string;
  name: string;
  cnpj?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  isMain?: boolean;
}): Promise<void> {
  assertClinicScope(input.clinicId);
  const trimmedName = input.name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 120) {
    throw new Error("O nome da unidade deve ter entre 2 e 120 caracteres.");
  }

  const cleanCnpj = input.cnpj ? input.cnpj.replace(/\D/g, "") : "";
  if (cleanCnpj && !isValidCNPJ(cleanCnpj)) {
    throw new Error("CNPJ inválido.");
  }

  const client = supabase as unknown as {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };

  const { error } = await client.from("clinic_units").insert({
    clinic_id: input.clinicId,
    name: trimmedName,
    cnpj: cleanCnpj || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim().toUpperCase().slice(0, 2) || null,
    is_main: Boolean(input.isMain),
    active: true,
  });

  if (error) {
    const norm = normalizeSupabaseError(error);
    throw new Error(norm.message);
  }
}

/**
 * Exclui uma unidade da clínica ativa (respeitando escopo multi-tenant).
 */
export async function deleteClinicUnit(clinicId: string, unitId: string): Promise<void> {
  assertClinicScope(clinicId);
  const client = supabase as unknown as {
    from: (table: string) => {
      delete: () => {
        eq: (c1: string, v1: string) => {
          eq: (c2: string, v2: string) => Promise<{ error: unknown }>;
        };
      };
    };
  };

  const { error } = await client
    .from("clinic_units")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("id", unitId);

  if (error) {
    const norm = normalizeSupabaseError(error);
    throw new Error(norm.message);
  }
}

