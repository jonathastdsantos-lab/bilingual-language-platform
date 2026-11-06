import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_RELATIONSHIP_STAGES,
  getRelationshipRuleSettings,
  saveRelationshipRuleSettings,
  renderRelationshipMessage,
  buildRelationshipWhatsAppUrl,
  type RelationshipStageKey,
} from "@/modules/whatsapp/crm-relationship";

describe("WhatsApp CRM & Régua de Relacionamento Automática", () => {
  const testClinicId = "9605e213-26af-441b-bc60-29c655c95590";

  beforeEach(() => {
    localStorage.clear();
  });

  describe("Catálogo de Estágios da Régua de Relacionamento", () => {
    it("deve contemplar os 7 estágios essenciais do ciclo do paciente odontológico", () => {
      const stageKeys: RelationshipStageKey[] = [
        "welcome",
        "confirmation_48h",
        "post_op_care",
        "nps_survey",
        "birthday_greeting",
        "preventive_recall",
        "open_treatment_recovery",
      ];

      for (const key of stageKeys) {
        const stage = DEFAULT_RELATIONSHIP_STAGES[key];
        expect(stage).toBeDefined();
        expect(stage.enabled).toBe(true);
        expect(stage.name.length).toBeGreaterThan(3);
        expect(stage.template).toContain("{paciente}");
        expect(stage.template).toContain("{clinica}");
      }
    });

    it("estágio de NPS & Google deve conter tag {link_google}", () => {
      expect(DEFAULT_RELATIONSHIP_STAGES.nps_survey.template).toContain("{link_google}");
    });

    it("estágio de Recall Preventivo deve ter delay aproximado de 180 dias (4320 horas)", () => {
      expect(DEFAULT_RELATIONSHIP_STAGES.preventive_recall.delayHours).toBe(4320);
    });
  });

  describe("Persistência e Customização das Configurações da Régua", () => {
    it("deve carregar configurações padrão quando não houver registro prévio", () => {
      const settings = getRelationshipRuleSettings(testClinicId);
      expect(settings).toBeDefined();
      expect(settings.clinicId).toBe(testClinicId);
      expect(settings.autoDispatchActive).toBe(false);
      expect(settings.googleReviewUrl).toContain("review");
      expect(settings.stages.welcome.enabled).toBe(true);
    });

    it("deve salvar customizações de templates e switches na régua", () => {
      const customGoogleUrl = "https://g.page/r/sondapro-odonto/review";
      saveRelationshipRuleSettings(testClinicId, {
        googleReviewUrl: customGoogleUrl,
        autoDispatchActive: true,
        stages: {
          ...DEFAULT_RELATIONSHIP_STAGES,
          welcome: {
            ...DEFAULT_RELATIONSHIP_STAGES.welcome,
            enabled: false,
          },
          birthday_greeting: {
            ...DEFAULT_RELATIONSHIP_STAGES.birthday_greeting,
            template: "Feliz Aniversário {paciente}! Ganhe um clareamento na {clinica}!",
          },
        },
      });

      const reloaded = getRelationshipRuleSettings(testClinicId);
      expect(reloaded.googleReviewUrl).toBe(customGoogleUrl);
      expect(reloaded.autoDispatchActive).toBe(true);
      expect(reloaded.stages.welcome.enabled).toBe(false);
      expect(reloaded.stages.birthday_greeting.template).toContain("Ganhe um clareamento");
    });
  });

  describe("Renderização de Mensagens e Links do WhatsApp", () => {
    it("deve interpolar variáveis dinâmicas do paciente, clínica e links", () => {
      const template =
        "Olá, {paciente}! Aqui é da {clinica}. Sua consulta com Dr(a). {profissional} está marcada para {data} às {hora}. Avalie no Google: {link_google}";

      const rendered = renderRelationshipMessage(template, {
        paciente: "Mariana Souza",
        clinica: "SondaPro Odontologia",
        profissional: "Dr. Roberto",
        data: "10/11/2026",
        hora: "14:30",
        link_google: "https://g.page/r/sondapro/review",
      });

      expect(rendered).toContain("Olá, Mariana Souza!");
      expect(rendered).toContain("SondaPro Odontologia");
      expect(rendered).toContain("Dr. Roberto");
      expect(rendered).toContain("10/11/2026 às 14:30");
      expect(rendered).toContain("https://g.page/r/sondapro/review");
      expect(rendered).not.toContain("{paciente}");
    });

    it("deve gerar link seguro do WhatsApp com número formatado DDI 55 e mensagem encodada", () => {
      const url = buildRelationshipWhatsAppUrl(
        "(11) 98888-7777",
        "Olá Mariana! Confirmamos sua consulta."
      );

      expect(url).toBe(
        "https://wa.me/5511988887777?text=Ol%C3%A1%20Mariana!%20Confirmamos%20sua%20consulta."
      );
    });
  });
});

