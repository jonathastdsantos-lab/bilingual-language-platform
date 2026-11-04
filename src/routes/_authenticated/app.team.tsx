import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SlidersHorizontal, Trash2 } from "lucide-react";
import { supabase, normalizeSupabaseError } from "@/services/supabase";
import { fetchClinicMemberPermissions } from "@/modules/permissions";
import { useClinic, ROLES, type ClinicRole } from "@/lib/clinic";
import { useT, type TKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MemberPermissionsDialog } from "@/components/forms/MemberPermissionsDialog";
import { AuditLogsTable } from "@/components/tables/AuditLogsTable";

export const Route = createFileRoute("/_authenticated/app/team")({
  head: () => ({
    meta: [
      { title: "Equipe — SondaPro" },
      { name: "description", content: "Equipe, perfis de acesso, permissões individuais e auditoria." },
      { property: "og:title", content: "Equipe — SondaPro" },
      { property: "og:description", content: "Equipe, perfis de acesso, permissões individuais e auditoria." },
    ],
  }),
  component: Team,
});

function Team() {
  const { t, dateLocale } = useT();
  const { clinicId, hasPermission, userId } = useClinic();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ClinicRole>("receptionist");
  const [selectedMember, setSelectedMember] = useState<{
    id: string;
    display_name: string | null;
    email: string | null;
    role: ClinicRole;
  } | null>(null);

  const canManageTeam = hasPermission("team.manage");
  const canViewAudit = hasPermission("audit.view");

  const { data: members = [] } = useQuery({
    queryKey: ["members", clinicId],
    enabled: canManageTeam,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_members")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("created_at");
      if (error) throw new Error(normalizeSupabaseError(error).message);
      return data ?? [];
    },
  });

  const { data: permOverrides = [] } = useQuery({
    queryKey: ["clinicMemberPermissions", clinicId],
    enabled: canManageTeam,
    queryFn: () => fetchClinicMemberPermissions(clinicId),
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["audit", clinicId],
    enabled: canViewAudit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw new Error(normalizeSupabaseError(error).message);
      return data ?? [];
    },
  });

  if (!canManageTeam) {
    return <p className="text-muted-foreground">{t("common.noPermission")}</p>;
  }

  const nameOf = (uid: string | null) =>
    members.find((m) => m.user_id === uid)?.display_name ??
    members.find((m) => m.user_id === uid)?.email ??
    "—";

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc("add_clinic_member", {
      _clinic: clinicId,
      _email: email.trim().slice(0, 255),
      _role: role,
    });
    if (error) {
      toast.error(
        error.message.includes("user_not_found")
          ? t("team.notFound")
          : error.code === "23505"
            ? t("team.exists")
            : error.message,
      );
      return;
    }
    toast.success(t("common.saved"));
    setEmail("");
    qc.invalidateQueries({ queryKey: ["members", clinicId] });
  }

  async function changeRole(id: string, r: ClinicRole) {
    const { error } = await supabase.from("clinic_members").update({ role: r }).eq("clinic_id", clinicId).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("common.saved"));
    qc.invalidateQueries({ queryKey: ["members", clinicId] });
  }

  async function remove(id: string) {
    if (!confirm(t("common.delete") + "?")) return;
    const { error } = await supabase.from("clinic_members").delete().eq("clinic_id", clinicId).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["members", clinicId] });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-navy">{t("team.title")}</h1>

      <form onSubmit={add} className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-5 shadow-card">
        <div className="min-w-60 flex-1 space-y-1.5">
          <Label>{t("team.email")}</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>{t("team.role")}</Label>
          <Select value={role} onValueChange={(v) => setRole(v as ClinicRole)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.filter((r) => r !== "owner").map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`role.${r}` as TKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="hero">{t("team.add")}</Button>
        <p className="w-full text-xs text-muted-foreground">{t("team.hint")}</p>
      </form>

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <tbody>
            {members.map((m) => {
              const memberCustomCount = permOverrides.filter((o) => o.member_id === m.id).length;
              return (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="p-3">
                    <p className="font-medium text-navy">{m.display_name ?? m.email}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </td>
                  <td className="p-3">
                    {m.role === "owner" || m.user_id === userId ? (
                      <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                        {t(`role.${m.role}` as TKey)}
                      </span>
                    ) : (
                      <Select value={m.role} onValueChange={(v) => changeRole(m.id, v as ClinicRole)}>
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.filter((r) => r !== "owner").map((r) => (
                            <SelectItem key={r} value={r}>
                              {t(`role.${r}` as TKey)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {m.role !== "owner" && (
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedMember(m)}
                          className="h-8 gap-1.5 text-xs"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          <span>{t("team.permissions")}</span>
                          {memberCustomCount > 0 && (
                            <span className="rounded-full bg-primary px-1.5 py-0.2 text-[10px] text-primary-foreground">
                              {memberCustomCount}
                            </span>
                          )}
                        </Button>
                        {m.user_id !== userId && (
                          <Button variant="ghost" size="icon" onClick={() => remove(m.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canViewAudit && <AuditLogsTable logs={logs} resolveUserName={nameOf} dateLocale={dateLocale} />}

      <MemberPermissionsDialog
        open={!!selectedMember}
        onOpenChange={(o) => !o && setSelectedMember(null)}
        clinicId={clinicId}
        member={selectedMember}
        overrides={permOverrides}
      />
    </div>
  );
}
