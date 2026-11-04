import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatSaoPauloDateTime } from "@/utils/timezone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
}

export function AuditLogsTable({
  logs,
  resolveUserName,
  dateLocale,
}: {
  logs: AuditLogRow[];
  resolveUserName: (userId: string | null) => string;
  dateLocale: string;
}) {
  const { t } = useT();
  const [entityFilter, setEntityFilter] = useState("all");

  const entities = Array.from(new Set(logs.map((l) => l.entity)));
  const filtered = entityFilter === "all" ? logs : logs.filter((l) => l.entity === entityFilter);

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-navy">{t("team.audit")}</h3>
        </div>
        {entities.length > 0 && (
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue placeholder={t("team.auditFilter")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("team.auditAll")}</SelectItem>
              {entities.map((ent) => (
                <SelectItem key={ent} value={ent}>
                  {ent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <ul className="mt-3 divide-y text-sm">
        {filtered.length === 0 && <li className="py-3 text-muted-foreground">{t("common.none")}</li>}
        {filtered.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-bold uppercase text-accent-foreground">
                {l.action}
              </span>
              <span className="font-medium text-navy">{resolveUserName(l.user_id)}</span>
              <span className="text-muted-foreground">· {l.entity}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatSaoPauloDateTime(l.created_at, dateLocale, {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

