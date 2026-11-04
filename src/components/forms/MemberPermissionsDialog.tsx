import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ALL_PERMISSIONS,
  PERMISSION_DEFAULT_ROLES,
  setMemberPermissionOverride,
} from "@/modules/permissions";
import { useT, type TKey } from "@/lib/i18n";
import type { ClinicMemberPermission, ClinicRole, PermissionKey } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function MemberPermissionsDialog({
  open,
  onOpenChange,
  clinicId,
  member,
  overrides,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  member: { id: string; display_name: string | null; email: string | null; role: ClinicRole } | null;
  overrides: ClinicMemberPermission[];
}) {
  const { t } = useT();
  const qc = useQueryClient();

  if (!member) return null;

  async function handleChange(permission: PermissionKey, value: string) {
    if (!member) return;
    const granted = value === "default" ? null : value === "granted";
    try {
      await setMemberPermissionOverride({
        clinicId,
        memberId: member.id,
        permission,
        granted,
      });
      toast.success(t("common.saved"));
      qc.invalidateQueries({ queryKey: ["clinicMemberPermissions", clinicId] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("team.permModalTitle")}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {member.display_name ?? member.email} ({t(`role.${member.role}` as TKey)}) — {t("team.permModalDesc")}
          </p>
        </DialogHeader>

        <div className="mt-3 divide-y">
          {ALL_PERMISSIONS.map((perm) => {
            const existing = overrides.find((o) => o.member_id === member.id && o.permission === perm);
            const currentValue = existing === undefined ? "default" : existing.granted ? "granted" : "revoked";
            const defaultAllowed = PERMISSION_DEFAULT_ROLES[perm].includes(member.role);

            return (
              <div key={perm} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <div>
                  <p className="font-medium text-navy">{t(`perm.${perm}` as TKey)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("team.permDefault")}: {defaultAllowed ? t("team.permGranted") : t("team.permRevoked")}
                  </p>
                </div>
                <Select value={currentValue} onValueChange={(v) => handleChange(perm, v)}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{t("team.permDefault")}</SelectItem>
                    <SelectItem value="granted">{t("team.permGranted")}</SelectItem>
                    <SelectItem value="revoked">{t("team.permRevoked")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

