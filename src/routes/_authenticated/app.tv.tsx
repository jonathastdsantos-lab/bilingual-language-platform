import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Tv,
  Megaphone,
  ExternalLink,
  Volume2,
  Clock,
  Sparkles,
  DoorOpen,
  UserCheck,
  CheckCircle2,
  Play,
  Copy,
  Check,
  AlertTriangle,
  Sun,
  CloudSun,
  Image as ImageIcon,
  Plus,
  Trash2,
  Save,
  Terminal,
  Sliders,
  MessageSquare,
  KeyRound,
  Laptop,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useClinic } from "@/lib/clinic";
import { useT } from "@/lib/i18n";
import { CallPatientModal } from "@/components/waiting-room/CallPatientModal";
import {
  fetchWaitingRoomCalls,
  playWaitingRoomChime,
  createWaitingRoomCall,
  checkWaitingRoomTableExists,
  getTvSettings,
  saveTvSettings,
  sendRemoteTvReload,
  getTvHeartbeatStatus,
  TvSettings,
  TvMediaItem,
} from "@/modules/waiting-room";
import { supabase } from "@/services/supabase";

export const Route = createFileRoute("/_authenticated/app/tv")({
  head: () => ({
    meta: [
      { title: "Painel de TV da Recepção — SondaPro" },
      { name: "description", content: "Gerencie as chamadas de pacientes, anúncios, previsão do tempo e exibição na sala de espera." },
    ],
  }),
  component: AppTvManagementPage,
});

function AppTvManagementPage() {
  const { clinicId, clinicName, units, activeUnitId, hasPermission } = useClinic();
  const { locale } = useT();
  const isEn = locale === "en";
  const qc = useQueryClient();

  const [callModalOpen, setCallModalOpen] = useState(false);
  const [isCallingTest, setIsCallingTest] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [hasCopiedKiosk, setHasCopiedKiosk] = useState(false);

  // Configurações de Mídia, Letreiro e Previsão do Tempo
  const [tvSettings, setTvSettingsState] = useState<TvSettings>(() => getTvSettings(clinicId));
  const [newTickerText, setNewTickerText] = useState("");
  const [newSlideTitle, setNewSlideTitle] = useState("");
  const [newSlideSubtitle, setNewSlideSubtitle] = useState("");
  const [newSlideImageUrl, setNewSlideImageUrl] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Monitoramento e Controle Remoto do Player de TV (Inspirado no DigitalSignageOS)
  const [tvStatus, setTvStatus] = useState(() => getTvHeartbeatStatus(clinicId));
  const [isReloadingTv, setIsReloadingTv] = useState(false);

  useEffect(() => {
    setTvSettingsState(getTvSettings(clinicId));
  }, [clinicId]);

  useEffect(() => {
    const check = () => setTvStatus(getTvHeartbeatStatus(clinicId));
    check();
    const interval = setInterval(check, 4000);
    return () => clearInterval(interval);
  }, [clinicId]);

  const handleRemoteTvReload = () => {
    setIsReloadingTv(true);
    sendRemoteTvReload(clinicId);
    toast.success(
      isEn
        ? "Remote reload signal sent to Reception TV screen!"
        : "Comando de recarregamento remoto enviado para a TV da Recepção!"
    );
    setTimeout(() => setIsReloadingTv(false), 2000);
  };

  // Queries de profissionais e consultórios para a chamada
  const { data: refs } = useQuery({
    queryKey: ["tv_refs", clinicId],
    queryFn: async () => {
      const [profsRes, roomsRes] = await Promise.all([
        supabase.from("professionals").select("id, name").eq("clinic_id", clinicId).eq("active", true),
        supabase.from("rooms").select("id, name").eq("clinic_id", clinicId),
      ]);
      return {
        professionals: profsRes.data ?? [],
        rooms: roomsRes.data ?? [],
      };
    },
  });

  const professionals = refs?.professionals ?? [];
  const rooms = refs?.rooms ?? [];

  // Query: Histórico de chamadas
  const { data: calls = [] } = useQuery({
    queryKey: ["waiting_room_calls", clinicId, activeUnitId],
    queryFn: () => fetchWaitingRoomCalls(clinicId, activeUnitId),
    refetchInterval: 3000,
  });

  // Query: Verifica se a tabela remota já foi criada no Supabase
  const { data: isTableReady = true } = useQuery({
    queryKey: ["waiting_room_table_status"],
    queryFn: checkWaitingRoomTableExists,
    refetchInterval: 8000,
  });

  // Atualização em tempo real via Supabase Realtime + BroadcastChannel + Eventos Locais
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      if ("BroadcastChannel" in window) {
        bc = new BroadcastChannel("sondapro_waiting_room");
        bc.onmessage = (event) => {
          if (event.data?.type === "CALL_PATIENT") {
            qc.invalidateQueries({ queryKey: ["waiting_room_calls"] });
          }
        };
      }
    } catch {
      // ignore
    }

    const handleLocalSync = () => {
      qc.invalidateQueries({ queryKey: ["waiting_room_calls"] });
    };

    window.addEventListener("sondapro:waiting_room_call", handleLocalSync);
    window.addEventListener("storage", handleLocalSync);

    // Supabase Realtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;
    if (clinicId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel = (supabase as any)
        .channel(`app_tv_${clinicId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "waiting_room_calls",
            filter: `clinic_id=eq.${clinicId}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: ["waiting_room_calls"] });
          }
        )
        .subscribe();
    }

    return () => {
      if (bc) bc.close();
      window.removeEventListener("sondapro:waiting_room_call", handleLocalSync);
      window.removeEventListener("storage", handleLocalSync);
      if (channel) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).removeChannel(channel);
      }
    };
  }, [clinicId, qc]);

  const canWrite = hasPermission("appointments.write");
  const tvUrl = `/tv?clinicId=${clinicId}${activeUnitId && activeUnitId !== "all" ? `&unitId=${activeUnitId}` : ""}`;
  const fullTvUrl = typeof window !== "undefined" ? `${window.location.origin}${tvUrl}` : tvUrl;
  const raspberryKioskCommand = `chromium-browser --kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 "${fullTvUrl}"`;

  // Função para chamada de teste rápido (1 clique)
  const handleQuickTestCall = async () => {
    try {
      setIsCallingTest(true);
      const prof = professionals[0];
      const room = rooms[0];

      const call = await createWaitingRoomCall({
        clinicId,
        unitId: activeUnitId && activeUnitId !== "all" ? activeUnitId : null,
        patientName: "Paciente Teste (Demonstração)",
        professionalId: prof?.id || null,
        professionalName: prof?.name || "Dra. Carolina Mendes",
        roomId: room?.id || null,
        roomName: room?.name || "Consultório 01",
        priority: "normal",
      });

      qc.invalidateQueries({ queryKey: ["waiting_room_calls"] });
      playWaitingRoomChime();
      toast.success(
        isEn
          ? `Test call sent! Patient "${call.patient_name}" called to ${call.room_name} on the TV screen.`
          : `Chamada de teste enviada! "${call.patient_name}" chamado para o ${call.room_name} na TV.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(isEn ? `Failed test call: ${msg}` : `Erro ao fazer chamada de teste: ${msg}`);
    } finally {
      setIsCallingTest(false);
    }
  };

  // Salvar configurações de TV
  const handleSaveTvSettings = () => {
    setIsSavingSettings(true);
    try {
      saveTvSettings(clinicId, tvSettings);
      toast.success("Configurações da TV atualizadas com sucesso!");
    } catch {
      toast.error("Erro ao salvar configurações.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Adicionar aviso ao letreiro
  const handleAddTicker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTickerText.trim()) return;
    const updated = {
      ...tvSettings,
      tickerTexts: [...tvSettings.tickerTexts, newTickerText.trim()],
    };
    setTvSettingsState(updated);
    saveTvSettings(clinicId, updated);
    setNewTickerText("");
    toast.success("Aviso adicionado ao letreiro da TV!");
  };

  // Remover aviso do letreiro
  const handleRemoveTicker = (idx: number) => {
    const updated = {
      ...tvSettings,
      tickerTexts: tvSettings.tickerTexts.filter((_, i) => i !== idx),
    };
    setTvSettingsState(updated);
    saveTvSettings(clinicId, updated);
    toast.info("Aviso removido do letreiro.");
  };

  // Adicionar slide de mídia
  const handleAddSlide = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlideTitle.trim()) {
      toast.error("Informe o título do anúncio.");
      return;
    }
    const newMedia: TvMediaItem = {
      id: `slide-${Date.now()}`,
      title: newSlideTitle.trim(),
      subtitle: newSlideSubtitle.trim() || undefined,
      imageUrl: newSlideImageUrl.trim() || undefined,
      active: true,
    };
    const updated = {
      ...tvSettings,
      mediaItems: [...tvSettings.mediaItems, newMedia],
    };
    setTvSettingsState(updated);
    saveTvSettings(clinicId, updated);
    setNewSlideTitle("");
    setNewSlideSubtitle("");
    setNewSlideImageUrl("");
    toast.success("Banner adicionado aos slides da TV!");
  };

  // Alternar ativo do slide
  const handleToggleSlide = (id: string) => {
    const updated = {
      ...tvSettings,
      mediaItems: tvSettings.mediaItems.map((m) => (m.id === id ? { ...m, active: !m.active } : m)),
    };
    setTvSettingsState(updated);
    saveTvSettings(clinicId, updated);
  };

  // Remover slide
  const handleRemoveSlide = (id: string) => {
    const updated = {
      ...tvSettings,
      mediaItems: tvSettings.mediaItems.filter((m) => m.id !== id),
    };
    setTvSettingsState(updated);
    saveTvSettings(clinicId, updated);
    toast.info("Banner removido.");
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* 1. Header do Módulo TV */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border bg-card p-6 shadow-card">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-sm">
            <Tv className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-navy">
              {isEn ? "Waiting Room TV & Display" : "Painel de Chamada em Sala de Espera (TV / Totem)"}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-xs text-muted-foreground">
                {isEn
                  ? "Broadcast patient calls, news tickers, weather forecast and clinic promotional banners on reception screen."
                  : "Exiba chamadas de pacientes, previsão do tempo, letreiro rotativo e anúncios da clínica na recepção."}
              </p>
              {tvStatus.isOnline ? (
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] gap-1.5 py-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  TV Online {tvStatus.lastSeenSecondsAgo !== null ? `(visto há ${tvStatus.lastSeenSecondsAgo}s)` : ""}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500 border-slate-200 text-[11px] gap-1.5 py-0.5">
                  <span className="h-2 w-2 rounded-full bg-slate-300" />
                  TV Desconectada
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 text-xs border-slate-200 text-slate-700 hover:bg-slate-50"
            disabled={isReloadingTv}
            onClick={handleRemoteTvReload}
            title="Recarrega a tela da TV remotamente (sem precisar de controle remoto ou teclado na recepção)"
          >
            <RefreshCw className={`h-4 w-4 text-sky-600 ${isReloadingTv ? "animate-spin" : ""}`} />
            <span>{isReloadingTv ? (isEn ? "Reloading..." : "Recarregando...") : (isEn ? "Reload TV" : "Recarregar TV")}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={() => playWaitingRoomChime()}
          >
            <Volume2 className="h-4 w-4 text-emerald-600" />
            <span>{isEn ? "Test Chime" : "Testar Som do Sino"}</span>
          </Button>

          {canWrite && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 text-xs border-sky-300 text-sky-700 hover:bg-sky-50"
              disabled={isCallingTest}
              onClick={handleQuickTestCall}
            >
              <Sparkles className="h-4 w-4 text-sky-600" />
              <span>{isCallingTest ? (isEn ? "Calling..." : "Chamando...") : (isEn ? "Quick Test Call" : "Chamar Paciente Teste")}</span>
            </Button>
          )}

          {canWrite && (
            <Button
              type="button"
              variant="hero"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => setCallModalOpen(true)}
            >
              <Megaphone className="h-4 w-4" />
              <span>{isEn ? "Call Patient Now" : "Chamar Paciente"}</span>
            </Button>
          )}

          <Button
            type="button"
            className="gap-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs"
            asChild
          >
            <Link to="/tv" search={{ clinicId, unitId: activeUnitId && activeUnitId !== "all" ? activeUnitId : undefined }}>
              <Tv className="h-4 w-4" />
              <span>{isEn ? "Open TV Here (This Tab)" : "Abrir TV Nesta Aba (Projetor)"}</span>
            </Link>
          </Button>

          <Button
            type="button"
            className="gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs"
            onClick={() => {
              window.open(tvUrl, "_blank");
            }}
          >
            <ExternalLink className="h-4 w-4" />
            <span>{isEn ? "Open TV New Tab" : "Abrir TV (Nova Aba)"}</span>
          </Button>
        </div>
      </div>

      {/* Alerta quando a migração remota do Supabase ainda não foi executada */}
      {!isTableReady && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 shadow-xs text-xs text-amber-950 space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <span>Sincronização entre Múltiplos Computadores Pendente</span>
          </div>
          <p className="text-amber-900 leading-relaxed">
            As chamadas estão funcionando perfeitamente <strong>neste computador</strong> localmente (como visto no botão <em>"Abrir TV Nesta Aba (Projetor)"</em>).
            Porém, para que a TV funcione em <strong>outro computador separado ou Smart TV</strong>, o banco remoto Supabase precisa ter a tabela criada.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1 font-medium">
            <span>👉 Para ativar a sincronização em outros computadores, clique no botão</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-200 font-mono font-bold text-amber-900 border border-amber-300">
              "Corrigir migrações pendentes"
            </span>
            <span>na barra lateral da Lovable (ou execute a migração <code>0017_waiting_room_calls.sql</code> no SQL Editor do Supabase).</span>
          </div>
        </div>
      )}

      {/* TABS DE CONFIGURAÇÃO DO MÓDULO TV */}
      <Tabs defaultValue="transmission" className="w-full">
        <TabsList className="grid grid-cols-3 w-full h-11 bg-white border border-slate-200 p-1 rounded-xl shadow-xs">
          <TabsTrigger value="transmission" className="text-xs gap-1.5 data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700">
            <Tv className="w-3.5 h-3.5" />
            <span>Chamadas & Transmissão</span>
          </TabsTrigger>
          <TabsTrigger value="media" className="text-xs gap-1.5 data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700">
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Anúncios & Banners</span>
          </TabsTrigger>
          <TabsTrigger value="weather_device" className="text-xs gap-1.5 data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700">
            <Laptop className="w-3.5 h-3.5" />
            <span>Previsão do Tempo & Raspberry Pi</span>
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: CHAMADAS & TRANSMISSÃO */}
        <TabsContent value="transmission" className="mt-5 space-y-6">
          {/* Instruções de Conexão na TV / Projetor */}
          <section className="rounded-2xl border bg-gradient-to-r from-sky-50/70 via-white to-blue-50/50 p-5 shadow-xs text-xs space-y-3">
            <div className="flex items-center gap-2 font-bold text-navy text-sm">
              <Sparkles className="h-4 w-4 text-sky-600" />
              <span>Como Exibir na TV da Recepção ou Projetor</span>
            </div>

            <div className="space-y-3">
              <p className="text-slate-700 font-medium">
                <strong>Opção 1 (Recomendada no Consultório):</strong> Conecte um cabo HDMI do computador da recepção à TV ou segundo monitor e clique no botão acima <strong>"Abrir TV Nesta Aba (Projetor)"</strong> ou <strong>"Abrir TV (Nova Aba)"</strong>. Pressione F11 para tela cheia.
              </p>

              <div className="rounded-xl border border-sky-200 bg-white p-3.5 space-y-2 shadow-xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Tv className="h-4 w-4 text-sky-600" />
                    <strong>Opção 2 (Smart TV / Totem / Outro Computador):</strong>
                  </span>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-[10px]">
                    ✓ Acesso Público Liberado (Sem Login)
                  </Badge>
                </div>

                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Abra o navegador da Smart TV ou do outro computador e acesse o endereço abaixo (clique no botão para copiar o link completo):
                </p>

                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-sky-50 border border-sky-200 px-3 py-1.5 font-mono font-bold text-sky-900 text-xs break-all select-all">
                    {fullTvUrl}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs gap-1.5 shrink-0 bg-sky-600 text-white hover:bg-sky-700 hover:text-white font-medium shadow-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(fullTvUrl);
                      setHasCopied(true);
                      toast.success(isEn ? "TV Link copied to clipboard!" : "Link da TV copiado para a área de transferência!");
                      setTimeout(() => setHasCopied(false), 2500);
                    }}
                  >
                    {hasCopied ? <Check className="h-4 w-4 text-white" /> : <Copy className="h-4 w-4" />}
                    <span>{hasCopied ? "Copiado!" : "Copiar Link"}</span>
                  </Button>
                </div>

                <p className="text-[11px] text-slate-500 pt-1">
                  💡 <strong>Dica de Áudio na Smart TV:</strong> Ao abrir na TV ou em outro computador pela primeira vez, dê <strong>1 clique ou toque na tela</strong> para liberar a voz e o sinal sonoro do navegador (requisito de segurança padrão dos navegadores).
                </p>
              </div>
            </div>
          </section>

          {/* Tabela de Histórico de Chamadas Recentes */}
          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between pb-3 border-b">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-sky-600" />
                <h3 className="font-bold text-navy">
                  {isEn ? "Today's Patient Calls" : "Histórico de Chamadas de Hoje"}
                </h3>
              </div>
              <span className="text-xs text-muted-foreground">
                {calls.length} {isEn ? "calls registered" : "chamadas registradas"}
              </span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-slate-500 font-semibold bg-slate-50/70">
                    <th className="py-2.5 px-3">Horário</th>
                    <th className="py-2.5 px-3">Paciente</th>
                    <th className="py-2.5 px-3">Consultório</th>
                    <th className="py-2.5 px-3">Profissional</th>
                    <th className="py-2.5 px-3">Prioridade</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {calls.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted-foreground">
                        {isEn ? "No calls registered today yet." : "Nenhuma chamada realizada hoje ainda."}
                      </td>
                    </tr>
                  ) : (
                    calls.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-3 font-mono font-bold text-navy">
                          {new Date(c.called_at).toLocaleTimeString(locale === "en" ? "en-US" : "pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-800 capitalize">
                          {c.patient_name}
                        </td>
                        <td className="py-3 px-3 text-sky-700 font-medium">
                          {c.room_name}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {c.professional_name}
                        </td>
                        <td className="py-3 px-3">
                          <Badge
                            variant={c.priority === "urgent" ? "destructive" : c.priority === "priority" ? "secondary" : "outline"}
                            className="text-[10px] capitalize font-bold"
                          >
                            {c.priority === "urgent" ? "Urgência" : c.priority === "priority" ? "Prioritário" : "Normal"}
                          </Badge>
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Chamado</span>
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </TabsContent>

        {/* ABA 2: ANÚNCIOS & BANNERS */}
        <TabsContent value="media" className="mt-5 space-y-6">
          {/* Seção 1: Letreiro de Texto Rotativo (Rodapé da TV) */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sky-600" />
                Letreiro Rotativo de Notícias & Avisos (Rodapé da TV)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Estas mensagens passam continuamente na barra inferior da TV da recepção para informar os pacientes.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 text-xs">
              <form onSubmit={handleAddTicker} className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Ex: Wi-Fi gratuito: conecte-se na rede Clinica_Visitantes..."
                  value={newTickerText}
                  onChange={(e) => setNewTickerText(e.target.value)}
                  className="h-9 text-xs"
                />
                <Button type="submit" size="sm" className="h-9 bg-sky-600 hover:bg-sky-700 text-white text-xs gap-1 shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar Frase
                </Button>
              </form>

              <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100 bg-slate-50/50">
                {tvSettings.tickerTexts.length === 0 ? (
                  <p className="p-4 text-center text-slate-400">Nenhum aviso cadastrado. Adicione uma frase acima.</p>
                ) : (
                  tvSettings.tickerTexts.map((text, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between gap-3 hover:bg-white transition">
                      <span className="text-slate-700 flex-1">{text}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveTicker(idx)}
                        className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                        title="Remover frase"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Seção 2: Banners & Slides Promocionais (Centro da TV) */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-sky-600" />
                  Banners & Slides Promocionais da Clínica
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Exibidos na tela central da TV enquanto nenhum paciente estiver sendo anunciado.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Tempo de rotação:</span>
                <select
                  value={tvSettings.slideIntervalSeconds}
                  onChange={(e) => {
                    const sec = Number(e.target.value);
                    const updated = { ...tvSettings, slideIntervalSeconds: sec };
                    setTvSettingsState(updated);
                    saveTvSettings(clinicId, updated);
                  }}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                >
                  <option value={8}>8 segundos</option>
                  <option value={12}>12 segundos</option>
                  <option value={15}>15 segundos</option>
                  <option value={20}>20 segundos</option>
                </select>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 text-xs">
              {/* Formulário para novo slide */}
              <form onSubmit={handleAddSlide} className="p-4 rounded-xl border border-sky-100 bg-sky-50/50 space-y-3">
                <p className="font-bold text-slate-800 text-xs">Adicionar Novo Banner / Promoção</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">Título do Anúncio</label>
                    <Input
                      type="text"
                      placeholder="Ex: Clareamento Dental a Laser"
                      value={newSlideTitle}
                      onChange={(e) => setNewSlideTitle(e.target.value)}
                      className="h-9 text-xs bg-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">URL da Imagem (Opcional)</label>
                    <Input
                      type="url"
                      placeholder="https://exemplo.com/foto.jpg"
                      value={newSlideImageUrl}
                      onChange={(e) => setNewSlideImageUrl(e.target.value)}
                      className="h-9 text-xs bg-white mt-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Descrição / Legenda</label>
                  <Input
                    type="text"
                    placeholder="Ex: Agende sua avaliação estética com condições especiais este mês."
                    value={newSlideSubtitle}
                    onChange={(e) => setNewSlideSubtitle(e.target.value)}
                    className="h-9 text-xs bg-white mt-1"
                  />
                </div>
                <Button type="submit" size="sm" className="bg-sky-600 hover:bg-sky-700 text-white text-xs gap-1.5 h-8">
                  <Plus className="w-3.5 h-3.5" />
                  Salvar Banner
                </Button>
              </form>

              {/* Lista de Slides Atuais */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {tvSettings.mediaItems.map((slide) => (
                  <div key={slide.id} className="border border-slate-200 rounded-xl p-3 bg-white flex gap-3 items-start justify-between shadow-xs">
                    {slide.imageUrl ? (
                      <img src={slide.imageUrl} alt={slide.title} className="w-20 h-20 rounded-lg object-cover border border-slate-100 shrink-0" />
                    ) : (
                      <div className="w-20 h-20 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0">
                        <ImageIcon className="w-7 h-7" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-800 text-xs truncate">{slide.title}</h4>
                        <Badge variant="outline" className={slide.active ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]" : "bg-slate-100 text-slate-500 text-[10px]"}>
                          {slide.active ? "Ativo" : "Pausado"}
                        </Badge>
                      </div>
                      {slide.subtitle && <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">{slide.subtitle}</p>}
                    </div>

                    <div className="flex flex-col gap-1 items-end">
                      <Switch
                        checked={slide.active}
                        onCheckedChange={() => handleToggleSlide(slide.id)}
                        title={slide.active ? "Pausar slide" : "Ativar slide"}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveSlide(slide.id)}
                        className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50 mt-2"
                        title="Excluir banner"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 3: PREVISÃO DO TEMPO & RASPBERRY PI */}
        <TabsContent value="weather_device" className="mt-5 space-y-6">
          {/* Previsão do Tempo */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-500" />
                Previsão do Tempo na TV da Recepção
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Exibe temperatura e condição do clima no topo da TV ao lado do relógio digital (via Open-Meteo).
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div>
                  <p className="font-semibold text-slate-800">Ativar Widget de Previsão do Tempo</p>
                  <p className="text-[11px] text-slate-500">Exibe a temperatura em °C e o clima atualizado a cada 20 minutos.</p>
                </div>
                <Switch
                  checked={tvSettings.showWeather}
                  onCheckedChange={(checked) => {
                    const updated = { ...tvSettings, showWeather: checked };
                    setTvSettingsState(updated);
                    saveTvSettings(clinicId, updated);
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Cidade da Clínica</label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Ex: São Paulo, SP ou Rio de Janeiro, RJ"
                    value={tvSettings.cityName}
                    onChange={(e) => setTvSettingsState({ ...tvSettings, cityName: e.target.value })}
                    className="h-9 text-xs"
                  />
                  <Button
                    type="button"
                    onClick={handleSaveTvSettings}
                    disabled={isSavingSettings}
                    className="bg-sky-600 hover:bg-sky-700 text-white text-xs h-9 gap-1.5 shrink-0"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Salvar Cidade
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Modo Totem / Tablet / Raspberry Pi (Kiosk Independente) */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-sky-600" />
                Acesso Exclusivo para Raspberry Pi, Tablet ou Totem
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Configure dispositivos dedicados para abrir exclusivamente o painel da TV, sem permitir navegação em prontuários ou área administrativa.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 space-y-2">
                <p className="font-bold text-sky-900 text-xs">Link Direto da TV do Totem / Tablet</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-white border border-sky-300 px-3 py-1.5 font-mono font-bold text-sky-950 text-xs break-all select-all">
                    {fullTvUrl}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs gap-1.5 shrink-0 bg-sky-600 text-white hover:bg-sky-700 hover:text-white"
                    onClick={() => {
                      navigator.clipboard.writeText(fullTvUrl);
                      setHasCopied(true);
                      toast.success("Link copiado!");
                      setTimeout(() => setHasCopied(false), 2000);
                    }}
                  >
                    {hasCopied ? <Check className="h-4 w-4 text-white" /> : <Copy className="h-4 w-4" />}
                    <span>{hasCopied ? "Copiado!" : "Copiar Link"}</span>
                  </Button>
                </div>
              </div>

              {/* Comando Kiosk para Raspberry Pi */}
              <div className="p-3.5 rounded-xl bg-slate-900 text-slate-200 space-y-2 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-bold text-sky-400 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    Comando Kiosk (Raspberry Pi OS / Linux)
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] text-slate-300 hover:text-white hover:bg-slate-800 gap-1 px-2"
                    onClick={() => {
                      navigator.clipboard.writeText(raspberryKioskCommand);
                      setHasCopiedKiosk(true);
                      toast.success("Comando do Raspberry Pi copiado!");
                      setTimeout(() => setHasCopiedKiosk(false), 2000);
                    }}
                  >
                    {hasCopiedKiosk ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>Copiar Comando</span>
                  </Button>
                </div>
                <code className="block rounded-lg bg-slate-950 p-2.5 font-mono text-[11px] text-emerald-400 break-all select-all border border-slate-800">
                  {raspberryKioskCommand}
                </code>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Coloque este comando no script de inicialização (<code>autostart</code>) do seu Raspberry Pi. Ao ligar na tomada, ele abrirá direto em tela cheia na TV da recepção, travado no painel de atendimento!
                </p>
              </div>

              {/* Login por PIN no Dispositivo */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white">
                <div>
                  <p className="font-semibold text-slate-800">Código / PIN de Vinculação Rápida</p>
                  <p className="text-[11px] text-slate-500">Se abrir na TV e pedir login, você pode digitar este código direto:</p>
                </div>
                <code className="px-2.5 py-1 rounded-md bg-slate-100 font-mono font-bold text-slate-800 text-xs">
                  {clinicId}
                </code>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Chamada */}
      <CallPatientModal
        open={callModalOpen}
        onOpenChange={setCallModalOpen}
        clinicId={clinicId}
        unitId={activeUnitId}
        professionals={professionals}
        rooms={rooms}
      />
    </div>
  );
}
