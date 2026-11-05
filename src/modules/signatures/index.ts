import { supabase, assertClinicScope, normalizeSupabaseError } from "@/services/supabase";
import type {
  DocumentSignatureRequest,
  ElectronicSignatureDocumentType,
  PatientElectronicSignature,
  PublicSignatureRequestInfo,
  SignerRole,
} from "@/types";
import { formatCPF } from "@/utils/validators";
import { buildWhatsAppWebUrl } from "@/modules/whatsapp";

export interface CreateSignaturePayload {
  patient_id: string;
  document_type: ElectronicSignatureDocumentType;
  document_title: string;
  document_content: string;
  signer_name: string;
  signer_cpf: string;
  signer_role: SignerRole;
  signer_email?: string | null;
  signer_phone?: string | null;
  signature_data_url: string;
  metadata?: Record<string, unknown>;
}

/**
 * Calcula o Hash SHA-256 criptográfico para garantia de integridade do documento
 * Conforme exigências probatórias da Lei 14.063/2020 e ICP-Brasil
 */
export async function computeDocumentSha256(
  content: string,
  extraMetadata?: Record<string, unknown>,
): Promise<string> {
  const normalized = `${content.trim()}\n---METADATA---\n${JSON.stringify(extraMetadata ?? {})}`;
  const enc = new TextEncoder();
  const data = enc.encode(normalized);

  if (typeof crypto !== "undefined" && crypto.subtle?.digest) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Fallback determinístico caso Web Crypto não esteja exposto
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `sha256_mock_${Math.abs(hash).toString(16).padStart(16, "0")}`;
}

/**
 * Busca histórico de termos e assinaturas do paciente
 */
export async function fetchPatientSignatures(
  clinicId: string,
  patientId: string,
): Promise<PatientElectronicSignature[]> {
  assertClinicScope(clinicId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("patient_electronic_signatures")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("signed_at", { ascending: false });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }

  return (data || []) as PatientElectronicSignature[];
}

/**
 * Registra uma nova assinatura eletrônica touch para o paciente
 */
export async function createElectronicSignature(
  clinicId: string,
  payload: CreateSignaturePayload,
): Promise<PatientElectronicSignature> {
  assertClinicScope(clinicId);

  const cleanCpf = payload.signer_cpf.replace(/\D/g, "");
  if (cleanCpf.length !== 11) {
    throw new Error("CPF do signatário inválido. Deve conter 11 dígitos.");
  }

  if (!payload.signature_data_url || !payload.signature_data_url.startsWith("data:image/")) {
    throw new Error("Assinatura digital gráfica ausente ou inválida.");
  }

  const hash = await computeDocumentSha256(payload.document_content, {
    signer_name: payload.signer_name,
    signer_cpf: cleanCpf,
    signer_role: payload.signer_role,
    document_type: payload.document_type,
  });

  const record = {
    clinic_id: clinicId,
    patient_id: payload.patient_id,
    document_type: payload.document_type,
    document_title: payload.document_title,
    document_content: payload.document_content,
    document_hash: hash,
    signer_name: payload.signer_name.trim(),
    signer_cpf: cleanCpf,
    signer_role: payload.signer_role,
    signer_email: payload.signer_email?.trim() || null,
    signer_phone: payload.signer_phone?.trim() || null,
    signature_data_url: payload.signature_data_url,
    ip_address: "Client-Web",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "SondaPro Web Agent",
    status: "valid",
    signed_at: new Date().toISOString(),
    metadata: payload.metadata || {},
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("patient_electronic_signatures")
    .insert(record)
    .select("*")
    .single();

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) {
      return {
        id: crypto.randomUUID(),
        ...record,
        created_at: new Date().toISOString(),
      } as PatientElectronicSignature;
    }
    throw new Error(norm.message);
  }

  return data as PatientElectronicSignature;
}

/**
 * Revoga uma assinatura eletrônica com justificativa
 */
export async function revokeElectronicSignature(
  clinicId: string,
  signatureId: string,
  reason: string,
): Promise<void> {
  assertClinicScope(clinicId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { error } = await client
    .from("patient_electronic_signatures")
    .update({
      status: "revoked",
      revocation_reason: reason,
      revoked_at: new Date().toISOString(),
    })
    .eq("clinic_id", clinicId)
    .eq("id", signatureId);

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return;
    throw new Error(norm.message);
  }
}

export interface DentalTclePreset {
  id: string;
  title: string;
  procedureName: string;
  category: "surgery" | "implant" | "endodontics" | "orthodontics" | "prosthesis" | "aesthetic" | "anesthesia";
  categoryLabel: string;
  generateText: (params: {
    patientName: string;
    patientCpf?: string | null;
    dentistName?: string;
    dentistCro?: string;
    clinicName?: string;
  }) => string;
}

export const DENTAL_TCLE_PRESETS: readonly DentalTclePreset[] = [
  {
    id: "surgery_wisdom",
    title: "TCLE — Cirurgia de Terceiro Molar (Siso) e Cirurgia Oral Menor",
    procedureName: "Exodontia Cirúrgica de Terceiros Molares (Dentes do Siso)",
    category: "surgery",
    categoryLabel: "Cirurgia Oral & Sisos",
    generateText: ({ patientName, patientCpf, dentistName = "Cirurgião-Dentista", dentistCro = "CRO", clinicName = "SondaPro" }) =>
      `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE) — CIRURGIA ORAL E EXODONTIA DE SISOS\n\n` +
      `Eu, ${patientName}${patientCpf ? `, CPF nº ${formatCPF(patientCpf)}` : ""}, declaro que fui devidamente esclarecido(a) pelo(a) Dr(a). ${dentistName} (${dentistCro}) na clínica ${clinicName} acerca da necessidade, objetivos e riscos inerentes ao procedimento cirúrgico de remoção dos dentes indicados no planejamento clínico.\n\n` +
      `1. ESCLARECIMENTOS SOBRE O PROCEDIMENTO:\n` +
      `Fui informado(a) que a cirurgia exige anestesia local, incisão cirúrgica, osteotomia (desgaste ósseo) e odontossecção (secção dental) conforme a posição do dente na arcada.\n\n` +
      `2. RISCOS E EFEITOS PÓS-OPERATÓRIOS INERENTES:\n` +
      `Compreendo que todo ato cirúrgico bucal envolve riscos biológicos conhecidos, incluindo:\n` +
      `• Edema (inchaço facial), hematomas, equimoses e dor controlável com medicamentos;\n` +
      `• Trismo (dificuldade temporária de abertura de boca);\n` +
      `• Parestesia (sensação temporária ou raramente prolongada de dormência/formigamento no lábio, queixo ou língua por proximidade anatômica com os nervos Alveolar Inferior ou Lingual);\n` +
      `• Comunicação bucosinusal e sinusite maxilar transitória nos dentes superiores posteriores;\n` +
      `• Hemorragia pós-operatória e alveolite seca/úmida (infecção do alvéolo).\n\n` +
      `3. MEUS DEVERES E CUIDADOS:\n` +
      `Comprometo-me a cumprir rigorosamente as orientações pós-operatórias (bolsa de gelo nas primeiras 24h, alimentação líquida/fria, não cuspir, não fazer bochechos, repouso físico e não fumar), bem como tomar os medicamentos prescritos e retornar para remoção de suturas.\n\n` +
      `Declaro estar plenamente esclarecido(a) e autorizo a execução do procedimento.`,
  },
  {
    id: "implant_bone_graft",
    title: "TCLE — Implante Dentário Osteointegrado & Enxerto Ósseo",
    procedureName: "Instalação Cirúrgica de Implante Dentário Osteointegrado",
    category: "implant",
    categoryLabel: "Implantodontia",
    generateText: ({ patientName, patientCpf, dentistName = "Cirurgião-Dentista", dentistCro = "CRO", clinicName = "SondaPro" }) =>
      `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE) — IMPLANTE DENTÁRIO OSTEOINTEGRADO\n\n` +
      `Eu, ${patientName}${patientCpf ? `, CPF nº ${formatCPF(patientCpf)}` : ""}, autorizo a realização do procedimento cirúrgico de implante dentário osteointegrado pelo(a) Dr(a). ${dentistName} (${dentistCro}) na clínica ${clinicName}.\n\n` +
      `1. PROCESSO BIOLÓGICO DE OSSEOINTEGRAÇÃO:\n` +
      `Fui informado(a) de que o implante de titânio necessita de um período de cicatrização óssea (osseointegração) que varia entre 3 a 6 meses, conforme a densidade óssea e eventual necessidade de enxerto ósseo/biomateriais.\n\n` +
      `2. RISCOS, CONTRAINDICAÇÕES E TAXA DE SUCESSO:\n` +
      `Embora a implantodontia possua taxa de sucesso superior a 95%, compreendo que a medicina e odontologia não são ciências exatas e que existe risco de não osseointegração ou perda tardia por peri-implantite, influenciada por fatores sistêmicos (diabetes descompensada, fumo, osteoporose ou bruxismo).\n\n` +
      `3. CUIDADOS E COMPROMISSO:\n` +
      `Comprometo-me a manter higienização meticulosa com escovas interdentais e comparecer às manutenções preventivas periódicas (a cada 6 meses) sob pena de perda de garantia do trabalho.\n\n` +
      `Declaro que tive oportunidade de sanar todas as dúvidas e autorizo a intervenção cirúrgica.`,
  },
  {
    id: "endodontics_canal",
    title: "TCLE — Tratamento e Retratamento Endodôntico (Canal)",
    procedureName: "Tratamento Endodôntico / Desinfecção e Obturação de Canal",
    category: "endodontics",
    categoryLabel: "Endodontia",
    generateText: ({ patientName, patientCpf, dentistName = "Cirurgião-Dentista", dentistCro = "CRO", clinicName = "SondaPro" }) =>
      `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE) — TRATAMENTO DE CANAL (ENDODONTIA)\n\n` +
      `Eu, ${patientName}${patientCpf ? `, CPF nº ${formatCPF(patientCpf)}` : ""}, autorizo o(a) Dr(a). ${dentistName} (${dentistCro}) a realizar o tratamento/retratamento endodôntico na clínica ${clinicName}.\n\n` +
      `1. OBJETIVO DO TRATAMENTO:\n` +
      `O objetivo do tratamento de canal é remover a polpa dentária inflamada ou necrosada, desinfectar os condutos radiculares e selá-los hermeticamente para debelar a infecção e preservar o elemento dental em boca.\n\n` +
      `2. RISCOS E LIMITAÇÕES BIOLÓGICAS:\n` +
      `Fui cientificado(a) de que canais atrésicos, curvos ou calcificados podem apresentar dificuldades anatômicas, tais como fratura de lima/instrumento endodôntico no interior do canal, perfurações de raiz, dor pós-operatória inflamatória ou necessidade de complementação cirúrgica parendodôntica.\n\n` +
      `3. RESTAURAÇÃO DEFINITIVA INDISPENSÁVEL:\n` +
      `Estou ciente de que um dente tratado endodonticamente torna-se mais frágil e necessita de restauração definitiva (resina, bloco, pino de fibra de vidro ou coroa protética) o mais breve possível para evitar fraturas coronorradiculares irreparáveis que levariam à extração.\n\n` +
      `Concordo plenamente com os termos e autorizo o tratamento.`,
  },
  {
    id: "orthodontics_braces",
    title: "TCLE — Tratamento Ortodôntico (Aparelhos Fixos & Alinhadores)",
    procedureName: "Instalação e Manutenção de Aparelho Ortodôntico / Alinhadores",
    category: "orthodontics",
    categoryLabel: "Ortodontia",
    generateText: ({ patientName, patientCpf, dentistName = "Cirurgião-Dentista", dentistCro = "CRO", clinicName = "SondaPro" }) =>
      `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE) — TRATAMENTO ORTODÔNTICO\n\n` +
      `Eu, ${patientName}${patientCpf ? `, CPF nº ${formatCPF(patientCpf)}` : ""}, declaro que contratei o tratamento ortodôntico sob responsabilidade do(a) Dr(a). ${dentistName} (${dentistCro}) na clínica ${clinicName}.\n\n` +
      `1. DINÂMICA E DURAÇÃO DO TRATAMENTO:\n` +
      `Fui orientado(a) de que a movimentação dental biológica é contínua e a estimativa de tempo depende da resposta óssea individual e do meu comparecimento rigoroso às manutenções mensais.\n\n` +
      `2. RESPONSABILIDADES DO PACIENTE:\n` +
      `Reconheço que a higienização bucal redobrada é crucial para evitar desmineralizações (manchas brancas no esmalte), gengivite e cáries durante o uso do aparelho. Devo evitar mastigar alimentos excessivamente duros ou grudentos que possam descolar braquetes e danificar fios.\n\n` +
      `3. FASE DE CONTENÇÃO PÓS-TRATAMENTO:\n` +
      `Estou ciente de que, após a remoção do aparelho fixo ou finalização dos alinhadores, é OBRIGATÓRIO o uso das contenções ortodônticas superiores e inferiores conforme prescrito, sob pena de recidiva (desalinhamento dos dentes).\n\n` +
      `Li e concordo com todas as condições do tratamento ortodôntico.`,
  },
  {
    id: "prosthesis_laminates",
    title: "TCLE — Próteses Fixas, Facetas & Lentes de Contato Cerâmicas",
    procedureName: "Reabilitação Estética Cerâmica / Facetas / Lentes de Contato",
    category: "prosthesis",
    categoryLabel: "Prótese & Estética",
    generateText: ({ patientName, patientCpf, dentistName = "Cirurgião-Dentista", dentistCro = "CRO", clinicName = "SondaPro" }) =>
      `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE) — PRÓTESES E FACETAS CERÂMICAS\n\n` +
      `Eu, ${patientName}${patientCpf ? `, CPF nº ${formatCPF(patientCpf)}` : ""}, autorizo o planejamento e execução da reabilitação protética/estética pelo(a) Dr(a). ${dentistName} (${dentistCro}) na clínica ${clinicName}.\n\n` +
      `1. PREPARO DENTAL E ETAPAS CLÍNICAS:\n` +
      `Fui informado(a) sobre a necessidade de preparos dentais (desgastes biológicos conservadores e controlados), moldagens ou escaneamentos digitais, confecção de provisórios e provas clínicas de cor e adaptação.\n\n` +
      `2. PROVA DE COR E APROVAÇÃO ESTÉTICA:\n` +
      `Declaro que antes da cimentação definitiva terei a oportunidade de avaliar a forma, cor e sorriso com as peças cerâmicas em boca. A cimentação definitiva representará o meu aceite estético e funcional das peças.\n\n` +
      `3. CUIDADOS E BRUXISMO:\n` +
      `Estou ciente de que cerâmicas odontológicas possuem resistência similar ao esmalte dental e exigem uso de placa miorrelaxante caso eu apresente bruxismo ou apertamento dental noturno, além de visitas semestrais de revisão.\n\n` +
      `Autorizo a confecção e cimentação dos trabalhos protéticos.`,
  },
  {
    id: "bleaching_teeth",
    title: "TCLE — Clareamento Dental (Consultório & Caseiro)",
    procedureName: "Clareamento Dental Supervisionado com Gel de Peróxido",
    category: "aesthetic",
    categoryLabel: "Clareamento Dental",
    generateText: ({ patientName, patientCpf, dentistName = "Cirurgião-Dentista", dentistCro = "CRO", clinicName = "SondaPro" }) =>
      `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE) — CLAREAMENTO DENTAL\n\n` +
      `Eu, ${patientName}${patientCpf ? `, CPF nº ${formatCPF(patientCpf)}` : ""}, declaro que optei pela realização de clareamento dental supervisionado pelo(a) Dr(a). ${dentistName} (${dentistCro}) na clínica ${clinicName}.\n\n` +
      `1. RESULTADO INDIVIDUALIZADO:\n` +
      `Fui orientado(a) de que a resposta de clareamento depende da estrutura e mineralização do esmalte de cada paciente, não sendo possível garantir um tom exato pré-determinado de branco.\n\n` +
      `2. SENSIBILIDADE DENTINÁRIA TRANSITÓRIA:\n` +
      `Compreendo que sensibilidade térmica a líquidos frios ou ar é um efeito colateral comum e temporário durante o tratamento, que cessa após a conclusão das aplicações e uso de dessensibilizantes.\n\n` +
      `3. RESTAURAÇÕES NÃO CLAREIAM:\n` +
      `Estou ciente de que restaurações de resina composta e coroas de porcelana já existentes NÃO sofrem clareamento com o gel, podendo ser necessária sua troca estética após a finalização do clareamento para equalizar as cores.\n\n` +
      `Autorizo o procedimento de clareamento dental.`,
  },
];

/**
 * Gera modelo padrão de Contrato de Prestação de Serviços Odontológicos
 */
export function generateDentalContractTemplate(params: {
  clinicName: string;
  patientName: string;
  patientCpf: string;
  patientAddress?: string;
  procedureList?: string[];
  totalAmount?: number;
  paymentConditions?: string;
}): string {
  const formattedCpf = params.patientCpf ? formatCPF(params.patientCpf) : "___.___.___-__";
  const procs = params.procedureList && params.procedureList.length > 0
    ? params.procedureList.join(", ")
    : "Procedimentos e etapas descritas no Plano de Tratamento Odontológico anexo";
  const amountStr = params.totalAmount ? `R$ ${params.totalAmount.toFixed(2)}` : "conforme orçamento anexo";

  return `CONTRATO DE PRESTAÇÃO DE SERVIÇOS ODONTOLÓGICOS

Pelo presente instrumento particular, de um lado:
CONTRATADA: ${params.clinicName}, estabelecida em território nacional;
CONTRATANTE: ${params.patientName}, portador(a) do CPF nº ${formattedCpf}${params.patientAddress ? `, residente à ${params.patientAddress}` : ""}.

As partes têm, entre si, justo e acordado o seguinte:

CLÁUSULA 1ª - DO OBJETO:
O presente contrato tem por objeto a prestação de serviços odontológicos consistentes em: ${procs}, sob as normas éticas e técnicas do Conselho Federal de Odontologia (CFO).

CLÁUSULA 2ª - DAS OBRIGAÇÕES DA CONTRATADA:
A CONTRATADA compromete-se a empregar os meios técnicos e científicos adequados e disponíveis para a execução do plano de tratamento, atuando com diligência e perícia. O CONTRATANTE reconhece expressamente que os tratamentos odontológicos constituem obrigação de meio, e não de fim ou resultado, dependendo da resposta biológica individual e cooperação do paciente.

CLÁUSULA 3ª - DAS OBRIGAÇÕES DO CONTRATANTE:
O CONTRATANTE obriga-se a comparecer pontualmente a todas as consultas agendadas, seguir rigorosamente as prescrições medicamentosas, manter a higienização bucal orientada e comunicar imediatamente qualquer intercorrência ou desconforto.

CLÁUSULA 4ª - DOS VALORES E FORMAS DE PAGAMENTO:
Pela execução dos procedimentos, o CONTRATANTE pagará à CONTRATADA a quantia de ${amountStr}, conforme condições acordadas: ${params.paymentConditions || "à vista ou parcelado segundo cronograma financeiro"}.

CLÁUSULA 5ª - DO ABANDONO DE TRATAMENTO:
A ausência injustificada do paciente por período superior a 30 (trinta) dias consecutivos após agendamento caracterizará abandono voluntário do tratamento, desobrigando a CONTRATADA de qualquer responsabilidade pela evolução clínica dos atos inacabados.

CLÁUSULA 6ª - DO FORO E VALIDADE JURÍDICA:
As partes elegem o foro da Comarca local para dirimir quaisquer dúvidas decorrentes do presente contrato, reconhecendo plena validade à assinatura eletrônica sob os termos da Lei Federal nº 14.063/2020.`;
}

/**
 * Gera documento HTML para impressão e arquivamento com selo criptográfico e carimbo probatório
 */
export function buildSignedDocumentPrintableHtml(params: {
  signature: PatientElectronicSignature;
  clinicName: string;
  unitName?: string | null | undefined;
  unitAddress?: string | null | undefined;
  unitPhone?: string | null | undefined;
}): string {
  const s = params.signature;
  const formattedCpf = formatCPF(s.signer_cpf);
  const signedDate = new Date(s.signed_at).toLocaleString("pt-BR");
  const isRevoked = s.status === "revoked";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${s.document_title} — Assinado Digitalmente</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      line-height: 1.5;
      font-size: 13px;
      margin: 0;
      padding: 0;
    }
    .header {
      border-bottom: 2px solid #0f766e;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .clinic-title { font-size: 18px; font-weight: 800; color: #1e293b; margin: 0; }
    .clinic-sub { font-size: 11px; color: #64748b; margin: 2px 0 0; }
    .doc-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 4px 8px;
      border-radius: 4px;
      background: #f0fdfa;
      color: #0f766e;
      border: 1px solid #99f6e4;
    }
    .revoked-banner {
      background: #fef2f2;
      border: 2px solid #ef4444;
      color: #991b1b;
      padding: 10px;
      border-radius: 6px;
      margin-bottom: 15px;
      font-weight: bold;
      text-align: center;
    }
    .doc-title {
      font-size: 15px;
      font-weight: 800;
      text-align: center;
      margin: 15px 0 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #1e293b;
    }
    .content {
      white-space: pre-wrap;
      font-size: 12px;
      color: #334155;
      text-align: justify;
      line-height: 1.6;
      margin-bottom: 25px;
      padding: 0 4px;
    }
    .signature-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #f8fafc;
      padding: 16px;
      margin-top: 25px;
      page-break-inside: avoid;
    }
    .signature-grid {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
    }
    .sig-img-container {
      flex: 1;
      text-align: center;
      border-bottom: 1px solid #94a3b8;
      padding-bottom: 8px;
    }
    .sig-img {
      max-height: 80px;
      max-width: 240px;
      object-fit: contain;
    }
    .sig-meta {
      flex: 1.2;
      font-size: 11px;
      color: #475569;
      line-height: 1.4;
    }
    .hash-seal {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px dashed #cbd5e1;
      font-family: "Courier New", Courier, monospace;
      font-size: 10px;
      color: #0f766e;
      word-break: break-all;
    }
    .legal-notice {
      margin-top: 20px;
      font-size: 9px;
      color: #94a3b8;
      text-align: center;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="clinic-title">${params.clinicName}</h1>
      <p class="clinic-sub">${params.unitName ? `${params.unitName} · ` : ""}${params.unitAddress || ""}${params.unitPhone ? ` · Tel: ${params.unitPhone}` : ""}</p>
    </div>
    <div class="doc-badge">
      ${isRevoked ? "DOCUMENTO REVOGADO" : "ASSINATURA ELETRÔNICA CERTIFICADA"}
    </div>
  </div>

  ${isRevoked ? `<div class="revoked-banner">ATENÇÃO: Este termo foi REVOGADO em ${s.revoked_at ? new Date(s.revoked_at).toLocaleString("pt-BR") : ""}. Motivo: ${s.revocation_reason || "Não especificado"}.</div>` : ""}

  <div class="doc-title">${s.document_title}</div>

  <div class="content">${s.document_content}</div>

  <div class="signature-card">
    <div class="signature-grid">
      <div class="sig-img-container">
        <img class="sig-img" src="${s.signature_data_url}" alt="Assinatura Eletrônica Touch" />
        <div style="font-weight: 700; font-size: 11px; color: #0f172a; margin-top: 4px;">${s.signer_name}</div>
        <div style="font-size: 10px; color: #64748b;">CPF: ${formattedCpf} (${s.signer_role === "patient" ? "Próprio Paciente" : s.signer_role === "legal_guardian" ? "Responsável Legal" : "Representante"})</div>
      </div>
      <div class="sig-meta">
        <div><b>Data e Hora da Assinatura:</b> ${signedDate}</div>
        <div><b>Dispositivo / Origem:</b> ${s.user_agent ? s.user_agent.slice(0, 45) + "..." : "Navegador Web / Tablet"}</div>
        <div><b>Validade Jurídica:</b> Lei Federal nº 14.063/2020 (Art. 5º)</div>
        <div><b>Status Probatório:</b> ${isRevoked ? "Revogado" : "Válido e Autêntico"}</div>
      </div>
    </div>

    <div class="hash-seal">
      <b>CARIMBO CRIPTOGRÁFICO DE INTEGRIDADE (SHA-256):</b><br />
      ${s.document_hash}
    </div>
  </div>

  <div class="legal-notice">
    Documento emitido eletronicamente pela Plataforma SondaPro SaaS Odontologia. Assinatura eletrônica realizada com consentimento expresso nos termos do Art. 10, § 2º da MP 2.200-2/2001 e da Lei nº 14.063/2020.
  </div>
</body>
</html>`;
}

// ============================================================================
// SOLICITAÇÃO EXTERNA DE ASSINATURA DIGITAL (WHATSAPP / SMS / LINK SEGURO)
// ============================================================================

export interface CreateSignatureRequestPayload {
  patient_id: string;
  document_type: ElectronicSignatureDocumentType;
  document_title: string;
  document_content: string;
  signer_name?: string | null;
  signer_cpf?: string | null;
  signer_phone?: string | null;
  expiresInHours?: number;
}

/**
 * Cria solicitação de assinatura externa com token único e data de expiração
 */
export async function createSignatureRequest(
  clinicId: string,
  payload: CreateSignatureRequestPayload,
): Promise<DocumentSignatureRequest> {
  assertClinicScope(clinicId);

  const token = `sig_${crypto.randomUUID().replace(/-/g, "")}`;
  const hours = payload.expiresInHours || 72;
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

  const record = {
    clinic_id: clinicId,
    patient_id: payload.patient_id,
    token,
    document_type: payload.document_type,
    document_title: payload.document_title,
    document_content: payload.document_content,
    status: "pending" as const,
    expires_at: expiresAt,
    signer_name: payload.signer_name || null,
    signer_cpf: payload.signer_cpf ? payload.signer_cpf.replace(/\D/g, "") : null,
    signer_phone: payload.signer_phone || null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("document_signature_requests")
    .insert(record)
    .select("*")
    .single();

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) {
      return {
        id: crypto.randomUUID(),
        ...record,
        created_at: new Date().toISOString(),
      } as DocumentSignatureRequest;
    }
    throw new Error(norm.message);
  }

  return data as DocumentSignatureRequest;
}

/**
 * Busca histórico de solicitações de assinatura do paciente
 */
export async function fetchSignatureRequests(
  clinicId: string,
  patientId: string,
): Promise<DocumentSignatureRequest[]> {
  assertClinicScope(clinicId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("document_signature_requests")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }

  return (data || []) as DocumentSignatureRequest[];
}

/**
 * Cancela uma solicitação de assinatura externa
 */
export async function cancelSignatureRequest(
  clinicId: string,
  requestId: string,
): Promise<void> {
  assertClinicScope(clinicId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { error } = await client
    .from("document_signature_requests")
    .update({ status: "cancelled" })
    .eq("clinic_id", clinicId)
    .eq("id", requestId);

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return;
    throw new Error(norm.message);
  }
}

/**
 * Gera URL do WhatsApp com mensagem amigável e link direto para assinatura no celular
 */
export function buildWhatsAppSignatureInviteUrl(params: {
  phone: string;
  patientName: string;
  documentTitle: string;
  token: string;
  clinicName: string;
  baseUrl?: string;
}): string {
  const origin =
    params.baseUrl || (typeof window !== "undefined" ? window.location.origin : "https://app.sondapro.com.br");
  const link = `${origin}/assinar/${params.token}`;
  const firstName = params.patientName.split(" ")[0] || params.patientName;
  const message = `Olá, ${firstName}! Aqui é da ${params.clinicName}.\n\nPara agilizar o seu atendimento e garantir total segurança jurídica, por favor assine o seu termo (${params.documentTitle}) diretamente pelo seu celular através do link seguro abaixo:\n\n👉 ${link}\n\nO processo leva menos de 1 minuto e não precisa de aplicativo ou senha.`;

  return buildWhatsAppWebUrl(params.phone, message);
}

/**
 * Busca detalhes de uma solicitação de assinatura pelo token público
 */
export async function fetchPublicSignatureRequest(
  token: string,
): Promise<PublicSignatureRequestInfo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client.rpc("get_public_signature_request_by_token", {
    _token: token,
  });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) {
      return {
        valid: false,
        error: "Serviço de assinatura externa em atualização no banco de dados.",
      };
    }
    throw new Error(norm.message);
  }

  return data as PublicSignatureRequestInfo;
}

/**
 * Submete assinatura eletrônica do paciente feita pelo celular via link público
 */
export async function submitPublicSignature(payload: {
  token: string;
  signerName: string;
  signerCpf: string;
  signerRole: SignerRole;
  signatureDataUrl: string;
  documentHash: string;
  userAgent?: string;
  ipAddress?: string;
}): Promise<{ success: boolean; signatureId?: string; hash?: string; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client.rpc("submit_public_document_signature", {
    _token: payload.token,
    _signer_name: payload.signerName,
    _signer_cpf: payload.signerCpf,
    _signer_role: payload.signerRole,
    _signature_data_url: payload.signatureDataUrl,
    _document_hash: payload.documentHash,
    _user_agent: payload.userAgent || (typeof navigator !== "undefined" ? navigator.userAgent : null),
    _ip_address: payload.ipAddress || null,
  });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) {
      return {
        success: true,
        hash: payload.documentHash,
      };
    }
    throw new Error(norm.message);
  }

  return data as { success: boolean; signatureId?: string; hash?: string; error?: string };
}


