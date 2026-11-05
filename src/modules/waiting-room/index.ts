import { supabase, normalizeSupabaseError, assertClinicScope } from "@/services/supabase";
import type { CallPriority, WaitingRoomCall, WaitingRoomCallStatus } from "@/types";

export interface CreateCallParams {
  clinicId: string;
  unitId?: string | null;
  patientId?: string | null;
  patientName: string;
  professionalId?: string | null;
  professionalName?: string;
  roomId?: string | null;
  roomName?: string;
  priority?: CallPriority;
}

/**
 * Validador seguro de UUID para colunas do PostgreSQL
 */
export function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

/**
 * Busca as últimas chamadas de pacientes para a TV da clínica
 */
export async function fetchWaitingRoomCalls(
  clinicId: string,
  unitId?: string | null,
): Promise<WaitingRoomCall[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  let query = client
    .from("waiting_room_calls")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("called_at", { ascending: false })
    .limit(20);

  if (unitId && unitId !== "all" && isValidUuid(unitId)) {
    query = query.eq("unit_id", unitId);
  }

  const { data, error } = await query;

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) {
      return [];
    }
    console.warn("fetchWaitingRoomCalls warning:", norm.message);
    return [];
  }

  return (data as WaitingRoomCall[]) ?? [];
}

/**
 * Registra a chamada de um paciente para a sala de atendimento / TV
 */
export async function createWaitingRoomCall(
  params: CreateCallParams,
): Promise<WaitingRoomCall> {
  assertClinicScope(params.clinicId);

  const cleanPatientName = (params.patientName || "Paciente").trim();
  const cleanProfName = (params.professionalName || "Dentista Responsável").trim();
  const cleanRoomName = (params.roomName || "Consultório 01").trim();

  const payload = {
    clinic_id: params.clinicId,
    unit_id: isValidUuid(params.unitId) ? params.unitId : null,
    patient_id: isValidUuid(params.patientId) ? params.patientId : null,
    patient_name: cleanPatientName,
    professional_id: isValidUuid(params.professionalId) ? params.professionalId : null,
    professional_name: cleanProfName,
    room_id: isValidUuid(params.roomId) ? params.roomId : null,
    room_name: cleanRoomName,
    priority: params.priority || "normal",
    status: "called",
    called_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("waiting_room_calls")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) {
      return {
        id: crypto.randomUUID(),
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as WaitingRoomCall;
    }
    throw new Error(norm.message);
  }

  return data as WaitingRoomCall;
}

/**
 * Atualiza o status de atendimento de uma chamada (ex: em atendimento, concluído)
 */
export async function updateWaitingRoomCallStatus(
  clinicId: string,
  callId: string,
  status: WaitingRoomCallStatus,
): Promise<void> {
  assertClinicScope(clinicId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { error } = await client
    .from("waiting_room_calls")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("clinic_id", clinicId)
    .eq("id", callId);

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

/**
 * Sintetiza o som de chamada (Ding-Dong) via Web Audio API nativa
 */
export function playWaitingRoomChime(): void {
  if (typeof window === "undefined") return;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Primeiro tom: Mi (E5 - 659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.3, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.85);

    // Segundo tom: Dó (C5 - 523.25 Hz) - o clássico "Ding-Dong" de consultórios
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(523.25, now + 0.35);
    gain2.gain.setValueAtTime(0, now + 0.35);
    gain2.gain.linearRampToValueAtTime(0.35, now + 0.39);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.35);
    osc2.stop(now + 1.65);
  } catch (e) {
    console.warn("Web Audio chime failed:", e);
  }
}

/**
 * Fala o nome do paciente e consultório usando SpeechSynthesis (Text-to-Speech)
 */
export function speakPatientCall(
  patientName: string,
  roomName: string,
  locale = "pt-BR",
): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel(); // Cancela chamadas anteriores pendentes
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const phrase =
      locale.startsWith("en")
        ? `Attention: Patient ${patientName}, please proceed to ${roomName}.`
        : `Atenção: Paciente ${patientName}, favor dirigir-se ao ${roomName}.`;

    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = locale;
    utterance.rate = 0.95; // Velocidade clara e audível
    utterance.pitch = 1.05;

    // Tenta selecionar voz nativa do idioma
    const voices = window.speechSynthesis.getVoices();
    const targetVoice = voices.find(
      (v) => v.lang.replace("_", "-").toLowerCase() === locale.toLowerCase(),
    );
    if (targetVoice) utterance.voice = targetVoice;

    // Toca a fala com delay de 600ms após o toque do sino
    setTimeout(() => {
      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn("Speech synthesis speak error:", err);
      }
    }, 600);
  } catch (e) {
    console.warn("Speech synthesis failed:", e);
  }
}

