import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Building2, LogOut, Menu, Search, Shield } from "lucide-react";
import { supabase } from "@/services/supabase";
import { useClinic } from "@/lib/clinic";
import { useT, type TKey } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AppHeader({
  email,
  onOpenMobileMenu,
}: {
  email: string;
  onOpenMobileMenu: () => void;
}) {
  const { t } = useT();
  const { clinicName, role, clinicId, hasPermission, units, activeUnitId, setActiveUnitId } = useClinic();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const { data: todayCount = 0 } = useQuery({
    queryKey: ["todayCount", clinicId],
    enabled: hasPermission("appointments.read"),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .gte("starts_at", today.toISOString())
        .lt("starts_at", tomorrow.toISOString())
        .in("status", ["scheduled", "confirmed"]);
      if (error) return 0;
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
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur md:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileMenu}>
        <Menu />
      </Button>

      <div className="hidden items-center gap-2 rounded-xl border bg-muted/50 px-3 py-1.5 sm:flex">
        <Building2 className="h-4 w-4 text-primary" />
        <div className="leading-tight">
          <p className="max-w-[180px] truncate text-xs font-bold text-navy">{clinicName}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Shield className="h-3 w-3 text-primary" />
            {t(`role.${role}` as TKey)}
          </p>
        </div>
      </div>

      {units.length > 0 && (
        <div className="hidden xl:block">
          <Select value={activeUnitId} onValueChange={setActiveUnitId}>
            <SelectTrigger className="h-9 w-44 text-xs">
              <SelectValue placeholder={t("dash.allUnits")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("dash.allUnits")}</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {hasPermission("patients.read") && (
        <form
          className="relative max-w-sm flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ to: "/app/patients", search: { q } });
          }}
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("top.search")}
            className="h-9 rounded-full bg-muted pl-9 text-sm"
          />
        </form>
      )}

      <div className="ml-auto flex items-center gap-2">
        <LanguageToggle className="hidden sm:inline-flex" />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label={t("top.notifications")}>
              <Bell className="h-4 w-4" />
              {todayCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5 rounded-full bg-destructive" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 text-sm">
            <p className="font-semibold text-navy">{t("top.notifications")}</p>
            <p className="mt-2 text-muted-foreground">
              {todayCount > 0 ? `${todayCount} ${t("top.todayAppts")}` : t("top.noNotifications")}
            </p>
          </PopoverContent>
        </Popover>

        <div className="hidden text-right md:block">
          <p className="max-w-[180px] truncate text-sm font-semibold leading-tight text-navy">{email}</p>
          <p className="text-xs text-muted-foreground">
            {clinicName} · {t(`role.${role}` as TKey)}
          </p>
        </div>

        <Button variant="ghost" size="icon" onClick={signOut} aria-label={t("top.signout")}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

