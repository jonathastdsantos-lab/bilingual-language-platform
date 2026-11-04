import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ClinicRole = Database["public"]["Enums"]["clinic_role"];
export type Membership = { clinic_id: string; role: ClinicRole; clinics: { id: string; name: string } | null };

type Ctx = {
  userId: string;
  memberships: Membership[];
  clinicId: string;
  clinicName: string;
  role: ClinicRole;
  setClinicId: (id: string) => void;
  can: (roles: ClinicRole[]) => boolean;
};

const ClinicContext = createContext<Ctx | null>(null);

export const ROLES: ClinicRole[] = ["owner", "admin", "dentist", "receptionist", "assistant", "finance", "stock"];
export const PERM = {
  patientsRead: ["owner", "admin", "dentist", "receptionist", "assistant", "finance"] as ClinicRole[],
  patientsWrite: ["owner", "admin", "dentist", "receptionist"] as ClinicRole[],
  manage: ["owner", "admin"] as ClinicRole[],
};

export function useMemberships(userId: string | undefined) {
  return useQuery({
    queryKey: ["memberships", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_members")
        .select("clinic_id, role, clinics(id, name)")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as Membership[];
    },
  });
}

export function ClinicProvider({ userId, memberships, children }: { userId: string; memberships: Membership[]; children: ReactNode }) {
  const [clinicId, setId] = useState(memberships[0].clinic_id);
  const qc = useQueryClient();
  useEffect(() => {
    const saved = localStorage.getItem("sondapro.clinic");
    if (saved && memberships.some((m) => m.clinic_id === saved)) setId(saved);
  }, [memberships]);
  const current = memberships.find((m) => m.clinic_id === clinicId) ?? memberships[0];
  const setClinicId = (id: string) => {
    localStorage.setItem("sondapro.clinic", id);
    setId(id);
    qc.invalidateQueries();
  };
  return (
    <ClinicContext.Provider
      value={{
        userId,
        memberships,
        clinicId: current.clinic_id,
        clinicName: current.clinics?.name ?? "",
        role: current.role,
        setClinicId,
        can: (roles) => roles.includes(current.role),
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
