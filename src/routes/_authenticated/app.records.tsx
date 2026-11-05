import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, UserPlus } from "lucide-react";
import { supabase, normalizeSupabaseError } from "@/services/supabase";
import {
  evaluateSurgicalRiskAndAsa,
  fetchPatientClinicalRecords,
  fetchPatientExamFiles,
  fetchPatientOdontogram,
  fetchPatientProstheticLabOrders,
  fetchPatientStructuredAnamnesis,
  fetchPatientTreatmentPlans,
} from "@/modules/records";
import { useClinic } from "@/lib/clinic";
import { useT } from "@/lib/i18n";
import { formatCPF } from "@/utils/validators";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OdontogramChart } from "@/components/records/OdontogramChart";
import { ClinicalEvolutionsPanel } from "@/components/records/ClinicalEvolutionsPanel";
import { TreatmentPlansPanel } from "@/components/records/TreatmentPlansPanel";
import { ClinicalDocumentsPanel } from "@/components/records/ClinicalDocumentsPanel";
import { PatientExamsGalleryPanel } from "@/components/records/PatientExamsGalleryPanel";
import { StructuredAnamnesisPanel } from "@/components/records/StructuredAnamnesisPanel";
import { ProstheticLabOrdersPanel } from "@/components/records/ProstheticLabOrdersPanel";
import { PediatricDentalPanel } from "@/components/records/PediatricDentalPanel";

export const Route = createFileRoute("/_authenticated/app/records")({
  validateSearch: (s: Record<string, unknown>) => ({
    patientId: typeof s["patientId"] === "string" ? s["patientId"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Prontuário & Odontograma — SondaPro" },
      { name: "description", content: "Prontuário odontológico eletrônico, odontograma FDI e planos de tratamento." },
      { property: "og:title", content: "Prontuário & Odontograma — SondaPro" },
      { property: "og:description", content: "Prontuário odontológico eletrônico, odontograma FDI e planos de tratamento." },
    ],
  }),
  component: ClinicalRecordsPage,
});

function ClinicalRecordsPage() {
  const { t, dateLocale } = useT();
  const { clinicId, clinicName, units, activeUnitId, hasPermission } = useClinic();
  const { patientId: searchPatientId } = Route.useSearch();
  const activeUnit =
    units.find((u) => u.id === activeUnitId) ?? units.find((u) => u.is_main) ?? units[0] ?? null;

  const canRead = hasPermission("records.read");
  const canWrite = hasPermission("records.write");

  const [selectedPatientId, setSelectedPatientId] = useState<string>(searchPatientId ?? "");
  const [selectedTooth, setSelectedTooth] = useState<number | null>(11);

  const refsQuery = useQuery({
    queryKey: ["recordsRefs", clinicId],
    enabled: canRead,
    queryFn: async () => {
      const [pRes, profRes] = await Promise.all([
        supabase
          .from("patients")
          .select("id,full_name,cpf,birth_date,phone,allergies,anamnesis,clinical_notes")
          .eq("clinic_id", clinicId)
          .order("full_name")
          .limit(500),
        supabase
          .from("professionals")
          .select("id,name")
          .eq("clinic_id", clinicId)
          .eq("active", true)
          .order("name"),
      ]);
      const err = pRes.error || profRes.error;
      if (err) throw new Error(normalizeSupabaseError(err).message);
      return {
        patients: pRes.data ?? [],
        professionals: profRes.data ?? [],
      };
    },
  });

  const patients = refsQuery.data?.patients ?? [];
  const professionals = refsQuery.data?.professionals ?? [];

  useEffect(() => {
    if (searchPatientId && patients.some((p) => p.id === searchPatientId)) {
      setSelectedPatientId(searchPatientId);
      return;
    }
    if (!selectedPatientId && patients[0]) {
      setSelectedPatientId(patients[0].id);
    }
  }, [searchPatientId, patients, selectedPatientId]);

  const activePatient = patients.find((p) => p.id === selectedPatientId) ?? null;

  const odontogramQuery = useQuery({
    queryKey: ["odontogram", clinicId, activePatient?.id],
    enabled: canRead && !!activePatient,
    queryFn: () => fetchPatientOdontogram(clinicId, activePatient!.id),
  });

  const recordsQuery = useQuery({
    queryKey: ["clinicalRecords", clinicId, activePatient?.id],
    enabled: canRead && !!activePatient,
    queryFn: () => fetchPatientClinicalRecords(clinicId, activePatient!.id),
  });

  const plansQuery = useQuery({
    queryKey: ["treatmentPlans", clinicId, activePatient?.id],
    enabled: canRead && !!activePatient,
    queryFn: () => fetchPatientTreatmentPlans(clinicId, activePatient!.id),
  });

  const examsQuery = useQuery({
    queryKey: ["patientExams", clinicId, activePatient?.id],
    enabled: canRead && !!activePatient,
    queryFn: () => fetchPatientExamFiles(clinicId, activePatient!.id),
  });

  const anamnesisQuery = useQuery({
    queryKey: ["structuredAnamnesis", clinicId, activePatient?.id],
    enabled: canRead && !!activePatient,
    queryFn: () => fetchPatientStructuredAnamnesis(clinicId, activePatient!.id),
  });

  const prostheticLabOrdersQuery = useQuery({
    queryKey: ["prosthetic-lab-orders", clinicId, activePatient?.id],
    enabled: canRead && !!activePatient,
    queryFn: () => fetchPatientProstheticLabOrders(clinicId, activePatient!.id),
  });

  const headerRisk = anamnesisQuery.data
    ? evaluateSurgicalRiskAndAsa(anamnesisQuery.data)
    : null;

  if (!canRead) {
    return <p className="text-muted-foreground">{t("common.noPermission")}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-extrabold text-navy md:text-3xl">{t("rec.title")}</h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("rec.subtitle")}</p>
        </div>

        {patients.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground">{t("rec.selectPatient")}:</span>
            <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder={t("rec.selectPatient")} />
              </SelectTrigger>
              <SelectContent>
                {patients.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name} {p.cpf ? `(${formatCPF(p.cpf)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!refsQuery.isLoading && patients.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center shadow-card">
          <p className="text-sm text-muted-foreground">{t("rec.noPatients")}</p>
          <Button variant="hero" size="sm" className="mt-4" asChild>
            <Link to="/app/patients" search={{}}>
              <UserPlus className="h-4 w-4" />
              {t("pat.new")}
            </Link>
          </Button>
        </div>
      ) : (
        activePatient && (
          <>
            {/* Resumo Clínico e Alergias do Paciente */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-4 shadow-card">
              <div>
                <h2 className="text-lg font-extrabold text-navy">{activePatient.full_name}</h2>
                <p className="text-xs text-muted-foreground">
                  {t("pat.cpf")}: {formatCPF(activePatient.cpf)} · {t("pat.phone")}: {activePatient.phone ?? "—"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {anamnesisQuery.data && headerRisk && (
                  <span
                    className={`rounded-xl px-3 py-1.5 text-xs font-extrabold ${
                      headerRisk.overallRiskLevel === "critical"
                        ? "bg-red-600 text-white"
                        : headerRisk.overallRiskLevel === "high"
                          ? "border border-destructive/40 bg-destructive/15 text-destructive"
                          : headerRisk.overallRiskLevel === "moderate"
                            ? "border border-amber-300 bg-amber-500/15 text-amber-800"
                            : "border border-emerald-300 bg-emerald-500/15 text-emerald-800"
                    }`}
                  >
                    {anamnesisQuery.data.asa_classification} ({headerRisk.alerts.length} alerta(s) cirúrgico(s))
                  </span>
                )}
                {activePatient.allergies && (
                  <div className="flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      {t("pat.allergies")}: {activePatient.allergies}
                    </span>
                  </div>
                )}
                {activePatient.anamnesis && (
                  <div className="rounded-xl border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
                    <b>{t("pat.anamnesis")}:</b> {activePatient.anamnesis}
                  </div>
                )}
              </div>
            </div>

            <Tabs defaultValue="odontogram" className="space-y-5">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:w-full lg:grid-cols-8">
                <TabsTrigger value="odontogram">{t("rec.tabOdontogram")}</TabsTrigger>
                <TabsTrigger value="pediatric">Odontopediatria (51-85)</TabsTrigger>
                <TabsTrigger value="anamnesis">Anamnese & Risco</TabsTrigger>
                <TabsTrigger value="evolutions">{t("rec.tabEvolutions")}</TabsTrigger>
                <TabsTrigger value="plans">{t("rec.tabPlans")}</TabsTrigger>
                <TabsTrigger value="prosthesis">Laboratório Prótese</TabsTrigger>
                <TabsTrigger value="exams">Exames & Radiografias</TabsTrigger>
                <TabsTrigger value="documents">Receitas, Atestados & TCLE</TabsTrigger>
              </TabsList>

              <TabsContent value="odontogram">
                <OdontogramChart
                  clinicId={clinicId}
                  patientId={activePatient.id}
                  entries={odontogramQuery.data ?? []}
                  professionals={professionals}
                  canWrite={canWrite}
                  selectedTooth={selectedTooth}
                  onSelectTooth={setSelectedTooth}
                  dateLocale={dateLocale}
                />
              </TabsContent>

              <TabsContent value="pediatric">
                <PediatricDentalPanel
                  clinicId={clinicId}
                  patientId={activePatient.id}
                  patientBirthDate={activePatient.birth_date}
                  patientName={activePatient.full_name}
                  professionals={professionals}
                  canWrite={canWrite}
                />
              </TabsContent>

              <TabsContent value="anamnesis">
                <StructuredAnamnesisPanel
                  clinicId={clinicId}
                  patientId={activePatient.id}
                  anamnesis={anamnesisQuery.data ?? null}
                  professionals={professionals}
                  canWrite={canWrite}
                />
              </TabsContent>

              <TabsContent value="evolutions">
                <ClinicalEvolutionsPanel
                  clinicId={clinicId}
                  patientId={activePatient.id}
                  records={recordsQuery.data ?? []}
                  professionals={professionals}
                  canWrite={canWrite}
                  selectedTooth={selectedTooth}
                  dateLocale={dateLocale}
                />
              </TabsContent>

              <TabsContent value="plans">
                <TreatmentPlansPanel
                  clinicId={clinicId}
                  patientId={activePatient.id}
                  plans={plansQuery.data?.plans ?? []}
                  items={plansQuery.data?.items ?? []}
                  professionals={professionals}
                  canWrite={canWrite}
                  dateLocale={dateLocale}
                />
              </TabsContent>

              <TabsContent value="prosthesis">
                <ProstheticLabOrdersPanel
                  clinicId={clinicId}
                  clinicName={clinicName || "SondaPro Clínica Odontológica"}
                  patient={{
                    id: activePatient.id,
                    full_name: activePatient.full_name,
                    cpf: activePatient.cpf,
                  }}
                  orders={prostheticLabOrdersQuery.data ?? []}
                  professionals={professionals}
                  canWrite={canWrite}
                  selectedTooth={selectedTooth}
                />
              </TabsContent>

              <TabsContent value="exams">
                <PatientExamsGalleryPanel
                  clinicId={clinicId}
                  patientId={activePatient.id}
                  exams={examsQuery.data ?? []}
                  professionals={professionals}
                  canWrite={canWrite}
                  selectedTooth={selectedTooth}
                  dateLocale={dateLocale}
                />
              </TabsContent>

              <TabsContent value="documents">
                <ClinicalDocumentsPanel
                  clinicId={clinicId}
                  clinicName={clinicName || "SondaPro Clínica Odontológica"}
                  unitName={activeUnit?.name}
                  unitAddress={activeUnit?.address ?? undefined}
                  unitPhone={activeUnit?.phone ?? undefined}
                  patient={{
                    id: activePatient.id,
                    full_name: activePatient.full_name,
                    cpf: activePatient.cpf,
                  }}
                  professionals={professionals}
                  canWrite={canWrite}
                />
              </TabsContent>
            </Tabs>
          </>
        )
      )}
    </div>
  );
}

