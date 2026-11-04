import { assertClinicScope, normalizeSupabaseError, supabase } from "@/services/supabase";
import type { ClinicMemberPermission, ClinicRole, PermissionKey } from "@/types";

export const ALL_ROLES: ClinicRole[] = [
  "owner",
  "admin",
  "dentist",
  "receptionist",
  "assistant",
  "finance",
  "stock",
];

export const PERMISSION_DEFAULT_ROLES: Record<PermissionKey, ClinicRole[]> = {
  "dashboard.view": ["owner", "admin", "dentist", "receptionist", "assistant", "finance", "stock"],
  "financial.view": ["owner", "admin", "dentist", "finance"],
  "financial.write": ["owner", "admin", "finance", "receptionist"],
  "patients.read": ["owner", "admin", "dentist", "receptionist", "assistant", "finance"],
  "patients.write": ["owner", "admin", "dentist", "receptionist"],
  "records.read": ["owner", "admin", "dentist", "assistant"],
  "records.write": ["owner", "admin", "dentist"],
  "appointments.read": ["owner", "admin", "dentist", "receptionist", "assistant", "finance"],
  "appointments.write": ["owner", "admin", "dentist", "receptionist"],
  "stock.read": ["owner", "admin", "dentist", "assistant", "stock", "receptionist"],
  "stock.write": ["owner", "admin", "stock", "assistant"],
  "reports.view": ["owner", "admin", "finance", "dentist"],
  "whatsapp.manage": ["owner", "admin", "receptionist", "dentist", "assistant"],
  "team.manage": ["owner", "admin"],
  "settings.manage": ["owner", "admin"],
  "units.manage": ["owner", "admin"],
  "audit.view": ["owner", "admin"],
};

export const ALL_PERMISSIONS: PermissionKey[] = Object.keys(PERMISSION_DEFAULT_ROLES) as PermissionKey[];

/**
 * Avalia se um membro possui uma permissão específica considerando:
 * 1. Proprietário (owner) tem acesso irrestrito à sua clínica.
 * 2. Permissão individual explícita (concessão ou revogação) sobrepõe o perfil.
 * 3. Caso contrário, aplica a matriz padrão do perfil (RBAC).
 */
export function evaluateMemberPermission(
  role: ClinicRole,
  permission: PermissionKey,
  memberOverrides: Pick<ClinicMemberPermission, "permission" | "granted">[] = [],
): boolean {
  if (role === "owner") return true;
  const override = memberOverrides.find((o) => o.permission === permission);
  if (override !== undefined) {
    return override.granted;
  }
  const allowedRoles = PERMISSION_DEFAULT_ROLES[permission] ?? [];
  return allowedRoles.includes(role);
}

/**
 * Busca todas as permissões individuais customizadas de uma clínica.
 */
export async function fetchClinicMemberPermissions(clinicId: string): Promise<ClinicMemberPermission[]> {
  assertClinicScope(clinicId);
  const { data, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{ data: ClinicMemberPermission[] | null; error: unknown }>;
      };
    };
  })
    .from("clinic_member_permissions")
    .select("*")
    .eq("clinic_id", clinicId);

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }
  return data ?? [];
}

/**
 * Define, atualiza ou remove (quando granted === null) uma permissão individual para um membro da clínica.
 */
export async function setMemberPermissionOverride(params: {
  clinicId: string;
  memberId: string;
  permission: PermissionKey;
  granted: boolean | null;
  updatedBy?: string;
}): Promise<void> {
  assertClinicScope(params.clinicId);
  if (params.granted === null) {
    await removeMemberPermissionOverride({
      clinicId: params.clinicId,
      memberId: params.memberId,
      permission: params.permission,
    });
    return;
  }

  const { error } = await (supabase as unknown as {
    from: (table: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string },
      ) => Promise<{ error: unknown }>;
    };
  })
    .from("clinic_member_permissions")
    .upsert(
      {
        clinic_id: params.clinicId,
        member_id: params.memberId,
        permission: params.permission,
        granted: params.granted,
        updated_at: new Date().toISOString(),
        updated_by: params.updatedBy ?? null,
      },
      { onConflict: "member_id,permission" },
    );

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

/**
 * Remove uma customização individual para que o membro volte ao padrão do seu perfil.
 */
export async function removeMemberPermissionOverride(params: {
  clinicId: string;
  memberId: string;
  permission: PermissionKey;
}): Promise<void> {
  assertClinicScope(params.clinicId);
  const { error } = await (supabase as unknown as {
    from: (table: string) => {
      delete: () => {
        eq: (c1: string, v1: string) => {
          eq: (c2: string, v2: string) => {
            eq: (c3: string, v3: string) => Promise<{ error: unknown }>;
          };
        };
      };
    };
  })
    .from("clinic_member_permissions")
    .delete()
    .eq("clinic_id", params.clinicId)
    .eq("member_id", params.memberId)
    .eq("permission", params.permission);

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}
