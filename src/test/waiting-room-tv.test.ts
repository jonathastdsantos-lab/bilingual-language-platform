import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isValidUuid,
  createWaitingRoomCall,
  fetchWaitingRoomCalls,
  playWaitingRoomChime,
  speakPatientCall,
} from "@/modules/waiting-room";

describe("Painel de Chamada em Sala de Espera (TV / Totem)", () => {
  const validClinicId = "9605e213-26af-441b-bc60-29c655c95590";
  const validUnitId = "11111111-2222-3333-4444-555555555555";
  const validProfId = "22222222-3333-4444-5555-666666666666";
  const validRoomId = "33333333-4444-5555-6666-777777777777";

  describe("Validador de UUID (isValidUuid)", () => {
    it("deve validar UUIDs v4 legítimos", () => {
      expect(isValidUuid(validClinicId)).toBe(true);
      expect(isValidUuid(validUnitId)).toBe(true);
      expect(isValidUuid("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")).toBe(true);
    });

    it("deve rejeitar valores que causariam erro no PostgreSQL", () => {
      expect(isValidUuid("all")).toBe(false);
      expect(isValidUuid("default")).toBe(false);
      expect(isValidUuid("")).toBe(false);
      expect(isValidUuid(null)).toBe(false);
      expect(isValidUuid(undefined)).toBe(false);
      expect(isValidUuid("12345")).toBe(false);
      expect(isValidUuid("not-a-valid-uuid")).toBe(false);
    });
  });

  describe("Criação de Chamada (createWaitingRoomCall)", () => {
    it("deve bloquear chamada com escopo de clínica inválido", async () => {
      await expect(
        createWaitingRoomCall({
          clinicId: "curto",
          patientName: "João Silva",
          professionalName: "Dra. Ana",
          roomName: "Consultório 01",
        }),
      ).rejects.toThrow("Escopo de clínica inválido");
    });

    it("deve sanitizar unitId 'all' e roomId 'default' para evitar erro de sintaxe UUID no PostgreSQL", async () => {
      const call = await createWaitingRoomCall({
        clinicId: validClinicId,
        unitId: "all",
        patientName: "Maria Oliveira",
        roomId: "default",
        roomName: "Consultório 01",
        professionalId: "undefined",
        professionalName: "Dr. Roberto",
        priority: "urgent",
      });

      expect(call).toBeDefined();
      expect(call.clinic_id).toBe(validClinicId);
      // unit_id e room_id devem ser null, nunca strings inválidas como 'all' ou 'default'
      expect(call.unit_id).toBeNull();
      expect(call.room_id).toBeNull();
      expect(call.patient_name).toBe("Maria Oliveira");
      expect(call.room_name).toBe("Consultório 01");
      expect(call.priority).toBe("urgent");
      expect(call.status).toBe("called");
    });

    it("deve aceitar UUIDs válidos e preencher os campos corretamente", async () => {
      const call = await createWaitingRoomCall({
        clinicId: validClinicId,
        unitId: validUnitId,
        patientName: "Carlos Eduardo",
        professionalId: validProfId,
        professionalName: "Dra. Carolina Mendes",
        roomId: validRoomId,
        roomName: "Consultório 03",
        priority: "priority",
      });

      expect(call.clinic_id).toBe(validClinicId);
      expect(call.unit_id).toBe(validUnitId);
      expect(call.professional_id).toBe(validProfId);
      expect(call.room_id).toBe(validRoomId);
      expect(call.patient_name).toBe("Carlos Eduardo");
      expect(call.priority).toBe("priority");
    });
  });

  describe("Busca de Chamadas (fetchWaitingRoomCalls)", () => {
    it("deve buscar lista sem falhar quando unitId é 'all' ou indefinido", async () => {
      const calls = await fetchWaitingRoomCalls(validClinicId, "all");
      expect(Array.isArray(calls)).toBe(true);
    });

    it("deve aceitar unitId como UUID válido", async () => {
      const calls = await fetchWaitingRoomCalls(validClinicId, validUnitId);
      expect(Array.isArray(calls)).toBe(true);
    });
  });

  describe("Multimídia: Som do Sino e Síntese de Fala", () => {
    it("playWaitingRoomChime não deve lançar erro mesmo em ambiente sem Web Audio", () => {
      expect(() => playWaitingRoomChime()).not.toThrow();
    });

    it("speakPatientCall não deve lançar erro mesmo em ambiente sem SpeechSynthesis", () => {
      expect(() => speakPatientCall("Carlos Teste", "Consultório 01")).not.toThrow();
    });
  });
});
