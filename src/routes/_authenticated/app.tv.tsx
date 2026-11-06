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
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClinic } from "@/lib/clinic";
import { useT } from "@/lib/i18n";
import { CallPatientModal } from "@/components/waiting-room/CallPatientModal";
import {
  fetchWaitingRoomCalls,
  playWaitingRoomChime,
  createWaitingRoomCall,
  checkWaitingRoomTableExists,
} from "@/modules/waiting-room";
import { supabase } from "@/services/supabase";

export const Route = createFileRoute("/_authenticated/app/tv")({
  head: () => ({
    meta: [
      { title: "Painel de TV da Recepção — SondaPro" },
      { name: "description", content: "Gerencie as chamadas de pacientes para a TV e sala de espera." },
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
            <p className="text-xs text-muted-foreground">
              {isEn
                ? "Broadcast patient calls on the clinic reception screen with audio chime alerts."
                : "Exiba as chamadas de pacientes na tela da recepção acompanhadas de sinal sonoro."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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

      {/* 2. Destaque: Instrução de Configuração da TV na Recepção */}
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
                {typeof window !== "undefined" ? `${window.location.origin}${tvUrl}` : tvUrl}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5 shrink-0 bg-sky-600 text-white hover:bg-sky-700 hover:text-white font-medium shadow-xs"
                onClick={() => {
                  const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${tvUrl}` : tvUrl;
                  navigator.clipboard.writeText(fullUrl);
                  setHasCopied(true);
                  toast.success(isEn ? "TV Link copied to clipboard!" : "Link da TV copiado para a área de transferência!");
                  setTimeout(() => setHasCopied(false), 2500);
                }}
              >
                {hasCopied ? <Check className="h-4 w-4 text-white" /> : <Copy className="h-4 w-4" />}
                <span>{hasCopied ? (isEn ? "Copiado!" : "Copiado!") : (isEn ? "Copiar Link" : "Copiar Link")}</span>
              </Button>
            </div>

            <p className="text-[11px] text-slate-500 pt-1">
              💡 <strong>Dica de Áudio na Smart TV:</strong> Ao abrir na TV ou em outro computador pela primeira vez, dê <strong>1 clique ou toque na tela</strong> para liberar a voz e o sinal sonoro do navegador (requisito de segurança padrão dos navegadores).
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-[11px] text-amber-900 flex items-start gap-2.5">
          <span className="font-bold text-amber-700 shrink-0">ℹ️ Nota sobre o Ambiente Lovable Preview:</span>
          <span>
            No ambiente de teste privado (com link <code>id-preview--...lovable.app</code>), se você tentar abrir em outro navegador (como Edge) ou na Smart TV onde você não está logado na Lovable, a plataforma Lovable exigirá login. Para testar sem login ou em produção, abra no mesmo navegador onde você está trabalhando (usando os botões azuis acima) ou acesse através do domínio publicado final da clínica.
          </span>
        </div>
      </section>

      {/* 3. Tabela de Histórico de Chamadas Recentes */}
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
                  <tr key={c.id} className="hover:bg-slate-50/50">
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

