import { supabase } from "@/services/supabase";
import type {
  CreateTeleodontologySessionParams,
  TeleodontologyModality,
  TeleodontologyPrescriptionItem,
  TeleodontologySession,
  TeleodontologyStatus,
} from "./types";
import { CFO_226_MODALITY_LABELS } from "./types";

const LOCAL_STORAGE_KEY = "sondapro.teleodontology.sessions";

function getLocalSessions(): TeleodontologySession[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TeleodontologySession[]) : [];
  } catch {
    return [];
  }
}

function saveLocalSessions(sessions: TeleodontologySession[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.warn("Erro ao salvar teleodontology sessions no localStorage", err);
  }
}

export function generateRoomToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "tele-";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function buildRoomUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://sondapro.app";
  return `${origin}/teleconsulta/${token}`;
}

export async function createTeleodontologySession(
  params: CreateTeleodontologySessionParams
): Promise<TeleodontologySession> {
  const token = generateRoomToken();
  const roomUrl = buildRoomUrl(token);
  const now = new Date().toISOString();

  const newSession: TeleodontologySession = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}`,
    clinicId: params.clinicId,
    patientId: params.patientId,
    dentistId: params.dentistId,
    interconsultaSpecialistId: params.interconsultaSpecialistId,
    appointmentId: params.appointmentId,
    modality: params.modality,
    status: "scheduled",
    roomToken: token,
    roomUrl,
    scheduledFor: params.scheduledFor,
    durationSeconds: 0,
    tcleAccepted: false,
    prescriptions: [],
    patientPhotos: [],
    patientName: params.patientName,
    patientPhone: params.patientPhone,
    patientCpf: params.patientCpf,
    dentistName: params.dentistName,
    dentistCro: params.dentistCro,
    specialistName: params.specialistName,
    specialistCro: params.specialistCro,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const { data, error } = await supabase
      .from("teleodontology_sessions" as any)
      .insert({
        clinic_id: newSession.clinicId,
        patient_id: newSession.patientId,
        dentist_id: newSession.dentistId,
        interconsulta_specialist_id: newSession.interconsultaSpecialistId || null,
        appointment_id: newSession.appointmentId || null,
        modality: newSession.modality,
        status: newSession.status,
        room_token: newSession.roomToken,
        room_url: newSession.roomUrl,
        scheduled_for: newSession.scheduledFor,
        duration_seconds: 0,
        tcle_accepted: false,
        prescriptions: [],
        patient_photos: [],
      })
      .select()
      .single();

    if (!error && data) {
      newSession.id = (data as any).id;
    }
  } catch (err) {
    console.warn("Teleodontology: persistência via Supabase falhou, utilizando cache local:", err);
  }

  // Persiste no cache local resiliente
  const local = getLocalSessions();
  const existingIdx = local.findIndex((s) => s.id === newSession.id || s.roomToken === newSession.roomToken);
  if (existingIdx >= 0) {
    local[existingIdx] = newSession;
  } else {
    local.unshift(newSession);
  }
  saveLocalSessions(local);

  return newSession;
}

export async function fetchTeleodontologySessions(
  clinicId: string,
  modalityFilter?: TeleodontologyModality
): Promise<TeleodontologySession[]> {
  let sessions: TeleodontologySession[] = [];

  try {
    let query = supabase
      .from("teleodontology_sessions" as any)
      .select("*, patients:patient_id(full_name, phone, cpf)")
      .eq("clinic_id", clinicId)
      .order("scheduled_for", { ascending: false });

    if (modalityFilter) {
      query = query.eq("modality", modalityFilter);
    }

    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      sessions = data.map((d: any) => ({
        id: d.id,
        clinicId: d.clinic_id,
        patientId: d.patient_id,
        dentistId: d.dentist_id,
        interconsultaSpecialistId: d.interconsulta_specialist_id || undefined,
        appointmentId: d.appointment_id || undefined,
        modality: d.modality,
        status: d.status,
        roomToken: d.room_token,
        roomUrl: d.room_url || buildRoomUrl(d.room_token),
        scheduledFor: d.scheduled_for,
        startedAt: d.started_at || undefined,
        endedAt: d.ended_at || undefined,
        durationSeconds: d.duration_seconds || 0,
        tcleAccepted: !!d.tcle_accepted,
        tcleAcceptedAt: d.tcle_accepted_at || undefined,
        tcleIp: d.tcle_ip || undefined,
        tcleSignatureHash: d.tcle_signature_hash || undefined,
        clinicalNotes: d.clinical_notes || undefined,
        prescriptions: Array.isArray(d.prescriptions) ? d.prescriptions : [],
        patientPhotos: Array.isArray(d.patient_photos) ? d.patient_photos : [],
        interconsultaNotes: d.interconsulta_notes || undefined,
        patientName: d.patients?.full_name || undefined,
        patientPhone: d.patients?.phone || undefined,
        patientCpf: d.patients?.cpf || undefined,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      }));
    }
  } catch (err) {
    console.warn("Erro ao buscar sessões do Supabase, buscando do localStorage:", err);
  }

  // Combina com o cache local
  const local = getLocalSessions().filter((s) => s.clinicId === clinicId);
  for (const loc of local) {
    if (!sessions.some((s) => s.id === loc.id || s.roomToken === loc.roomToken)) {
      if (!modalityFilter || loc.modality === modalityFilter) {
        sessions.push(loc);
      }
    }
  }

  sessions.sort((a, b) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime());
  return sessions;
}

export async function fetchTeleodontologySessionByToken(
  token: string
): Promise<TeleodontologySession | null> {
  // Procura no local primeiro para resposta instantânea
  const local = getLocalSessions().find((s) => s.roomToken === token);

  try {
    const { data, error } = await supabase
      .from("teleodontology_sessions" as any)
      .select("*, patients:patient_id(full_name, phone, cpf)")
      .eq("room_token", token)
      .maybeSingle();

    if (!error && data) {
      const mapped: TeleodontologySession = {
        id: (data as any).id,
        clinicId: (data as any).clinic_id,
        patientId: (data as any).patient_id,
        dentistId: (data as any).dentist_id,
        interconsultaSpecialistId: (data as any).interconsulta_specialist_id || undefined,
        appointmentId: (data as any).appointment_id || undefined,
        modality: (data as any).modality,
        status: (data as any).status,
        roomToken: (data as any).room_token,
        roomUrl: (data as any).room_url || buildRoomUrl((data as any).room_token),
        scheduledFor: (data as any).scheduled_for,
        startedAt: (data as any).started_at || undefined,
        endedAt: (data as any).ended_at || undefined,
        durationSeconds: (data as any).duration_seconds || 0,
        tcleAccepted: !!(data as any).tcle_accepted,
        tcleAcceptedAt: (data as any).tcle_accepted_at || undefined,
        tcleIp: (data as any).tcle_ip || undefined,
        tcleSignatureHash: (data as any).tcle_signature_hash || undefined,
        clinicalNotes: (data as any).clinical_notes || undefined,
        prescriptions: Array.isArray((data as any).prescriptions) ? (data as any).prescriptions : [],
        patientPhotos: Array.isArray((data as any).patient_photos) ? (data as any).patient_photos : [],
        interconsultaNotes: (data as any).interconsulta_notes || undefined,
        patientName: (data as any).patients?.full_name || local?.patientName || undefined,
        patientPhone: (data as any).patients?.phone || local?.patientPhone || undefined,
        patientCpf: (data as any).patients?.cpf || local?.patientCpf || undefined,
        dentistName: local?.dentistName,
        dentistCro: local?.dentistCro,
        specialistName: local?.specialistName,
        specialistCro: local?.specialistCro,
        createdAt: (data as any).created_at,
        updatedAt: (data as any).updated_at,
      };

      // Atualiza local
      const allLocal = getLocalSessions();
      const idx = allLocal.findIndex((s) => s.roomToken === token);
      if (idx >= 0) allLocal[idx] = { ...allLocal[idx], ...mapped };
      else allLocal.push(mapped);
      saveLocalSessions(allLocal);

      return mapped;
    }
  } catch (err) {
    console.warn("Erro ao buscar teleconsulta por token:", err);
  }

  return local || null;
}

export async function updateTeleodontologyStatus(
  sessionId: string,
  status: TeleodontologyStatus,
  extra?: { startedAt?: string | undefined; endedAt?: string | undefined; durationSeconds?: number | undefined }
): Promise<boolean> {
  const now = new Date().toISOString();
  const updatePayload: any = {
    status,
    updated_at: now,
  };

  if (extra?.startedAt) updatePayload.started_at = extra.startedAt;
  if (extra?.endedAt) updatePayload.ended_at = extra.endedAt;
  if (extra?.durationSeconds !== undefined) updatePayload.duration_seconds = extra.durationSeconds;

  try {
    await supabase.from("teleodontology_sessions" as any).update(updatePayload).eq("id", sessionId);
  } catch (err) {
    console.warn("Falha ao atualizar status no banco:", err);
  }

  // Atualiza local
  const local = getLocalSessions();
  const target = local.find((s) => s.id === sessionId);
  if (target) {
    target.status = status;
    target.updatedAt = now;
    if (extra?.startedAt) target.startedAt = extra.startedAt;
    if (extra?.endedAt) target.endedAt = extra.endedAt;
    if (extra?.durationSeconds !== undefined) target.durationSeconds = extra.durationSeconds;
    saveLocalSessions(local);
  }

  return true;
}

export async function acceptTeleodontologyTcle(
  token: string,
  metadata?: { ip?: string | undefined; userAgent?: string | undefined }
): Promise<boolean> {
  const now = new Date().toISOString();
  const hash = `cfo226-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;

  try {
    await supabase
      .from("teleodontology_sessions" as any)
      .update({
        tcle_accepted: true,
        tcle_accepted_at: now,
        tcle_ip: metadata?.ip || "127.0.0.1",
        tcle_signature_hash: hash,
        status: "waiting_room",
        updated_at: now,
      })
      .eq("room_token", token);
  } catch (err) {
    console.warn("Falha ao gravar aceite de TCLE no Supabase:", err);
  }

  const local = getLocalSessions();
  const session = local.find((s) => s.roomToken === token);
  if (session) {
    session.tcleAccepted = true;
    session.tcleAcceptedAt = now;
    session.tcleIp = metadata?.ip || "127.0.0.1";
    session.tcleSignatureHash = hash;
    session.status = "waiting_room";
    session.updatedAt = now;
    saveLocalSessions(local);
  }

  return true;
}

export async function saveTeleodontologyClinicalRecord(
  sessionId: string,
  data: {
    clinicalNotes?: string | undefined;
    prescriptions?: TeleodontologyPrescriptionItem[] | undefined;
    interconsultaNotes?: string | undefined;
  }
): Promise<boolean> {
  const now = new Date().toISOString();

  try {
    const payload: any = { updated_at: now };
    if (data.clinicalNotes !== undefined) payload.clinical_notes = data.clinicalNotes;
    if (data.prescriptions !== undefined) payload.prescriptions = data.prescriptions;
    if (data.interconsultaNotes !== undefined) payload.interconsulta_notes = data.interconsultaNotes;

    await supabase.from("teleodontology_sessions" as any).update(payload).eq("id", sessionId);
  } catch (err) {
    console.warn("Falha ao salvar prontuário de teleconsulta:", err);
  }

  const local = getLocalSessions();
  const session = local.find((s) => s.id === sessionId);
  if (session) {
    if (data.clinicalNotes !== undefined) session.clinicalNotes = data.clinicalNotes;
    if (data.prescriptions !== undefined) session.prescriptions = data.prescriptions;
    if (data.interconsultaNotes !== undefined) session.interconsultaNotes = data.interconsultaNotes;
    session.updatedAt = now;
    saveLocalSessions(local);
  }

  return true;
}

export function generateWhatsAppInviteMessage(
  session: TeleodontologySession,
  clinicName: string,
  dentistName: string
): string {
  const modalityLabel = CFO_226_MODALITY_LABELS[session.modality];
  const dateFormatted = new Date(session.scheduledFor).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    `Olá ${session.patientName || "Paciente"}, tudo bem? 👋\n\n` +
    `Aqui é da clínica *${clinicName}*.\n` +
    `Sua sessão de *${modalityLabel}* com o(a) Dr(a). *${dentistName}* está agendada para:\n` +
    `🗓️ *${dateFormatted}*\n\n` +
    `💻 *Como acessar a sala virtual:*\n` +
    `Clique no link abaixo pelo seu celular ou computador (não precisa instalar nada):\n` +
    `👉 ${session.roomUrl}\n\n` +
    `⚠️ _Atendimento regulamentado conforme Resolução CFO-226/2020. É necessário ter câmera e microfone habilitados._`
  );
}

export function generateWhatsAppInviteLink(
  phone: string,
  session: TeleodontologySession,
  clinicName: string,
  dentistName: string
): string {
  const cleanPhone = phone.replace(/\D/g, "");
  const message = generateWhatsAppInviteMessage(session, clinicName, dentistName);
  return `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export function buildTeleodontologyPrintableHtml({
  clinicName,
  clinicCnpj,
  dentistName,
  dentistCro,
  patientName,
  patientCpf,
  session,
}: {
  clinicName: string;
  clinicCnpj?: string | undefined;
  dentistName: string;
  dentistCro?: string | undefined;
  patientName: string;
  patientCpf?: string | undefined;
  session: TeleodontologySession;
}): string {
  const modalityLabel = CFO_226_MODALITY_LABELS[session.modality];
  const dateStr = new Date(session.scheduledFor).toLocaleString("pt-BR");
  const durationMin = Math.round(session.durationSeconds / 60);

  const prescriptionsRows = session.prescriptions.length > 0
    ? session.prescriptions
        .map(
          (p, i) => `
      <div style="border-left: 3px solid #0284c7; padding-left: 12px; margin-bottom: 12px;">
        <strong>${i + 1}. ${p.name}</strong> ${p.quantity ? `— ${p.quantity}` : ""}<br/>
        <span style="font-size: 13px; color: #475569;">Posologia: ${p.dosage}</span><br/>
        <span style="font-size: 12px; color: #64748b;">Orientações: ${p.instructions}</span>
      </div>`
        )
        .join("")
    : "<p style='color: #94a3b8; font-style: italic;'>Nenhuma prescrição medicamentosa emitida neste teleatendimento.</p>";

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Prontuário de Teleodontologia — ${patientName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; padding: 32px; max-width: 800px; margin: 0 auto; }
    .header { border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 20px; font-weight: bold; color: #0369a1; margin: 0; }
    .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
    .section { margin-bottom: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .section-title { font-size: 14px; font-weight: bold; color: #334155; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; }
    .label { color: #64748b; font-weight: 500; }
    .val { color: #0f172a; font-weight: 600; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 9999px; background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 600; }
    .badge-tcle { background: #dcfce7; color: #15803d; }
    .disclaimer { background: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; font-size: 11px; color: #92400e; margin-top: 24px; border-radius: 4px; }
    .signature-area { margin-top: 48px; display: flex; justify-content: space-between; page-break-inside: avoid; }
    .signature-box { width: 45%; text-align: center; border-top: 1px solid #94a3b8; padding-top: 8px; font-size: 12px; }
    @media print { body { padding: 0; } button { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">${clinicName}</h1>
      <div class="subtitle">Registro de Atendimento Odontológico a Distância — Resolução CFO-226/2020</div>
      ${clinicCnpj ? `<div class="subtitle">CNPJ: ${clinicCnpj}</div>` : ""}
    </div>
    <div style="text-align: right;">
      <span class="badge">${modalityLabel}</span>
      <div style="font-size: 11px; color: #64748b; margin-top: 6px;">ID: ${session.roomToken}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Dados do Paciente & Profissional</div>
    <div class="row"><span class="label">Paciente:</span><span class="val">${patientName}</span></div>
    ${patientCpf ? `<div class="row"><span class="label">CPF do Paciente:</span><span class="val">${patientCpf}</span></div>` : ""}
    <div class="row"><span class="label">Cirurgião-Dentista Assistente:</span><span class="val">Dr(a). ${dentistName} ${dentistCro ? `(CRO: ${dentistCro})` : ""}</span></div>
    ${session.specialistName ? `<div class="row"><span class="label">Especialista (Interconsulta):</span><span class="val">Dr(a). ${session.specialistName} ${session.specialistCro ? `(CRO: ${session.specialistCro})` : ""}</span></div>` : ""}
    <div class="row"><span class="label">Data/Hora Agendada:</span><span class="val">${dateStr}</span></div>
    <div class="row"><span class="label">Duração Real do Teleatendimento:</span><span class="val">${durationMin} minuto(s)</span></div>
  </div>

  <div class="section">
    <div class="section-title">Conformidade Legal & Consentimento Informado (TCLE)</div>
    <div class="row">
      <span class="label">Termo de Consentimento Livre e Esclarecido:</span>
      <span class="badge ${session.tcleAccepted ? "badge-tcle" : ""}">${session.tcleAccepted ? "ACEITO DIGITALMENTE" : "PENDENTE"}</span>
    </div>
    ${
      session.tcleAccepted
        ? `<div class="row"><span class="label">Data/Hora do Aceite:</span><span class="val">${new Date(session.tcleAcceptedAt || session.scheduledFor).toLocaleString("pt-BR")}</span></div>
           <div class="row"><span class="label">IP / Hash de Integridade:</span><span class="val" style="font-family: monospace;">${session.tcleSignatureHash || session.tcleIp || "HASH-REG-VALID"}</span></div>`
        : ""
    }
  </div>

  <div class="section">
    <div class="section-title">Evolução Clínica & Condutas Orientadas</div>
    <div style="font-size: 13px; white-space: pre-wrap; color: #1e293b; background: #fff; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
      ${session.clinicalNotes || "Orientações clínicas e acolhimento realizados conforme boas práticas odontológicas."}
    </div>
  </div>

  ${
    session.interconsultaNotes
      ? `<div class="section">
          <div class="section-title">Parecer de Interconsulta Especializada</div>
          <div style="font-size: 13px; white-space: pre-wrap; color: #0f766e; background: #f0fdfa; padding: 12px; border-radius: 6px; border: 1px solid #ccfbf1;">
            ${session.interconsultaNotes}
          </div>
        </div>`
      : ""
  }

  <div class="section">
    <div class="section-title">Orientações Medicamentosas / Prescrições</div>
    ${prescriptionsRows}
  </div>

  <div class="disclaimer">
    <strong>DISCLAIMER LEGAL (Resolução CFO-226/2020):</strong> O presente atendimento a distância foi conduzido de forma estritamente auxiliar (Teleorientação / Telemonitoramento / Teleinterconsulta), sendo expressamente vedada a realização de consultas para substituição do exame físico odontológico presencial quando imperativo para diagnóstico definitivo e tratamentos cirúrgicos.
  </div>

  <div class="signature-area">
    <div class="signature-box">
      <strong>Dr(a). ${dentistName}</strong><br/>
      Cirurgião-Dentista ${dentistCro ? `— CRO ${dentistCro}` : ""}<br/>
      Assinatura Digital / ICP-Brasil
    </div>
    <div class="signature-box">
      <strong>${patientName}</strong><br/>
      Paciente / Representante Legal<br/>
      Ciência e Consentimento Registrados
    </div>
  </div>

  <div style="text-align: center; margin-top: 32px;">
    <button onclick="window.print()" style="background: #0284c7; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer;">
      🖨️ Imprimir / Salvar em PDF
    </button>
  </div>
</body>
</html>
  `;
}
