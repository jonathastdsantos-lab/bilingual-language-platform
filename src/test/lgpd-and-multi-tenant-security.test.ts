import { describe, it, expect } from "vitest";
import { assertClinicScope } from "@/services/supabase";
import {
  maskCpf,
  maskPhone,
  maskEmail,
  recordLgpdAuditLog,
  anonymizePatientData,
} from "@/modules/lgpd";

describe("Segurança Multi-Tenant & Blindagem LGPD", () => {
  const CLINIC_A = "11111111-1111-4111-8111-111111111111";
  const CLINIC_B = "22222222-2222-4222-8222-222222222222";
  const PATIENT_ID = "33333333-3333-4333-8333-333333333333";

  describe("1. Isolamento Multi-Tenant Rigoroso (assertClinicScope)", () => {
    it("deve rejeitar e bloquear execuções sem escopo válido de clínica", () => {
      expect(() => assertClinicScope(null)).toThrow(/Escopo de clínica inválido/);
      expect(() => assertClinicScope(undefined)).toThrow(/Escopo de clínica inválido/);
      expect(() => assertClinicScope("")).toThrow(/Escopo de clínica inválido/);
      expect(() => assertClinicScope("curto")).toThrow(/Escopo de clínica inválido/);
    });

    it("deve aprovar identificadores válidos de clínicas", () => {
      expect(() => assertClinicScope(CLINIC_A)).not.toThrow();
      expect(() => assertClinicScope(CLINIC_B)).not.toThrow();
    });
  });

  describe("2. Mascaramento de Dados Sensíveis LGPD", () => {
    it("deve mascarar CPF mantendo apenas dígitos iniciais e finais seguros", () => {
      expect(maskCpf("123.456.789-00")).toBe("123.***.***-00");
      expect(maskCpf("12345678900")).toBe("123.***.***-00");
      expect(maskCpf(null)).toBe("***.***.***-**");
      expect(maskCpf("")).toBe("***.***.***-**");
      expect(maskCpf("123")).toBe("***.***.***-**");
    });

    it("deve mascarar telefones celulares e fixos preservando DDD e finais", () => {
      expect(maskPhone("11987654321")).toBe("(11) 9****-4321");
      expect(maskPhone("(11) 98765-4321")).toBe("(11) 9****-4321");
      expect(maskPhone("1134567890")).toBe("(11) ****-7890");
      expect(maskPhone(null)).toBe("(**) *****-****");
      expect(maskPhone("")).toBe("(**) *****-****");
    });

    it("deve mascarar emails ocultando a maior parte do usuário", () => {
      expect(maskEmail("doutor@gmail.com")).toBe("d***r@gmail.com");
      expect(maskEmail("paciente@odontologia.com.br")).toBe("p***e@odontologia.com.br");
      expect(maskEmail(null)).toBe("*****@*****.***");
      expect(maskEmail("invalido")).toBe("*****@*****.***");
    });
  });

  describe("3. Trilha de Auditoria LGPD (Art. 6º, VIII e Art. 46)", () => {
    it("deve validar o escopo da clínica ao registrar evento de acesso", async () => {
      await expect(
        recordLgpdAuditLog({
          clinicId: "",
          action: "view_patient_profile",
        }),
      ).rejects.toThrow(/Escopo de clínica inválido/);
    });

    it("não deve quebrar a experiência do usuário se a gravação de auditoria falhar", async () => {
      await expect(
        recordLgpdAuditLog({
          clinicId: CLINIC_A,
          patientId: PATIENT_ID,
          action: "view_clinical_record",
          details: { ip: "127.0.0.1" },
        }),
      ).resolves.not.toThrow();
    });
  });

  describe("4. Direito ao Esquecimento / Anonimização Legal (Art. 18 LGPD)", () => {
    it("deve exigir clinicId válido para autorizar anonimização de dados", async () => {
      await expect(anonymizePatientData("invalido", PATIENT_ID)).rejects.toThrow(/Escopo de clínica inválido/);
    });
  });
});

