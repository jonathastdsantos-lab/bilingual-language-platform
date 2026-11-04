import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, ShieldCheck } from "lucide-react";
import {
  ALL_VALID_FDI_TEETH,
  CLINICAL_RECORD_TYPES,
  createClinicalRecord,
} from "@/modules/records";
import { useT, type TKey } from "@/lib/i18n";
import type { ClinicalRecord, ClinicalRecordType } from "@/types";
import { formatSaoPauloDateTime } from "@/utils/timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ClinicalEvolutionsPanel({
  clinicId,
  patientId,
  records,
  professionals,
  canWrite,
  selectedTooth,
  dateLocale,
}: {
  clinicId: string;
  patientId: string;
  records: ClinicalRecord[];
  professionals: Array<{ id: string; name: string }>;
  canWrite: boolean;
  selectedTooth: number | null;
  dateLocale: string;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [recordType, setRecordType] = useState<ClinicalRecordType>("evolution");
  const [professionalId, setProfessionalId] = useState<string>(professionals[0]?.id ?? "none");
  const [tooth, setTooth] = useState<string>(selectedTooth ? String(selectedTooth) : "none");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      await createClinicalRecord(clinicId, {
        patient_id: patientId,
        professional_id: professionalId !== "none" ? professionalId : null,
        tooth_number: tooth !== "none" ? Number(tooth) : null,
        record_type: recordType,
        title,
        content,
      });
    },
    onSuccess: () => {
      toast.success(t("common.saved"));
      setTitle("");
      setContent("");
      qc.invalidateQueries({ queryKey: ["clinicalRecords", clinicId, patientId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-navy">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
        <span>{t("rec.immutableNotice")}</span>
      </div>

      {canWrite && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-4 rounded-2xl border bg-card p-5 shadow-card"
        >
          <h3 className="font-semibold text-navy">{t("rec.newEvolution")}</h3>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("rec.type")}</Label>
              <Select value={recordType} onValueChange={(v) => setRecordType(v as ClinicalRecordType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLINICAL_RECORD_TYPES.map((rt) => (
                    <SelectItem key={rt} value={rt}>
                      {t(`rec.type.${rt}` as TKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("ag.professional")}</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {professionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("rec.toothOptional")}</Label>
              <Select value={tooth} onValueChange={setTooth}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {ALL_VALID_FDI_TEETH.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      #{n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("rec.recordTitle")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={2}
              maxLength={200}
              placeholder="Ex.: Anestesia infiltrativa + Restauração classe II em resina"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("rec.recordContent")}</Label>
            <Textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              minLength={2}
              maxLength={10000}
            />
          </div>

          <div className="flex justify-end">
            <Button variant="hero" disabled={createMutation.isPending}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-navy">{t("rec.timelineTitle")}</h3>
        </div>

        <ul className="mt-4 space-y-4">
          {records.length === 0 && <li className="py-3 text-sm text-muted-foreground">{t("common.none")}</li>}
          {records.map((rec) => (
            <li key={rec.id} className="rounded-xl border bg-background/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-accent-foreground">
                    {t(`rec.type.${rec.record_type}` as TKey)}
                  </span>
                  {rec.tooth_number && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      #{rec.tooth_number}
                    </span>
                  )}
                  <h4 className="font-bold text-navy">{rec.title}</h4>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatSaoPauloDateTime(rec.created_at, dateLocale, {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{rec.content}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("ag.professional")}: {rec.professionals?.name ?? "—"}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

