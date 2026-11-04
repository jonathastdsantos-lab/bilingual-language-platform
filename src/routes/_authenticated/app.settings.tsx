import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase, normalizeSupabaseError } from "@/services/supabase";
import { useClinic } from "@/lib/clinic";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ClinicUnitForm } from "@/components/forms/ClinicUnitForm";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({
    meta: [
      { title: "Configurações — SondaPro" },
      { name: "description", content: "Configurações da clínica, unidades, profissionais e consultórios." },
      { property: "og:title", content: "Configurações — SondaPro" },
      { property: "og:description", content: "Configurações da clínica, unidades, profissionais e consultórios." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useT();
  const { clinicId, clinicName, hasPermission, units } = useClinic();
  const qc = useQueryClient();
  const [name, setName] = useState(clinicName);
  const [prof, setProf] = useState({ name: "", specialty: "", color: "#1e6bff", commission_pct: "0" });
  const [room, setRoom] = useState("");

  const canManageSettings = hasPermission("settings.manage");
  const canManageUnits = hasPermission("units.manage");

  const { data } = useQuery({
    queryKey: ["settings", clinicId],
    enabled: canManageSettings,
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("professionals").select("*").eq("clinic_id", clinicId).order("name"),
        supabase.from("rooms").select("*").eq("clinic_id", clinicId).order("name"),
      ]);
      const firstErr = p.error || r.error;
      if (firstErr) throw new Error(normalizeSupabaseError(firstErr).message);
      return { profs: p.data ?? [], rooms: r.data ?? [] };
    },
  });

  if (!canManageSettings) {
    return <p className="text-muted-foreground">{t("common.noPermission")}</p>;
  }

  const done = (error: { message: string } | null) => {
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("common.saved"));
    qc.invalidateQueries();
  };

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-3xl font-extrabold text-navy">{t("set.title")}</h1>

      <section className="rounded-2xl border bg-card p-5 shadow-card">
        <h3 className="font-semibold text-navy">{t("set.clinic")}</h3>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (name.trim().length < 2) return;
            done(
              (
                await supabase
                  .from("clinics")
                  .update({ name: name.trim().slice(0, 120) })
                  .eq("id", clinicId)
              ).error,
            );
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
          <Button variant="hero">{t("common.save")}</Button>
        </form>
        <div className="mt-4 flex items-center gap-3 text-sm">
          <span>{t("set.language")}</span>
          <LanguageToggle />
        </div>
      </section>

      {canManageUnits && <ClinicUnitForm clinicId={clinicId} units={units} />}

      <section className="rounded-2xl border bg-card p-5 shadow-card">
        <h3 className="font-semibold text-navy">{t("set.professionals")}</h3>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[2fr_2fr_80px_110px_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!prof.name.trim()) return;
            const { error } = await supabase.from("professionals").insert({
              clinic_id: clinicId,
              name: prof.name.trim().slice(0, 120),
              specialty: prof.specialty.trim().slice(0, 120) || null,
              color: prof.color,
              commission_pct: Math.min(100, Math.max(0, Number(prof.commission_pct) || 0)),
            });
            if (!error) setProf({ name: "", specialty: "", color: "#1e6bff", commission_pct: "0" });
            done(error);
          }}
        >
          <div className="space-y-1.5">
            <Label>{t("set.profName")}</Label>
            <Input value={prof.name} onChange={(e) => setProf({ ...prof, name: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t("set.specialty")}</Label>
            <Input value={prof.specialty} onChange={(e) => setProf({ ...prof, specialty: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("set.color")}</Label>
            <Input type="color" className="p-1" value={prof.color} onChange={(e) => setProf({ ...prof, color: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("set.commission")}</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={prof.commission_pct}
              onChange={(e) => setProf({ ...prof, commission_pct: e.target.value })}
            />
          </div>
          <Button variant="hero">{t("common.add")}</Button>
        </form>
        <ul className="mt-4 divide-y text-sm">
          {(data?.profs ?? []).length === 0 && <li className="py-2 text-muted-foreground">{t("common.none")}</li>}
          {data?.profs.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <span className="h-4 w-4 rounded-full" style={{ background: p.color }} />
              <span className="flex-1">
                <b>{p.name}</b>{" "}
                {p.specialty && <span className="text-muted-foreground">· {p.specialty}</span>}{" "}
                <span className="text-muted-foreground">· {p.commission_pct}%</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () =>
                  confirm(t("common.delete") + "?") &&
                  done((await supabase.from("professionals").delete().eq("clinic_id", clinicId).eq("id", p.id)).error)
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-card">
        <h3 className="font-semibold text-navy">{t("set.rooms")}</h3>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!room.trim()) return;
            const { error } = await supabase.from("rooms").insert({
              clinic_id: clinicId,
              name: room.trim().slice(0, 80),
            });
            if (!error) setRoom("");
            done(error);
          }}
        >
          <Input placeholder={t("set.roomName")} value={room} onChange={(e) => setRoom(e.target.value)} />
          <Button variant="hero">{t("common.add")}</Button>
        </form>
        <ul className="mt-4 divide-y text-sm">
          {(data?.rooms ?? []).length === 0 && <li className="py-2 text-muted-foreground">{t("common.none")}</li>}
          {data?.rooms.map((r) => (
            <li key={r.id} className="flex items-center py-2">
              <span className="flex-1 font-medium text-navy">{r.name}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () =>
                  confirm(t("common.delete") + "?") &&
                  done((await supabase.from("rooms").delete().eq("clinic_id", clinicId).eq("id", r.id)).error)
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
