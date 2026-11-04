import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Columns2,
  ExternalLink,
  Eye,
  FileText,
  ImagePlus,
  ScanLine,
  Trash2,
  Upload,
} from "lucide-react";
import {
  ALL_VALID_FDI_TEETH,
  ALLOWED_EXAM_MIME_TYPES,
  EXAM_CATEGORIES,
  EXAM_CATEGORY_LABELS,
  MAX_EXAM_FILE_SIZE_BYTES,
  createSignedExamUrl,
  deletePatientExamFile,
  uploadPatientExamFile,
} from "@/modules/records";
import type { ExamCategory, PatientExamFile } from "@/types";
import { toSaoPauloDateKey } from "@/utils/timezone";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface PatientExamsGalleryPanelProps {
  clinicId: string;
  patientId: string;
  exams: PatientExamFile[];
  professionals: Array<{ id: string; name: string }>;
  canWrite: boolean;
  selectedTooth: number | null;
  dateLocale: string;
}

type GalleryFilter = "all" | "radiographs" | "intraoral" | "documents";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function PatientExamsGalleryPanel({
  clinicId,
  patientId,
  exams,
  professionals,
  canWrite,
  selectedTooth,
  dateLocale,
}: PatientExamsGalleryPanelProps) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [category, setCategory] = useState<ExamCategory>("periapical");
  const [title, setTitle] = useState<string>("");
  const [tooth, setTooth] = useState<string>(selectedTooth ? String(selectedTooth) : "none");
  const [professionalId, setProfessionalId] = useState<string>(professionals[0]?.id ?? "none");
  const [examDate, setExamDate] = useState<string>(() => toSaoPauloDateKey(new Date()));
  const [notes, setNotes] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [lightboxExam, setLightboxExam] = useState<PatientExamFile | null>(null);

  const beforePhotos = exams.filter((e) => e.exam_category === "intraoral_before");
  const afterPhotos = exams.filter((e) => e.exam_category === "intraoral_after");
  const [compareBeforeId, setCompareBeforeId] = useState<string>("");
  const [compareAfterId, setCompareAfterId] = useState<string>("");

  useEffect(() => {
    if (selectedTooth) {
      setTooth(String(selectedTooth));
    }
  }, [selectedTooth]);

  useEffect(() => {
    if (beforePhotos[0] && !compareBeforeId) {
      setCompareBeforeId(beforePhotos[0].id);
    }
    if (afterPhotos[0] && !compareAfterId) {
      setCompareAfterId(afterPhotos[0].id);
    }
  }, [beforePhotos, afterPhotos, compareBeforeId, compareAfterId]);

  // Carrega Signed URLs temporárias para os exames do paciente na clínica ativa
  useEffect(() => {
    let cancelled = false;
    async function loadUrls() {
      const next: Record<string, string> = {};
      for (const ex of exams) {
        if (signedUrls[ex.id]) {
          next[ex.id] = signedUrls[ex.id]!;
          continue;
        }
        try {
          const url = await createSignedExamUrl(clinicId, ex.storage_path, 3600);
          next[ex.id] = url;
        } catch {
          // Mantém vazio caso o arquivo ainda não esteja acessível
        }
      }
      if (!cancelled && Object.keys(next).length > 0) {
        setSignedUrls((prev) => ({ ...prev, ...next }));
      }
    }
    if (exams.length > 0) {
      void loadUrls();
    }
    return () => {
      cancelled = true;
    };
  }, [clinicId, exams]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!ALLOWED_EXAM_MIME_TYPES.includes(file.type as (typeof ALLOWED_EXAM_MIME_TYPES)[number])) {
      toast.error("Formato inválido. Selecione uma imagem (JPG, PNG, WEBP) ou PDF.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_EXAM_FILE_SIZE_BYTES) {
      toast.error("O arquivo excede o tamanho máximo permitido de 15 MB.");
      e.target.value = "";
      return;
    }
    setSelectedFile(file);
    if (!title.trim()) {
      const defaultTitle = file.name.replace(/\.[^.]+$/, "").slice(0, 80);
      setTitle(defaultTitle);
    }
  }

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!selectedFile) {
        throw new Error("Selecione um arquivo de radiografia, foto intraoral ou PDF.");
      }
      await uploadPatientExamFile(
        clinicId,
        {
          patient_id: patientId,
          professional_id: professionalId !== "none" ? professionalId : null,
          tooth_number: tooth !== "none" ? Number(tooth) : null,
          exam_category: category,
          title: title.trim(),
          notes: notes.trim() || undefined,
          exam_date: examDate,
          file_name: selectedFile.name,
          mime_type: selectedFile.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
          file_size_bytes: selectedFile.size,
        },
        selectedFile,
      );
    },
    onSuccess: () => {
      toast.success("Exame anexado com segurança ao prontuário do paciente!");
      setTitle("");
      setNotes("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["patientExams", clinicId, patientId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (exam: PatientExamFile) => {
      await deletePatientExamFile(clinicId, exam);
    },
    onSuccess: () => {
      toast.success("Exame removido do prontuário.");
      qc.invalidateQueries({ queryKey: ["patientExams", clinicId, patientId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filteredExams = exams.filter((ex) => {
    if (filter === "radiographs") {
      return ["periapical", "panoramic", "bitewing", "tomography"].includes(ex.exam_category);
    }
    if (filter === "intraoral") {
      return ["intraoral_before", "intraoral_after"].includes(ex.exam_category);
    }
    if (filter === "documents") {
      return ex.exam_category === "document" || ex.mime_type === "application/pdf";
    }
    return true;
  });

  const activeBefore = beforePhotos.find((b) => b.id === compareBeforeId) ?? beforePhotos[0] ?? null;
  const activeAfter = afterPhotos.find((a) => a.id === compareAfterId) ?? afterPhotos[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Formulário de Upload Seguro (Supabase Storage + RLS Multi-Tenant) */}
      {canWrite && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            uploadMut.mutate();
          }}
          className="space-y-4 rounded-2xl border bg-card p-5 shadow-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="flex items-center gap-2">
              <ImagePlus className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-base font-extrabold text-navy">
                  Anexar Radiografia, Foto Intraoral (Antes/Depois) ou Laudo
                </h3>
                <p className="text-xs text-muted-foreground">
                  Armazenamento criptografado em bucket privado (`clinical-exams`) isolado por `clinic_id` (JPG, PNG, WEBP ou PDF até 15 MB).
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria do Exame</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ExamCategory)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXAM_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {EXAM_CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Título / Identificação do Exame</Label>
              <Input
                className="h-9 text-xs"
                required
                minLength={2}
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Rx Periapical Pré-Endodontia #36 / Panorâmica Inicial"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Dente FDI (Opcional)</Label>
              <Select value={tooth} onValueChange={setTooth}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Arcada Completa / Geral</SelectItem>
                  {ALL_VALID_FDI_TEETH.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      Dente #{n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Data de Realização</Label>
              <Input
                type="date"
                className="h-9 text-xs"
                required
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Profissional Responsável</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger className="h-9 text-xs">
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

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Arquivo (JPG, PNG, WEBP ou PDF — máx. 15 MB)</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileChange}
                className="h-9 cursor-pointer text-xs"
                required
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Laudo / Achados Radiográficos / Observações (Opcional)</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: Rarefação óssea periapical discreta na raiz mesial do elemento 36."
                className="text-xs"
              />
            </div>

            <Button type="submit" variant="hero" disabled={uploadMut.isPending || !selectedFile} className="gap-1.5">
              <Upload className="h-4 w-4" />
              {uploadMut.isPending ? "Enviando Exame..." : "Anexar ao Prontuário"}
            </Button>
          </div>
        </form>
      )}

      {/* Comparador Clínico Antes × Depois (exibido automaticamente quando há fotos Antes e Depois) */}
      {beforePhotos.length > 0 && afterPhotos.length > 0 && (
        <div className="space-y-4 rounded-2xl border border-primary/25 bg-primary/5 p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Columns2 className="h-5 w-5 text-primary" />
              <div>
                <h4 className="text-sm font-extrabold text-navy">
                  Comparador Clínico Intraoral (Antes × Depois)
                </h4>
                <p className="text-xs text-muted-foreground">
                  Compare a evolução estética e funcional diretamente no prontuário.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={compareBeforeId} onValueChange={setCompareBeforeId}>
                <SelectTrigger className="h-8 w-48 bg-card text-xs">
                  <SelectValue placeholder="Foto Antes" />
                </SelectTrigger>
                <SelectContent>
                  {beforePhotos.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      Antes: {b.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={compareAfterId} onValueChange={setCompareAfterId}>
                <SelectTrigger className="h-8 w-48 bg-card text-xs">
                  <SelectValue placeholder="Foto Depois" />
                </SelectTrigger>
                <SelectContent>
                  {afterPhotos.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      Depois: {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {activeBefore && (
              <div className="overflow-hidden rounded-xl border bg-card p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                    ANTES — {activeBefore.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{activeBefore.exam_date}</span>
                </div>
                {signedUrls[activeBefore.id] ? (
                  <img
                    src={signedUrls[activeBefore.id]}
                    alt={activeBefore.title}
                    className="h-56 w-full rounded-lg bg-slate-950 object-contain"
                  />
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                    Carregando imagem protegida...
                  </div>
                )}
              </div>
            )}

            {activeAfter && (
              <div className="overflow-hidden rounded-xl border bg-card p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                    DEPOIS — {activeAfter.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{activeAfter.exam_date}</span>
                </div>
                {signedUrls[activeAfter.id] ? (
                  <img
                    src={signedUrls[activeAfter.id]}
                    alt={activeAfter.title}
                    className="h-56 w-full rounded-lg bg-slate-950 object-contain"
                  />
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                    Carregando imagem protegida...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barra de Filtros da Galeria */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border bg-card p-1 shadow-sm">
          {(
            [
              { id: "all", label: `Todos (${exams.length})` },
              { id: "radiographs", label: "Radiografias & TCFC" },
              { id: "intraoral", label: "Fotos Antes / Depois" },
              { id: "documents", label: "Laudos PDF" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-navy"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Listagem / Grid de Exames e Radiografias */}
      {filteredExams.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center shadow-card">
          <ScanLine className="mx-auto h-9 w-9 text-muted-foreground/60" />
          <p className="mt-2 text-sm font-semibold text-navy">
            Nenhum exame ou radiografia anexado para este filtro
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Utilize o formulário acima para enviar radiografias periapicais, panorâmicas, fotos intraorais (Antes/Depois) ou laudos em PDF.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredExams.map((exam) => {
            const url = signedUrls[exam.id];
            const isPdf = exam.mime_type === "application/pdf";

            return (
              <div
                key={exam.id}
                className="flex flex-col justify-between overflow-hidden rounded-2xl border bg-card shadow-card transition hover:border-primary/40"
              >
                <div>
                  {/* Área Visual da Radiografia / Foto / PDF */}
                  <div className="relative flex h-48 items-center justify-center bg-slate-950">
                    {isPdf ? (
                      <div className="flex flex-col items-center gap-2 text-slate-300">
                        <FileText className="h-12 w-12 text-primary" />
                        <span className="text-xs font-semibold">Documento PDF ({formatFileSize(exam.file_size_bytes)})</span>
                      </div>
                    ) : url ? (
                      <img
                        src={url}
                        alt={exam.title}
                        className="h-full w-full cursor-pointer object-contain transition hover:scale-[1.02]"
                        onClick={() => setLightboxExam(exam)}
                      />
                    ) : (
                      <span className="text-xs text-slate-400">Gerando visualização segura...</span>
                    )}

                    <span className="absolute left-2.5 top-2.5 rounded-md bg-slate-900/85 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                      {EXAM_CATEGORY_LABELS[exam.exam_category]}
                    </span>

                    {exam.tooth_number && (
                      <span className="absolute right-2.5 top-2.5 rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                        Dente #{exam.tooth_number}
                      </span>
                    )}
                  </div>

                  {/* Metadados Clínicos */}
                  <div className="space-y-1.5 p-4">
                    <h4 className="line-clamp-1 text-sm font-extrabold text-navy">{exam.title}</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Data:{" "}
                      {new Date(`${exam.exam_date}T12:00:00`).toLocaleDateString(dateLocale, {
                        dateStyle: "medium",
                      })}{" "}
                      • Dr(a). {exam.professionals?.name ?? "—"}
                    </p>
                    {exam.notes && (
                      <p className="line-clamp-2 rounded-lg bg-muted/50 p-2 text-xs text-navy">{exam.notes}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2.5">
                  <span className="text-[11px] text-muted-foreground">{formatFileSize(exam.file_size_bytes)}</span>
                  <div className="flex items-center gap-1.5">
                    {url && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => {
                          if (isPdf) {
                            window.open(url, "_blank", "noopener,noreferrer");
                          } else {
                            setLightboxExam(exam);
                          }
                        }}
                      >
                        {isPdf ? <ExternalLink className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {isPdf ? "Abrir PDF" : "Ampliar"}
                      </Button>
                    )}

                    {canWrite && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:bg-destructive/10"
                        disabled={deleteMut.isPending}
                        onClick={() => deleteMut.mutate(exam)}
                        title="Excluir exame"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox de Inspeção Radiográfica em Alta Resolução */}
      <Dialog open={!!lightboxExam} onOpenChange={(open) => !open && setLightboxExam(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-navy">
              <span>{lightboxExam?.title}</span>
              {lightboxExam?.tooth_number && (
                <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                  Dente #{lightboxExam.tooth_number}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {lightboxExam && (
            <div className="space-y-3">
              <div className="flex max-h-[70vh] items-center justify-center overflow-auto rounded-xl bg-slate-950 p-4">
                {signedUrls[lightboxExam.id] ? (
                  <img
                    src={signedUrls[lightboxExam.id]}
                    alt={lightboxExam.title}
                    className="max-h-[65vh] w-auto object-contain"
                  />
                ) : (
                  <p className="text-xs text-slate-400">Carregando imagem...</p>
                )}
              </div>
              {lightboxExam.notes && (
                <div className="rounded-xl border bg-muted/40 p-3 text-xs text-navy">
                  <strong>Laudo / Observações:</strong> {lightboxExam.notes}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

