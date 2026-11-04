import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — SondaPro" },
      { name: "description", content: "Acesse sua conta SondaPro." },
      { property: "og:title", content: "Entrar — SondaPro" },
      { property: "og:description", content: "Acesse sua conta SondaPro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(72),
  name: z.string().trim().max(100).optional(),
});

function AuthPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/app", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === "SIGNED_IN" && s) navigate({ to: "/app", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success(t("auth.resetSent"));
        return;
      }
      const parsed = schema.safeParse({ email, password, name: mode === "up" ? name : undefined });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0].message);
        return;
      }
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: window.location.origin + "/app", data: { full_name: parsed.data.name } },
        });
        if (error) throw error;
        if (!data.session) toast.success(t("auth.checkEmail"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(r.error.message);
  }

  return (
    <div className="flex min-h-screen bg-soft">
      <div className="hidden flex-1 flex-col justify-between bg-brand p-12 lg:flex">
        <Logo light />
        <div>
          <h2 className="text-4xl font-extrabold text-primary-foreground">{t("brand.tagline")}</h2>
        </div>
        <span />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <Link to="/" className="lg:hidden"><Logo /></Link>
            <span className="hidden lg:block" />
            <LanguageToggle />
          </div>
          <h1 className="text-3xl font-extrabold text-navy">
            {mode === "up" ? t("auth.signup") : mode === "forgot" ? t("auth.forgot") : t("auth.welcome")}
          </h1>
          {mode !== "forgot" && (
            <>
              <Button variant="outline" className="mt-6 w-full" onClick={google} type="button">
                {t("auth.google")}
              </Button>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />{t("auth.or")}<div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <form onSubmit={submit} className="mt-4 space-y-4">
            {mode === "up" && (
              <div className="space-y-1.5"><Label>{t("auth.name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></div>
            )}
            <div className="space-y-1.5"><Label>{t("auth.email")}</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            {mode !== "forgot" && (
              <div className="space-y-1.5"><Label>{t("auth.password")}</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
            )}
            <Button variant="hero" className="h-11 w-full" disabled={busy}>
              {mode === "up" ? t("auth.signup") : mode === "forgot" ? t("common.save") : t("auth.signin")}
            </Button>
          </form>
          <div className="mt-5 space-y-2 text-center text-sm text-muted-foreground">
            {mode === "in" && (
              <button className="text-primary hover:underline" onClick={() => setMode("forgot")}>{t("auth.forgot")}</button>
            )}
            <p>
              {mode === "up" ? t("auth.hasAccount") : t("auth.noAccount")}{" "}
              <button className="font-semibold text-primary hover:underline" onClick={() => setMode(mode === "up" ? "in" : "up")}>
                {mode === "up" ? t("auth.signin") : t("auth.signup")}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
