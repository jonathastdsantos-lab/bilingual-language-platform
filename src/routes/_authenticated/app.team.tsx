import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinic, PERM, ROLES, type ClinicRole } from "@/lib/clinic";
import { useT, type TKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/team")({
  head: () => ({ meta: [{ title: "Equipe — SondaPro" }, { name: "description", content: "Equipe e permissões." }, { property: "og:title", content: "Equipe — SondaPro" }, { property: "og:description", content: "Equipe e permissões." }] }),
  component: Team,
});

function Team() {
  const { t, dateLocale } = useT();
  const { clinicId, can, userId } = useClinic();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ClinicRole>("receptionist");

  const { data: members = [] } = useQuery({
    queryKey: ["members", clinicId],
    queryFn: async () => (await supabase.from("clinic_members").select("*").eq("clinic_id", clinicId).order("created_at")).data ?? [],
  });
  const { data: logs = [] } = useQuery({
    queryKey: ["audit", clinicId],
    queryFn: async () => (await supabase.from("audit_logs").select("*").eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(50)).data ?? [],
  });

  if (!can(PERM.manage)) return <p className="text-muted-foreground">{t("common.noPermission")}</p>;
  const nameOf = (uid: string | null) => members.find((m) => m.user_id === uid)?.display_name ?? members.find((m) => m.user_id === uid)?.email ?? "—";

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc("add_clinic_member", { _clinic: clinicId, _email: email.trim().slice(0, 255), _role: role });
    if (error) return toast.error(error.message.includes("user_not_found") ? t("team.notFound") : error.code === "23505" ? t("team.exists") : error.message);
    toast.success(t("common.saved")); setEmail(""); qc.invalidateQueries({ queryKey: ["members"] });
  }
  async function changeRole(id: string, r: ClinicRole) {
    const { error } = await supabase.from("clinic_members").update({ role: r }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["members"] });
  }
  async function remove(id: string) {
    if (!confirm(t("common.delete") + "?")) return;
    const { error } = await supabase.from("clinic_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["members"] });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-navy">{t("team.title")}</h1>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-5 shadow-card">
        <div className="min-w-60 flex-1 space-y-1.5"><Label>{t("team.email")}</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="space-y-1.5"><Label>{t("team.role")}</Label>
          <Select value={role} onValueChange={(v) => setRole(v as ClinicRole)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.filter((r) => r !== "owner").map((r) => <SelectItem key={r} value={r}>{t(`role.${r}` as TKey)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button variant="hero">{t("team.add")}</Button>
        <p className="w-full text-xs text-muted-foreground">{t("team.hint")}</p>
      </form>
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="p-3"><p className="font-medium">{m.display_name ?? m.email}</p><p className="text-xs text-muted-foreground">{m.email}</p></td>
                <td className="p-3">
                  {m.role === "owner" || m.user_id === userId ? (
                    <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">{t(`role.${m.role}` as TKey)}</span>
                  ) : (
                    <Select value={m.role} onValueChange={(v) => changeRole(m.id, v as ClinicRole)}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLES.filter((r) => r !== "owner").map((r) => <SelectItem key={r} value={r}>{t(`role.${r}` as TKey)}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </td>
                <td className="p-3 text-right">{m.role !== "owner" && m.user_id !== userId && <Button variant="ghost" size="icon" onClick={() => remove(m.id)}><Trash2 /></Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <h3 className="font-semibold">{t("team.audit")}</h3>
        <ul className="mt-3 divide-y text-sm">
          {logs.length === 0 && <li className="py-2 text-muted-foreground">{t("common.none")}</li>}
          {logs.map((l) => (
            <li key={l.id} className="flex justify-between gap-3 py-2">
              <span><b>{nameOf(l.user_id)}</b> · {l.action} · {l.entity}</span>
              <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString(dateLocale)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
