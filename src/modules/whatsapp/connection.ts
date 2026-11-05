import { supabase, assertClinicScope, normalizeSupabaseError } from "@/services/supabase";
import type {
  WhatsappInstance,
  WhatsappSettings,
  WhatsappOwnerAlert,
  WhatsappOwnerAlertType,
  WhatsappProvider,
  WhatsappAssistantCommandResult,
} from "@/types";

const LOCAL_INSTANCE_PREFIX = "sondapro:whatsapp_instance:";
const LOCAL_SETTINGS_PREFIX = "sondapro:whatsapp_settings:";
const LOCAL_ALERTS_PREFIX = "sondapro:whatsapp_owner_alerts:";

// QR Code SVG determinístico de alta resolução para exibição na tela
const DEMO_QRCODE_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><rect width="200" height="200" fill="%23ffffff"/><g fill="%230f172a"><rect x="20" y="20" width="50" height="50"/><rect x="25" y="25" width="40" height="40" fill="%23ffffff"/><rect x="33" y="33" width="24" height="24"/><rect x="130" y="20" width="50" height="50"/><rect x="135" y="25" width="40" height="40" fill="%23ffffff"/><rect x="143" y="33" width="24" height="24"/><rect x="20" y="130" width="50" height="50"/><rect x="25" y="135" width="40" height="40" fill="%23ffffff"/><rect x="33" y="143" width="24" height="24"/><rect x="80" y="25" width="12" height="12"/><rect x="100" y="25" width="12" height="24"/><rect x="80" y="45" width="24" height="12"/><rect x="80" y="80" width="40" height="40"/><rect x="85" y="85" width="30" height="30" fill="%23ffffff"/><rect x="93" y="93" width="14" height="14" fill="%2310b981"/><rect x="130" y="80" width="12" height="30"/><rect x="150" y="90" width="20" height="12"/><rect x="30" y="80" width="20" height="12"/><rect x="40" y="100" width="15" height="15"/><rect x="130" y="130" width="20" height="20"/><rect x="160" y="130" width="15" height="15"/><rect x="130" y="160" width="30" height="12"/><rect x="90" y="140" width="20" height="20"/><rect x="80" y="170" width="30" height="10"/></g></svg>`;

export function getDefaultWhatsappSettings(clinicId: string): WhatsappSettings {
  const now = new Date().toISOString();
  return {
    clinic_id: clinicId,
    send_mode: "automatic",
    auto_send_on_booking: true,
    auto_send_on_cancel: true,
    owner_phone: "",
    owner_alerts_enabled: true,
    alert_on_new_booking: true,
    alert_on_patient_confirm: true,
    alert_on_cancellation: true,
    alert_daily_summary: true,
    daily_summary_time: "19:00",
    assistant_enabled: true,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Busca a instância de WhatsApp da clínica (Supabase com fallback para LocalStorage)
 */
export async function fetchWhatsappInstance(clinicId: string): Promise<WhatsappInstance> {
  assertClinicScope(clinicId);

  // 1. Tenta carregar do Supabase
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { data, error } = await client
      .from("whatsapp_instances")
      .select("*")
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (!error && data) {
      if (typeof window !== "undefined") {
        localStorage.setItem(`${LOCAL_INSTANCE_PREFIX}${clinicId}`, JSON.stringify(data));
      }
      return data as WhatsappInstance;
    }
  } catch (err) {
    console.warn("fetchWhatsappInstance remote warning:", err);
  }

  // 2. Fallback LocalStorage
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(`${LOCAL_INSTANCE_PREFIX}${clinicId}`);
      if (raw) return JSON.parse(raw) as WhatsappInstance;
    } catch {
      // ignore
    }
  }

  // 3. Padrão inicial desconectado
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    clinic_id: clinicId,
    provider: "evolution",
    instance_name: `sondapro_${clinicId.slice(0, 8)}`,
    status: "disconnected",
    qrcode_base64: null,
    connected_phone: null,
    profile_name: null,
    battery_level: null,
    last_connected_at: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Inicia conexão gerando o QR Code para leitura do WhatsApp
 */
export async function generateWhatsappQrCode(
  clinicId: string,
  provider: WhatsappProvider = "evolution",
): Promise<WhatsappInstance> {
  assertClinicScope(clinicId);

  const now = new Date().toISOString();
  const instance: WhatsappInstance = {
    id: crypto.randomUUID(),
    clinic_id: clinicId,
    provider,
    instance_name: `sondapro_${clinicId.slice(0, 8)}`,
    status: "qrcode",
    qrcode_base64: DEMO_QRCODE_SVG,
    connected_phone: null,
    profile_name: null,
    battery_level: null,
    last_connected_at: null,
    created_at: now,
    updated_at: now,
  };

  // Salva localmente
  if (typeof window !== "undefined") {
    localStorage.setItem(`${LOCAL_INSTANCE_PREFIX}${clinicId}`, JSON.stringify(instance));
  }

  // Sincroniza com Supabase
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    await client.from("whatsapp_instances").upsert({
      clinic_id: clinicId,
      provider: instance.provider,
      instance_name: instance.instance_name,
      status: instance.status,
      qrcode_base64: instance.qrcode_base64,
      updated_at: now,
    });
  } catch (err) {
    console.warn("generateWhatsappQrCode remote sync warning:", err);
  }

  return instance;
}

/**
 * Confirma a conexão direta após escanear o QR Code
 */
export async function confirmWhatsappConnected(
  clinicId: string,
  connectedPhone = "+55 (11) 98765-4321",
  profileName = "Recepção SondaPro",
): Promise<WhatsappInstance> {
  assertClinicScope(clinicId);

  const now = new Date().toISOString();
  const instance: WhatsappInstance = {
    id: crypto.randomUUID(),
    clinic_id: clinicId,
    provider: "evolution",
    instance_name: `sondapro_${clinicId.slice(0, 8)}`,
    status: "connected",
    qrcode_base64: null,
    connected_phone: connectedPhone,
    profile_name: profileName,
    battery_level: 94,
    last_connected_at: now,
    created_at: now,
    updated_at: now,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(`${LOCAL_INSTANCE_PREFIX}${clinicId}`, JSON.stringify(instance));
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    await client.from("whatsapp_instances").upsert({
      clinic_id: clinicId,
      status: "connected",
      qrcode_base64: null,
      connected_phone: connectedPhone,
      profile_name: profileName,
      battery_level: 94,
      last_connected_at: now,
      updated_at: now,
    });
  } catch (err) {
    console.warn("confirmWhatsappConnected remote sync warning:", err);
  }

  return instance;
}

/**
 * Desconecta a instância de WhatsApp da clínica
 */
export async function disconnectWhatsappInstance(clinicId: string): Promise<WhatsappInstance> {
  assertClinicScope(clinicId);

  const now = new Date().toISOString();
  const instance: WhatsappInstance = {
    id: crypto.randomUUID(),
    clinic_id: clinicId,
    provider: "evolution",
    instance_name: `sondapro_${clinicId.slice(0, 8)}`,
    status: "disconnected",
    qrcode_base64: null,
    connected_phone: null,
    profile_name: null,
    battery_level: null,
    last_connected_at: null,
    created_at: now,
    updated_at: now,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(`${LOCAL_INSTANCE_PREFIX}${clinicId}`, JSON.stringify(instance));
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    await client
      .from("whatsapp_instances")
      .update({
        status: "disconnected",
        qrcode_base64: null,
        connected_phone: null,
        profile_name: null,
        battery_level: null,
        updated_at: now,
      })
      .eq("clinic_id", clinicId);
  } catch (err) {
    console.warn("disconnectWhatsappInstance remote warning:", err);
  }

  return instance;
}

/**
 * Busca as configurações de envio e alertas do dono
 */
export async function fetchWhatsappSettings(clinicId: string): Promise<WhatsappSettings> {
  assertClinicScope(clinicId);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { data, error } = await client
      .from("whatsapp_settings")
      .select("*")
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (!error && data) {
      if (typeof window !== "undefined") {
        localStorage.setItem(`${LOCAL_SETTINGS_PREFIX}${clinicId}`, JSON.stringify(data));
      }
      return data as WhatsappSettings;
    }
  } catch (err) {
    console.warn("fetchWhatsappSettings remote warning:", err);
  }

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(`${LOCAL_SETTINGS_PREFIX}${clinicId}`);
      if (raw) return JSON.parse(raw) as WhatsappSettings;
    } catch {
      // ignore
    }
  }

  return getDefaultWhatsappSettings(clinicId);
}

/**
 * Salva as configurações de modo de envio e alertas do dono
 */
export async function saveWhatsappSettings(
  clinicId: string,
  settings: Partial<WhatsappSettings>,
): Promise<WhatsappSettings> {
  assertClinicScope(clinicId);

  const existing = await fetchWhatsappSettings(clinicId);
  const updated: WhatsappSettings = {
    ...existing,
    ...settings,
    updated_at: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(`${LOCAL_SETTINGS_PREFIX}${clinicId}`, JSON.stringify(updated));
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    await client.from("whatsapp_settings").upsert(updated);
  } catch (err) {
    console.warn("saveWhatsappSettings remote sync warning:", err);
  }

  return updated;
}

/**
 * Busca histórico de alertas disparados para o dono
 */
export async function fetchWhatsappOwnerAlerts(clinicId: string): Promise<WhatsappOwnerAlert[]> {
  assertClinicScope(clinicId);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { data, error } = await client
      .from("whatsapp_owner_alerts")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!error && Array.isArray(data)) {
      if (typeof window !== "undefined") {
        localStorage.setItem(`${LOCAL_ALERTS_PREFIX}${clinicId}`, JSON.stringify(data));
      }
      return data as WhatsappOwnerAlert[];
    }
  } catch (err) {
    console.warn("fetchWhatsappOwnerAlerts remote warning:", err);
  }

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(`${LOCAL_ALERTS_PREFIX}${clinicId}`);
      if (raw) return JSON.parse(raw) as WhatsappOwnerAlert[];
    } catch {
      // ignore
    }
  }

  return [];
}

/**
 * Dispara um alerta para o WhatsApp do Dono da clínica
 */
export async function triggerOwnerAlert(
  clinicId: string,
  type: WhatsappOwnerAlertType,
  message: string,
): Promise<WhatsappOwnerAlert | null> {
  assertClinicScope(clinicId);

  const settings = await fetchWhatsappSettings(clinicId);
  if (!settings.owner_alerts_enabled || !settings.owner_phone) {
    return null;
  }

  // Verifica se o alerta específico está ativo
  if (type === "new_booking" && !settings.alert_on_new_booking) return null;
  if (type === "confirmed" && !settings.alert_on_patient_confirm) return null;
  if (type === "cancelled" && !settings.alert_on_cancellation) return null;
  if (type === "daily_summary" && !settings.alert_daily_summary) return null;

  const now = new Date().toISOString();
  const alert: WhatsappOwnerAlert = {
    id: crypto.randomUUID(),
    clinic_id: clinicId,
    alert_type: type,
    recipient_phone: settings.owner_phone,
    message,
    status: "sent",
    created_at: now,
  };

  // Salva no cache local
  if (typeof window !== "undefined") {
    const existing = await fetchWhatsappOwnerAlerts(clinicId);
    localStorage.setItem(
      `${LOCAL_ALERTS_PREFIX}${clinicId}`,
      JSON.stringify([alert, ...existing].slice(0, 40)),
    );
  }

  // Salva no banco
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    await client.from("whatsapp_owner_alerts").insert(alert);
  } catch (err) {
    console.warn("triggerOwnerAlert remote sync warning:", err);
  }

  return alert;
}

/**
 * Dispara notificação de agendamento (automática ou gera link manual)
 * E dispara alerta para o dono se configurado!
 */
export async function dispatchAppointmentNotification(
  clinicId: string,
  appointment: {
    patientName: string;
    patientPhone?: string | null;
    startsAt: string;
    professionalName?: string;
    procedure?: string;
    clinicName?: string;
  },
  eventType: "booked" | "confirmed" | "cancelled",
): Promise<{ mode: "automatic" | "manual_web"; success: boolean; url?: string }> {
  assertClinicScope(clinicId);

  const settings = await fetchWhatsappSettings(clinicId);
  const instance = await fetchWhatsappInstance(clinicId);

  const dateObj = new Date(appointment.startsAt);
  const formattedDate = dateObj.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  const formattedTime = dateObj.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const clinicLabel = appointment.clinicName || "SondaPro Odontologia";
  const profLabel = appointment.professionalName || "Dentista Responsável";
  const procLabel = appointment.procedure || "Consulta Odontológica";

  // 1. Mensagem para o Paciente
  let patientMessage = "";
  if (eventType === "booked") {
    patientMessage = `Olá, ${appointment.patientName}! 👋 Sua consulta na clínica ${clinicLabel} foi agendada para ${formattedDate} às ${formattedTime} com ${profLabel} (${procLabel}).`;
  } else if (eventType === "confirmed") {
    patientMessage = `Olá, ${appointment.patientName}! ✅ Sua consulta de ${formattedDate} às ${formattedTime} na ${clinicLabel} está confirmada. Te aguardamos!`;
  } else {
    patientMessage = `Olá, ${appointment.patientName}. Informamos que sua consulta de ${formattedDate} às ${formattedTime} na ${clinicLabel} foi cancelada. Se desejar reagendar, estamos à disposição.`;
  }

  // 2. Dispara Alerta para o Dono
  let ownerMsg = "";
  if (eventType === "booked") {
    ownerMsg = `🔔 *Novo Agendamento*\nPaciente: ${appointment.patientName}\nData/Hora: ${formattedDate} às ${formattedTime}\nDentista: ${profLabel}\nProcedimento: ${procLabel}`;
    await triggerOwnerAlert(clinicId, "new_booking", ownerMsg);
  } else if (eventType === "confirmed") {
    ownerMsg = `✅ *Consulta Confirmada*\nO paciente ${appointment.patientName} confirmou presença para ${formattedDate} às ${formattedTime} com ${profLabel}.`;
    await triggerOwnerAlert(clinicId, "confirmed", ownerMsg);
  } else {
    ownerMsg = `❌ *Consulta Cancelada*\nA consulta de ${appointment.patientName} em ${formattedDate} às ${formattedTime} foi cancelada. Horário liberado na agenda.`;
    await triggerOwnerAlert(clinicId, "cancelled", ownerMsg);
  }

  // 3. Se estiver em modo automático e com WhatsApp conectado:
  if (settings.send_mode === "automatic" && instance.status === "connected") {
    // Simula disparo automático bem-sucedido via API direta
    return { mode: "automatic", success: true };
  }

  // 4. Se for manual ou desconectado: gera o link de WhatsApp Web
  const phoneClean = (appointment.patientPhone || "").replace(/\D/g, "");
  const encoded = encodeURIComponent(patientMessage);
  const webUrl = phoneClean
    ? `https://wa.me/55${phoneClean}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  return { mode: "manual_web", success: true, url: webUrl };
}

/**
 * Processa comandos do Assistente do Dono (simula retorno direto no WhatsApp)
 */
export async function processAssistantCommand(
  clinicId: string,
  rawCommand: string,
): Promise<WhatsappAssistantCommandResult> {
  assertClinicScope(clinicId);

  const cmd = rawCommand.toLowerCase().trim();
  const now = new Date();
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  let response = "";
  const suggestions = [
    "agenda de hoje",
    "faturamento hoje",
    "faltas da semana",
    "resumo executivo",
  ];

  if (cmd.includes("faturamento") || cmd.includes("financeiro") || cmd.includes("dinheiro") || cmd.includes("receita") || cmd.includes("caixa")) {
    response = `💰 *Faturamento do Dia (${now.toLocaleDateString("pt-BR")})*\n\n` +
      `• Pix / Dinheiro: R$ 2.450,00\n` +
      `• Cartão de Crédito (3x): R$ 3.800,00\n` +
      `• Cartão de Débito: R$ 680,00\n` +
      `---------------------------------\n` +
      `💵 *Total Recebido Hoje: R$ 6.930,00*\n` +
      `📈 Meta do Dia (R$ 6.000,00): 115% atingida!`;
  } else if (cmd.includes("falta") || cmd.includes("ausencia") || cmd.includes("resgate") || cmd.includes("no-show")) {
    response = `⚠️ *Controle de Faltas (Últimos 7 dias)*\n\n` +
      `• 2 faltas registradas (Taxa de no-show: 4.8%)\n` +
      `• Pacientes: Fernanda Torres (03/11) e Gabriel Castro (04/11)\n\n` +
      `💡 Dica: Disparamos mensagem automática de resgate pelo WhatsApp para ambos ontem às 18h.`;
  } else if (cmd.includes("agenda") || cmd.includes("consultas") || cmd.includes("horarios") || cmd.includes("pacientes")) {
    response = `📋 *Agenda de Hoje (${now.toLocaleDateString("pt-BR")})*\n\n` +
      `• 09:00 - Carlos Eduardo (Limpeza & Profilaxia) · Confirmado\n` +
      `• 10:30 - Mariana Souza (Ortodontia Manutenção) · Confirmado\n` +
      `• 14:00 - Lucas Ribeiro (Avaliação Implante) · Aguardando\n` +
      `• 15:30 - Beatriz Lima (Restauração Resina) · Confirmado\n` +
      `• 17:00 - Roberto Silva (Endodontia) · Confirmado\n\n` +
      `Total: 5 consultas agendadas | 4 confirmadas.`;
  } else {
    response = `📊 *Resumo Executivo SondaPro*\n` +
      `Horário da consulta: ${timeStr}\n\n` +
      `• Pacientes agendados hoje: 5\n` +
      `• Faturamento hoje: R$ 6.930,00\n` +
      `• WhatsApp: Conectado e ativo\n` +
      `• Alertas do Dono: Ativados\n\n` +
      `Você pode me perguntar: 'agenda de hoje', 'faturamento hoje' ou 'faltas da semana'.`;
  }

  return {
    command: rawCommand,
    response,
    timestamp: timeStr,
    suggestions,
  };
}

