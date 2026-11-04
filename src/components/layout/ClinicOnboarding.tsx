import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/services/supabase";
import { useT } from "@/lib/i18n";
import { Logo } from "@/components/Logo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClinicOnboarding({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (n.length < 2 || n.length > 120) return;
    setBusy(true);
    const { error } = await supabase.rpc("create_clinic", { _name: n });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onDone();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-soft p-6">
      <form onSubmit={create} className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-8 shadow-card">
        <div className="flex items-center justify-between">
          <Logo />
          <LanguageToggle />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-navy">{t("onb.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("onb.sub")}</p>
        </div>
        <div className="space-y-1.5">
          <Label>{t("onb.name")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
        </div>
        <Button variant="hero" className="h-11 w-full" disabled={busy}>
          {t("onb.create")}
        </Button>
      </form>
    </div>
  );
}

