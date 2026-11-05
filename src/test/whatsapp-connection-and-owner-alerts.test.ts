import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  fetchWhatsappInstance,
  generateWhatsappQrCode,
  confirmWhatsappConnected,
  disconnectWhatsappInstance,
  fetchWhatsappSettings,
  saveWhatsappSettings,
  fetchWhatsappOwnerAlerts,
  triggerOwnerAlert,
  dispatchAppointmentNotification,
  processAssistantCommand,
  getDefaultWhatsappSettings,
} from "@/modules/whatsapp/connection";

const TEST_CLINIC_ID = "00000000-0000-0000-0000-000000000001";

describe("WhatsApp Connection & Owner Alerts (Sublime Gestão Flow)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("retorna configurações padrão corretas para a clínica", () => {
    const settings = getDefaultWhatsappSettings(TEST_CLINIC_ID);
    expect(settings.clinic_id).toBe(TEST_CLINIC_ID);
    expect(settings.send_mode).toBe("automatic");
    expect(settings.auto_send_on_booking).toBe(true);
    expect(settings.auto_send_on_cancel).toBe(true);
    expect(settings.owner_alerts_enabled).toBe(true);
    expect(settings.assistant_enabled).toBe(true);
  });

  it("gera QR code e atualiza status da instância para qrcode", async () => {
    const instance = await generateWhatsappQrCode(TEST_CLINIC_ID, "evolution");
    expect(instance.status).toBe("qrcode");
    expect(instance.provider).toBe("evolution");
    expect(instance.qrcode_base64).toBeTruthy();
    expect(instance.instance_name).toContain("sondapro_");

    const fetched = await fetchWhatsappInstance(TEST_CLINIC_ID);
    expect(fetched.status).toBe("qrcode");
  });

  it("conecta a instância de WhatsApp com sucesso e registra telefone e bateria", async () => {
    const connected = await confirmWhatsappConnected(
      TEST_CLINIC_ID,
      "+55 (11) 98765-4321",
      "Recepção SondaPro Odonto",
    );
    expect(connected.status).toBe("connected");
    expect(connected.connected_phone).toBe("+55 (11) 98765-4321");
    expect(connected.profile_name).toBe("Recepção SondaPro Odonto");
    expect(connected.battery_level).toBe(94);
    expect(connected.last_connected_at).toBeTruthy();
  });

  it("desconecta a instância quando solicitado", async () => {
    await confirmWhatsappConnected(TEST_CLINIC_ID);
    const disconnected = await disconnectWhatsappInstance(TEST_CLINIC_ID);
    expect(disconnected.status).toBe("disconnected");
    expect(disconnected.connected_phone).toBeNull();
  });

  it("salva e recupera as configurações de modo de envio e alertas do dono", async () => {
    await saveWhatsappSettings(TEST_CLINIC_ID, {
      send_mode: "manual_web",
      owner_phone: "+55 (11) 99999-0000",
      alert_on_cancellation: true,
      alert_on_new_booking: false,
    });

    const settings = await fetchWhatsappSettings(TEST_CLINIC_ID);
    expect(settings.send_mode).toBe("manual_web");
    expect(settings.owner_phone).toBe("+55 (11) 99999-0000");
    expect(settings.alert_on_cancellation).toBe(true);
    expect(settings.alert_on_new_booking).toBe(false);
  });

  it("dispara alerta para o dono quando ativado e com telefone configurado", async () => {
    await saveWhatsappSettings(TEST_CLINIC_ID, {
      owner_phone: "+55 (11) 99999-0000",
      owner_alerts_enabled: true,
      alert_on_new_booking: true,
    });

    const alert = await triggerOwnerAlert(
      TEST_CLINIC_ID,
      "new_booking",
      "Novo agendamento: Paciente João da Silva",
    );

    expect(alert).not.toBeNull();
    expect(alert?.recipient_phone).toBe("+55 (11) 99999-0000");
    expect(alert?.status).toBe("sent");

    const alertsList = await fetchWhatsappOwnerAlerts(TEST_CLINIC_ID);
    expect(alertsList.length).toBeGreaterThan(0);
    expect(alertsList[0]?.alert_type).toBe("new_booking");
  });

  it("não dispara alerta se a opção correspondente estiver desativada", async () => {
    await saveWhatsappSettings(TEST_CLINIC_ID, {
      owner_phone: "+55 (11) 99999-0000",
      owner_alerts_enabled: true,
      alert_on_new_booking: false, // Desativado
    });

    const alert = await triggerOwnerAlert(
      TEST_CLINIC_ID,
      "new_booking",
      "Novo agendamento",
    );

    expect(alert).toBeNull();
  });

  it("dispara notificação automática quando conectado e em modo automático", async () => {
    await saveWhatsappSettings(TEST_CLINIC_ID, {
      send_mode: "automatic",
      owner_phone: "+55 (11) 99999-0000",
    });
    await confirmWhatsappConnected(TEST_CLINIC_ID);

    const res = await dispatchAppointmentNotification(
      TEST_CLINIC_ID,
      {
        patientName: "Ana Paula",
        patientPhone: "11988887777",
        startsAt: new Date().toISOString(),
        procedure: "Limpeza Dental",
      },
      "booked",
    );

    expect(res.mode).toBe("automatic");
    expect(res.success).toBe(true);
  });

  it("gera link de WhatsApp Web quando desconectado ou em modo manual", async () => {
    await saveWhatsappSettings(TEST_CLINIC_ID, {
      send_mode: "manual_web",
      owner_phone: "+55 (11) 99999-0000",
    });

    const res = await dispatchAppointmentNotification(
      TEST_CLINIC_ID,
      {
        patientName: "Carlos Alberto",
        patientPhone: "11977776666",
        startsAt: new Date().toISOString(),
        procedure: "Extração",
      },
      "booked",
    );

    expect(res.mode).toBe("manual_web");
    expect(res.success).toBe(true);
    expect(res.url).toContain("https://wa.me/5511977776666");
    expect(res.url).toContain(encodeURIComponent("Carlos Alberto"));
  });

  it("processa comandos do Assistente do Dono com respostas clínicas inteligentes", async () => {
    const agendaRes = await processAssistantCommand(TEST_CLINIC_ID, "agenda de hoje");
    expect(agendaRes.response).toContain("Agenda de Hoje");
    expect(agendaRes.suggestions).toContain("faturamento hoje");

    const fatRes = await processAssistantCommand(TEST_CLINIC_ID, "faturamento hoje");
    expect(fatRes.response).toContain("Faturamento do Dia");
    expect(fatRes.response).toContain("Total Recebido Hoje");

    const faltasRes = await processAssistantCommand(TEST_CLINIC_ID, "faltas da semana");
    expect(faltasRes.response).toContain("Controle de Faltas");

    const resumoRes = await processAssistantCommand(TEST_CLINIC_ID, "qualquer coisa");
    expect(resumoRes.response).toContain("Resumo Executivo SondaPro");
  });
});

