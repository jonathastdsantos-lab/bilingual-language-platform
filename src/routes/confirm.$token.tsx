import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchPublicAppointmentInfo,
  submitPublicConfirmationResponse,
} from "@/modules/appointments/tokens";

export const Route = createFileRoute("/confirm/$token")({
  head: () => ({
    meta: [
      { title: "Confirmação de Consulta — SondaPro" },
      { name: "description", content: "Confirme ou remarque sua consulta odontológica." },
    ],
  }),
  component: PublicAppointmentConfirmationPage,
});

function PublicAppointmentConfirmationPage() {
  const { token } = Route.useParams();
  const [notes, setNotes] = useState("");
  const [showCancelField, setShowCancelField] = useState(false);
  const [resolvedStatus, setResolvedStatus] = useState<string | null>(null);

  const { data: info, isLoading, refetch } = useQuery({
    queryKey: ["publicAppointment", token],
    queryFn: () => fetchPublicAppointmentInfo(token),
  });

  const mutation = useMutation({
    mutationFn: async (action: "confirm" | "cancel") => {
      return submitPublicConfirmationResponse({ token, action, notes: notes || undefined });
    },
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.error ?? "Erro ao processar resposta.");
        return;
      }
      toast.success(res.message);
      setResolvedStatus(res.status ?? null);
      refetch();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
          <Clock className="mx-auto mb-2 h-8 w-8 animate-spin text-teal" />
          <p className="text-sm font-semibold text-slate-700">Carregando detalhes do seu agendamento...</p>
        </div>
      </div>
    );
  }

  if (!info || !info.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <XCircle className="mx-auto mb-3 h-12 w-12 text-destructive" />
          <h1 className="text-lg font-extrabold text-navy">Link Expirado ou Inválido</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            {info?.error || "Este link de confirmação não é mais válido. Entre em contato diretamente com a clínica."}
          </p>
        </div>
      </div>
    );
  }

  const startDate = info.starts_at ? new Date(info.starts_at) : null;
  const isAlreadyConfirmed = resolvedStatus === "confirmed" || info.appointment_status === "confirmed";
  const isAlreadyCancelled = resolvedStatus === "cancelled" || info.appointment_status === "cancelled";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50/80 p-4 sm:p-6">
      <div className="w-full max-w-lg space-y-6 rounded-3xl border bg-white p-6 shadow-card sm:p-8">
        {/* Topo da Clínica */}
        <div className="border-b pb-4 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-3 py-1 text-xs font-bold text-teal">
            <ShieldCheck className="h-3.5 w-3.5" />
            Portal do Paciente SondaPro
          </span>
          <h1 className="mt-2 text-xl font-extrabold text-navy sm:text-2xl">{info.clinic_name}</h1>
          <p className="text-xs text-muted-foreground">Confirmação de Presença na Consulta Odontológica</p>
        </div>

        {/* Detalhes da Consulta */}
        <div className="space-y-3 rounded-2xl bg-slate-50 p-4 text-xs">
          <div className="flex items-center gap-2 font-bold text-navy">
            <User className="h-4 w-4 text-teal" />
            <span>Paciente: {info.patient_name}</span>
          </div>

          <div className="flex items-center gap-2 text-slate-700">
            <CalendarDays className="h-4 w-4 text-teal" />
            <span>
              <b>Data:</b> {startDate ? startDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) : "—"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-700">
            <Clock className="h-4 w-4 text-teal" />
            <span>
              <b>Horário:</b> {startDate ? startDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
            </span>
          </div>

          {info.procedure && (
            <div className="flex items-center gap-2 text-slate-700">
              <CheckCircle2 className="h-4 w-4 text-teal" />
              <span><b>Procedimento:</b> {info.procedure}</span>
            </div>
          )}

          {info.professional_name && (
            <div className="flex items-center gap-2 text-slate-700">
              <User className="h-4 w-4 text-teal" />
              <span><b>Profissional:</b> Dr(a). {info.professional_name}</span>
            </div>
          )}

          {(info.unit_name || info.unit_address) && (
            <div className="flex items-start gap-2 text-slate-700">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
              <span>
                <b>Local de Atendimento:</b> {info.unit_name ? `${info.unit_name} — ` : ""}
                {info.unit_address || "Endereço principal da clínica"}
              </span>
            </div>
          )}
        </div>

        {/* Status Atual ou Ações */}
        {isAlreadyConfirmed ? (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-500/10 p-5 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
            <h3 className="text-base font-extrabold text-emerald-800">Sua presença está confirmada!</h3>
            <p className="mt-1 text-xs text-emerald-700">
              Agradecemos a confirmação. Estamos preparando tudo para o seu atendimento no consultório.
            </p>
          </div>
        ) : isAlreadyCancelled ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-center">
            <XCircle className="mx-auto mb-2 h-8 w-8 text-destructive" />
            <h3 className="text-base font-extrabold text-destructive">Consulta Cancelada</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Recebemos sua solicitação de cancelamento. A equipe da clínica entrará em contato para reagendar uma nova data.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-xs font-semibold text-slate-600">
              Por favor, confirme se você comparecerá à consulta:
            </p>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <Button
                type="button"
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate("confirm")}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Sim, Confirmo Minha Presença
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full text-slate-700"
                disabled={mutation.isPending}
                onClick={() => setShowCancelField((v) => !v)}
              >
                <XCircle className="mr-2 h-4 w-4 text-destructive" />
                Não poderei comparecer
              </Button>
            </div>

            {showCancelField && (
              <div className="space-y-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs">
                <p className="font-bold text-destructive">Motivo do cancelamento / Nova preferência de horário:</p>
                <Textarea
                  rows={2}
                  placeholder="Ex.: Tive um imprevisto de trabalho. Gostaria de remarcar para a próxima terça à tarde..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate("cancel")}
                  >
                    Confirmar Cancelamento
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rodapé e Contato com a Clínica */}
        {info.clinic_phone && (
          <div className="border-t pt-4 text-center">
            <p className="text-[11px] text-muted-foreground">
              Dúvidas ou urgências? Fale com a clínica:
            </p>
            <p className="mt-0.5 text-xs font-bold text-navy">
              📞 {info.clinic_phone}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

