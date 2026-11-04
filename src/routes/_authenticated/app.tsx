import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LayoutDashboard, CalendarDays, Users, ShieldCheck, Settings, LogOut, Bell, Search, Menu,
  ClipboardList, Wallet, Package, MessageCircle, BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClinicProvider, useClinic, useMemberships, PERM } from "@/lib/clinic";
import { useT, type TKey } from "@/lib/i18n";
import { Logo } from "@/components/Logo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Painel — SondaPro" },
      { name: "description", content: "Painel de gestão da clínica." },
      { property: "og:title", content: "Painel — SondaPro" },
      { property: "og:description", content: "Painel de gestão da clínica." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();
  const { data, isLoading, refetch } = useMemberships(user.id);
  if (isLoading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">…</div>;
  if (!data || data.length === 0) return <Onboarding onDone={() => refetch()} />;
  return (
    <ClinicProvider userId={user.id} memberships={data}>
      <Shell email={user.email ?? ""} />
    </ClinicProvider>
  );
}

function Onboarding({ onDone }: { onDone: () => void }) {
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
    if (error) return toast.error(error.message);
    onDone();
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-soft p-6">
      <form onSubmit={create} className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-8 shadow-card">
        <div className="flex items-center justify-between"><Logo /><LanguageToggle /></div>
        <div>
          <h1 className="text-2xl font-extrabold text-navy">{t("onb.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("onb.sub")}</p>
        </div>
        <div className="space-y-1.5"><Label>{t("onb.name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} /></div>
        <Button variant="hero" className="h-11 w-full" disabled={busy}>{t("onb.create")}</Button>
      </form>
    </div>
  );
}

const NAV: { to: string; icon: typeof Users; k: TKey; roles?: typeof PERM.manage }[] = [
  { to: "/app", icon: LayoutDashboard, k: "nav.dashboard" },
  { to: "/app/agenda", icon: CalendarDays, k: "nav.agenda", roles: PERM.patientsRead },
  { to: "/app/patients", icon: Users, k: "nav.patients", roles: PERM.patientsRead },
  { to: "/app/team", icon: ShieldCheck, k: "nav.team", roles: PERM.manage },
  { to: "/app/settings", icon: Settings, k: "nav.settings", roles: PERM.manage },
];
const SOON: { icon: typeof Users; k: TKey }[] = [
  { icon: ClipboardList, k: "nav.records" },
  { icon: Wallet, k: "nav.finance" },
  { icon: Package, k: "nav.stock" },
  { icon: MessageCircle, k: "nav.whatsapp" },
  { icon: BarChart3, k: "nav.reports" },
];

function SidebarNav({ onNav }: { onNav?: () => void }) {
  const { t } = useT();
  const { can, memberships, clinicId, setClinicId } = useClinic();
  return (
    <div className="flex h-full flex-col bg-sidebar p-4 text-sidebar-foreground">
      <div className="px-2 py-2"><Logo light /></div>
      {memberships.length > 1 && (
        <Select value={clinicId} onValueChange={setClinicId}>
          <SelectTrigger className="mt-4 border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground"><SelectValue /></SelectTrigger>
          <SelectContent>
            {memberships.map((m) => <SelectItem key={m.clinic_id} value={m.clinic_id}>{m.clinics?.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <nav className="mt-6 flex-1 space-y-1">
        {NAV.filter((n) => !n.roles || can(n.roles)).map(({ to, icon: I, k }) => (
          <Link
            key={to}
            to={to}
            onClick={onNav}
            activeOptions={{ exact: to === "/app" }}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-primary data-[status=active]:text-sidebar-primary-foreground"
          >
            <I className="h-4 w-4" />{t(k)}
          </Link>
        ))}
        <div className="px-3 pb-1 pt-6 text-[11px] font-semibold uppercase tracking-wider opacity-50">{t("nav.soon")}</div>
        {SOON.map(({ icon: I, k }) => (
          <div key={k} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm opacity-50"><I className="h-4 w-4" />{t(k)}</div>
        ))}
      </nav>
    </div>
  );
}

function Shell({ email }: { email: string }) {
  const { t } = useT();
  const { clinicName, role, clinicId, can } = useClinic();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const { data: todayCount = 0 } = useQuery({
    queryKey: ["todayCount", clinicId],
    enabled: can(PERM.patientsRead),
    queryFn: async () => {
      const { count } = await supabase.from("appointments").select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId).gte("starts_at", today.toISOString()).lt("starts_at", tomorrow.toISOString())
        .in("status", ["scheduled", "confirmed"]);
      return count ?? 0;
    },
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block"><SidebarNav /></aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 border-0 p-0"><SidebarNav onNav={() => setOpen(false)} /></SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur md:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}><Menu /></Button>
          <form
            className="relative max-w-md flex-1"
            onSubmit={(e) => { e.preventDefault(); navigate({ to: "/app/patients", search: { q } }); }}
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("top.search")} className="rounded-full bg-muted pl-9" />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle className="hidden sm:inline-flex" />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label={t("top.notifications")}>
                  <Bell />
                  {todayCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 text-sm">
                <p className="font-semibold">{t("top.notifications")}</p>
                <p className="mt-2 text-muted-foreground">
                  {todayCount > 0 ? `${todayCount} ${t("top.todayAppts")}` : t("top.noNotifications")}
                </p>
              </PopoverContent>
            </Popover>
            <div className="hidden text-right md:block">
              <p className="text-sm font-semibold leading-tight">{email}</p>
              <p className="text-xs text-muted-foreground">{clinicName} · {t(`role.${role}` as TKey)}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label={t("top.signout")}><LogOut /></Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
