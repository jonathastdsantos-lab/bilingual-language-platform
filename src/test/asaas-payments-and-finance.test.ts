import { describe, it, expect, beforeEach } from "vitest";
import {
  generatePixCopiaECola,
  generateBankSlipData,
  createAsaasCharge,
  markChargeAsPaid,
  fetchClinicCharges,
  getAsaasAccountConfig,
  saveAsaasAccountConfig,
  buildWhatsAppPaymentLinkMessage,
} from "@/modules/finance/asaas-payments";

describe("Financeiro, Meios de Pagamento & Comissões (Clinicorp / Asaas)", () => {
  const clinicId = "9605e213-26af-441b-bc60-29c655c95590";

  beforeEach(() => {
    localStorage.clear();
  });

  describe("Geração de Pix Dinâmico e Boletos Registrados", () => {
    it("deve gerar string Pix Copia e Cola no padrão oficial do Banco Central", () => {
      const pix = generatePixCopiaECola("SondaPro Odontologia", "pay_test_12345", 450.0);
      expect(pix).toBeDefined();
      expect(pix.startsWith("00020126580014BR.GOV.BCB.PIX")).toBe(true);
      expect(pix).toContain("pay_test_12345");
      expect(pix).toContain("450.00");
      expect(pix).toContain("SONDAPRO ODONTOLOGIA");
    });

    it("deve gerar linha digitável e código de barras para boletos e carnês", () => {
      const { barCode, digitableLine } = generateBankSlipData("pay_982341209123", 1200.0);
      expect(barCode.length).toBeGreaterThan(20);
      expect(digitableLine.length).toBeGreaterThan(30);
      expect(digitableLine).toContain(".");
    });
  });

  describe("Criação de Cobranças com Split de Pagamento (Anti-Bitributação)", () => {
    it("deve calcular o split de pagamento entre a clínica e o dentista parceiro", async () => {
      const charge = await createAsaasCharge(clinicId, {
        patientId: "patient_carlos",
        patientName: "Carlos Eduardo",
        patientPhone: "11988887777",
        billingType: "PIX",
        value: 1000.0,
        dueDate: "2026-11-15",
        description: "Restaurações Estéticas Múltiplas",
        splitProfessionalId: "prof_carolina",
        splitProfessionalName: "Dra. Carolina Mendes",
        splitPercentage: 40,
        clinicName: "SondaPro Dental",
      });

      expect(charge).toBeDefined();
      expect(charge.value).toBe(1000.0);
      expect(charge.billingType).toBe("PIX");
      expect(charge.status).toBe("PENDING");
      expect(charge.split).toBeDefined();
      expect(charge.split?.percentage).toBe(40);
      expect(charge.split?.professionalAmount).toBe(400.0);
      expect(charge.split?.clinicAmount).toBe(600.0);
      expect(charge.split?.professionalName).toBe("Dra. Carolina Mendes");
    });

    it("deve criar carnê parcelado odontológico em até 12x", async () => {
      const charge = await createAsaasCharge(clinicId, {
        patientId: "patient_ana",
        patientName: "Ana Paula",
        billingType: "CARNE",
        value: 2400.0,
        installmentCount: 12,
        dueDate: "2026-12-01",
        description: "Aparelho Autoligado 12x",
      });

      expect(charge.installmentCount).toBe(12);
      expect(charge.billingType).toBe("CARNE");
      expect(charge.bankSlipUrl).toContain("asaas.com");
    });
  });

  describe("Baixa Manual e Conciliação de Pagamento", () => {
    it("deve atualizar status de PENDING para CONFIRMED com data de pagamento", async () => {
      const charge = await createAsaasCharge(clinicId, {
        patientId: "patient_test",
        patientName: "Teste Baixa",
        billingType: "CREDIT_CARD",
        value: 500.0,
        dueDate: "2026-11-20",
        description: "Profilaxia e Clareamento",
      });

      expect(charge.status).toBe("PENDING");

      const paid = markChargeAsPaid(clinicId, charge.id);
      expect(paid).toBeDefined();
      expect(paid?.status).toBe("CONFIRMED");
      expect(paid?.paymentDate).toBeDefined();

      const all = fetchClinicCharges(clinicId);
      const found = all.find((c) => c.id === charge.id);
      expect(found?.status).toBe("CONFIRMED");
    });
  });

  describe("Mensagens Formatadas de Cobrança para WhatsApp", () => {
    it("deve gerar mensagem pronta de Pix Copia e Cola para envio no WhatsApp", async () => {
      const charge = await createAsaasCharge(clinicId, {
        patientId: "patient_beatriz",
        patientName: "Beatriz Oliveira",
        billingType: "PIX",
        value: 350.0,
        dueDate: "2026-11-10",
        description: "Placa de Bruxismo Miorrelaxante",
        clinicName: "SondaPro Odontologia",
      });

      const message = buildWhatsAppPaymentLinkMessage(charge, "SondaPro Odontologia");
      expect(message).toContain("Beatriz Oliveira");
      expect(message).toContain("R$ 350,00");
      expect(message).toContain("PIX COPIA E COLA");
      expect(message).toContain(charge.pixCopiaECola || "");
    });
  });

  describe("Configurações do Gateway Asaas da Clínica", () => {
    it("deve carregar padrões e salvar credenciais da conta", () => {
      const config = getAsaasAccountConfig(clinicId);
      expect(config.environment).toBe("sandbox");
      expect(config.fineValuePercent).toBe(2);

      saveAsaasAccountConfig(clinicId, {
        environment: "production",
        apiKey: "$aact_production_key_test",
        walletId: "wallet_clinic_prod_123",
        fineValuePercent: 3,
      });

      const saved = getAsaasAccountConfig(clinicId);
      expect(saved.environment).toBe("production");
      expect(saved.apiKey).toBe("$aact_production_key_test");
      expect(saved.walletId).toBe("wallet_clinic_prod_123");
      expect(saved.fineValuePercent).toBe(3);
    });
  });
});
