import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClinicProvider, useMemberships } from "@/lib/clinic";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { ClinicOnboarding } from "@/components/layout/ClinicOnboarding";
import { Sheet, SheetContent } from "@/components/ui/sheet";

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
  if (!data || data.length === 0) return <ClinicOnboarding onDone={() => refetch()} />;
  return (
    <ClinicProvider userId={user.id} memberships={data}>
      <Shell email={user.email ?? ""} onMembershipsRefresh={() => refetch()} />
    </ClinicProvider>
  );
}

function Shell({ email, onMembershipsRefresh }: { email: string; onMembershipsRefresh: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sondapro.sidebarCollapsed");
    if (saved === "1") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sondapro.sidebarCollapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 transition-all duration-200 lg:block ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        <AppSidebar
          collapsed={collapsed}
          userEmail={email}
          onToggleCollapse={toggleCollapsed}
          onClinicCreated={(newId) => {
            localStorage.setItem("sondapro.clinic", newId);
            onMembershipsRefresh();
          }}
        />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 border-0 p-0">
          <AppSidebar
            userEmail={email}
            onNav={() => setMobileOpen(false)}
            onClinicCreated={(newId) => {
              localStorage.setItem("sondapro.clinic", newId);
              setMobileOpen(false);
              onMembershipsRefresh();
            }}
          />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader email={email} onOpenMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
