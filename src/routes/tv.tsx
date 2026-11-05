import { useState, useEffect, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/services/supabase";
import {
  fetchWaitingRoomCalls,
  playWaitingRoomChime,
  speakPatientCall,
} from "@/modules/waiting-room";
import type { WaitingRoomCall } from "@/types";

export const Route = createFileRoute("/tv")({
  validateSearch: (search: Record<string, unknown>) => ({
    clinicId: typeof search["clinicId"] === "string" ? (search["clinicId"] as string) : undefined,
    unitId: typeof search["unitId"] === "string" ? (search["unitId"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Painel de Chamada TV — SondaPro" },
      { name: "description", content: "Painel em tela cheia para recepção e salas de espera odontológicas." },
    ],
  }),
  component: WaitingRoomTvPage,
});

function WaitingRoomTvPage() {
  const { clinicId, unitId } = Route.useSearch();

  // Estados de multimídia
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Relógio digital em tempo real
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  // Se clinicId não vier na URL, tenta buscar da clínica do usuário logado
  const [effectiveClinicId, setEffectiveClinicId] = useState<string | null>(clinicId ?? null);
  const [clinicName, setClinicName] = useState<string>("SondaPro Odontologia");

  useEffect(() => {
    if (clinicId) {
      setEffectiveClinicId(clinicId);
      // Busca nome da clínica
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("clinics")
        .select("name")
        .eq("id", clinicId)
        .single()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(({ data }: any) => {
          if (data?.name) setClinicName(data.name);
        });
      return;
    }

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
  }, [clinicId]);

  // Query: Busca chamadas com auto-refetch a cada 3 segundos
  const { data: calls = [] } = useQuery({
    queryKey: ["waiting_room_calls", effectiveClinicId, unitId],
    queryFn: () => fetchWaitingRoomCalls(effectiveClinicId!, unitId),
    enabled: !!effectiveClinicId,
    refetchInterval: 3000,
  });

  const lastCallIdRef = useRef<string | null>(null);
  const activeCall: WaitingRoomCall | undefined = calls[0];

  // Disparo de som e fala ao chegar nova chamada
  useEffect(() => {
    if (!activeCall) return;

    if (lastCallIdRef.current && lastCallIdRef.current !== activeCall.id) {
      if (soundEnabled) {
        playWaitingRoomChime();
      }
      if (speechEnabled) {
        speakPatientCall(activeCall.patient_name, activeCall.room_name);
      }
    }
    lastCallIdRef.current = activeCall.id;
  }, [activeCall, soundEnabled, speechEnabled]);

  const recentCalls = calls.slice(1, 6);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
      {/* 1. Header do Painel TV */}
      <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/90 px-8 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 to-cyan-500 text-white shadow-lg shadow-sky-500/20">
            <Sparkles className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase">
              {clinicName}
            </h1>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">
              Painel de Atendimento · Sala de Espera
            </p>
          </div>
        </div>

        {/* Relógio Digital e Controles */}
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="font-mono text-3xl font-extrabold tracking-wider text-white">
              {currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div className="text-xs font-medium capitalize text-slate-400">
              {currentTime.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            </div>
          </div>

          <div className="flex items-center gap-2 border-l border-slate-800 pl-6">
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
            <Button variant="ghost" size="icon" asChild className="text-slate-400 hover:bg-slate-800 hover:text-white">
              <Link to="/app" title="Voltar ao Sistema">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* 2. Conteúdo Central Dividido (Chamada Atual + Histórico Lateral) */}
      <main className="flex flex-1 overflow-hidden p-8 gap-8">
        {/* Chamada Ativa em Destaque Gigante */}
        <div className="flex flex-1 flex-col justify-between rounded-3xl border border-sky-500/30 bg-gradient-to-b from-slate-900/90 via-slate-900/60 to-slate-950 p-10 shadow-2xl shadow-sky-950/50 backdrop-blur-xl relative overflow-hidden">
          {/* Efeito luminoso de fundo */}
          <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-sky-600/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-cyan-600/10 blur-3xl pointer-events-none" />

          {activeCall ? (
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
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-900 border border-slate-800 text-slate-600">
                <Megaphone className="h-10 w-10 text-sky-500/60" />
              </span>
              <h3 className="text-3xl font-bold text-slate-300">
                Aguardando Próxima Chamada
              </h3>
              <p className="text-slate-500 max-w-md text-sm">
                Por favor, aguarde seu nome ser anunciado no painel. O profissional chamará em instantes.
              </p>
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
              recentCalls.map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 transition hover:border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-slate-400">
                      {new Date(c.called_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <Badge variant="outline" className="border-slate-800 text-[10px] text-slate-400 capitalize">
                      {c.room_name}
                    </Badge>
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

          <div className="mt-auto border-t border-slate-800/80 pt-4 text-center">
            <p className="text-[11px] text-slate-500">
              SondaPro Dental Display · Sistema Inteligente de Recepção
            </p>
          </div>
        </aside>
      </main>

      {/* 4. Rodapé Informativo da Recepção */}
      <footer className="h-10 shrink-0 border-t border-slate-900 bg-black/40 px-8 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Painel Conectado em Tempo Real</span>
        </div>
        <div>
          <span>Dica de Saúde: Mantenha sua escovação diária e consulte seu dentista regularmente.</span>
        </div>
      </footer>
    </div>
  );
}
