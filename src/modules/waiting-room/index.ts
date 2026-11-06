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
const LOCAL_STORAGE_LATEST_KEY = "sondapro:waiting_room_calls:latest";

/**
 * Obtém todas as chamadas salvas no dispositivo, independente de clínica ou pequenas variações de ID
 */
export function getAllLocalWaitingRoomCalls(): WaitingRoomCall[] {
  if (typeof window === "undefined") return [];
  try {
    const list: WaitingRoomCall[] = [];
    const latestRaw = localStorage.getItem(LOCAL_STORAGE_LATEST_KEY);
    if (latestRaw) {
      const parsed = JSON.parse(latestRaw);
      if (Array.isArray(parsed)) list.push(...parsed);
    }

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LOCAL_STORAGE_KEY_PREFIX) && key !== LOCAL_STORAGE_LATEST_KEY) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) list.push(...parsed);
        }
      }
    }

    const uniqueMap = new Map<string, WaitingRoomCall>();
    for (const c of list) {
      if (c && c.id) uniqueMap.set(c.id, c);
    }

    return Array.from(uniqueMap.values()).sort(
      (a, b) => new Date(b.called_at).getTime() - new Date(a.called_at).getTime(),
    );
  } catch {
    return [];
  }
}

/**
 * Obtém chamadas salvas localmente como cache resiliente
 */
export function getLocalWaitingRoomCalls(clinicId?: string | null): WaitingRoomCall[] {
  if (typeof window === "undefined") return [];
  try {
    if (clinicId) {
      const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${clinicId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as WaitingRoomCall[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }

    // Se não encontrou por clinicId específico (ex: erro de digitação na URL), busca do cache global
    return getAllLocalWaitingRoomCalls();
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
    const trimmed = calls.slice(0, 50);
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${clinicId}`, JSON.stringify(trimmed));
    localStorage.setItem(LOCAL_STORAGE_LATEST_KEY, JSON.stringify(trimmed));
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
 * Verifica se a tabela remota de chamadas já existe no banco Supabase
 */
export async function checkWaitingRoomTableExists(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { error } = await client.from("waiting_room_calls").select("id").limit(1);
    if (error && (error.code === "PGRST205" || error.code === "42P01" || error.message?.includes("not find the table"))) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
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
      .order("called_at", { ascending: false })
      .limit(30);

    // Só filtra por clinic_id quando for um UUID válido, evitando erro 22P02 do PostgreSQL
    if (isValidUuid(clinicId)) {
      query = query.eq("clinic_id", clinicId);
    }

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
      const effectiveId = isValidUuid(clinicId) ? clinicId : data[0]?.clinic_id;
      if (effectiveId) {
        saveLocalWaitingRoomCalls(effectiveId, merged);
      }
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

// ============================================================================
// TV MEDIA, ANÚNCIOS INSTITUCIONAIS & PREVISÃO DO TEMPO
// ============================================================================

export interface TvMediaItem {
  id: string;
  title: string;
  subtitle?: string | undefined;
  imageUrl?: string | undefined;
  active: boolean;
}

export interface TvSettings {
  cityName: string;
  showWeather: boolean;
  tickerTexts: string[];
  mediaItems: TvMediaItem[];
  slideIntervalSeconds: number;
}

export interface WeatherInfo {
  temperature: number;
  condition: string;
  icon: "sun" | "cloud-sun" | "cloud" | "rain" | "thunder";
  cityName: string;
}

export const DEFAULT_TV_SETTINGS: TvSettings = {
  cityName: "São Paulo, SP",
  showWeather: true,
  tickerTexts: [
    "Bem-vindo ao SondaPro Odontologia • Cuidando do seu sorriso com tecnologia e dedicação.",
    "Wi-Fi gratuito na sala de espera: conecte-se à rede 'Clinica_Visitantes'. Solicite a senha na recepção.",
    "Prevenção é saúde: mantenha sua escovação diária, use fio dental e consulte seu dentista periodicamente.",
    "Conheça nossos tratamentos: Alinhadores Invisíveis, Implantes Odontológicos, Próteses e Clareamento a Laser.",
  ],
  mediaItems: [
    {
      id: "slide-1",
      title: "Clareamento Dental Profissional",
      subtitle: "Renove a estética do seu sorriso com segurança, tecnologia e acompanhamento odontológico.",
      imageUrl: "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=1200&q=80",
      active: true,
    },
    {
      id: "slide-2",
      title: "Alinhadores Ortodônticos Transparentes",
      subtitle: "Alinhamento estético, confortável e removível para o seu dia a dia.",
      imageUrl: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=1200&q=80",
      active: true,
    },
    {
      id: "slide-3",
      title: "Implantes & Próteses Dentárias",
      subtitle: "Recupere o poder da sua mastigação e o prazer de sorrir livremente com planejamento 3D.",
      imageUrl: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1200&q=80",
      active: true,
    },
  ],
  slideIntervalSeconds: 12,
};

const LOCAL_STORAGE_TV_SETTINGS_PREFIX = "sondapro:tv_settings:";

/**
 * Obtém as configurações de mídia, letreiro e clima da TV
 */
export function getTvSettings(clinicId?: string | null): TvSettings {
  if (typeof window === "undefined") return DEFAULT_TV_SETTINGS;
  try {
    const key = clinicId ? `${LOCAL_STORAGE_TV_SETTINGS_PREFIX}${clinicId}` : `${LOCAL_STORAGE_TV_SETTINGS_PREFIX}default`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_TV_SETTINGS,
        ...parsed,
        mediaItems: Array.isArray(parsed.mediaItems) && parsed.mediaItems.length > 0 ? parsed.mediaItems : DEFAULT_TV_SETTINGS.mediaItems,
        tickerTexts: Array.isArray(parsed.tickerTexts) && parsed.tickerTexts.length > 0 ? parsed.tickerTexts : DEFAULT_TV_SETTINGS.tickerTexts,
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_TV_SETTINGS;
}

/**
 * Salva as configurações de mídia, letreiro e clima da TV
 */
export function saveTvSettings(clinicId: string, settings: TvSettings): void {
  if (typeof window === "undefined") return;
  try {
    const key = `${LOCAL_STORAGE_TV_SETTINGS_PREFIX}${clinicId}`;
    const serialized = JSON.stringify(settings);
    localStorage.setItem(key, serialized);
    localStorage.setItem(`${LOCAL_STORAGE_TV_SETTINGS_PREFIX}default`, serialized);

    if ("BroadcastChannel" in window) {
      const bc = new BroadcastChannel("sondapro_tv_settings");
      bc.postMessage({ type: "TV_SETTINGS_UPDATED", clinicId, settings });
      bc.close();
    }
    window.dispatchEvent(new CustomEvent("sondapro:tv_settings_updated", { detail: { clinicId, settings } }));
  } catch {
    // ignore
  }
}

/**
 * Consulta a previsão do tempo para a cidade informada (usando Open-Meteo público gratuito)
 */
export async function fetchWeatherForecast(cityName: string): Promise<WeatherInfo> {
  const fallback: WeatherInfo = {
    temperature: 24,
    condition: "Parcialmente Nublado",
    icon: "cloud-sun",
    cityName: cityName || "São Paulo, SP",
  };

  if (!cityName || typeof window === "undefined") return fallback;

  try {
    // 1. Geocoding da cidade
    const cityPart = cityName.split(",")[0];
    const cleanCity = (cityPart ?? "").trim() || "São Paulo";
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanCity)}&count=1&language=pt&format=json`;
    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) return fallback;
    const geoData = await geoRes.json();
    const firstResult = geoData.results?.[0];
    if (!firstResult) return fallback;

    const { latitude, longitude } = firstResult;

    // 2. Previsão meteorológica
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`;
    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) return fallback;
    const weatherData = await weatherRes.json();

    const temp = Math.round(weatherData.current?.temperature_2m ?? 24);
    const code = Number(weatherData.current?.weather_code ?? 1);

    let condition = "Parcialmente Nublado";
    let icon: WeatherInfo["icon"] = "cloud-sun";

    if (code === 0) {
      condition = "Céu Limpo / Ensolarado";
      icon = "sun";
    } else if (code <= 3) {
      condition = "Parcialmente Nublado";
      icon = "cloud-sun";
    } else if (code >= 45 && code <= 48) {
      condition = "Nevoeiro";
      icon = "cloud";
    } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
      condition = "Chuvoso";
      icon = "rain";
    } else if (code >= 95) {
      condition = "Tempestade";
      icon = "thunder";
    }

    return {
      temperature: temp,
      condition,
      icon,
      cityName,
    };
  } catch (e) {
    console.warn("fetchWeatherForecast warning:", e);
    return fallback;
  }
}

// ============================================================================
// COMANDOS REMOTOS & MONITORAMENTO (INSPIRED BY DIGITALSIGNAGEOS)
// ============================================================================

const LOCAL_STORAGE_HEARTBEAT_PREFIX = "sondapro:tv_heartbeat:";

/**
 * Envia comando para a TV recarregar a tela remotamente via BroadcastChannel e Realtime
 */
export function sendRemoteTvReload(clinicId: string): void {
  if (typeof window === "undefined") return;

  try {
    if ("BroadcastChannel" in window) {
      const bc = new BroadcastChannel("sondapro_tv_remote");
      bc.postMessage({ type: "RELOAD_TV", clinicId, timestamp: Date.now() });
      bc.close();
    }
    window.dispatchEvent(new CustomEvent("sondapro:tv_reload", { detail: { clinicId } }));
  } catch {
    // ignore
  }

  try {
    // Dispara também via canal de Realtime do Supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any).channel(`tv_remote_${clinicId}`);
    channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        channel.send({
          type: "broadcast",
          event: "RELOAD_TV",
          payload: { clinicId, timestamp: Date.now() },
        });
      }
    });
  } catch {
    // ignore
  }
}

/**
 * Registra o ping de que a TV está online e transmitindo
 */
export function recordTvHeartbeat(clinicId: string): void {
  if (typeof window === "undefined" || !clinicId) return;
  try {
    const key = `${LOCAL_STORAGE_HEARTBEAT_PREFIX}${clinicId}`;
    localStorage.setItem(key, Date.now().toString());
  } catch {
    // ignore
  }
}

/**
 * Consulta se a TV está online com base no último sinal emitido
 */
export function getTvHeartbeatStatus(clinicId: string): { isOnline: boolean; lastSeenSecondsAgo: number | null } {
  if (typeof window === "undefined" || !clinicId) return { isOnline: false, lastSeenSecondsAgo: null };
  try {
    const key = `${LOCAL_STORAGE_HEARTBEAT_PREFIX}${clinicId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return { isOnline: false, lastSeenSecondsAgo: null };
    const diffMs = Date.now() - Number(raw);
    const diffSec = Math.floor(diffMs / 1000);
    return {
      isOnline: diffSec <= 75, // Considera online se enviou sinal nos últimos 75 segundos
      lastSeenSecondsAgo: diffSec,
    };
  } catch {
    return { isOnline: false, lastSeenSecondsAgo: null };
  }
}



