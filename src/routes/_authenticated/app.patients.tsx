import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useClinic } from "@/lib/clinic";
import { useT, isValidCPF, formatBRL, type TKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Patient = Database["public"]["Tables"]["patients"]["Row"];

export const Route = createFileRoute("/_authenticated/app/patients")({
  validateSearch: (s: Record<string, unknown>): { q?: string | undefined } => ({
    q: typeof s["q"] === "string" ? s["q"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Pacientes — SondaPro" },
      { name: "description", content: "Cadastro de pacientes." },
      { property: "og:title", content: "Pacientes — SondaPro" },
      { property: "og:description", content: "Cadastro de pacientes." },
    ],
  }),
  component: Patients,
});

const empty = {
  full_name: "",
  cpf: "",
  birth_date: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  allergies: "",
  anamnesis: "",
  clinical_notes: "",
};

function Patients() {
  const { t, dateLocale } = useT();
  const { clinicId, hasPermission } = useClinic();
  const { q: initialQ } = Route.useSearch();
  const [q, setQ] = useState(initialQ ?? "");
  const [form, setForm] = useState<typeof empty & { id?: string }>(empty);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Patient | null>(null);
  const qc = useQueryClient();
  const canRead = hasPermission("patients.read");
  const canWrite = hasPermission("patients.write");

  const { data = [] } = useQuery({
    queryKey: ["patients", clinicId, q],
    enabled: canRead,
    queryFn: async () => {
      let qry = supabase.from("patients").select("*").eq("clinic_id", clinicId).order("full_name").limit(200);
      const s = q.trim().replace(/[%,()]/g, "");
      if (s) qry = qry.or(`full_name.ilike.%${s}%,cpf.ilike.%${s.replace(/\D/g, "") || s}%,phone.ilike.%${s}%`);
      const { data, error } = await qry;
      if (error) throw error;
      return data;
    },
  });

  const history = useQuery({
    queryKey: ["patientHistory", clinicId, view?.id],
    enabled: !!view && canRead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id,starts_at,status,procedure,price,professionals(name)")
        .eq("clinic_id", clinicId)
        .eq("patient_id", view!.id)
        .order("starts_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const schema = z.object({
        full_name: z.string().trim().min(2).max(150),
        email: z.string().trim().email().max(255).or(z.literal("")),
      });
      const p = schema.safeParse(form);
      if (!p.success) throw new Error(p.error.issues[0]?.message ?? t("common.error"));
      const cpf = form.cpf.replace(/\D/g, "");
      if (cpf && !isValidCPF(cpf)) throw new Error(t("pat.invalidCpf"));
      const row = {
        clinic_id: clinicId,
        full_name: form.full_name.trim(),
        cpf: cpf || null,
        birth_date: form.birth_date || null,
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        allergies: form.allergies.trim() || null,
        anamnesis: form.anamnesis.trim() || null,
        clinical_notes: form.clinical_notes.trim() || null,
      };
      const { error } = form.id
        ? await supabase.from("patients").update(row).eq("clinic_id", clinicId).eq("id", form.id)
        : await supabase.from("patients").insert(row);
      if (error) throw new Error(error.code === "23505" ? t("pat.dupCpf") : error.message);
    },
    onSuccess: () => {
      toast.success(t("common.saved"));
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function remove(id: string) {
    if (!confirm(t("common.delete") + "?")) return;
    const { error } = await supabase.from("patients").delete().eq("clinic_id", clinicId).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["patients"] });
  }

  if (!canRead) return <p className="text-muted-foreground">{t("common.noPermission")}</p>;

  const f = (k: keyof typeof empty, label: TKey, type = "text") => (
    <div className="space-y-1.5">
      <Label>{t(label)}</Label>
      <Input type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );
  const ta = (k: keyof typeof empty, label: TKey) => (
    <div className="space-y-1.5 sm:col-span-2">
      <Label>{t(label)}</Label>
      <Textarea rows={2} maxLength={2000} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold text-navy">{t("pat.title")}</h1>
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} className="w-56" />
          {canWrite && (
            <Button
              variant="hero"
              onClick={() => {
                setForm(empty);
                setOpen(true);
              }}
            >
              <Plus />
              {t("pat.new")}
            </Button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">{t("pat.name")}</th>
              <th className="p-3">{t("pat.cpf")}</th>
              <th className="p-3">{t("pat.phone")}</th>
              <th className="p-3">{t("pat.allergies")}</th>
              <th className="p-3 text-right">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {t("common.none")}
                </td>
              </tr>
            )}
            {data.map((p) => (
              <tr key={p.id} className="cursor-pointer border-t hover:bg-muted/50" onClick={() => setView(p)}>
                <td className="p-3 font-medium">{p.full_name}</td>
                <td className="p-3">{p.cpf ? p.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "—"}</td>
                <td className="p-3">{p.phone ?? "—"}</td>
                <td className="p-3">
                  {p.allergies ? (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">{p.allergies}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                  {canWrite && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setForm({
                            ...empty,
                            ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ""])),
                            id: p.id,
                          } as typeof form);
                          setOpen(true);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p.id)}>
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? t("common.edit") : t("pat.new")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="sm:col-span-2">{f("full_name", "pat.name")}</div>
            {f("cpf", "pat.cpf")}
            {f("birth_date", "pat.birth", "date")}
            {f("phone", "pat.phone")}
            {f("whatsapp", "pat.whatsapp")}
            {f("email", "pat.email", "email")}
            {f("address", "pat.address")}
            {ta("allergies", "pat.allergies")}
            {ta("anamnesis", "pat.anamnesis")}
            {ta("clinical_notes", "pat.notes")}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="hero" disabled={save.isPending}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {view && (
            <>
              <SheetHeader>
                <SheetTitle className="text-2xl">{view.full_name}</SheetTitle>
              </SheetHeader>
              <dl className="mt-4 grid grid-cols-2 gap-3 px-4 text-sm">
                {(
                  [
                    ["pat.cpf", view.cpf],
                    ["pat.birth", view.birth_date && new Date(view.birth_date + "T00:00").toLocaleDateString(dateLocale)],
                    ["pat.phone", view.phone],
                    ["pat.whatsapp", view.whatsapp],
                    ["pat.email", view.email],
                    ["pat.address", view.address],
                  ] as [TKey, string | null][]
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{t(k)}</dt>
                    <dd className="font-medium">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
              {(
                [
                  ["pat.allergies", view.allergies],
                  ["pat.anamnesis", view.anamnesis],
                  ["pat.notes", view.clinical_notes],
                ] as [TKey, string | null][]
              ).map(([k, v]) => (
                <div key={k} className="mx-4 mt-4 rounded-xl bg-muted p-3 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">{t(k)}</p>
                  <p className="mt-1 whitespace-pre-wrap">{v || "—"}</p>
                </div>
              ))}
              <h3 className="mx-4 mt-6 font-semibold">{t("pat.history")}</h3>
              <ul className="mx-4 mt-2 space-y-2 pb-6 text-sm">
                {(history.data ?? []).length === 0 && <li className="text-muted-foreground">{t("common.none")}</li>}
                {(history.data ?? []).map((h) => (
                  <li key={h.id} className="flex justify-between rounded-lg border p-2">
                    <span>
                      {new Date(h.starts_at).toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" })} ·{" "}
                      {h.procedure ?? "—"}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {h.professionals?.name} · {t(`status.${h.status}` as TKey)}
                      </span>
                    </span>
                    <span className="font-medium">{formatBRL(Number(h.price), dateLocale)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
