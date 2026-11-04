import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileCheck2, FileText, Pill, Printer, ShieldCheck } from "lucide-react";
import {
  DENTAL_CID10_CODES,
  DENTAL_PRESCRIPTION_PRESETS,
  type PrintableDocumentKind,
  type PrintablePageSize,
  buildClinicalDocumentRecordPayload,
  buildPrintableDocumentHtml,
  createClinicalRecord,
} from "@/modules/records";
import { formatCPF } from "@/utils/validators";
import { toSaoPauloDateKey } from "@/utils/timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ClinicalDocumentsPanelProps {
  clinicId: string;
  clinicName: string;
  unitName?: string | undefined;
  unitAddress?: string | undefined;
  unitPhone?: string | undefined;
  patient: {
    id: string;
    full_name: string;
    cpf: string | null;
  };
  professionals: Array<{ id: string; name: string }>;
  canWrite: boolean;
}

export function ClinicalDocumentsPanel({
  clinicId,
  clinicName,
  unitName,
  unitAddress,
  unitPhone,
  patient,
  professionals,
  canWrite,
}: ClinicalDocumentsPanelProps) {
  const qc = useQueryClient();

  const [kind, setKind] = useState<PrintableDocumentKind>("prescription_simple");
  const [pageSize, setPageSize] = useState<PrintablePageSize>("A4");
  const [professionalId, setProfessionalId] = useState<string>(professionals[0]?.id ?? "none");
  const [professionalCro, setProfessionalCro] = useState<string>("CRO-SP 00000");
  const [issueDate, setIssueDate] = useState<string>(() => toSaoPauloDateKey(new Date()));
  const [cid10Code, setCid10Code] = useState<string>("K02.9");
  const [restDays, setRestDays] = useState<string>("1");
  const [authorizeCid, setAuthorizeCid] = useState<boolean>(true);
  const [procedureName, setProcedureName] = useState<string>("Reabilitação Oral / Procedimento Odontológico");
  const [bodyText, setBodyText] = useState<string>(DENTAL_PRESCRIPTION_PRESETS[0].text);

  const selectedProfName =
    professionals.find((p) => p.id === professionalId)?.name ?? "Cirurgião-Dentista Responsável";

  const formattedPatientCpf = patient.cpf ? formatCPF(patient.cpf) : "";

  useEffect(() => {
    if (kind === "prescription_simple" || kind === "prescription_controlled") {
      setBodyText(DENTAL_PRESCRIPTION_PRESETS[0].text);
    } else if (kind === "certificate") {
      const days = Math.max(0, Number(restDays) || 0);
      setBodyText(
        days > 0
          ? `Atesto, para os devidos fins, que o(a) paciente ${patient.full_name}${formattedPatientCpf ? `, inscrito(a) no CPF sob nº ${formattedPatientCpf},` : ""} esteve sob meus cuidados profissionais em atendimento odontológico nesta data, necessitando de ${days} (${days === 1 ? "um" : days}) dia(s) de repouso/afastamento de suas atividades laborais ou escolares a partir desta data.`
          : `Declaro, para os devidos fins, que o(a) paciente ${patient.full_name}${formattedPatientCpf ? `, inscrito(a) no CPF sob nº ${formattedPatientCpf},` : ""} compareceu a esta clínica para atendimento odontológico nesta data.`,
      );
    } else if (kind === "tcle") {
      setBodyText(
        `Pelo presente Termo de Consentimento Livre e Esclarecido (TCLE), eu, ${patient.full_name}${formattedPatientCpf ? `, CPF ${formattedPatientCpf},` : ""} declaro que fui devidamente informado(a) pelo(a) Cirurgião-Dentista ${selectedProfName} (${professionalCro}) sobre o diagnóstico, objetivos, etapas clínicas, alternativas de tratamento, custos e riscos biológicos inerentes ao procedimento proposto (${procedureName}).\n\n1. Compreendo que a Odontologia não é uma ciência exata e que os resultados dependem também da resposta biológica individual, anatomia, higienização bucal e cumprimento rigoroso das recomendações pós-operatórias e retornos agendados.\n2. Fui orientado(a) quanto aos possíveis efeitos pós-operatórios transitórios (edema, sensibilidade, hematoma ou desconforto local) e recebi todas as instruções verbais e escritas de medicação e cuidados.\n3. Autorizo a realização do tratamento proposto, bem como registros fotográficos/radiográficos para fins exclusivamente clínicos e de prontuário odontológico.`,
      );
    }
  }, [kind, patient.full_name, formattedPatientCpf, restDays, selectedProfName, professionalCro, procedureName]);

  function openPrintWindow() {
    try {
      const html = buildPrintableDocumentHtml({
        kind,
        pageSize,
        clinicName,
        unitName,
        unitAddress,
        unitPhone,
        patientName: patient.full_name,
        patientCpf: formattedPatientCpf || undefined,
        professionalName: selectedProfName,
        professionalCro,
        issueDate,
        bodyText,
        cid10Code: kind === "certificate" ? cid10Code : undefined,
        restDays: kind === "certificate" ? Math.max(0, Number(restDays) || 0) : undefined,
        authorizeCidDisclosure: kind === "certificate" ? authorizeCid : undefined,
        procedureName: kind === "tcle" ? procedureName : undefined,
      });

      const win = window.open("", "_blank", "width=900,height=780");
      if (!win) {
        toast.error("Permita pop-ups no navegador para abrir a folha de impressão/PDF.");
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        win.print();
      }, 250);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const saveAndPrintMut = useMutation({
    mutationFn: async () => {
      const payload = buildClinicalDocumentRecordPayload({
        kind,
        pageSize,
        clinicName,
        unitName,
        unitAddress,
        unitPhone,
        patientName: patient.full_name,
        patientCpf: formattedPatientCpf || undefined,
        professionalName: selectedProfName,
        professionalCro,
        issueDate,
        bodyText,
        cid10Code: kind === "certificate" ? cid10Code : undefined,
        restDays: kind === "certificate" ? Math.max(0, Number(restDays) || 0) : undefined,
        authorizeCidDisclosure: kind === "certificate" ? authorizeCid : undefined,
        procedureName: kind === "tcle" ? procedureName : undefined,
      });

      await createClinicalRecord(clinicId, {
        patient_id: patient.id,
        professional_id: professionalId !== "none" ? professionalId : null,
        tooth_number: null,
        record_type: payload.recordType,
        title: payload.title,
        content: payload.content,
      });
    },
    onSuccess: () => {
      toast.success("Documento registrado no Prontuário Eletrônico e pronto para impressão!");
      qc.invalidateQueries({ queryKey: ["clinicalRecords", clinicId, patient.id] });
      openPrintWindow();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Coluna de Configuração do Documento */}
      <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card lg:col-span-6">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="text-base font-extrabold text-navy">
              Emissão de Receituário, Atestado (CID-10) e TCLE
            </h3>
            <p className="text-xs text-muted-foreground">
              Gera documentos prontos para folha A4 ou A5 e arquiva cópia imutável no prontuário.
            </p>
          </div>
        </div>

        {/* Seletor de Tipo de Documento */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setKind("prescription_simple")}
            className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs font-semibold transition ${
              kind === "prescription_simple"
                ? "border-primary bg-primary/10 text-primary"
                : "bg-background text-navy hover:bg-muted/60"
            }`}
          >
            <Pill className="h-4 w-4 shrink-0" />
            <div>
              <div>Receituário Simples</div>
              <div className="text-[10px] font-normal text-muted-foreground">Analgésicos, anti-inflamatórios</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setKind("prescription_controlled")}
            className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs font-semibold transition ${
              kind === "prescription_controlled"
                ? "border-primary bg-primary/10 text-primary"
                : "bg-background text-navy hover:bg-muted/60"
            }`}
          >
            <FileCheck2 className="h-4 w-4 shrink-0" />
            <div>
              <div>Controle Especial (2 Vias)</div>
              <div className="text-[10px] font-normal text-muted-foreground">Antibióticos / Portaria 344</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setKind("certificate")}
            className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs font-semibold transition ${
              kind === "certificate"
                ? "border-primary bg-primary/10 text-primary"
                : "bg-background text-navy hover:bg-muted/60"
            }`}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <div>
              <div>Atestado Odontológico</div>
              <div className="text-[10px] font-normal text-muted-foreground">Repouso e CID-10 odontológico</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setKind("tcle")}
            className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs font-semibold transition ${
              kind === "tcle"
                ? "border-primary bg-primary/10 text-primary"
                : "bg-background text-navy hover:bg-muted/60"
            }`}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <div>
              <div>Termo de Consentimento</div>
              <div className="text-[10px] font-normal text-muted-foreground">TCLE assinado pelo paciente</div>
            </div>
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Cirurgião-Dentista</Label>
            <Select value={professionalId} onValueChange={setProfessionalId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione..." />
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
            <Label className="text-xs">Inscrição CRO / UF</Label>
            <Input
              className="h-9 text-xs"
              value={professionalCro}
              onChange={(e) => setProfessionalCro(e.target.value)}
              placeholder="Ex.: CRO-SP 12345"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Formato</Label>
              <Select value={pageSize} onValueChange={(v) => setPageSize(v as PrintablePageSize)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A4">Folha A4</SelectItem>
                  <SelectItem value="A5">Receituário A5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data</Label>
              <Input
                type="date"
                className="h-9 text-xs"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Presets rápidos de prescrição odontológica */}
        {(kind === "prescription_simple" || kind === "prescription_controlled") && (
          <div className="space-y-1.5">
            <Label className="text-xs">Adicionar Posologia Odontológica Padrão</Label>
            <div className="flex flex-wrap gap-1.5">
              {DENTAL_PRESCRIPTION_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() =>
                    setBodyText((prev) => (prev.trim() ? `${prev.trim()}\n\n${preset.text}` : preset.text))
                  }
                >
                  + {preset.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Campos específicos para Atestado Odontológico (CID-10 e dias de repouso) */}
        {kind === "certificate" && (
          <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Código CID-10 Odontológico</Label>
              <Select value={cid10Code} onValueChange={setCid10Code}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DENTAL_CID10_CODES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} — {c.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Dias de Repouso / Afastamento</Label>
              <Input
                type="number"
                min={0}
                max={60}
                className="h-8 text-xs"
                value={restDays}
                onChange={(e) => setRestDays(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <input
                type="checkbox"
                checked={authorizeCid}
                onChange={(e) => setAuthorizeCid(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span>
                Exibir CID-10 no documento impresso (com termo de autorização do paciente conforme CFO)
              </span>
            </label>
          </div>
        )}

        {/* Campo específico para TCLE */}
        {kind === "tcle" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Procedimento Objeto do Consentimento (TCLE)</Label>
            <Input
              className="h-9 text-xs"
              value={procedureName}
              onChange={(e) => setProcedureName(e.target.value)}
              placeholder="Ex.: Exodontia de Terceiro Molar Incluso (#38) / Implante Osteointegrado"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Conteúdo do Documento (Editável antes de imprimir)</Label>
          <Textarea
            rows={8}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            className="font-mono text-xs leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={openPrintWindow} className="gap-1.5">
            <Printer className="h-4 w-4" />
            Apenas Imprimir / Salvar PDF ({pageSize})
          </Button>
          {canWrite && (
            <Button
              type="button"
              variant="hero"
              disabled={saveAndPrintMut.isPending}
              onClick={() => saveAndPrintMut.mutate()}
              className="gap-1.5"
            >
              <Printer className="h-4 w-4" />
              Arquivar no Prontuário & Imprimir ({pageSize})
            </Button>
          )}
        </div>
      </div>

      {/* Coluna de Pré-Visualização do Papel Timbrado */}
      <div className="rounded-2xl border bg-slate-50 p-6 shadow-inner lg:col-span-6">
        <div className="mx-auto max-w-xl rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between border-b-2 border-navy pb-3">
            <div>
              <h4 className="text-lg font-extrabold text-navy">{clinicName}</h4>
              <p className="text-[11px] text-muted-foreground">
                {unitName ?? "Unidade Matriz"}
                {unitAddress ? ` • ${unitAddress}` : ""}
                {unitPhone ? ` • ${unitPhone}` : ""}
              </p>
            </div>
            <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              Folha {pageSize}
            </span>
          </div>

          <p className="my-4 text-center text-sm font-extrabold tracking-wide text-navy">
            {kind === "prescription_simple"
              ? "RECEITUÁRIO ODONTOLÓGICO"
              : kind === "prescription_controlled"
                ? "RECEITUÁRIO DE CONTROLE ESPECIAL (2 VIAS)"
                : kind === "certificate"
                  ? "ATESTADO ODONTOLÓGICO"
                  : "TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)"}
          </p>

          <div className="mb-4 rounded-lg border bg-slate-50 p-3 text-xs">
            <p>
              <strong>Paciente:</strong> {patient.full_name}
              {formattedPatientCpf ? `  |  CPF: ${formattedPatientCpf}` : ""}
            </p>
            {kind === "tcle" && procedureName && (
              <p className="mt-1">
                <strong>Procedimento:</strong> {procedureName}
              </p>
            )}
          </div>

          <pre className="min-h-[180px] whitespace-pre-wrap font-sans text-xs leading-relaxed text-navy">
            {bodyText}
          </pre>

          {kind === "certificate" && authorizeCid && cid10Code && (
            <div className="mt-4 rounded-md border border-slate-300 bg-slate-50 p-2.5 text-[11px]">
              <strong>CID-10:</strong> {cid10Code} — Autorizo a divulgação do CID neste atestado.
            </div>
          )}

          {kind === "prescription_controlled" && (
            <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-slate-600">
              <div className="rounded border p-2">
                <strong>IDENTIFICAÇÃO DO COMPRADOR</strong>
                <p className="mt-1">Nome / RG / Endereço / Telefone</p>
              </div>
              <div className="rounded border p-2">
                <strong>IDENTIFICAÇÃO DO FORNECEDOR</strong>
                <p className="mt-1">Carimbo da Farmácia • 1ª e 2ª Vias</p>
              </div>
            </div>
          )}

          <div className="mt-8 grid grid-cols-2 gap-6 pt-6 text-center text-[11px]">
            <div>
              <div className="mx-auto mb-1 w-44 border-t border-navy" />
              <p className="font-bold text-navy">{selectedProfName}</p>
              <p className="text-muted-foreground">{professionalCro}</p>
            </div>
            {(kind === "tcle" || kind === "certificate") && (
              <div>
                <div className="mx-auto mb-1 w-44 border-t border-navy" />
                <p className="font-bold text-navy">{patient.full_name}</p>
                <p className="text-muted-foreground">Paciente / Responsável Legal</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

