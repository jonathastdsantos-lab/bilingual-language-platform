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

const LOCAL_STORAGE_KEY_PREFIX = "sondapro:waiting_room_calls:";

/**
 * Obtém chamadas salvas localmente como cache resiliente
 */
export function getLocalWaitingRoomCalls(clinicId: string): WaitingRoomCall[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${clinicId}`);
    return raw ? (JSON.parse(raw) as WaitingRoomCall[]) : [];
  } catch {
    return [];
  }
}

/**
 * Salva chamadas no cache local da clínica
 */
export function saveLocalWaitingRoomCalls(clinicId: string, calls: WaitingRoomCall[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${clinicId}`, JSON.stringify(calls.slice(0, 50)));
  } catch {
    // ignore
  }
}

/**
 * Dispara notificação entre abas e janelas em tempo real
 */
export function broadcastWaitingRoomCall(call: WaitingRoomCall): void {
  if (typeof window === "undefined") return;

  try {
    // 1. BroadcastChannel para comunicação instantânea entre abas no mesmo navegador
    if ("BroadcastChannel" in window) {
      const bc = new BroadcastChannel("sondapro_waiting_room");
      bc.postMessage({ type: "CALL_PATIENT", call });
      bc.close();
    }
  } catch {
    // ignore
  }

  try {
    // 2. CustomEvent dentro da mesma aba
    window.dispatchEvent(new CustomEvent("sondapro:waiting_room_call", { detail: call }));
  } catch {
    // ignore
  }
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
 * (Com fusão resiliente entre Supabase e cache local)
 */
export async function fetchWaitingRoomCalls(
  clinicId: string,
  unitId?: string | null,
): Promise<WaitingRoomCall[]> {
  const localCalls = getLocalWaitingRoomCalls(clinicId);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    let query = client
      .from("waiting_room_calls")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("called_at", { ascending: false })
      .limit(30);

    if (unitId && unitId !== "all" && isValidUuid(unitId)) {
      query = query.eq("unit_id", unitId);
    }

    const { data, error } = await query;

    if (!error && Array.isArray(data) && data.length > 0) {
      // Mescla chamadas do banco com eventuais chamadas locais recentes
      const map = new Map<string, WaitingRoomCall>();
      for (const item of (data as WaitingRoomCall[])) {
        map.set(item.id, item);
      }
      for (const loc of localCalls) {
        if (!map.has(loc.id)) {
          map.set(loc.id, loc);
        }
      }
      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.called_at).getTime() - new Date(a.called_at).getTime(),
      );
      saveLocalWaitingRoomCalls(clinicId, merged);
      return merged;
    }
  } catch (err) {
    console.warn("fetchWaitingRoomCalls fallback to local calls:", err);
  }

  return localCalls;
}

/**
 * Registra a chamada de um paciente para a sala de atendimento / TV
 * (Persiste localmente, faz broadcast imediato e sincroniza com Supabase)
 */
export async function createWaitingRoomCall(
  params: CreateCallParams,
): Promise<WaitingRoomCall> {
  assertClinicScope(params.clinicId);

  const cleanPatientName = (params.patientName || "Paciente").trim();
  const cleanProfName = (params.professionalName || "Dentista Responsável").trim();
  const cleanRoomName = (params.roomName || "Consultório 01").trim();

  const generatedId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const payload: WaitingRoomCall = {
    id: generatedId,
    clinic_id: params.clinicId,
    unit_id: isValidUuid(params.unitId) ? (params.unitId as string) : null,
    patient_id: isValidUuid(params.patientId) ? (params.patientId as string) : null,
    patient_name: cleanPatientName,
    professional_id: isValidUuid(params.professionalId) ? (params.professionalId as string) : null,
    professional_name: cleanProfName,
    room_id: isValidUuid(params.roomId) ? (params.roomId as string) : null,
    room_name: cleanRoomName,
    priority: params.priority || "normal",
    status: "called",
    called_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  };

  // 1. Salva imediatamente no cache local e dispara broadcast entre abas (garante funcionamento mesmo sem tabela)
  const currentLocal = getLocalWaitingRoomCalls(params.clinicId);
  const updatedLocal = [payload, ...currentLocal.filter((c) => c.id !== payload.id)].slice(0, 40);
  saveLocalWaitingRoomCalls(params.clinicId, updatedLocal);
  broadcastWaitingRoomCall(payload);

  // 2. Tenta sincronizar com o banco de dados Supabase
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { data, error } = await client
      .from("waiting_room_calls")
      .insert({
        clinic_id: payload.clinic_id,
        unit_id: payload.unit_id,
        patient_id: payload.patient_id,
        patient_name: payload.patient_name,
        professional_id: payload.professional_id,
        professional_name: payload.professional_name,
        room_id: payload.room_id,
        room_name: payload.room_name,
        priority: payload.priority,
        status: payload.status,
        called_at: payload.called_at,
      })
      .select("*")
      .single();

    if (!error && data) {
      const realCall = data as WaitingRoomCall;
      const synced = [realCall, ...updatedLocal.filter((c) => c.id !== payload.id && c.id !== realCall.id)];
      saveLocalWaitingRoomCalls(params.clinicId, synced);
      return realCall;
    }
  } catch (err) {
    console.warn("createWaitingRoomCall: Supabase sync warning, kept local call:", err);
  }

  return payload;
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

