import { describe, it, expect } from "vitest";
import {
  buildClinicalDocumentRecordPayload,
  buildPrintableDocumentHtml,
  DENTAL_PRESCRIPTION_PRESETS,
  DENTAL_CID10_CODES,
} from "@/modules/records";
import { DENTAL_TCLE_PRESETS } from "@/modules/signatures";

describe("Prescrição Digital, Atestados e Assinatura Eletrônica de Termos (TCLE)", () => {
  it("contém bulário odontológico categorizado com presets completos", () => {
    expect(DENTAL_PRESCRIPTION_PRESETS.length).toBeGreaterThanOrEqual(10);
    const analgesics = DENTAL_PRESCRIPTION_PRESETS.filter((p) => p.category === "analgesic");
    const antibiotics = DENTAL_PRESCRIPTION_PRESETS.filter((p) => p.category === "antibiotic");
    const antiInflam = DENTAL_PRESCRIPTION_PRESETS.filter((p) => p.category === "anti_inflammatory");

    expect(analgesics.length).toBeGreaterThan(0);
    expect(antibiotics.length).toBeGreaterThan(0);
    expect(antiInflam.length).toBeGreaterThan(0);
  });

  it("contém presets oficiais de TCLE para todas as especialidades odontológicas", () => {
    expect(DENTAL_TCLE_PRESETS.length).toBeGreaterThanOrEqual(6);

    const wisdom = DENTAL_TCLE_PRESETS.find((t) => t.id === "surgery_wisdom");
    expect(wisdom).toBeDefined();
    const textWisdom = wisdom!.generateText({
      patientName: "João Silva",
      patientCpf: "12345678901",
      dentistName: "Dr. Carlos Mendes",
      dentistCro: "CRO-SP 12345",
      clinicName: "SondaPro Odontologia",
    });
    expect(textWisdom).toContain("João Silva");
    expect(textWisdom).toContain("Parestesia");
    expect(textWisdom).toContain("Dr. Carlos Mendes");

    const implant = DENTAL_TCLE_PRESETS.find((t) => t.id === "implant_bone_graft");
    expect(implant).toBeDefined();
    const textImplant = implant!.generateText({
      patientName: "Maria Souza",
      clinicName: "SondaPro",
    });
    expect(textImplant.toLowerCase()).toContain("osseointegração");
  });

  it("gera payload estruturado e HTML para Declaração de Comparecimento com horários", () => {
    const payload = buildClinicalDocumentRecordPayload({
      kind: "attendance_declaration",
      pageSize: "A4",
      clinicName: "SondaPro Clínica",
      patientName: "Carlos Eduardo",
      professionalName: "Dra. Carolina Mendes",
      professionalCro: "CRO-SP 98765",
      issueDate: "2026-11-05",
      attendanceStartTime: "09:00",
      attendanceEndTime: "10:30",
      bodyText: "Declaro que o paciente compareceu...",
    });

    expect(payload.recordType).toBe("certificate");
    expect(payload.title).toContain("Declaração de Comparecimento");
    expect(payload.content).toContain("09:00");
    expect(payload.content).toContain("10:30");

    const html = buildPrintableDocumentHtml({
      kind: "attendance_declaration",
      pageSize: "A4",
      clinicName: "SondaPro Clínica",
      patientName: "Carlos Eduardo",
      professionalName: "Dra. Carolina Mendes",
      professionalCro: "CRO-SP 98765",
      issueDate: "2026-11-05",
      attendanceStartTime: "09:00",
      attendanceEndTime: "10:30",
      bodyText: "Declaro que o paciente compareceu...",
      validationCode: "SP-A1B2-C3D4-E5F6",
      validationUrl: "https://app.sondapro.com.br/validar/SP-A1B2-C3D4-E5F6",
    });

    expect(html).toContain("DECLARAÇÃO DE COMPARECIMENTO ODONTOLÓGICO");
    expect(html).toContain("SP-A1B2-C3D4-E5F6");
    expect(html).toContain("ASSINATURA DIGITAL OFICIAL — ICP-BRASIL");
    expect(html).toContain("SCAN TO VERIFY");
  });

  it("gera documento impresso de TCLE com assinatura e carimbo digital", () => {
    const html = buildPrintableDocumentHtml({
      kind: "tcle",
      pageSize: "A4",
      clinicName: "SondaPro Clínica",
      patientName: "Ana Paula Rocha",
      patientCpf: "11122233344",
      professionalName: "Dr. Roberto Silva",
      professionalCro: "CRO-SP 54321",
      procedureName: "Exodontia de Terceiro Molar Incluso",
      issueDate: "2026-11-05",
      bodyText: "Pelo presente termo autorizo o procedimento...",
      signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });

    expect(html).toContain("TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO");
    expect(html).toContain("Ana Paula Rocha");
    expect(html).toContain("Exodontia de Terceiro Molar Incluso");
    expect(html).toContain("data:image/png;base64");
  });
});

