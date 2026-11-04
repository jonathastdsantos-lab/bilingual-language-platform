import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, Users, ClipboardList, LineChart, Package, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useT } from "@/lib/i18n";
import icon from "@/assets/sondapro-icon.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SondaPro — Gestão odontológica inteligente" },
      { name: "description", content: "Agenda, pacientes, prontuário, financeiro e estoque para clínicas odontológicas, em português e inglês." },
      { property: "og:title", content: "SondaPro — Gestão odontológica inteligente" },
      { property: "og:description", content: "Plataforma completa de gestão para clínicas odontológicas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={icon.url} alt="SondaPro" className="h-9 w-9 rounded-xl" />
      <span className={`font-display text-xl font-extrabold ${light ? "text-sidebar-accent-foreground" : "text-navy"}`}>
        Sonda<span className="text-primary">Pro</span>
      </span>
    </div>
  );
}

function Landing() {
  const { t } = useT();
  const features = [
    { i: CalendarClock, k: "landing.f1" },
    { i: Users, k: "landing.f2" },
    { i: ClipboardList, k: "landing.f3" },
    { i: LineChart, k: "landing.f4" },
    { i: Package, k: "landing.f5" },
    { i: ShieldCheck, k: "landing.f6" },
  ] as const;
  return (
    <div className="min-h-screen bg-soft">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <Button variant="ghost" asChild>
            <Link to="/auth">{t("landing.signin")}</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20 pt-12">
        <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="mb-4 text-sm font-semibold italic text-primary">{t("brand.tagline")}</p>
            <h1 className="text-5xl font-extrabold leading-[1.05] text-navy md:text-6xl">{t("landing.title")}</h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">{t("landing.sub")}</p>
            <Button variant="hero" size="lg" className="mt-8 h-12 px-8 text-base" asChild>
              <Link to="/auth">{t("landing.cta")}</Link>
            </Button>
          </div>
          <div className="relative mx-auto">
            <div className="absolute inset-0 -z-10 rounded-[3rem] bg-brand opacity-30 blur-3xl" />
            <img src={icon.url} alt="" className="w-72 rounded-[2.5rem] shadow-elegant md:w-80" />
          </div>
        </div>
        <div className="mt-20 grid grid-cols-2 gap-4 md:grid-cols-6">
          {features.map(({ i: I, k }) => (
            <div key={k} className="rounded-2xl border bg-card p-5 text-center shadow-card">
              <I className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 text-sm font-semibold text-navy">{t(k)}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
