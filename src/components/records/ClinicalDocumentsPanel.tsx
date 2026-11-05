import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clock,
  FileCheck2,
  FileSignature,
  FileText,
  MessageCircle,
  Pill,
  Printer,
  ScrollText,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  HeartPulse,
} from "lucide-react";
import {
  DENTAL_CID10_CODES,
  DENTAL_PRESCRIPTION_PRESETS,
  type PrintableDocumentKind,
  type PrintablePageSize,
  buildClinicalDocumentRecordPayload,
  buildPrintableDocumentHtml,
  createClinicalRecord,
} from "@/modules/records";
import { generateDentalContractTemplate, DENTAL_TCLE_PRESETS } from "@/modules/signatures";
import { SignaturePadModal } from "@/components/signatures/SignaturePadModal";
import { SignedDocumentsList } from "@/components/signatures/SignedDocumentsList";
import { SendSignatureWhatsAppModal } from "@/components/signatures/SendSignatureWhatsAppModal";
import { SignWithIcpBrasilModal } from "@/components/icp-brasil/SignWithIcpBrasilModal";
import { formatCPF } from "@/utils/validators";
import { toSaoPauloDateKey } from "@/utils/timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

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
    phone?: string | null | undefined;
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
  const [attendanceStartTime, setAttendanceStartTime] = useState<string>("08:30");
  const [attendanceEndTime, setAttendanceEndTime] = useState<string>("10:00");
  const [authorizeCid, setAuthorizeCid] = useState<boolean>(true);
  const [procedureName, setProcedureName] = useState<string>("Reabilitação Oral / Procedimento Odontológico");
  const [bodyText, setBodyText] = useState<string>(DENTAL_PRESCRIPTION_PRESETS[0]?.text ?? "");
  const [activePresetCategory, setActivePresetCategory] = useState<string>("all");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [validationCode, setValidationCode] = useState<string | null>(null);
  const [validationUrl, setValidationUrl] = useState<string | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState<boolean>(false);
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState<boolean>(false);
  const [icpModalOpen, setIcpModalOpen] = useState<boolean>(false);

  const selectedProfName =
    professionals.find((p) => p.id === professionalId)?.name ?? "Cirurgião-Dentista Responsável";

  const formattedPatientCpf = patient.cpf ? formatCPF(patient.cpf) : "";

  useEffect(() => {
    if (kind === "prescription_simple" || kind === "prescription_controlled") {
      setBodyText(DENTAL_PRESCRIPTION_PRESETS[0]?.text ?? "");
    } else if (kind === "certificate") {
      const days = Math.max(0, Number(restDays) || 0);
      setBodyText(
        days > 0
          ? `Atesto, para os devidos fins, que o(a) paciente ${patient.full_name}${formattedPatientCpf ? `, inscrito(a) no CPF sob nº ${formattedPatientCpf},` : ""} esteve sob meus cuidados profissionais em atendimento odontológico nesta data, necessitando de ${days} (${days === 1 ? "um" : days}) dia(s) de repouso/afastamento de suas atividades laborais ou escolares a partir desta data.`
          : `Declaro, para os devidos fins, que o(a) paciente ${patient.full_name}${formattedPatientCpf ? `, inscrito(a) no CPF sob nº ${formattedPatientCpf},` : ""} compareceu a esta clínica para atendimento odontológico nesta data.`,
      );
    } else if (kind === "attendance_declaration") {
      setBodyText(
        `Declaro, para os devidos fins de comprovação junto a empresas, escolas ou repartições públicas, que o(a) paciente ${patient.full_name}${formattedPatientCpf ? `, inscrito(a) no CPF sob nº ${formattedPatientCpf},` : ""} esteve sob atendimento odontológico nesta clínica na presente data, no período compreendido entre ${attendanceStartTime} e ${attendanceEndTime}.\n\nRecomenda-se o abono das horas correspondentes ao deslocamento e atendimento prestado.`,
      );
    } else if (kind === "orientation_post_op") {
      setBodyText(
        `RECOMENDAÇÕES E CUIDADOS PÓS-OPERATÓRIOS:\n\n` +
        `1. COMPRESSA DE GELO: Aplicar bolsa de gelo envolvida em pano externamente na face (20 minutos aplicando, 20 minutos de descanso) nas primeiras 24 horas para minimizar inchaço e hematomas.\n` +
        `2. ALIMENTAÇÃO: Dieta líquida ou pastosa e fria/morna nos primeiros 2 a 3 dias (iogurtes, sopas batidas, sorvetes). Evite mastigar do lado operado e alimentos quentes, duros ou crocantes.\n` +
        `3. HIGIENIZAÇÃO: Escovação suave com escova macia. NÃO FAÇA BOCHECHOS VIGOROSOS nem cuspa com força nas primeiras 24 horas para não remover o coágulo sanguíneo protetor.\n` +
        `4. REPOUSO: Mantenha repouso relativo, evite esforço físico intenso, academia, abaixar a cabeça e exposição solar por 48 a 72 horas.\n` +
        `5. MEDICAÇÃO: Tome rigorosamente os medicamentos prescritos nos horários indicados, sem interromper antes do prazo estipulado.\n` +
        `6. HÁBITOS: Não fume e não consuma bebidas alcoólicas durante o período de cicatrização e tratamento medicamentoso.\n\n` +
        `Em caso de sangramento persistente, febre ou dor intensa que não ceda com a medicação prescrita, contate nossa clínica imediatamente.`,
      );
    } else if (kind === "tcle") {
      setBodyText(
        `Pelo presente Termo de Consentimento Livre e Esclarecido (TCLE), eu, ${patient.full_name}${formattedPatientCpf ? `, CPF ${formattedPatientCpf},` : ""} declaro que fui devidamente informado(a) pelo(a) Cirurgião-Dentista ${selectedProfName} (${professionalCro}) sobre o diagnóstico, objetivos, etapas clínicas, alternativas de tratamento, custos e riscos biológicos inerentes ao procedimento proposto (${procedureName}).\n\n1. Compreendo que a Odontologia não é uma ciência exata e que os resultados dependem também da resposta biológica individual, anatomia, higienização bucal e cumprimento rigoroso das recomendações pós-operatórias e retornos agendados.\n2. Fui orientado(a) quanto aos possíveis efeitos pós-operatórios transitórios (edema, sensibilidade, hematoma ou desconforto local) e recebi todas as instruções verbais e escritas de medicação e cuidados.\n3. Autorizo a realização do tratamento proposto, bem como registros fotográficos/radiográficos para fins exclusivamente clínicos e de prontuário odontológico.`,
      );
    } else if (kind === "contract") {
      setBodyText(
        generateDentalContractTemplate({
          clinicName,
          patientName: patient.full_name,
          patientCpf: patient.cpf || "",
        }),
      );
    }
  }, [
    kind,
    patient.full_name,
    patient.cpf,
    formattedPatientCpf,
    restDays,
    attendanceStartTime,
    attendanceEndTime,
    selectedProfName,
    professionalCro,
    procedureName,
    clinicName,
  ]);

  function handleAppendPreset(presetText: string) {
    setBodyText((prev) => {
      const cleanPrev = prev.trim();
      if (!cleanPrev) return presetText;
      const matches = cleanPrev.match(/^\s*(\d+)\)/gm);
      const nextNum = matches ? matches.length + 1 : 2;
      const adjusted = presetText.replace(/^\s*1\)/, `${nextNum})`);
      return `${cleanPrev}\n\n${adjusted}`;
    });
    toast.success("Medicamento adicionado à prescrição!");
  }

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
        attendanceStartTime: kind === "attendance_declaration" ? attendanceStartTime : undefined,
        attendanceEndTime: kind === "attendance_declaration" ? attendanceEndTime : undefined,
        authorizeCidDisclosure: kind === "certificate" ? authorizeCid : undefined,
        procedureName: kind === "tcle" ? procedureName : undefined,
        validationCode: validationCode || undefined,
        validationUrl: validationUrl || undefined,
        signatureDataUrl: signatureDataUrl || undefined,
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
        attendanceStartTime: kind === "attendance_declaration" ? attendanceStartTime : undefined,
        attendanceEndTime: kind === "attendance_declaration" ? attendanceEndTime : undefined,
        authorizeCidDisclosure: kind === "certificate" ? authorizeCid : undefined,
        procedureName: kind === "tcle" ? procedureName : undefined,
        validationCode: validationCode || undefined,
        validationUrl: validationUrl || undefined,
        signatureDataUrl: signatureDataUrl || undefined,
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

  function handleSendWhatsAppDirect() {
    const rawPhone = patient.phone ? patient.phone.replace(/\D/g, "") : "";
    const cleanDocTitle =
      kind === "prescription_simple"
        ? "Receituário Odontológico Simples"
        : kind === "prescription_controlled"
          ? "Receituário de Controle Especial (2 Vias)"
          : kind === "certificate"
            ? "Atestado Odontológico"
            : kind === "attendance_declaration"
              ? "Declaração de Comparecimento Odontológico"
              : kind === "orientation_post_op"
                ? "Orientações Pós-Operatórias"
                : kind === "contract"
                  ? "Contrato Odontológico"
                  : "Termo de Consentimento Livre e Esclarecido (TCLE)";

    let validationMsg = "";
    if (validationCode) {
      const valUrl = validationUrl || (typeof window !== "undefined" ? `${window.location.origin}/validar/${validationCode}` : "");
      validationMsg = `\n\n🔒 *Documento com Assinatura Digital Oficial ICP-Brasil*\nCódigo de Validação: *${validationCode}*\nConsulte a autenticidade em: ${valUrl}`;
    }

    const fullMsg = `Olá, ${patient.full_name}! 👋\n\nSegue o seu documento emitido por ${selectedProfName} (${professionalCro}) na clínica ${clinicName}:\n\n📋 *${cleanDocTitle}*\nData: ${issueDate}\n\n${bodyText}${validationMsg}`;

    const encoded = encodeURIComponent(fullMsg);
    const url = rawPhone ? `https://wa.me/55${rawPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success("WhatsApp aberto com a mensagem pré-preenchida!");
  }

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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setKind("prescription_simple")}
            className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition ${
              kind === "prescription_simple"
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "bg-background text-foreground hover:bg-muted/60"
            }`}
          >
            <Pill className="h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <div>Receituário Simples</div>
              <div className="text-[10px] font-normal text-muted-foreground">Analgésicos, anti-inflamatórios</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setKind("prescription_controlled")}
            className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition ${
              kind === "prescription_controlled"
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "bg-background text-foreground hover:bg-muted/60"
            }`}
          >
            <FileCheck2 className="h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <div>Controle Especial (2 Vias)</div>
              <div className="text-[10px] font-normal text-muted-foreground">Antibióticos / Portaria 344</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setKind("certificate")}
            className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition ${
              kind === "certificate"
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "bg-background text-foreground hover:bg-muted/60"
            }`}
          >
            <FileText className="h-4 w-4 shrink-0 text-sky-600" />
            <div>
              <div>Atestado Odontológico</div>
              <div className="text-[10px] font-normal text-muted-foreground">Repouso e CID-10 oficial</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setKind("attendance_declaration")}
            className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition ${
              kind === "attendance_declaration"
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "bg-background text-foreground hover:bg-muted/60"
            }`}
          >
            <Clock className="h-4 w-4 shrink-0 text-purple-600" />
            <div>
              <div>Declaração Horas</div>
              <div className="text-[10px] font-normal text-muted-foreground">Comparecimento e abono</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setKind("orientation_post_op")}
            className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition ${
              kind === "orientation_post_op"
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "bg-background text-foreground hover:bg-muted/60"
            }`}
          >
            <HeartPulse className="h-4 w-4 shrink-0 text-rose-600" />
            <div>
              <div>Pós-Operatório</div>
              <div className="text-[10px] font-normal text-muted-foreground">Cuidados pós-cirúrgicos</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setKind("tcle")}
            className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition ${
              kind === "tcle"
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "bg-background text-foreground hover:bg-muted/60"
            }`}
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-teal" />
            <div>
              <div>Termo TCLE</div>
              <div className="text-[10px] font-normal text-muted-foreground">Consentimento do paciente</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setKind("contract")}
            className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition ${
              kind === "contract"
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "bg-background text-foreground hover:bg-muted/60"
            }`}
          >
            <ScrollText className="h-4 w-4 shrink-0 text-indigo-600" />
            <div>
              <div>Contrato Odonto</div>
              <div className="text-[10px] font-normal text-muted-foreground">Prestação de serviços</div>
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

        {/* Bulário Odontológico Rápido com Categorias */}
        {(kind === "prescription_simple" || kind === "prescription_controlled") && (
          <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> Bulário Odontológico Inteligente (Clique para adicionar):
              </Label>
              <div className="flex flex-wrap gap-1 text-[10px]">
                {[
                  { id: "all", label: "Todos" },
                  { id: "analgesic", label: "Analgésicos" },
                  { id: "anti_inflammatory", label: "Anti-inflamatórios" },
                  { id: "antibiotic", label: "Antibióticos" },
                  { id: "antiseptic", label: "Antissépticos" },
                  { id: "corticoid_topical", label: "Tópicos" },
                  { id: "anxiolytic", label: "Sedação" },
                  { id: "pediatric", label: "Pediátricos" },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActivePresetCategory(c.id)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition ${
                      activePresetCategory === c.id
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-1">
              {DENTAL_PRESCRIPTION_PRESETS.filter(
                (p) => activePresetCategory === "all" || p.category === activePresetCategory,
              ).map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10.5px] px-2 py-0 border-muted-foreground/30 hover:border-primary hover:text-primary transition"
                  onClick={() => handleAppendPreset(preset.text)}
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

            <label className="flex items-center gap-2 text-xs sm:col-span-2 cursor-pointer">
              <input
                type="checkbox"
                checked={authorizeCid}
                onChange={(e) => setAuthorizeCid(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span>
                Exibir CID-10 no documento impresso (com termo de autorização expressa do paciente conforme CFO)
              </span>
            </label>
          </div>
        )}

        {/* Campos específicos para Declaração de Comparecimento */}
        {kind === "attendance_declaration" && (
          <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Horário de Início do Atendimento</Label>
              <Input
                type="time"
                className="h-8 text-xs"
                value={attendanceStartTime}
                onChange={(e) => setAttendanceStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Horário de Término do Atendimento</Label>
              <Input
                type="time"
                className="h-8 text-xs"
                value={attendanceEndTime}
                onChange={(e) => setAttendanceEndTime(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-muted-foreground sm:col-span-2">
              A declaração justificará o período de atendimento odontológico para fins escolares ou laborais.
            </p>
          </div>
        )}

        {/* Campo específico para TCLE com Presets Oficiais */}
        {kind === "tcle" && (
          <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" /> Modelos de TCLE Odontológico (1 Clique):
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {DENTAL_TCLE_PRESETS.map((tcle) => (
                  <Button
                    key={tcle.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] justify-start text-left truncate px-2.5 border-muted-foreground/30 hover:border-primary hover:text-primary transition"
                    onClick={() => {
                      setProcedureName(tcle.procedureName);
                      setBodyText(
                        tcle.generateText({
                          patientName: patient.full_name,
                          patientCpf: patient.cpf,
                          dentistName: selectedProfName,
                          dentistCro: professionalCro,
                          clinicName,
                        }),
                      );
                      toast.success(`TCLE carregado: ${tcle.categoryLabel}`);
                    }}
                  >
                    📄 {tcle.categoryLabel}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <Label className="text-xs">Procedimento / Tratamento Referenciado</Label>
              <Input
                className="h-9 text-xs"
                value={procedureName}
                onChange={(e) => setProcedureName(e.target.value)}
                placeholder="Ex.: Exodontia de Terceiro Molar Incluso (#38) / Implante Osteointegrado"
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Conteúdo do Documento (Editável antes de imprimir)</Label>
            {validationCode && (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] gap-1">
                <CheckCircle2 className="h-3 w-3" /> Assinado ICP-Brasil ({validationCode})
              </Badge>
            )}
          </div>
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
            Imprimir / PDF ({pageSize})
          </Button>

          {canWrite && (
            <>
              <Button
                type="button"
                variant="hero"
                disabled={saveAndPrintMut.isPending}
                onClick={() => saveAndPrintMut.mutate()}
                className="gap-1.5"
              >
                <Printer className="h-4 w-4" />
                Arquivar & Imprimir
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleSendWhatsAppDirect}
                className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 shadow-sm"
              >
                <MessageCircle className="h-4 w-4 text-emerald-600" />
                Enviar no WhatsApp
              </Button>

              <Button
                type="button"
                onClick={() => setIcpModalOpen(true)}
                className="gap-1.5 bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm"
              >
                <ShieldCheck className="h-4 w-4" />
                Assinar ICP-Brasil (Dentista)
              </Button>

              <Button
                type="button"
                onClick={() => setSignatureModalOpen(true)}
                className="gap-1.5 bg-teal text-white hover:bg-teal-600 shadow-sm"
              >
                <FileSignature className="h-4 w-4" />
                Coletar Assinatura Touch
              </Button>
            </>
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
                {unitPhone ? ` • Tel: ${unitPhone}` : ""}
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
                  : kind === "attendance_declaration"
                    ? "DECLARAÇÃO DE COMPARECIMENTO ODONTOLÓGICO"
                    : kind === "orientation_post_op"
                      ? "ORIENTAÇÕES E CUIDADOS PÓS-OPERATÓRIOS"
                      : kind === "contract"
                        ? "CONTRATO DE PRESTAÇÃO DE SERVIÇOS ODONTOLÓGICOS"
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

          <pre className="min-h-[160px] whitespace-pre-wrap font-sans text-xs leading-relaxed text-navy">
            {bodyText}
          </pre>

          {kind === "certificate" && authorizeCid && cid10Code && (
            <div className="mt-4 rounded-md border border-slate-300 bg-slate-50 p-2.5 text-[11px]">
              <strong>CID-10:</strong> {cid10Code} — Autorizo expressamente a inclusão do CID neste atestado.
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

          {/* Selo de Assinatura Digital ICP-Brasil */}
          {validationCode && (
            <div className="mt-4 rounded-lg border-2 border-emerald-500 bg-emerald-50/60 p-3 text-[11px] space-y-1">
              <div className="flex items-center justify-between font-bold text-emerald-950">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  Assinado Digitalmente — ICP-Brasil
                </span>
                <span className="font-mono text-xs">{validationCode}</span>
              </div>
              <p className="text-[10px] text-emerald-800">
                Autenticidade verificável em: <strong>{validationUrl || "app.sondapro.com.br/validar/" + validationCode}</strong>
              </p>
            </div>
          )}

          <div className="mt-8 grid grid-cols-2 gap-6 pt-6 text-center text-[11px]">
            <div>
              {signatureDataUrl ? (
                <img
                  src={signatureDataUrl}
                  alt="Assinatura"
                  className="mx-auto mb-1 max-h-12 max-w-[150px] object-contain"
                />
              ) : (
                <div className="mx-auto mb-1 w-44 border-t border-navy" />
              )}
              <p className="font-bold text-navy">{selectedProfName}</p>
              <p className="text-muted-foreground">{professionalCro}</p>
            </div>
            {(kind === "tcle" || kind === "certificate" || kind === "contract") && (
              <div>
                <div className="mx-auto mb-1 w-44 border-t border-navy" />
                <p className="font-bold text-navy">{patient.full_name}</p>
                <p className="text-muted-foreground">Paciente / Responsável Legal</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lista e Gestão de Termos e Contratos Assinados Eletronicamente */}
      <div className="lg:col-span-12">
        <SignedDocumentsList
          clinicId={clinicId}
          patientId={patient.id}
          clinicName={clinicName}
          unitName={unitName}
          unitAddress={unitAddress}
          unitPhone={unitPhone}
          onNewSignature={() => setSignatureModalOpen(true)}
          onNewWhatsAppSignature={() => setWhatsAppModalOpen(true)}
        />
      </div>

      <SignaturePadModal
        open={signatureModalOpen}
        onOpenChange={setSignatureModalOpen}
        clinicId={clinicId}
        patientId={patient.id}
        patientName={patient.full_name}
        patientCpf={patient.cpf}
        documentType={
          kind === "tcle"
            ? "tcle"
            : kind === "certificate" || kind === "attendance_declaration"
              ? "certificate"
              : kind === "contract"
                ? "contract"
                : kind === "prescription_simple" || kind === "prescription_controlled"
                  ? "prescription"
                  : "other"
        }
        documentTitle={
          kind === "prescription_simple"
            ? "Receituário Simples"
            : kind === "prescription_controlled"
              ? "Receituário de Controle Especial"
              : kind === "certificate"
                ? "Atestado Odontológico"
                : kind === "attendance_declaration"
                  ? "Declaração de Comparecimento"
                  : kind === "orientation_post_op"
                    ? "Orientações Pós-Operatórias"
                    : kind === "contract"
                      ? "Contrato de Prestação de Serviços Odontológicos"
                      : `Termo de Consentimento Livre e Esclarecido (TCLE) — ${procedureName}`
        }
        documentContent={bodyText}
        onSuccess={(sig) => {
          if (sig?.signature_data_url) {
            setSignatureDataUrl(sig.signature_data_url);
          }
          qc.invalidateQueries({ queryKey: ["patientSignatures", clinicId, patient.id] });
          qc.invalidateQueries({ queryKey: ["clinicalRecords", clinicId, patient.id] });
        }}
      />

      <SendSignatureWhatsAppModal
        open={whatsAppModalOpen}
        onOpenChange={setWhatsAppModalOpen}
        clinicId={clinicId}
        patientId={patient.id}
        patientName={patient.full_name}
        patientPhone={patient.phone}
        patientCpf={patient.cpf}
        clinicName={clinicName}
        documentType={
          kind === "tcle"
            ? "tcle"
            : kind === "certificate" || kind === "attendance_declaration"
              ? "certificate"
              : kind === "contract"
                ? "contract"
                : kind === "prescription_simple" || kind === "prescription_controlled"
                  ? "prescription"
                  : "other"
        }
        documentTitle={
          kind === "prescription_simple"
            ? "Receituário Simples"
            : kind === "prescription_controlled"
              ? "Receituário de Controle Especial"
              : kind === "certificate"
                ? "Atestado Odontológico"
                : kind === "attendance_declaration"
                  ? "Declaração de Comparecimento"
                  : kind === "orientation_post_op"
                    ? "Orientações Pós-Operatórias"
                    : kind === "contract"
                      ? "Contrato de Prestação de Serviços Odontológicos"
                      : `Termo de Consentimento Livre e Esclarecido (TCLE) — ${procedureName}`
        }
        documentContent={bodyText}
      />

      <SignWithIcpBrasilModal
        open={icpModalOpen}
        onOpenChange={setIcpModalOpen}
        clinicId={clinicId}
        patientId={patient.id}
        professionalId={professionalId}
        professionalName={selectedProfName}
        professionalCro={professionalCro}
        documentType={
          kind === "prescription_simple"
            ? "prescription_simple"
            : kind === "prescription_controlled"
              ? "prescription_controlled"
              : kind === "certificate" || kind === "attendance_declaration"
                ? "certificate"
                : kind === "tcle"
                  ? "tcle"
                  : "other"
        }
        documentTitle={
          kind === "prescription_simple"
            ? "Receituário Simples"
            : kind === "prescription_controlled"
              ? "Receituário de Controle Especial (2 Vias)"
              : kind === "certificate"
                ? "Atestado Odontológico"
                : kind === "attendance_declaration"
                  ? "Declaração de Comparecimento"
                  : kind === "orientation_post_op"
                    ? "Orientações Pós-Operatórias"
                    : kind === "contract"
                      ? "Contrato Odontológico"
                      : `Termo de Consentimento Livre e Esclarecido (TCLE) — ${procedureName}`
        }
        documentContent={bodyText}
        onSigned={(sig) => {
          setValidationCode(sig.validation_code);
          setValidationUrl(sig.validation_url);
          toast.success(`Assinado com sucesso via ICP-Brasil! Código: ${sig.validation_code}`);
        }}
      />
    </div>
  );
}

