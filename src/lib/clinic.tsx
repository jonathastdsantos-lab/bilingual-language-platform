import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { fetchClinicUnits } from "@/modules/clinics";
import { evaluateMemberPermission, fetchClinicMemberPermissions } from "@/modules/permissions";
import type { ClinicUnit, PermissionKey } from "@/types";

export type ClinicRole = Database["public"]["Enums"]["clinic_role"];
export type Membership = {
  id: string;
  clinic_id: string;
  role: ClinicRole;
  clinics: { id: string; name: string } | null;
};

type Ctx = {
  userId: string;
  memberId: string;
  memberships: Membership[];
  clinicId: string;
  clinicName: string;
  role: ClinicRole;
  units: ClinicUnit[];
  activeUnitId: string;
  setActiveUnitId: (id: string) => void;
  setClinicId: (id: string) => void;
  can: (roles: ClinicRole[]) => boolean;
  hasPermission: (perm: PermissionKey) => boolean;
};

const ClinicContext = createContext<Ctx | null>(null);

export const ROLES: ClinicRole[] = ["owner", "admin", "dentist", "receptionist", "assistant", "finance", "stock"];
export const PERM = {
  patientsRead: ["owner", "admin", "dentist", "receptionist", "assistant", "finance"] as ClinicRole[],
  patientsWrite: ["owner", "admin", "dentist", "receptionist"] as ClinicRole[],
  financialView: ["owner", "admin", "dentist", "finance"] as ClinicRole[],
  manage: ["owner", "admin"] as ClinicRole[],
};

export function useMemberships(userId: string | undefined) {
  return useQuery({
    queryKey: ["memberships", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_members")
        .select("id, clinic_id, role, clinics(id, name)")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as Membership[];
    },
  });
}

export function ClinicProvider({
  userId,
  memberships,
  children,
}: {
  userId: string;
  memberships: Membership[];
  children: ReactNode;
}) {
  const firstMembership = memberships[0]!;
  const [clinicId, setId] = useState(firstMembership.clinic_id);
  const [activeUnitId, setActiveUnitId] = useState<string>("all");
  const qc = useQueryClient();

  useEffect(() => {
    const saved = localStorage.getItem("sondapro.clinic");
    if (saved && memberships.some((m) => m.clinic_id === saved)) setId(saved);
  }, [memberships]);

  const current = memberships.find((m) => m.clinic_id === clinicId) ?? firstMembership;

  const { data: units = [] } = useQuery({
    queryKey: ["clinicUnits", current.clinic_id],
    queryFn: () => fetchClinicUnits(current.clinic_id),
  });

  const { data: allPermissions = [] } = useQuery({
    queryKey: ["clinicMemberPermissions", current.clinic_id],
    queryFn: () => fetchClinicMemberPermissions(current.clinic_id),
  });

  const myOverrides = allPermissions.filter((p) => p.member_id === current.id);

  const setClinicId = (id: string) => {
    localStorage.setItem("sondapro.clinic", id);
    setId(id);
    setActiveUnitId("all");
    qc.invalidateQueries();
  };

  return (
    <ClinicContext.Provider
      value={{
        userId,
        memberId: current.id,
        memberships,
        clinicId: current.clinic_id,
        clinicName: current.clinics?.name ?? "",
        role: current.role,
        units,
        activeUnitId,
        setActiveUnitId,
        setClinicId,
        can: (roles) => roles.includes(current.role),
        hasPermission: (perm) => evaluateMemberPermission(current.role, perm, myOverrides),
      }}
    >
      {children}
    </ClinicContext.Provider>
  );
}

export function useClinic() {
  const c = useContext(ClinicContext);
  if (!c) throw new Error("useClinic outside ClinicProvider");
  return c;
}
