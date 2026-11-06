import { useState, useEffect, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Clock,
  Sparkles,
  ArrowLeft,
  Building2,
  DoorOpen,
  UserCheck,
  Megaphone,
  BellRing,
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudLightning,
  KeyRound,
  Tv,
  Image as ImageIcon,
  ChevronRight,
  Info,
  CheckCircle2,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/services/supabase";
import {
  fetchWaitingRoomCalls,
  playWaitingRoomChime,
  speakPatientCall,
  isValidUuid,
  getTvSettings,
  fetchWeatherForecast,
  recordTvHeartbeat,
  TvSettings,
  TvMediaItem,
  WeatherInfo,
  DEFAULT_TV_SETTINGS,
} from "@/modules/waiting-room";
import { QrCode } from "lucide-react";
import type { WaitingRoomCall } from "@/types";
import { toast } from "sonner";

export const Route = createFileRoute("/tv")({
  validateSearch: (search: Record<string, unknown>) => {
    // Busca clinicId com tolerância máxima a erros de digitação (ex: 'cl' confundido com 'd' -> dinicId)
    let clinicId: string | undefined = undefined;
    for (const key of ["clinicId", "dinicId", "clinic_id", "dinic_id", "clinic", "id", "c"]) {
      const val = search[key];
      if (typeof val === "string" && val.trim().length > 0) {
        clinicId = val.trim();
        break;
      }
    }

    if (!clinicId) {
      for (const val of Object.values(search)) {
        if (typeof val === "string" && isValidUuid(val)) {
          clinicId = val.trim();
          break;
        }
      }
    }

    let unitId: string | undefined = undefined;
    if (typeof search["unitId"] === "string") unitId = search["unitId"] as string;
    else if (typeof search["unit_id"] === "string") unitId = search["unit_id"] as string;

    return {
      clinicId,
      unitId,
    };
  },
  head: () => ({
    meta: [
      { title: "Painel de Chamada TV — SondaPro" },
      { name: "description", content: "Painel em tela cheia para recepção e salas de espera odontológicas com previsão do tempo e anúncios." },
    ],
  }),
  component: WaitingRoomTvPage,
});

export function WaitingRoomTvPage() {
  const { clinicId, unitId } = Route.useSearch();
  const qc = useQueryClient();

  // Estados de multimídia
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Relógio digital em tempo real
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Desbloqueia áudio ao primeiro toque ou clique na tela
  const unlockAudio = () => {
    if (!audioUnlocked) {
      setAudioUnlocked(true);
      playWaitingRoomChime();
    }
  };

  // Monitora Fullscreen
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const searchClinicId = (() => {
    if (clinicId && isValidUuid(clinicId)) return clinicId;
    if (typeof window !== "undefined") {
      const searchStr = window.location.search || "";
      const params = new URLSearchParams(searchStr);
      for (const key of ["clinicId", "dinicId", "clinic_id", "dinic_id", "clinic", "id", "c"]) {
        const val = params.get(key);
        if (val && isValidUuid(val)) return val;
      }
      for (const [, val] of params.entries()) {
        if (isValidUuid(val)) return val;
      }
      const match = (searchStr + " " + window.location.href).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (match) return match[0];
      const stored = localStorage.getItem("sondapro.clinic");
      if (stored && isValidUuid(stored)) return stored;
    }
    return clinicId || undefined;
  })();

  // Se clinicId não vier na URL, tenta buscar da chamada mais recente ou do usuário logado
  const [effectiveClinicId, setEffectiveClinicId] = useState<string | null>(searchClinicId ?? null);
  const [clinicName, setClinicName] = useState<string>("SondaPro Odontologia");

  // Configurações de Mídia, Letreiro e Clima da TV
  const [tvSettings, setTvSettings] = useState<TvSettings>(() => getTvSettings(effectiveClinicId));
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [tickerIndex, setTickerIndex] = useState(0);

  // Modal de Conexão de Dispositivo / Totem / Raspberry Pi
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Sincroniza configurações locais e via BroadcastChannel
  useEffect(() => {
    const fresh = getTvSettings(effectiveClinicId);
    setTvSettings(fresh);

    let bc: BroadcastChannel | null = null;
    try {
      if ("BroadcastChannel" in window) {
        bc = new BroadcastChannel("sondapro_tv_settings");
        bc.onmessage = (e) => {
          if (e.data?.settings) {
            setTvSettings(e.data.settings);
          }
        };
      }
    } catch {
      // ignore
    }

    const handleCustom = (e: Event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (e as any)?.detail?.settings;
      if (s) setTvSettings(s);
    };

    window.addEventListener("sondapro:tv_settings_updated", handleCustom);

    return () => {
      if (bc) bc.close();
      window.removeEventListener("sondapro:tv_settings_updated", handleCustom);
    };
  }, [effectiveClinicId]);

  // Carrega e atualiza a previsão do tempo
  useEffect(() => {
    if (!tvSettings.showWeather || !tvSettings.cityName) return;
    fetchWeatherForecast(tvSettings.cityName).then(setWeather);
    const timer = setInterval(() => {
      fetchWeatherForecast(tvSettings.cityName).then(setWeather);
    }, 20 * 60 * 1000); // 20 minutos
    return () => clearInterval(timer);
  }, [tvSettings.showWeather, tvSettings.cityName]);

  // Rotação dos slides de mídia institucional
  useEffect(() => {
    const activeMedia = (tvSettings.mediaItems || []).filter((m) => m.active);
    if (activeMedia.length <= 1) return;
    const intervalMs = Math.max(5, tvSettings.slideIntervalSeconds || 12) * 1000;
    const timer = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % activeMedia.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [tvSettings.mediaItems, tvSettings.slideIntervalSeconds]);

  // Rotação do letreiro de avisos do rodapé com tempo configurável
  useEffect(() => {
    const tickers = tvSettings.tickerTexts || [];
    if (tickers.length <= 1) return;
    const intervalMs = (tvSettings.tickerIntervalSeconds || 7) * 1000;
    const timer = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % tickers.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [tvSettings.tickerTexts, tvSettings.tickerIntervalSeconds]);

  // Heartbeat do Player da TV (inspirado no DigitalSignageOS - registra presença local e via Realtime)
  useEffect(() => {
    if (!effectiveClinicId) return;
    recordTvHeartbeat(effectiveClinicId);

    // Canal Realtime para presença e heartbeat bidirecional entre navegadores
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any).channel(`tv_presence_${effectiveClinicId}`);
    channel
      .on("broadcast", { event: "PING_TV" }, () => {
        channel.send({
          type: "broadcast",
          event: "PONG_TV",
          payload: { clinicId: effectiveClinicId, timestamp: Date.now() },
        });
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          channel.send({
            type: "broadcast",
            event: "PONG_TV",
            payload: { clinicId: effectiveClinicId, timestamp: Date.now() },
          });
        }
      });

    const interval = setInterval(() => {
      recordTvHeartbeat(effectiveClinicId);
      channel.send({
        type: "broadcast",
        event: "PONG_TV",
        payload: { clinicId: effectiveClinicId, timestamp: Date.now() },
      });
    }, 12000);

    return () => {
      clearInterval(interval);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).removeChannel(channel);
    };
  }, [effectiveClinicId]);

  // Listener de comando de recarregamento remoto da tela (inspirado no DigitalSignageOS)
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      if ("BroadcastChannel" in window) {
        bc = new BroadcastChannel("sondapro_tv_remote");
        bc.onmessage = (event) => {
          if (event.data?.type === "RELOAD_TV") {
            if (!event.data.clinicId || event.data.clinicId === effectiveClinicId) {
              window.location.reload();
            }
          }
        };
      }
    } catch {
      // ignore
    }

    const handleReload = (e: Event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const targetId = (e as any)?.detail?.clinicId;
      if (!targetId || targetId === effectiveClinicId) {
        window.location.reload();
      }
    };
    window.addEventListener("sondapro:tv_reload", handleReload);

    // Escuta também via Supabase Realtime Broadcast se houver effectiveClinicId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;
    if (effectiveClinicId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel = (supabase as any)
        .channel(`tv_remote_${effectiveClinicId}`)
        .on("broadcast", { event: "RELOAD_TV" }, () => {
          window.location.reload();
        })
        .subscribe();
    }

    return () => {
      if (bc) bc.close();
      window.removeEventListener("sondapro:tv_reload", handleReload);
      if (channel) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).removeChannel(channel);
      }
    };
  }, [effectiveClinicId]);

  useEffect(() => {
    const activeId = clinicId || searchClinicId;
    if (activeId && isValidUuid(activeId)) {
      setEffectiveClinicId(activeId);
      // Busca nome da clínica
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("clinics")
        .select("name")
        .eq("id", activeId)
        .single()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(({ data }: any) => {
          if (data?.name) setClinicName(data.name);
        });
      return;
    }

    // Se aberto na Smart TV sem parâmetros, descobre a clínica pela chamada mais recente
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("waiting_room_calls")
      .select("clinic_id")
      .order("called_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: any) => {
        if (data?.clinic_id && isValidUuid(data.clinic_id)) {
          setEffectiveClinicId(data.clinic_id);
        }
      });

    // Se o usuário estiver logado, recupera a clínica da associação
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).auth.getUser().then(({ data }: any) => {
      const user = data?.user;
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("clinic_members")
        .select("clinic_id, clinics(name)")
        .eq("user_id", user.id)
        .limit(1)
        .single()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(({ data: member }: any) => {
          if (member?.clinic_id) {
            setEffectiveClinicId(member.clinic_id);
            if (member.clinics?.name) setClinicName(member.clinics.name);
          }
        });
    });
  }, [clinicId, searchClinicId]);

  const queryClinicId = effectiveClinicId || searchClinicId || "";

  // Query: Busca chamadas com auto-refetch a cada 3 segundos (sempre ativa)
  const { data: calls = [] } = useQuery({
    queryKey: ["waiting_room_calls", queryClinicId, unitId],
    queryFn: () => fetchWaitingRoomCalls(queryClinicId, unitId),
    refetchInterval: 3000,
  });

  // Atualiza effectiveClinicId caso as chamadas tragam a clínica real
  useEffect(() => {
    if (!effectiveClinicId && calls.length > 0 && calls[0]?.clinic_id) {
      setEffectiveClinicId(calls[0].clinic_id);
    }
  }, [calls, effectiveClinicId]);

  // Sincronização multi-canal: Supabase Realtime + BroadcastChannel + Local Events
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      if ("BroadcastChannel" in window) {
        bc = new BroadcastChannel("sondapro_waiting_room");
        bc.onmessage = (event) => {
          if (event.data?.type === "CALL_PATIENT" && event.data?.call) {
            const newCall = event.data.call as WaitingRoomCall;
            if (soundEnabled) playWaitingRoomChime();
            if (speechEnabled) speakPatientCall(newCall.patient_name, newCall.room_name);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            qc.setQueriesData({ queryKey: ["waiting_room_calls"] }, (old: any) => {
              if (Array.isArray(old)) {
                return [newCall, ...old.filter((c: any) => c.id !== newCall.id)];
              }
              return [newCall];
            });
            qc.invalidateQueries({ queryKey: ["waiting_room_calls"] });
          } else if (event.data?.type === "UPDATE_CALL_STATUS" && event.data?.callId) {
            const { callId, status } = event.data;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            qc.setQueriesData({ queryKey: ["waiting_room_calls"] }, (old: any) => {
              if (Array.isArray(old)) {
                return old.map((c: any) => (c.id === callId ? { ...c, status } : c));
              }
              return old;
            });
            qc.invalidateQueries({ queryKey: ["waiting_room_calls"] });
          }
        };
      }
    } catch {
      // ignore
    }

    const handleLocalSync = (e?: Event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detailCall = (e as any)?.detail as WaitingRoomCall | undefined;
      if (detailCall) {
        if (soundEnabled) playWaitingRoomChime();
        if (speechEnabled) speakPatientCall(detailCall.patient_name, detailCall.room_name);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        qc.setQueriesData({ queryKey: ["waiting_room_calls"] }, (old: any) => {
          if (Array.isArray(old)) {
            return [detailCall, ...old.filter((c: any) => c.id !== detailCall.id)];
          }
          return [detailCall];
        });
      }
      qc.invalidateQueries({ queryKey: ["waiting_room_calls"] });
    };

    const handleStatusSync = (e?: Event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (e as any)?.detail as { callId: string; status: WaitingRoomCall["status"] } | undefined;
      if (detail?.callId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        qc.setQueriesData({ queryKey: ["waiting_room_calls"] }, (old: any) => {
          if (Array.isArray(old)) {
            return old.map((c: any) => (c.id === detail.callId ? { ...c, status: detail.status } : c));
          }
          return old;
        });
        qc.invalidateQueries({ queryKey: ["waiting_room_calls"] });
      }
    };

    window.addEventListener("sondapro:waiting_room_call", handleLocalSync);
    window.addEventListener("sondapro:waiting_room_call_updated", handleStatusSync);
    window.addEventListener("storage", handleLocalSync);

    return () => {
      if (bc) bc.close();
      window.removeEventListener("sondapro:waiting_room_call", handleLocalSync);
      window.removeEventListener("sondapro:waiting_room_call_updated", handleStatusSync);
      window.removeEventListener("storage", handleLocalSync);
    };
  }, [qc, soundEnabled, speechEnabled]);

  // Supabase Realtime Subscription para chamadas remotas instantâneas (Postgres Changes + Broadcast direto)
  useEffect(() => {
    const channelName = effectiveClinicId ? `waiting_room_${effectiveClinicId}` : "waiting_room_discovery";
    const filter = effectiveClinicId ? `clinic_id=eq.${effectiveClinicId}` : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "waiting_room_calls",
          ...(filter ? { filter } : {}),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload?.new?.clinic_id && !effectiveClinicId) {
            setEffectiveClinicId(payload.new.clinic_id);
          }
          qc.invalidateQueries({ queryKey: ["waiting_room_calls"] });
        }
      )
      .on("broadcast", { event: "CALL_PATIENT" }, (eventPayload: any) => {
        const newCall = eventPayload?.payload?.call as WaitingRoomCall | undefined;
        if (newCall) {
          if (soundEnabled) playWaitingRoomChime();
          if (speechEnabled) speakPatientCall(newCall.patient_name, newCall.room_name);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          qc.setQueriesData({ queryKey: ["waiting_room_calls"] }, (old: any) => {
            if (Array.isArray(old)) {
              return [newCall, ...old.filter((c: any) => c.id !== newCall.id)];
            }
            return [newCall];
          });
          qc.invalidateQueries({ queryKey: ["waiting_room_calls"] });
        }
      })
      .on("broadcast", { event: "UPDATE_CALL_STATUS" }, (eventPayload: any) => {
        const payload = eventPayload?.payload as { callId: string; status: WaitingRoomCall["status"] } | undefined;
        if (payload?.callId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          qc.setQueriesData({ queryKey: ["waiting_room_calls"] }, (old: any) => {
            if (Array.isArray(old)) {
              return old.map((c: any) => (c.id === payload.callId ? { ...c, status: payload.status } : c));
            }
            return old;
          });
          qc.invalidateQueries({ queryKey: ["waiting_room_calls"] });
        }
      })
      .subscribe();

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).removeChannel(channel);
    };
  }, [effectiveClinicId, qc, soundEnabled, speechEnabled]);

  const isFirstRenderRef = useRef(true);
  const lastCallIdRef = useRef<string | null>(null);

  // Duração configurada do tempo em que o paciente fica chamando na tela central da TV (editável no painel)
  const callDisplaySeconds = tvSettings.callDisplaySeconds || 35;
  const maxCallAgeMs = callDisplaySeconds * 1000;

  // Busca a chamada mais recente com status "called" dentro do tempo limite configurado
  const activeFreshCall = calls.find(
    (c) => c.status === "called" && Date.now() - new Date(c.called_at).getTime() < maxCallAgeMs
  );
  const isCallFresh = !!activeFreshCall;
  const activeCall: WaitingRoomCall | undefined = activeFreshCall || calls[0];

  const callAgeMs = activeFreshCall ? Date.now() - new Date(activeFreshCall.called_at).getTime() : Infinity;
  const progressPercent = activeFreshCall
    ? Math.max(0, Math.min(100, 100 - (callAgeMs / maxCallAgeMs) * 100))
    : 0;
  const secondsLeft = activeFreshCall
    ? Math.max(0, Math.ceil((maxCallAgeMs - callAgeMs) / 1000))
    : 0;

  // Disparo de som e fala ao chegar nova chamada
  useEffect(() => {
    if (!activeFreshCall) return;

    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      const ageMs = Date.now() - new Date(activeFreshCall.called_at).getTime();
      if (ageMs < maxCallAgeMs) {
        if (soundEnabled) playWaitingRoomChime();
        if (speechEnabled) speakPatientCall(activeFreshCall.patient_name, activeFreshCall.room_name);
      }
      lastCallIdRef.current = activeFreshCall.id;
      return;
    }

    if (lastCallIdRef.current !== activeFreshCall.id) {
      if (soundEnabled) playWaitingRoomChime();
      if (speechEnabled) speakPatientCall(activeFreshCall.patient_name, activeFreshCall.room_name);
      lastCallIdRef.current = activeFreshCall.id;
    }
  }, [activeFreshCall, maxCallAgeMs, soundEnabled, speechEnabled]);

  const activeMediaList = (tvSettings.mediaItems || []).filter((m) => m.active);
  const currentSlide: TvMediaItem | undefined = activeMediaList[currentSlideIndex % Math.max(1, activeMediaList.length)];

  // Lista lateral: se há uma chamada em destaque central, exibe as outras; se não, exibe todas
  const recentCalls = isCallFresh
    ? calls.filter((c) => c.id !== activeFreshCall?.id).slice(0, 6)
    : calls.slice(0, 6);

  const activeTicker = (tvSettings.tickerTexts || [])[tickerIndex % Math.max(1, tvSettings.tickerTexts.length)] ||
    "Bem-vindo ao SondaPro Odontologia • Mantenha sua escovação diária e consulte seu dentista regularmente.";

  // Função para login no dispositivo (Tablet / Raspberry Pi)
  async function handleDeviceLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      if (loginEmail && loginPassword) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).auth.signInWithPassword({
          email: loginEmail.trim(),
          password: loginPassword,
        });
        if (error) throw error;

        if (data.user) {
          // Busca a clínica do usuário
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: member } = await (supabase as any)
            .from("clinic_members")
            .select("clinic_id")
            .eq("user_id", data.user.id)
            .limit(1)
            .single();

          if (member?.clinic_id) {
            setEffectiveClinicId(member.clinic_id);
            localStorage.setItem("sondapro.clinic", member.clinic_id);
            toast.success("Dispositivo conectado com sucesso!");
            setLoginModalOpen(false);
            return;
          }
        }
      } else if (loginPin.trim()) {
        const cleanPin = loginPin.trim();
        setEffectiveClinicId(cleanPin);
        localStorage.setItem("sondapro.clinic", cleanPin);
        toast.success("Clínica vinculada via código!");
        setLoginModalOpen(false);
        return;
      }
      toast.error("Informe e-mail e senha ou o código da clínica.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao autenticar dispositivo";
      toast.error(msg);
    } finally {
      setIsLoggingIn(false);
    }
  }

  // Render do ícone do clima
  const renderWeatherIcon = () => {
    if (!weather) return <Sun className="w-4 h-4 text-amber-400" />;
    switch (weather.icon) {
      case "sun":
        return <Sun className="w-5 h-5 text-amber-400 animate-spin-slow" />;
      case "cloud-sun":
        return <CloudSun className="w-5 h-5 text-amber-300" />;
      case "cloud":
        return <Cloud className="w-5 h-5 text-slate-300" />;
      case "rain":
        return <CloudRain className="w-5 h-5 text-sky-400" />;
      case "thunder":
        return <CloudLightning className="w-5 h-5 text-purple-400" />;
      default:
        return <CloudSun className="w-5 h-5 text-amber-300" />;
    }
  };

  return (
    <div
      onClick={unlockAudio}
      className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950 font-sans text-slate-100 select-none relative"
    >
      {/* Banner flutuante para desbloquear áudio em navegadores de Smart TV / Totens */}
      {!audioUnlocked && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            unlockAudio();
          }}
          className="absolute top-24 left-1/2 -translate-x-1/2 z-50 flex cursor-pointer items-center gap-3 rounded-full border border-sky-400 bg-sky-950/90 px-6 py-2.5 text-xs font-bold text-sky-200 shadow-xl shadow-sky-900/40 backdrop-blur-md animate-bounce hover:bg-sky-900 transition"
        >
          <BellRing className="h-4 w-4 text-emerald-400 animate-pulse" />
          <span>Clique aqui para ativar o áudio e voz do painel da TV</span>
        </div>
      )}

      {/* 1. Header do Painel TV com Relógio e Previsão do Tempo */}
      <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/90 px-8 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 to-cyan-500 text-white shadow-lg shadow-sky-500/20">
            <Sparkles className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase truncate max-w-md">
              {clinicName}
            </h1>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">
              Painel de Atendimento · Sala de Espera
            </p>
          </div>
        </div>

        {/* Centro/Direita: Previsão do Tempo + Relógio Digital + Controles */}
        <div className="flex items-center gap-6">
          {/* Widget de Previsão do Tempo */}
          {tvSettings.showWeather && (
            <div className="hidden md:flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 shadow-xs">
              {renderWeatherIcon()}
              <div className="text-left">
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="font-bold text-white text-base">
                    {weather ? `${weather.temperature}°C` : "24°C"}
                  </span>
                  <span className="text-[11px] text-slate-300 font-medium">
                    {weather?.condition || "Ensolarado"}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate max-w-[120px]">
                  {weather?.cityName || tvSettings.cityName || "São Paulo, SP"}
                </p>
              </div>
            </div>
          )}

          {/* Relógio Digital */}
          <div className="text-right">
            <div className="font-mono text-3xl font-extrabold tracking-wider text-white">
              {currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div className="text-xs font-medium capitalize text-slate-400">
              {currentTime.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            </div>
          </div>

          {/* Controles de Som, Tela Cheia e Dispositivo */}
          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:bg-slate-800 hover:text-white"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "Desativar Som" : "Ativar Som"}
            >
              {soundEnabled ? <Volume2 className="h-5 w-5 text-emerald-400" /> : <VolumeX className="h-5 w-5 text-slate-500" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:bg-slate-800 hover:text-white"
              onClick={() => setSpeechEnabled(!speechEnabled)}
              title={speechEnabled ? "Desativar Voz" : "Ativar Voz"}
            >
              {speechEnabled ? <Mic className="h-5 w-5 text-sky-400" /> : <MicOff className="h-5 w-5 text-slate-500" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:bg-slate-800 hover:text-white"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
            >
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </Button>

            {/* Botão de Login / Pareamento de Dispositivo (Raspberry / Tablet) */}
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:bg-slate-800 hover:text-sky-300"
              onClick={() => setLoginModalOpen(true)}
              title="Conectar Dispositivo (Login / PIN)"
            >
              <KeyRound className="h-5 w-5" />
            </Button>

            <Button variant="ghost" size="icon" asChild className="text-slate-400 hover:bg-slate-800 hover:text-white">
              <Link to="/app" title="Voltar ao Sistema">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* 2. Conteúdo Central Dividido (Chamada Ativa OU Carrossel de Anúncios + Histórico Lateral) */}
      <main className="flex flex-1 overflow-hidden p-8 gap-8">
        {/* Painel Central: Exibe Chamada Ativa quando houver OU Carrossel de Mídia/Anúncios */}
        <div className="flex flex-1 flex-col justify-between rounded-3xl border border-sky-500/30 bg-gradient-to-b from-slate-900/90 via-slate-900/60 to-slate-950 p-10 shadow-2xl shadow-sky-950/50 backdrop-blur-xl relative overflow-hidden">
          {/* Efeito luminoso de fundo */}
          <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-sky-600/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-cyan-600/10 blur-3xl pointer-events-none" />

          {isCallFresh && activeCall ? (
            /* --- MODO CHAMADA ATIVA (DESTQUE TOTAL) --- */
            <>
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-6">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
                  </span>
                  <span className="text-sm font-bold uppercase tracking-widest text-emerald-400">
                    Chamada em Andamento
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {activeCall.priority === "urgent" ? (
                    <Badge className="bg-red-600 text-white font-extrabold px-3 py-1 text-sm uppercase animate-pulse">
                      Atendimento de Urgência
                    </Badge>
                  ) : activeCall.priority === "priority" ? (
                    <Badge className="bg-amber-500 text-white font-extrabold px-3 py-1 text-sm uppercase">
                      Prioritário (Lei 10.048)
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-sky-500/50 text-sky-300 font-bold px-3 py-1 text-sm uppercase">
                      Atendimento Geral
                    </Badge>
                  )}
                  <span className="text-xs text-slate-400 ml-2">
                    Chamado às {new Date(activeCall.called_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>

              {/* Nome do Paciente Gigante */}
              <div className="my-auto py-8 text-center space-y-4">
                <span className="text-sm font-bold uppercase tracking-widest text-slate-400">
                  Paciente
                </span>
                <h2 className="text-5xl lg:text-7xl font-black text-white tracking-tight drop-shadow-md capitalize">
                  {activeCall.patient_name}
                </h2>
              </div>

              {/* Box de Consultório e Dentista */}
              <div className="grid grid-cols-2 gap-6 rounded-2xl border border-sky-500/40 bg-sky-950/40 p-6 backdrop-blur-md">
                <div className="flex items-center gap-4 border-r border-sky-800/60 pr-6">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg">
                    <DoorOpen className="h-7 w-7" />
                  </span>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-sky-300">
                      Dirija-se ao
                    </span>
                    <p className="text-3xl font-extrabold text-white">
                      {activeCall.room_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 pl-2">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-slate-200 shadow-md">
                    <UserCheck className="h-7 w-7 text-sky-400" />
                  </span>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Profissional
                    </span>
                    <p className="text-2xl font-bold text-slate-100">
                      {activeCall.professional_name}
                    </p>
                  </div>
                </div>
              </div>

              {/* Barra de Progresso Regressiva da Chamada na TV */}
              <div className="pt-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium pb-1.5">
                  <span className="flex items-center gap-1.5 text-sky-300">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                    <span>Destaque na TV ({secondsLeft}s restantes)</span>
                  </span>
                  <span className="text-slate-500 text-[10px]">
                    Após o tempo ou ao ser atendido, a tela volta aos anúncios
                  </span>
                </div>
                <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-slate-700/50 p-0.5">
                  <div
                    className="bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 h-full rounded-full transition-all duration-1000 ease-linear shadow-sm"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </>
          ) : (
            /* --- MODO CARROSSEL DE ANÚNCIOS INSTITUCIONAIS / PROMOÇÕES --- */
            <div className="flex flex-col justify-between h-full relative">
              {/* Header do Banner */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-300">
                    SondaPro Informa · Saúde Bucal & Tratamentos
                  </span>
                </div>
                {activeCall && (
                  <Badge variant="outline" className="border-slate-700 bg-slate-900/80 text-slate-300 text-[11px] gap-1.5">
                    <Clock className="w-3 h-3 text-sky-400" />
                    Último chamado: <strong className="text-white">{activeCall.patient_name}</strong> ({activeCall.room_name})
                  </Badge>
                )}
              </div>

              {/* Slide Atual com Imagem e Textos */}
              <div className="my-auto py-4 flex flex-col md:flex-row items-center gap-8">
                {currentSlide?.imageUrl ? (
                  <div className="w-full md:w-1/2 h-64 md:h-80 rounded-2xl overflow-hidden shadow-2xl border border-slate-700/80 relative shrink-0">
                    <img
                      src={currentSlide.imageUrl}
                      alt={currentSlide.title}
                      className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                  </div>
                ) : (
                  <div className="w-full md:w-1/2 h-64 md:h-80 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-600 shrink-0">
                    <ImageIcon className="w-16 h-16 opacity-40 text-sky-500" />
                  </div>
                )}

                <div className="flex-1 space-y-4 text-left">
                  <Badge className="bg-sky-600/80 text-white font-semibold text-xs uppercase tracking-wide">
                    Destaque da Clínica
                  </Badge>
                  <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight">
                    {currentSlide?.title || "Cuidando do Seu Sorriso com Tecnologia"}
                  </h2>
                  <p className="text-slate-300 text-base md:text-lg leading-relaxed max-w-xl">
                    {currentSlide?.subtitle || "Consulte nossa equipe na recepção para tirar dúvidas sobre procedimentos preventivos, estéticos e restauradores."}
                  </p>
                  <div className="pt-2 flex items-center gap-2 text-xs text-sky-300 font-medium">
                    <span>Consulte seu cirurgião-dentista</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Indicadores de Slide */}
              {activeMediaList.length > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4 border-t border-slate-800/80">
                  {activeMediaList.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentSlideIndex(idx)}
                      className={`h-2 rounded-full transition-all ${
                        idx === (currentSlideIndex % activeMediaList.length)
                          ? "w-8 bg-sky-400"
                          : "w-2 bg-slate-700 hover:bg-slate-600"
                      }`}
                      title={`Slide ${idx + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Painel Lateral de Histórico: Últimas Chamadas */}
        <aside className="w-80 lg:w-96 flex flex-col rounded-3xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-sky-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                Últimas Chamadas
              </h3>
            </div>
            <span className="text-xs text-slate-500">Histórico</span>
          </div>

          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
            {recentCalls.length === 0 ? (
              <p className="text-center text-xs text-slate-600 pt-10">
                Nenhuma chamada anterior hoje.
              </p>
            ) : (
              recentCalls.map((c, idx) => (
                <div
                  key={c.id}
                  className={`rounded-2xl border p-4 transition ${
                    idx === 0 && !isCallFresh
                      ? "border-sky-500/50 bg-sky-950/30 shadow-md shadow-sky-950/40"
                      : "border-slate-800/80 bg-slate-950/60 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-slate-400">
                      {new Date(c.called_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {idx === 0 && !isCallFresh && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 bg-sky-950/80 border border-sky-600/40 px-1.5 py-0.5 rounded-md">
                          Último
                        </span>
                      )}
                      {c.status === "called" && (
                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] gap-1 py-0 px-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping inline-block" />
                          Chamando
                        </Badge>
                      )}
                      {c.status === "in_attendance" && (
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] gap-1 py-0 px-2 font-medium">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                          Em Atendimento
                        </Badge>
                      )}
                      {c.status === "completed" && (
                        <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/40 text-[10px] py-0 px-2 font-medium">
                          Atendido
                        </Badge>
                      )}
                      {c.status === "cancelled" && (
                        <Badge variant="outline" className="border-slate-700 text-slate-400 text-[10px] py-0 px-2">
                          Cancelado
                        </Badge>
                      )}
                      <Badge variant="outline" className="border-slate-800 text-[10px] text-slate-400 capitalize">
                        {c.room_name}
                      </Badge>
                    </div>
                  </div>
                  <h4 className="mt-2 font-bold text-slate-200 capitalize text-sm truncate">
                    {c.patient_name}
                  </h4>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {c.professional_name}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Card QR Code Portal do Paciente (Inspirado no DigitalSignageOS) */}
          <div className="mt-3 rounded-2xl border border-sky-500/20 bg-sky-950/40 p-3.5 flex items-center gap-3 backdrop-blur-sm">
            <div className="bg-white p-1 rounded-xl shrink-0 shadow-md">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=0&data=${encodeURIComponent(
                  typeof window !== "undefined" ? `${window.location.origin}/portal` : "https://sondapro.com.br/portal"
                )}`}
                alt="QR Code Portal do Paciente"
                className="w-14 h-14 object-contain"
                loading="lazy"
              />
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-sky-400">
                <QrCode className="w-3.5 h-3.5 shrink-0" />
                <span>Portal do Paciente</span>
              </div>
              <p className="text-xs font-semibold text-slate-200 mt-0.5 leading-snug">
                Aponte o celular para agendar ou ver receitas
              </p>
              <span className="text-[10px] text-slate-400 font-mono mt-0.5 block truncate">
                {typeof window !== "undefined" ? `${window.location.host}/portal` : "sondapro.com/portal"}
              </span>
            </div>
          </div>

          <div className="mt-3 border-t border-slate-800/80 pt-3 text-center">
            <p className="text-[11px] text-slate-500">
              SondaPro Dental Display · Sistema Inteligente de Recepção
            </p>
          </div>
        </aside>
      </main>

      {/* 4. Rodapé Informativo: Letreiro Animado de Notícias / Avisos */}
      <footer className="h-11 shrink-0 border-t border-slate-900 bg-black/60 px-8 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-slate-300">TV Conectada</span>
        </div>

        {/* Letreiro Rotativo */}
        <div className="flex-1 mx-6 overflow-hidden text-center">
          <p className="font-medium text-slate-200 animate-in fade-in transition duration-500 truncate">
            {activeTicker}
          </p>
        </div>

        <div className="shrink-0 text-[11px] text-slate-500">
          SondaPro Dental Suite
        </div>
      </footer>

      {/* Modal de Conexão de Dispositivo / Totem / Raspberry Pi */}
      <Dialog open={loginModalOpen} onOpenChange={setLoginModalOpen}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-white">
              <KeyRound className="w-5 h-5 text-sky-400" />
              Conectar Dispositivo / Totem / Raspberry Pi
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Faça login para vincular este tablet, TV ou mini-computador diretamente à sua clínica sem acesso a prontuários ou dados confidenciais.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleDeviceLogin} className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">E-mail da Clínica / Recepção</label>
              <Input
                type="email"
                placeholder="recepcao@clinicax.com.br"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Senha</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white"
              />
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-800" />
              <span className="flex-shrink mx-3 text-[10px] text-slate-500 uppercase">ou conecte via ID / PIN</span>
              <div className="flex-grow border-t border-slate-800" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Código / UUID da Clínica</label>
              <Input
                type="text"
                placeholder="Ex: 9095e213-26af-441b-bc68-29c655c95590"
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value)}
                className="bg-slate-950 border-slate-800 font-mono text-xs text-white"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLoginModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isLoggingIn}
                className="bg-sky-600 hover:bg-sky-700 text-white font-medium"
              >
                {isLoggingIn ? "Conectando..." : "Conectar à TV"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
