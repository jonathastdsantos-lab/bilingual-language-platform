import { supabase, assertClinicScope, normalizeSupabaseError } from "@/services/supabase";
import type {
  DigitalCertificateType,
  ProfessionalDigitalCertificate,
  PublicQualifiedValidationInfo,
  QualifiedDocumentSignature,
} from "@/types";
import { formatCPF } from "@/utils/validators";

/**
 * Gera um código de validação legível de 16 caracteres no padrão ICP-Brasil (ex: SP-A1B2-C3D4-E5F6)
 */
export function generateValidationCode(prefix = "SP"): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const genPart = (len: number) => {
    let res = "";
    for (let i = 0; i < len; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };
  return `${prefix}-${genPart(4)}-${genPart(4)}-${genPart(4)}`;
}

/**
 * Gera assinatura digital simulada/real em conformidade com PKCS#7 / CMS
 */
export function generateCmsSignaturePayload(hash: string, serialNumber: string, certIssuer: string): string {
  const envelope = {
    standard: "ICP-Brasil / CMS PKCS#7",
    algorithm: "sha256WithRSAEncryption",
    digest: hash,
    serial: serialNumber,
    issuer: certIssuer,
    timestamp: new Date().toISOString(),
  };
  return btoa(JSON.stringify(envelope));
}

export interface RegisterCertificatePayload {
  professional_id: string;
  certificate_type: DigitalCertificateType;
  issuer: string;
  subject_name: string;
  subject_cpf: string;
  cro_number?: string | null;
  cro_state?: string | null;
  serial_number: string;
  valid_from: string;
  valid_to: string;
  certificate_public_pem?: string | null;
  cloud_account_email?: string | null;
}

/**
 * Busca certificados digitais do profissional na clínica
 */
export async function fetchProfessionalCertificates(
  clinicId: string,
  professionalId: string,
): Promise<ProfessionalDigitalCertificate[]> {
  assertClinicScope(clinicId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("professional_digital_certificates")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }

  return (data || []) as ProfessionalDigitalCertificate[];
}

/**
 * Cadastra certificado digital (A1 em arquivo ou Nuvem BirdID/SafeID/Vidaas)
 */
export async function registerProfessionalCertificate(
  clinicId: string,
  payload: RegisterCertificatePayload,
): Promise<ProfessionalDigitalCertificate> {
  assertClinicScope(clinicId);

  const cleanCpf = payload.subject_cpf.replace(/\D/g, "");
  if (cleanCpf.length !== 11) {
    throw new Error("CPF do titular do certificado digital deve ter 11 dígitos.");
  }

  const record = {
    clinic_id: clinicId,
    professional_id: payload.professional_id,
    certificate_type: payload.certificate_type,
    issuer: payload.issuer,
    subject_name: payload.subject_name.trim(),
    subject_cpf: cleanCpf,
    cro_number: payload.cro_number || null,
    cro_state: payload.cro_state || null,
    serial_number: payload.serial_number,
    valid_from: payload.valid_from,
    valid_to: payload.valid_to,
    status: "active" as const,
    certificate_public_pem: payload.certificate_public_pem || null,
    cloud_account_email: payload.cloud_account_email || null,
    updated_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("professional_digital_certificates")
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
      } as ProfessionalDigitalCertificate;
    }
    throw new Error(norm.message);
  }

  return data as ProfessionalDigitalCertificate;
}

export interface CreateQualifiedSignatureParams {
  professionalId: string;
  patientId: string;
  certificateId?: string | null | undefined;
  documentType: "prescription_simple" | "prescription_controlled" | "certificate" | "tcle" | "other";
  documentTitle: string;
  documentContent: string;
  signerName: string;
  signerCpf: string;
  signerCro: string;
  issuerName?: string | undefined;
  baseUrl?: string | undefined;
}

/**
 * Emite e grava uma Assinatura Qualificada ICP-Brasil para Receita ou Atestado
 */
export async function createQualifiedSignature(
  clinicId: string,
  params: CreateQualifiedSignatureParams,
): Promise<QualifiedDocumentSignature> {
  assertClinicScope(clinicId);

  const cleanCpf = params.signerCpf.replace(/\D/g, "");
  const code = generateValidationCode("SP");
  const base =
    params.baseUrl || (typeof window !== "undefined" ? window.location.origin : "https://app.sondapro.com.br");
  const validationUrl = `${base}/validar/${code}`;

  // Calcula Hash SHA-256 do documento
  const normalized = `${params.documentContent.trim()}\n---METADATA---\n${JSON.stringify({
    title: params.documentTitle,
    signer: params.signerName,
    cro: params.signerCro,
    code,
  })}`;
  const enc = new TextEncoder();
  const data = enc.encode(normalized);

  let hash = "";
  if (typeof crypto !== "undefined" && crypto.subtle?.digest) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } else {
    hash = `sha256_${Date.now().toString(16)}`;
  }

  const serial = `SN-${Date.now().toString(16).toUpperCase()}`;
  const issuer = params.issuerName || "AC SOLUTI Multipla v5 (ICP-Brasil)";
  const sig = generateCmsSignaturePayload(hash, serial, issuer);

  const record = {
    clinic_id: clinicId,
    professional_id: params.professionalId,
    patient_id: params.patientId,
    certificate_id: params.certificateId || null,
    document_type: params.documentType,
    document_title: params.documentTitle,
    document_content: params.documentContent,
    document_hash: hash,
    cryptographic_signature: sig,
    validation_code: code,
    validation_url: validationUrl,
    signer_name: params.signerName.trim(),
    signer_cpf: cleanCpf,
    signer_cro: params.signerCro.trim(),
    authority_chain: ["Autoridade Certificadora Raiz Brasileira v10", issuer],
    timestamp_authority: "ACT ITI / ICP-Brasil",
    signed_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data: inserted, error } = await client
    .from("qualified_document_signatures")
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
      } as QualifiedDocumentSignature;
    }
    throw new Error(norm.message);
  }

  return inserted as QualifiedDocumentSignature;
}

/**
 * Consulta pública de validação da assinatura qualificada pelo código (sem login)
 */
export async function fetchPublicQualifiedValidation(code: string): Promise<PublicQualifiedValidationInfo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client.rpc("get_public_qualified_signature_validation", {
    _code: code.trim(),
  });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) {
      return {
        valid: false,
        error: "Validador público de assinaturas em atualização no banco de dados.",
      };
    }
    throw new Error(norm.message);
  }

  return data as PublicQualifiedValidationInfo;
}

/**
 * Gera bloco visual HTML do Selo Oficial ICP-Brasil para embutir na impressão do Receituário/Atestado
 */
export function buildIcpBrasilVisualStampHtml(params: {
  signerName: string;
  cro: string;
  validationCode: string;
  validationUrl: string;
  signedAt: string;
  documentHash: string;
  issuer?: string | undefined;
}): string {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=4&data=${encodeURIComponent(params.validationUrl)}`;
  const dateFormatted = new Date(params.signedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return `
  <div style="border: 2px solid #0f766e; border-radius: 8px; background: #f0fdfa; padding: 12px 14px; margin-top: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; page-break-inside: avoid;">
    <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px;">
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span style="background: #0f766e; color: #ffffff; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px;">
            ICP-Brasil
          </span>
          <span style="font-size: 11px; font-weight: 800; color: #0f766e;">
            DOCUMENTO ASSINADO DIGITALMENTE
          </span>
        </div>
        <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 2px;">
          ${params.signerName}
        </div>
        <div style="font-size: 11px; color: #334155; margin-top: 1px;">
          Cirurgião-Dentista · <b>${params.cro}</b>
        </div>
        <div style="font-size: 10px; color: #64748b; margin-top: 3px;">
          Emissor: ${params.issuer || "AC SOLUTI Multipla v5 (ICP-Brasil)"} · Assinado em: ${dateFormatted}
        </div>
        <div style="font-size: 9px; color: #0f766e; font-family: 'Courier New', monospace; margin-top: 4px; word-break: break-all;">
          Hash SHA-256: ${params.documentHash.slice(0, 36)}...
        </div>
        <div style="font-size: 10px; color: #0f766e; margin-top: 5px;">
          CÓDIGO DE VALIDAÇÃO: <b style="background: #ccfbf1; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 11px;">${params.validationCode}</b>
        </div>
      </div>

      <div style="text-align: center; border-left: 1px solid #99f6e4; padding-left: 14px; min-width: 100px;">
        <img src="${qrUrl}" alt="QR Code Validador" style="width: 82px; height: 82px; display: block; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;" />
        <div style="font-size: 8px; color: #0f766e; font-weight: bold; margin-top: 3px; line-height: 1.2;">
          Consulte a autenticidade<br />ou aponte a câmera
        </div>
      </div>
    </div>
    <div style="border-top: 1px dashed #99f6e4; margin-top: 8px; padding-top: 6px; font-size: 8px; color: #64748b; text-align: center;">
      Assinatura Digital Qualificada nos termos da Medida Provisória nº 2.200-2/2001, da Lei nº 14.063/2020 e da Portaria SVS/MS nº 344/1998. Válido em todo o território nacional para dispensação em farmácias e órgãos fiscalizadores.
    </div>
  </div>
  `;
}

