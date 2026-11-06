import { describe, it, expect, beforeEach } from "vitest";
import {
  CFO_226_LEGAL_DISCLAIMER,
  CFO_226_MODALITY_DESCRIPTIONS,
  CFO_226_MODALITY_LABELS,
  CFO_226_TCLE_TEXT,
  acceptTeleodontologyTcle,
  buildRoomUrl,
  buildTeleodontologyPrintableHtml,
  createTeleodontologySession,
  fetchTeleodontologySessionByToken,
  fetchTeleodontologySessions,
  generateRoomToken,
  generateWhatsAppInviteLink,
  generateWhatsAppInviteMessage,
  saveTeleodontologyClinicalRecord,
  updateTeleodontologyStatus,
} from "@/modules/teleodontology";

describe("Módulo de Teleodontologia Integrada (Resolução CFO 226/2020)", () => {
  const clinicId = "clinic-tele-test-123";
  const patientId = "patient-tele-test-456";
  const dentistId = "dentist-tele-test-789";

  beforeEach(() => {
    localStorage.clear();
  });

  it("deve conter as 3 modalidades exclusivas e os textos regulamentares da Resolução CFO 226/2020", () => {
    expect(CFO_226_MODALITY_LABELS.teleorientacao).toContain("Teleorientação");
    expect(CFO_226_MODALITY_LABELS.telemonitoramento).toContain("Telemonitoramento");
    expect(CFO_226_MODALITY_LABELS.teleinterconsulta).toContain("Teleinterconsulta");

    expect(CFO_226_MODALITY_DESCRIPTIONS.teleorientacao).toContain("Art. 2º, I");
    expect(CFO_226_MODALITY_DESCRIPTIONS.telemonitoramento).toContain("Art. 2º, II");
    expect(CFO_226_MODALITY_DESCRIPTIONS.teleinterconsulta).toContain("Art. 2º, III");

    expect(CFO_226_LEGAL_DISCLAIMER).toContain("Resolução CFO-226/2020");
    expect(CFO_226_LEGAL_DISCLAIMER).toContain("vedada a realização de consultas com o objetivo de diagnóstico presuntivo definitivo");

    expect(CFO_226_TCLE_TEXT).toContain("TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO");
    expect(CFO_226_TCLE_TEXT).toContain("LGPD");
  });

  it("deve gerar room token e URL segura de sala virtual", () => {
    const token = generateRoomToken();
    expect(token).toMatch(/^tele-[a-z0-9]{16}$/);

    const roomUrl = buildRoomUrl(token);
    expect(roomUrl).toContain(`/teleconsulta/${token}`);
  });

  it("deve criar uma nova sessão de Teleorientação com status scheduled", async () => {
    const scheduledFor = new Date(Date.now() + 3600000).toISOString();
    const session = await createTeleodontologySession({
      clinicId,
      patientId,
      dentistId,
      modality: "teleorientacao",
      scheduledFor,
      patientName: "Maria da Silva",
      patientPhone: "11988887777",
      dentistName: "Dr. João Carlos",
      dentistCro: "SP-12345",
    });

    expect(session.id).toBeDefined();
    expect(session.modality).toBe("teleorientacao");
    expect(session.status).toBe("scheduled");
    expect(session.tcleAccepted).toBe(false);
    expect(session.roomToken).toBeDefined();
    expect(session.roomUrl).toContain(session.roomToken);
    expect(session.patientName).toBe("Maria da Silva");
  });

  it("deve recuperar sessão por token mesmo em ambiente offline/cache", async () => {
    const session = await createTeleodontologySession({
      clinicId,
      patientId,
      dentistId,
      modality: "telemonitoramento",
      scheduledFor: new Date().toISOString(),
      patientName: "Carlos Eduardo",
    });

    const retrieved = await fetchTeleodontologySessionByToken(session.roomToken);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(session.id);
    expect(retrieved?.patientName).toBe("Carlos Eduardo");
    expect(retrieved?.modality).toBe("telemonitoramento");
  });

  it("deve registrar aceite do TCLE pelo paciente com hash e avançar para waiting_room", async () => {
    const session = await createTeleodontologySession({
      clinicId,
      patientId,
      dentistId,
      modality: "teleorientacao",
      scheduledFor: new Date().toISOString(),
      patientName: "Ana Paula",
    });

    const accepted = await acceptTeleodontologyTcle(session.roomToken, {
      ip: "189.120.45.67",
      userAgent: "Mozilla/5.0 (iPhone)",
    });
    expect(accepted).toBe(true);

    const updated = await fetchTeleodontologySessionByToken(session.roomToken);
    expect(updated?.tcleAccepted).toBe(true);
    expect(updated?.tcleAcceptedAt).toBeDefined();
    expect(updated?.tcleIp).toBe("189.120.45.67");
    expect(updated?.tcleSignatureHash).toMatch(/^cfo226-/);
    expect(updated?.status).toBe("waiting_room");
  });

  it("deve atualizar status da sessão durante o ciclo de atendimento (in_progress -> completed)", async () => {
    const session = await createTeleodontologySession({
      clinicId,
      patientId,
      dentistId,
      modality: "telemonitoramento",
      scheduledFor: new Date().toISOString(),
    });

    // Início da chamada
    const startIso = new Date().toISOString();
    await updateTeleodontologyStatus(session.id, "in_progress", { startedAt: startIso });
    let current = await fetchTeleodontologySessionByToken(session.roomToken);
    expect(current?.status).toBe("in_progress");
    expect(current?.startedAt).toBe(startIso);

    // Finalização da chamada após 15 minutos (900s)
    const endIso = new Date().toISOString();
    await updateTeleodontologyStatus(session.id, "completed", {
      endedAt: endIso,
      durationSeconds: 900,
    });
    current = await fetchTeleodontologySessionByToken(session.roomToken);
    expect(current?.status).toBe("completed");
    expect(current?.endedAt).toBe(endIso);
    expect(current?.durationSeconds).toBe(900);
  });

  it("deve gravar prontuário com evolução, parecer de interconsulta e prescrições", async () => {
    const session = await createTeleodontologySession({
      clinicId,
      patientId,
      dentistId,
      interconsultaSpecialistId: "specialist-buxo-1",
      modality: "teleinterconsulta",
      scheduledFor: new Date().toISOString(),
      patientName: "Lucas Souza",
      specialistName: "Dra. Renata Cirurgiã",
    });

    const saved = await saveTeleodontologyClinicalRecord(session.id, {
      clinicalNotes: "Paciente em pós-operatório D+7 de exodontia do dente 38. Cicatrização adequada.",
      interconsultaNotes: "Parecer do especialista: sem sinais de alveolite seca. Manter higiene local.",
      prescriptions: [
        {
          id: "rx-1",
          name: "Amoxicilina 500mg",
          dosage: "1 cápsula a cada 8h por mais 2 dias",
          instructions: "Ingerir com água após as refeições",
        },
      ],
    });
    expect(saved).toBe(true);

    const updated = await fetchTeleodontologySessionByToken(session.roomToken);
    expect(updated?.clinicalNotes).toContain("pós-operatório D+7");
    expect(updated?.interconsultaNotes).toContain("sem sinais de alveolite");
    expect(updated?.prescriptions).toHaveLength(1);
    expect(updated?.prescriptions[0]?.name).toBe("Amoxicilina 500mg");
  });

  it("deve gerar mensagem e link direto para WhatsApp com formatação amigável", async () => {
    const session = await createTeleodontologySession({
      clinicId,
      patientId,
      dentistId,
      modality: "teleorientacao",
      scheduledFor: new Date("2026-11-10T14:30:00.000Z").toISOString(),
      patientName: "Fernanda Lima",
      patientPhone: "(11) 97777-6666",
    });

    const msg = generateWhatsAppInviteMessage(session, "OdontoPrime Jardins", "Dr. Roberto");
    expect(msg).toContain("Fernanda Lima");
    expect(msg).toContain("OdontoPrime Jardins");
    expect(msg).toContain("Dr. Roberto");
    expect(msg).toContain(session.roomUrl);
    expect(msg).toContain("CFO-226/2020");

    const link = generateWhatsAppInviteLink("11977776666", session, "OdontoPrime Jardins", "Dr. Roberto");
    expect(link).toContain("https://wa.me/5511977776666?text=");
  });

  it("deve gerar prontuário HTML de teleatendimento com disclaimer legal e assinaturas", async () => {
    const session = await createTeleodontologySession({
      clinicId,
      patientId,
      dentistId,
      modality: "teleorientacao",
      scheduledFor: new Date().toISOString(),
      patientName: "Guilherme Santos",
      patientCpf: "123.456.789-00",
    });

    await acceptTeleodontologyTcle(session.roomToken, { ip: "200.180.10.5" });
    await saveTeleodontologyClinicalRecord(session.id, {
      clinicalNotes: "Paciente relata desconforto gengival leve no quadrante superior direito.",
      prescriptions: [
        {
          id: "rx-1",
          name: "Periogard 0,12%",
          dosage: "Bochechar 15ml 2x ao dia por 7 dias",
          instructions: "Não enxaguar com água logo após",
        },
      ],
    });

    const current = (await fetchTeleodontologySessionByToken(session.roomToken))!;
    const html = buildTeleodontologyPrintableHtml({
      clinicName: "Clínica OdontoMax",
      clinicCnpj: "12.345.678/0001-90",
      dentistName: "Dr. André Martins",
      dentistCro: "SP-88899",
      patientName: "Guilherme Santos",
      patientCpf: "123.456.789-00",
      session: current,
    });

    expect(html).toContain("Clínica OdontoMax");
    expect(html).toContain("Resolução CFO-226/2020");
    expect(html).toContain("Guilherme Santos");
    expect(html).toContain("123.456.789-00");
    expect(html).toContain("Dr. André Martins");
    expect(html).toContain("SP-88899");
    expect(html).toContain("ACEITO DIGITALMENTE");
    expect(html).toContain("Periogard 0,12%");
    expect(html).toContain("DISCLAIMER LEGAL");
    expect(html).toContain("window.print()");
  });

  it("deve listar sessões por clínica e filtrar por modalidade", async () => {
    await createTeleodontologySession({
      clinicId,
      patientId,
      dentistId,
      modality: "teleorientacao",
      scheduledFor: new Date().toISOString(),
    });
    await createTeleodontologySession({
      clinicId,
      patientId,
      dentistId,
      modality: "telemonitoramento",
      scheduledFor: new Date().toISOString(),
    });

    const all = await fetchTeleodontologySessions(clinicId);
    expect(all.length).toBeGreaterThanOrEqual(2);

    const onlyMonit = await fetchTeleodontologySessions(clinicId, "telemonitoramento");
    expect(onlyMonit.every((s) => s.modality === "telemonitoramento")).toBe(true);
  });
});
