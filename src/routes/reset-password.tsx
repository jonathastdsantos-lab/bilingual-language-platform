import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — SondaPro" },
      { name: "description", content: "Defina uma nova senha para sua conta SondaPro." },
      { property: "og:title", content: "Redefinir senha — SondaPro" },
      { property: "og:description", content: "Defina uma nova senha." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reset,
});

function Reset() {
  const { t } = useT();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("common.saved"));
    navigate({ to: "/app" });
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-soft p-6">
      <form onSubmit={save} className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-8 shadow-card">
        <Logo />
        <div className="space-y-1.5">
          <Label>{t("auth.newPassword")}</Label>
          <Input type="password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} required />
        </div>
        <Button variant="hero" className="w-full">
          {t("auth.save")}
        </Button>
      </form>
    </div>
  );
}
