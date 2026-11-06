import { describe, it, expect } from "vitest";
import {
  formatClinicalEvolutionWithAI,
  detectFdiToothFromText,
  detectReturnDays,
  VOICE_EVOLUTION_EXAMPLES,
  TUSS_ODONTO_CATALOG,
} from "@/modules/records/voice-evolution";
import { DENTAL_AESTHETIC_PRESETS } from "@/modules/records/before-after-presets";

describe("Pilar 2: Atendimento Clínico & Prontuário com Inteligência Artificial (Simples Dental / Clinicorp)", () => {
  describe("Evolução Odontológica por Áudio/Voz (Whisper + IA Odontológica)", () => {
    it("deve estruturar o caso exato de manutenção ortodôntica com TUSS 85100140 e materiais", () => {
      const rawDictation =
        "Paciente compareceu para manutenção ortodôntica. Trocado arco superior para 0.16 termoativado, instalada mecânica de elásticos intermaxilares classe II lado direito. Boa higiene bucal, retorno em 30 dias.";

      const result = formatClinicalEvolutionWithAI(rawDictation, {
        patientName: "João Silva",
        professionalName: "Dra. Carolina Mendes",
      });

      expect(result).toBeDefined();
      expect(result.tussCode).toBe("85100140");
      expect(result.procedureCategory).toBe("Ortodontia");
      expect(result.title).toContain("Manutenção Ortodôntica");
      expect(result.title).toContain("85100140");
      expect(result.materials).toContain("Arco NiTi Termoativado");
      expect(result.materials).toContain("Elásticos Intermaxilares Ortodônticos");
      expect(result.suggestedReturnDays).toBe(30);

      // Tópicos clínicos padrão CFO/TUSS
      expect(result.formattedContent).toContain("MOTIVO DA CONSULTA / QUEIXA");
      expect(result.formattedContent).toContain("PROCEDIMENTOS REALIZADOS (CFO / TUSS 85100140)");
      expect(result.formattedContent).toContain("MATERIAIS & INSUMOS APLICADOS");
      expect(result.formattedContent).toContain("ACHADOS CLÍNICOS & HIGIENE");
      expect(result.formattedContent).toContain("ORIENTAÇÕES PÓS-ATENDIMENTO & PRÓXIMO RETORNO");
    });

    it("deve detectar dentes FDI em diferentes formatos da fala clínica", () => {
      expect(detectFdiToothFromText("Restauração classe II no dente 36 com resina")).toBe(36);
      expect(detectFdiToothFromText("Confecção de faceta direta no elemento 11")).toBe(11);
      expect(detectFdiToothFromText("Exodontia cirúrgica do 38")).toBe(38);
      expect(detectFdiToothFromText("Canal do dente 46")).toBe(46);
      expect(detectFdiToothFromText("Limpeza geral sem especificar dente")).toBeNull();
    });

    it("deve detectar prazos de retorno em dias, semanas e meses", () => {
      expect(detectReturnDays("retorno em 30 dias")).toBe(30);
      expect(detectReturnDays("retorno em 7 dias para tirar pontos")).toBe(7);
      expect(detectReturnDays("retorno após 2 semanas")).toBe(14);
      expect(detectReturnDays("retorno em 6 meses para controle")).toBe(180);
      expect(detectReturnDays("sem previsão de retorno")).toBeNull();
    });

    it("deve formatar caso estético de faceta / clareamento com materiais de resina e peróxido", () => {
      const raw =
        "Sessão de clareamento de consultório com peróxido de hidrogênio e faceta em resina composta no dente 21. Retorno em 15 dias.";
      const result = formatClinicalEvolutionWithAI(raw);

      expect(result.toothNumber).toBe(21);
      expect(result.suggestedReturnDays).toBe(15);
      expect(result.materials.length).toBeGreaterThan(0);
      expect(result.formattedContent).toContain("Elemento FDI #21");
    });

    it("deve disponibilizar catálogo TUSS com procedimentos odontológicos padrão", () => {
      expect(TUSS_ODONTO_CATALOG.length).toBeGreaterThanOrEqual(8);
      expect(TUSS_ODONTO_CATALOG.some((t) => t.code === "85100140")).toBe(true);
      expect(TUSS_ODONTO_CATALOG.some((t) => t.code === "85100043")).toBe(true);
      expect(TUSS_ODONTO_CATALOG.some((t) => t.code === "85100191")).toBe(true);
    });

    it("deve disponibilizar exemplos de ditado para demonstração e treinamento", () => {
      expect(VOICE_EVOLUTION_EXAMPLES.length).toBeGreaterThanOrEqual(5);
      const ortho = VOICE_EVOLUTION_EXAMPLES.find((e) => e.id === "ortho_maintenance");
      expect(ortho).toBeDefined();
      expect(ortho?.rawDictation).toContain("elásticos intermaxilares");
    });
  });

  describe("Comparador Antes & Depois com Slider Interativo (Estética Odontológica)", () => {
    it("deve disponibilizar presets clínicos de clareamento, lentes, facetas e ortodontia", () => {
      expect(DENTAL_AESTHETIC_PRESETS.length).toBeGreaterThanOrEqual(4);

      const whitening = DENTAL_AESTHETIC_PRESETS.find((p) => p.category === "clareamento");
      expect(whitening).toBeDefined();
      expect(whitening?.beforeUrl).toContain("http");
      expect(whitening?.afterUrl).toContain("http");

      const veneers = DENTAL_AESTHETIC_PRESETS.find((p) => p.category === "lentes");
      expect(veneers).toBeDefined();
      expect(veneers?.treatmentsUsed.length).toBeGreaterThan(0);

      const aligners = DENTAL_AESTHETIC_PRESETS.find((p) => p.category === "ortodontia");
      expect(aligners).toBeDefined();
    });
  });
});

