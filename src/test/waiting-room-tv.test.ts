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

    it("deve recuperar chamadas criadas mesmo se o clinicId consultado tiver pequena variação ou fallback", async () => {
      await createWaitingRoomCall({
        clinicId: validClinicId,
        patientName: "Paciente Teste Fallback",
        professionalName: "Dra. Carolina",
        roomName: "Consultório 01",
      });

      const calls = await fetchWaitingRoomCalls("qualquer-outro-id");
      expect(Array.isArray(calls)).toBe(true);
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.some((c) => c.patient_name === "Paciente Teste Fallback")).toBe(true);
    });

    it("não deve falhar com erro de sintaxe SQL se clinicId for 'default' e deve retornar chamadas", async () => {
      const calls = await fetchWaitingRoomCalls("default");
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

  describe("Personalização da TV: Anúncios, Banners e Previsão do Tempo", () => {
    it("deve carregar configurações padrão e permitir salvar novidades de mídia", async () => {
      const { getTvSettings, saveTvSettings, DEFAULT_TV_SETTINGS } = await import("../modules/waiting-room");
      const initial = getTvSettings("test-clinic");
      expect(initial).toBeDefined();
      expect(initial.cityName).toBe(DEFAULT_TV_SETTINGS.cityName);
      expect(initial.tickerTexts.length).toBeGreaterThan(0);
      expect(initial.mediaItems.length).toBeGreaterThan(0);

      const modified = {
        ...initial,
        cityName: "Curitiba, PR",
        tickerTexts: ["Promoção Implantes", ...initial.tickerTexts],
      };
      saveTvSettings("test-clinic", modified);

      const loaded = getTvSettings("test-clinic");
      expect(loaded.cityName).toBe("Curitiba, PR");
      expect(loaded.tickerTexts).toContain("Promoção Implantes");
    });

    it("deve consultar previsão do tempo com fallback seguro", async () => {
      const { fetchWeatherForecast } = await import("../modules/waiting-room");
      const weather = await fetchWeatherForecast("São Paulo, SP");
      expect(weather).toBeDefined();
      expect(weather).toHaveProperty("temperature");
      expect(weather).toHaveProperty("condition");
      expect(weather).toHaveProperty("icon");
      expect(typeof weather.temperature).toBe("number");
    });
    it("deve disponibilizar presets profissionais de imagens odontológicas para banners", async () => {
      const { DENTAL_BANNER_PRESETS } = await import("../modules/waiting-room");
      expect(Array.isArray(DENTAL_BANNER_PRESETS)).toBe(true);
      expect(DENTAL_BANNER_PRESETS.length).toBeGreaterThanOrEqual(5);
      const clareamento = DENTAL_BANNER_PRESETS.find((p) => p.category === "Estética");
      expect(clareamento).toBeDefined();
      expect(clareamento?.imageUrl).toMatch(/^https:\/\//);
      expect(clareamento?.title.length).toBeGreaterThan(0);
    });

    it("compressImageFile não deve lançar erro mesmo em ambiente sem Canvas no Node.js", async () => {
      const { compressImageFile } = await import("../modules/waiting-room");
      const fakeBlob = new Blob(["test"], { type: "image/jpeg" });
      const result = await compressImageFile(fakeBlob);
      expect(typeof result).toBe("string");
    });
  });

  describe("Temporizadores e Automatização com a Agenda", () => {
    it("deve carregar e persistir temporizadores customizados de chamada, banners e letreiro", async () => {
      const { getTvSettings, saveTvSettings, DEFAULT_TV_SETTINGS } = await import("../modules/waiting-room");
      const settings = getTvSettings(validClinicId);
      expect(settings.callDisplaySeconds).toBeDefined();
      expect(settings.slideIntervalSeconds).toBeDefined();
      expect(settings.tickerIntervalSeconds).toBeDefined();
      expect(settings.autoDismissOnAttendance).toBe(true);

      const customSettings = {
        ...settings,
        callDisplaySeconds: 45,
        slideIntervalSeconds: 15,
        tickerIntervalSeconds: 10,
        autoDismissOnAttendance: true,
      };
      saveTvSettings(validClinicId, customSettings);

      const reloaded = getTvSettings(validClinicId);
      expect(reloaded.callDisplaySeconds).toBe(45);
      expect(reloaded.slideIntervalSeconds).toBe(15);
      expect(reloaded.tickerIntervalSeconds).toBe(10);
      expect(reloaded.autoDismissOnAttendance).toBe(true);
    });

    it("deve atualizar status da chamada para 'in_attendance' e 'completed' via updateWaitingRoomCallStatus", async () => {
      const { createWaitingRoomCall, updateWaitingRoomCallStatus, getLocalWaitingRoomCalls } = await import("../modules/waiting-room");
      const call = await createWaitingRoomCall({
        clinicId: validClinicId,
        patientName: "Paciente Status Transition",
        roomName: "Consultório 02",
      });

      expect(call.status).toBe("called");

      // Atualiza para em atendimento
      await updateWaitingRoomCallStatus(validClinicId, call.id, "in_attendance");
      const localAfterAttendance = getLocalWaitingRoomCalls(validClinicId);
      const attendedCall = localAfterAttendance.find((c) => c.id === call.id);
      expect(attendedCall).toBeDefined();
      expect(attendedCall?.status).toBe("in_attendance");

      // Atualiza para concluído
      await updateWaitingRoomCallStatus(validClinicId, call.id, "completed");
      const localAfterCompleted = getLocalWaitingRoomCalls(validClinicId);
      const completedCall = localAfterCompleted.find((c) => c.id === call.id);
      expect(completedCall?.status).toBe("completed");
    });

    it("deve dispensar chamada ativa na TV automaticamente via dismissWaitingRoomCallForPatient ao confirmar atendimento na agenda", async () => {
      const { createWaitingRoomCall, dismissWaitingRoomCallForPatient, getLocalWaitingRoomCalls } = await import("../modules/waiting-room");
      const patientName = "Ana Paula Pereira";
      const call = await createWaitingRoomCall({
        clinicId: validClinicId,
        patientName,
        roomName: "Consultório 01",
      });

      expect(call.status).toBe("called");

      // Agenda confirma que paciente foi atendido
      const dismissed = await dismissWaitingRoomCallForPatient(validClinicId, patientName, "in_attendance");
      expect(dismissed).toBe(true);

      const localCalls = getLocalWaitingRoomCalls(validClinicId);
      const updated = localCalls.find((c) => c.id === call.id);
      expect(updated?.status).toBe("in_attendance");
    });
  });
});

