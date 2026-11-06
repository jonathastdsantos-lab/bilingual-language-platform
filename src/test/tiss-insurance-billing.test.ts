import { describe, it, expect, beforeEach } from "vitest";
import {
  TUSS_ODONTO_CATALOG,
  TISS_GLOSA_REASONS,
  getTissSettings,
  saveTissSettings,
  recordTissGlosaAppeal,
  getTissGlosaAppeals,
  validateGuidesForXmlBatch,
  generateTissXmlBatch,
  calculateTissBillingSummary,
} from "@/modules/tiss";
import type { TissGuide } from "@/types";

describe("Faturamento TISS para Convênios Odontológicos (Padrão ANS)", () => {
  const clinicId = "9605e213-26af-441b-bc60-29c655c95590";

  beforeEach(() => {
    localStorage.clear();
  });

  describe("Catálogo TUSS e Tabela de Glosas ANS", () => {
    it("deve disponibilizar procedimentos odontológicos frequentes da Tabela TUSS com validação de dente/face", () => {
      expect(TUSS_ODONTO_CATALOG.length).toBeGreaterThan(15);

      const consult = TUSS_ODONTO_CATALOG.find((p) => p.code === "81000030");
      expect(consult).toBeDefined();
      expect(consult?.category).toBe("Consulta");
      expect(consult?.requiresTooth).toBe(false);

      const res2Faces = TUSS_ODONTO_CATALOG.find((p) => p.code === "82000876");
      expect(res2Faces).toBeDefined();
      expect(res2Faces?.category).toBe("Dentística");
      expect(res2Faces?.requiresTooth).toBe(true);
      expect(res2Faces?.requiresSurface).toBe(true);

      const endo = TUSS_ODONTO_CATALOG.find((p) => p.code === "83000121");
      expect(endo).toBeDefined();
      expect(endo?.category).toBe("Endodontia");
      expect(endo?.requiresTooth).toBe(true);
    });

    it("deve conter códigos padronizados de glosa da ANS", () => {
      expect(TISS_GLOSA_REASONS.length).toBeGreaterThanOrEqual(7);

      const g1001 = TISS_GLOSA_REASONS.find((g) => g.code === "1001");
      expect(g1001?.description).toContain("carteira");

      const g1203 = TISS_GLOSA_REASONS.find((g) => g.code === "1203");
      expect(g1203?.description).toContain("radiografia");

      const g1406 = TISS_GLOSA_REASONS.find((g) => g.code === "1406");
      expect(g1406?.description).toContain("Dente ou face");
    });
  });

  describe("Configurações do Módulo TISS & CNES", () => {
    it("deve carregar configurações padrão com switches ativos e CNES válido", () => {
      const settings = getTissSettings(clinicId);
      expect(settings.clinicId).toBe(clinicId);
      expect(settings.cnesNumber).toBe("7891234");
      expect(settings.tissVersion).toBe("v4.01.00");
      expect(settings.switches.enableTissModule).toBe(true);
      expect(settings.switches.autoMarkBilledOnXmlExport).toBe(true);
      expect(settings.switches.requireToothOnRestorations).toBe(true);
    });

    it("deve salvar alterações nas configurações e switches da clínica", () => {
      const updated = saveTissSettings(clinicId, {
        cnesNumber: "1234567",
        tissVersion: "v3.05.00",
        switches: {
          enableTissModule: false,
          enableCardExpirationAlert: true,
          autoMarkBilledOnXmlExport: false,
          requireToothOnRestorations: true,
        },
      });

      expect(updated.cnesNumber).toBe("1234567");
      expect(updated.tissVersion).toBe("v3.05.00");
      expect(updated.switches.enableTissModule).toBe(false);

      const reloaded = getTissSettings(clinicId);
      expect(reloaded.cnesNumber).toBe("1234567");
      expect(reloaded.switches.enableTissModule).toBe(false);
    });
  });

  describe("Validação e Geração de Lote XML TISS Odontológico", () => {
    const mockGuide: TissGuide = {
      id: "guide_1",
      clinic_id: clinicId,
      patient_id: "pat_1",
      insurance_id: "ins_amil",
      professional_id: "prof_1",
      guide_number: "GTO-2026-123456",
      auth_code: "AUT-9988",
      guide_type: "treatment",
      status: "authorized",
      card_number: "001122334455",
      card_expiration: "2027-12-31",
      cns_number: "123456789012345",
      issue_date: "2026-11-06",
      billed_date: null,
      paid_date: null,
      total_amount: 235.0,
      glosed_amount: 0,
      notes: null,
      created_by: null,
      created_at: "2026-11-06T10:00:00Z",
      updated_at: "2026-11-06T10:00:00Z",
      patients: {
        full_name: "Mariana Rios",
        cpf: "123.456.789-00",
      },
      dental_insurances: {
        name: "Amil Dental",
        ans_code: "326305",
      },
      professionals: {
        name: "Dra. Carolina Mendes",
        cro: "CRO-SP 12345",
      },
      items: [
        {
          id: "item_1",
          clinic_id: clinicId,
          guide_id: "guide_1",
          tuss_code: "81000030",
          description: "Consulta odontológica inicial",
          tooth_number: null,
          tooth_surface: null,
          quantity: 1,
          unit_price: 90.0,
          total_price: 90.0,
          glosed: false,
          glosa_reason: null,
          created_at: "2026-11-06T10:00:00Z",
        },
        {
          id: "item_2",
          clinic_id: clinicId,
          guide_id: "guide_1",
          tuss_code: "82000876",
          description: "Restauração em resina composta - 2 faces",
          tooth_number: 36,
          tooth_surface: "MOD",
          quantity: 1,
          unit_price: 145.0,
          total_price: 145.0,
          glosed: false,
          glosa_reason: null,
          created_at: "2026-11-06T10:00:00Z",
        },
      ],
    };

    it("deve validar com sucesso um lote consistente de guias", () => {
      const validation = validateGuidesForXmlBatch([mockGuide]);
      expect(validation.isValid).toBe(true);
      expect(validation.errors.length).toBe(0);
      expect(validation.guideCount).toBe(1);
      expect(validation.totalBatchValue).toBe(235.0);
    });

    it("deve apontar erro se a carteirinha estiver ausente ou inválida", () => {
      const invalidGuide = { ...mockGuide, card_number: "   " };
      const validation = validateGuidesForXmlBatch([invalidGuide]);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes("carteirinha"))).toBe(true);
    });

    it("deve apontar erro de validação em restauração sem dente informado quando a regra está ativa", () => {
      const guideWithoutTooth: TissGuide = {
        ...mockGuide,
        items: [
          {
            id: "it_no_tooth",
            clinic_id: clinicId,
            guide_id: "guide_1",
            tuss_code: "82000850",
            description: "Restauração em resina composta - 1 face",
            tooth_number: null, // Sem dente informado
            tooth_surface: null,
            quantity: 1,
            unit_price: 115.0,
            total_price: 115.0,
            glosed: false,
            glosa_reason: null,
            created_at: "2026-11-06T10:00:00Z",
          },
        ],
      };

      const settings = getTissSettings(clinicId);
      const validation = validateGuidesForXmlBatch([guideWithoutTooth], settings);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes("requer indicação do dente"))).toBe(true);
    });

    it("deve gerar o documento XML no Padrão TISS da ANS estruturado corretamente", () => {
      const xml = generateTissXmlBatch({
        clinicName: "SondaPro Odontologia Integrada",
        clinicCnpj: "12.345.678/0001-90",
        cnes: "7891234",
        tissVersion: "v4.01.00",
        insuranceName: "Amil Dental",
        ansCode: "326305",
        batchNumber: "LOTE-2026-TEST",
        guides: [mockGuide],
      });

      expect(xml).toBeDefined();
      expect(xml).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
      expect(xml).toContain("ans:mensagemTISS");
      expect(xml).toContain("<ans:versaoPadrao>4.01.00</ans:versaoPadrao>");
      expect(xml).toContain("<ans:registroANS>326305</ans:registroANS>");
      expect(xml).toContain("<ans:numeroGuiaPrestador>GTO-2026-123456</ans:numeroGuiaPrestador>");
      expect(xml).toContain("<ans:senhaAutorizacao>AUT-9988</ans:senhaAutorizacao>");
      expect(xml).toContain("<ans:numeroCarteira>001122334455</ans:numeroCarteira>");
      expect(xml).toContain("<ans:nomeBeneficiario>Mariana Rios</ans:nomeBeneficiario>");
      expect(xml).toContain("<ans:codigoProcedimento>81000030</ans:codigoProcedimento>");
      expect(xml).toContain("<ans:codigoProcedimento>82000876</ans:codigoProcedimento>");
      expect(xml).toContain("<ans:denteRegiao>36</ans:denteRegiao>");
      expect(xml).toContain("<ans:faceDente>MOD</ans:faceDente>");
      expect(xml).toContain("<ans:valorTotalLote>235.00</ans:valorTotalLote>");
    });
  });

  describe("Contestação e Gestão de Recursos de Glosa", () => {
    it("deve registrar e recuperar recursos de glosa para envio à operadora", () => {
      const appeal = recordTissGlosaAppeal(clinicId, {
        guideId: "guide_glosa_1",
        guideNumber: "GTO-2026-7788",
        insuranceName: "Bradesco Dental",
        glosedAmount: 145.0,
        glosaCode: "1203",
        glosaReason: "Procedimento exige envio de radiografia inicial ou final comprobatória",
        appealJustification: "Radiografia periapical pós-operatória anexada. Procedimento executado conforme diretrizes.",
      });

      expect(appeal.id).toBeDefined();
      expect(appeal.guideNumber).toBe("GTO-2026-7788");
      expect(appeal.glosedAmount).toBe(145.0);
      expect(appeal.glosaCode).toBe("1203");
      expect(appeal.status).toBe("pending_analysis");

      const appeals = getTissGlosaAppeals(clinicId);
      expect(appeals.length).toBe(1);
      expect(appeals[0]?.guideId).toBe("guide_glosa_1");
      expect(appeals[0]?.appealJustification).toContain("Radiografia periapical");
    });
  });

  describe("Consolidação de Indicadores Financeiros TISS", () => {
    it("deve calcular o resumo financeiro com guias em rascunho, autorizadas, faturadas, pagas e glosadas", () => {
      const guides: TissGuide[] = [
        {
          id: "g1",
          clinic_id: clinicId,
          patient_id: "p1",
          insurance_id: "i1",
          professional_id: "pr1",
          guide_number: "GTO-01",
          auth_code: null,
          guide_type: "treatment",
          status: "billed",
          card_number: "111",
          card_expiration: null,
          cns_number: null,
          issue_date: "2026-11-01",
          billed_date: "2026-11-02",
          paid_date: null,
          total_amount: 500,
          glosed_amount: 0,
          notes: null,
          created_by: null,
          created_at: "2026-11-01T10:00:00Z",
          updated_at: "2026-11-01T10:00:00Z",
        },
        {
          id: "g2",
          clinic_id: clinicId,
          patient_id: "p2",
          insurance_id: "i1",
          professional_id: "pr1",
          guide_number: "GTO-02",
          auth_code: null,
          guide_type: "treatment",
          status: "paid",
          card_number: "222",
          card_expiration: null,
          cns_number: null,
          issue_date: "2026-11-01",
          billed_date: "2026-11-02",
          paid_date: "2026-11-05",
          total_amount: 850,
          glosed_amount: 0,
          notes: null,
          created_by: null,
          created_at: "2026-11-01T10:00:00Z",
          updated_at: "2026-11-01T10:00:00Z",
        },
        {
          id: "g3",
          clinic_id: clinicId,
          patient_id: "p3",
          insurance_id: "i2",
          professional_id: "pr1",
          guide_number: "GTO-03",
          auth_code: null,
          guide_type: "treatment",
          status: "glosed",
          card_number: "333",
          card_expiration: null,
          cns_number: null,
          issue_date: "2026-11-01",
          billed_date: "2026-11-02",
          paid_date: null,
          total_amount: 300,
          glosed_amount: 150,
          notes: null,
          created_by: null,
          created_at: "2026-11-01T10:00:00Z",
          updated_at: "2026-11-01T10:00:00Z",
        },
      ];

      const summary = calculateTissBillingSummary(guides);
      expect(summary.totalGuides).toBe(3);
      expect(summary.billedCount).toBe(1);
      expect(summary.paidCount).toBe(1);
      expect(summary.glosedCount).toBe(1);
      expect(summary.totalBilledAmount).toBe(500);
      expect(summary.totalPaidAmount).toBe(850);
      expect(summary.totalGlosedAmount).toBe(150);
    });
  });
});

