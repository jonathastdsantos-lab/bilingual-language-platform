/**
 * SondaPro Dental - Exportador de Lote XML TISS Odontológico (Padrão ANS)
 * Gera lote eletrônico de Guias de Tratamento Odontológico (GTO) de acordo com os schemas oficiais da ANS.
 */

import type { TissGuide } from "@/types";
import type { TissSettings } from "./settings";

export interface TissXmlBatchInput {
  clinicName: string;
  clinicCnpj?: string | undefined;
  cnes: string;
  tissVersion: "v3.05.00" | "v4.01.00";
  insuranceName: string;
  ansCode: string;
  batchNumber?: string | undefined;
  guides: TissGuide[];
}

export interface TissValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  guideCount: number;
  totalBatchValue: number;
}

/**
 * Valida a consistência de um lote de guias TISS antes da geração do XML
 */
export function validateGuidesForXmlBatch(
  guides: TissGuide[],
  settings?: TissSettings
): TissValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let totalBatchValue = 0;

  if (guides.length === 0) {
    errors.push("Nenhuma guia selecionada para o lote XML.");
    return { isValid: false, errors, warnings, guideCount: 0, totalBatchValue: 0 };
  }

  guides.forEach((guide, idx) => {
    const guideRef = `Guia ${guide.guide_number || `#${idx + 1}`}`;
    totalBatchValue += Number(guide.total_amount) || 0;

    if (!guide.card_number || guide.card_number.trim().length < 4) {
      errors.push(`${guideRef}: Número da carteirinha do beneficiário não informado ou inválido.`);
    }

    if (!guide.dental_insurances?.ans_code && !guide.dental_insurances?.name) {
      errors.push(`${guideRef}: Convênio odontológico ou registro ANS não identificado.`);
    }

    if (!guide.items || guide.items.length === 0) {
      errors.push(`${guideRef}: Guia sem procedimentos TUSS registrados.`);
    } else {
      guide.items.forEach((item, itemIdx) => {
        if (!item.tuss_code) {
          errors.push(`${guideRef} (Item ${itemIdx + 1}): Código TUSS obrigatório ausente.`);
        }

        // Restaurações ou endodontias recomendam identificação de dente
        const isRestoration = item.description?.toLowerCase().includes("restauração");
        if (isRestoration && !item.tooth_number) {
          if (settings?.switches.requireToothOnRestorations) {
            errors.push(`${guideRef}: Restauração (${item.tuss_code}) requer indicação do dente (FDI).`);
          } else {
            warnings.push(`${guideRef}: Procedimento restaurador sem dente informado pode sofrer glosa na operadora.`);
          }
        }
      });
    }

    // Alerta de validade da carteirinha
    if (guide.card_expiration) {
      const expDate = new Date(guide.card_expiration);
      const today = new Date();
      if (expDate < today) {
        warnings.push(`${guideRef}: Carteirinha do beneficiário expirou em ${guide.card_expiration}.`);
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    guideCount: guides.length,
    totalBatchValue: Number(totalBatchValue.toFixed(2)),
  };
}

/**
 * Escapa caracteres especiais para inserção segura no XML
 */
function escapeXml(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Gera a string XML estruturada no Padrão TISS da ANS
 */
export function generateTissXmlBatch(input: TissXmlBatchInput): string {
  const {
    clinicName,
    clinicCnpj = "00000000000100",
    cnes,
    tissVersion,
    insuranceName,
    ansCode,
    batchNumber = `LOTE-${new Date().getFullYear()}${String(Date.now()).slice(-6)}`,
    guides,
  } = input;

  const nowIso = new Date().toISOString();
  const dateOnly = nowIso.slice(0, 10);
  const timeOnly = nowIso.slice(11, 19);
  const totalAmount = guides.reduce((acc, g) => acc + (Number(g.total_amount) || 0), 0);

  const xmlGuides = guides
    .map((guide, idx) => {
      const items = guide.items || [];
      const xmlItems = items
        .map(
          (it, i) => `
            <ans:procedimentoExecutado>
              <ans:sequencialItem>${i + 1}</ans:sequencialItem>
              <ans:dataExecucao>${escapeXml(guide.issue_date || dateOnly)}</ans:dataExecucao>
              <ans:procedimento>
                <ans:codigoTabela>22</ans:codigoTabela>
                <ans:codigoProcedimento>${escapeXml(it.tuss_code)}</ans:codigoProcedimento>
                <ans:descricaoProcedimento>${escapeXml(it.description)}</ans:descricaoProcedimento>
              </ans:procedimento>
              ${it.tooth_number ? `<ans:denteRegiao>${it.tooth_number}</ans:denteRegiao>` : ""}
              ${it.tooth_surface ? `<ans:faceDente>${escapeXml(it.tooth_surface)}</ans:faceDente>` : ""}
              <ans:quantidadeExecutada>${it.quantity || 1}</ans:quantidadeExecutada>
              <ans:valorUnitario>${Number(it.unit_price || 0).toFixed(2)}</ans:valorUnitario>
              <ans:valorTotal>${Number(it.total_price || 0).toFixed(2)}</ans:valorTotal>
            </ans:procedimentoExecutado>`
        )
        .join("");

      return `
        <ans:guiaOdontologia>
          <ans:cabecalhoGuia>
            <ans:registroANS>${escapeXml(ansCode || "000000")}</ans:registroANS>
            <ans:numeroGuiaPrestador>${escapeXml(guide.guide_number)}</ans:numeroGuiaPrestador>
            ${guide.auth_code ? `<ans:senhaAutorizacao>${escapeXml(guide.auth_code)}</ans:senhaAutorizacao>` : ""}
            <ans:dataEmissaoGuia>${escapeXml(guide.issue_date || dateOnly)}</ans:dataEmissaoGuia>
          </ans:cabecalhoGuia>
          <ans:dadosBeneficiario>
            <ans:numeroCarteira>${escapeXml(guide.card_number)}</ans:numeroCarteira>
            ${guide.card_expiration ? `<ans:validadeCarteira>${escapeXml(guide.card_expiration)}</ans:validadeCarteira>` : ""}
            <ans:nomeBeneficiario>${escapeXml(guide.patients?.full_name || "Beneficiário")}</ans:nomeBeneficiario>
            ${guide.patients?.cpf ? `<ans:numeroCNS>${escapeXml(guide.patients.cpf)}</ans:numeroCNS>` : ""}
          </ans:dadosBeneficiario>
          <ans:dadosContratadoExecutante>
            <ans:cnesContratado>${escapeXml(cnes)}</ans:cnesContratado>
            <ans:nomeContratado>${escapeXml(clinicName)}</ans:nomeContratado>
            <ans:codigoProfissionalExecutante>${escapeXml(guide.professionals?.cro || "CRO")}</ans:codigoProfissionalExecutante>
            <ans:nomeProfissionalExecutante>${escapeXml(guide.professionals?.name || "Cirurgião-Dentista")}</ans:nomeProfissionalExecutante>
          </ans:dadosContratadoExecutante>
          <ans:procedimentosExecutados>
            ${xmlItems}
          </ans:procedimentosExecutados>
          <ans:valorTotalGuia>
            <ans:valorTotalGeral>${Number(guide.total_amount || 0).toFixed(2)}</ans:valorTotalGeral>
          </ans:valorTotalGuia>
        </ans:guiaOdontologia>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ans:cabecalho>
    <ans:identificacaoTransacao>
      <ans:tipoTransacao>ENVIO_LOTE_GUIAS</ans:tipoTransacao>
      <ans:sequencialTransacao>${Date.now()}</ans:sequencialTransacao>
      <ans:dataRegistroTransacao>${dateOnly}</ans:dataRegistroTransacao>
      <ans:horaRegistroTransacao>${timeOnly}</ans:horaRegistroTransacao>
    </ans:identificacaoTransacao>
    <ans:origem>
      <ans:identificacaoPrestador>
        <ans:codigoPrestadorNaOperadora>${escapeXml(cnes)}</ans:codigoPrestadorNaOperadora>
        <ans:cnpjPrestador>${escapeXml(clinicCnpj.replace(/\D/g, ""))}</ans:cnpjPrestador>
      </ans:identificacaoPrestador>
    </ans:origem>
    <ans:destino>
      <ans:registroANS>${escapeXml(ansCode || "000000")}</ans:registroANS>
      <ans:nomeOperadora>${escapeXml(insuranceName)}</ans:nomeOperadora>
    </ans:destino>
    <ans:versaoPadrao>${tissVersion === "v4.01.00" ? "4.01.00" : "3.05.00"}</ans:versaoPadrao>
  </ans:cabecalho>
  <ans:prestadorParaOperadora>
    <ans:loteGuias>
      <ans:numeroLote>${escapeXml(batchNumber)}</ans:numeroLote>
      <ans:quantidadeGuias>${guides.length}</ans:quantidadeGuias>
      <ans:valorTotalLote>${totalAmount.toFixed(2)}</ans:valorTotalLote>
      <ans:guiasOdonto>
        ${xmlGuides}
      </ans:guiasOdonto>
    </ans:loteGuias>
  </ans:prestadorParaOperadora>
  <ans:epilogo>
    <ans:hash>${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}</ans:hash>
  </ans:epilogo>
</ans:mensagemTISS>`;
}

/**
 * Realiza o download do arquivo XML TISS no navegador
 */
export function triggerTissXmlDownload(xmlContent: string, fileName?: string): void {
  if (typeof window === "undefined") return;

  const resolvedName = fileName || `tiss_lote_${new Date().toISOString().slice(0, 10)}.xml`;
  const blob = new Blob([xmlContent], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = resolvedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

