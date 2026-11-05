import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClinic } from "@/lib/clinic";
import { useT } from "@/lib/i18n";
import { CallPatientModal } from "@/components/waiting-room/CallPatientModal";
import { fetchWaitingRoomCalls, playWaitingRoomChime } from "@/modules/waiting-room";
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

  const [callModalOpen, setCallModalOpen] = useState(false);

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
    refetchInterval: 5000,
  });

  const canWrite = hasPermission("appointments.write");
  const tvUrl = `/tv?clinicId=${clinicId}${activeUnitId && activeUnitId !== "all" ? `&unitId=${activeUnitId}` : ""}`;

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

        <div className="flex flex-wrap items-center gap-3">
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
            className="gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs"
            asChild
          >
            <a href={tvUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              <span>{isEn ? "Open TV Fullscreen Screen" : "Abrir Tela da TV na Recepção"}</span>
            </a>
          </Button>
        </div>
      </div>

      {/* 2. Destaque: Instrução de Configuração da TV na Recepção */}
      <section className="rounded-2xl border bg-gradient-to-r from-sky-50/70 via-white to-blue-50/50 p-5 shadow-xs text-xs space-y-2">
        <div className="flex items-center gap-2 font-bold text-navy text-sm">
          <Sparkles className="h-4 w-4 text-sky-600" />
          <span>Como usar na Smart TV ou Monitor do Consultório</span>
        </div>
        <p className="text-slate-600">
          Abra o navegador da Smart TV, Totem ou Raspberry Pi e acesse o endereço direto:
          <code className="ml-1.5 rounded-lg bg-sky-100 px-2 py-0.5 font-mono font-bold text-sky-800">
            {typeof window !== "undefined" ? `${window.location.origin}${tvUrl}` : tvUrl}
          </code>
        </p>
        <p className="text-slate-500">
          A tela entrará em modo exibição contínua com atualização em tempo real, relógio digital, toque de campainha odontológica e anúncio por voz.
        </p>
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

