import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  ShieldCheck,
  Settings,
  ClipboardList,
  Wallet,
  Package,
  MessageCircle,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import { supabase } from "@/services/supabase";
import { useClinic } from "@/lib/clinic";
import { useT, type TKey } from "@/lib/i18n";
import type { PermissionKey } from "@/types";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const NAV_ITEMS: { to: string; icon: typeof Users; k: TKey; permission?: PermissionKey }[] = [
  { to: "/app", icon: LayoutDashboard, k: "nav.dashboard", permission: "dashboard.view" },
  { to: "/app/agenda", icon: CalendarDays, k: "nav.agenda", permission: "appointments.read" },
  { to: "/app/patients", icon: Users, k: "nav.patients", permission: "patients.read" },
  { to: "/app/records", icon: ClipboardList, k: "nav.records", permission: "records.read" },
  { to: "/app/finance", icon: Wallet, k: "nav.finance", permission: "financial.view" },
  { to: "/app/stock", icon: Package, k: "nav.stock", permission: "stock.read" },
  { to: "/app/whatsapp", icon: MessageCircle, k: "nav.whatsapp", permission: "whatsapp.manage" },
  { to: "/app/reports", icon: BarChart3, k: "nav.reports", permission: "reports.view" },
  { to: "/app/team", icon: ShieldCheck, k: "nav.team", permission: "team.manage" },
  { to: "/app/settings", icon: Settings, k: "nav.settings", permission: "settings.manage" },
];

export function AppSidebar({
  collapsed = false,
  onToggleCollapse,
  onNav,
  onClinicCreated,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNav?: () => void;
  onClinicCreated?: (newClinicId: string) => void;
}) {
  const { t } = useT();
  const { hasPermission, memberships, clinicId, setClinicId } = useClinic();
  const [newClinicOpen, setNewClinicOpen] = useState(false);
  const [newClinicName, setNewClinicName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreateClinic(e: React.FormEvent) {
    e.preventDefault();
    const n = newClinicName.trim();
    if (n.length < 2 || n.length > 120) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_clinic", { _name: n });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("common.saved"));
    setNewClinicName("");
    setNewClinicOpen(false);
    if (data && onClinicCreated) {
      onClinicCreated(data);
    }
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full flex-col bg-sidebar p-3 text-sidebar-foreground transition-all duration-200">
        <div className="flex items-center justify-between px-1 py-2">
          {!collapsed ? (
            <Logo light />
          ) : (
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary font-display text-sm font-extrabold text-sidebar-primary-foreground">
              SP
            </div>
          )}
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
              className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {!collapsed && (
          <div className="mt-3 space-y-2 px-1">
            {memberships.length > 1 && (
              <Select value={clinicId} onValueChange={setClinicId}>
                <SelectTrigger className="border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {memberships.map((m) => (
                    <SelectItem key={m.clinic_id} value={m.clinic_id}>
                      {m.clinics?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setNewClinicOpen(true)}
              className="w-full justify-start gap-2 border border-sidebar-border/60 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("nav.newClinic")}
            </Button>
          </div>
        )}

        <nav className="mt-5 flex-1 space-y-1">
          {NAV_ITEMS.filter((n) => !n.permission || hasPermission(n.permission)).map(({ to, icon: Icon, k }) => {
            const linkEl = (
              <Link
                key={to}
                to={to}
                onClick={onNav}
                activeOptions={{ exact: to === "/app" }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-primary data-[status=active]:text-sidebar-primary-foreground ${
                  collapsed ? "justify-center px-2" : ""
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{t(k)}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={to}>
                  <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                  <TooltipContent side="right">{t(k)}</TooltipContent>
                </Tooltip>
              );
            }
            return linkEl;
          })}
        </nav>

        <Dialog open={newClinicOpen} onOpenChange={setNewClinicOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("onb.title")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateClinic} className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("onb.name")}</Label>
                <Input
                  value={newClinicName}
                  onChange={(e) => setNewClinicName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setNewClinicOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="hero" disabled={busy}>
                  {t("onb.create")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
