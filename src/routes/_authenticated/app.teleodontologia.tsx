import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Video,
  Plus,
  Calendar,
  Clock,
  ShieldCheck,
  Search,
  MessageCircle,
  Copy,
  Printer,
  FileCheck,
  AlertCircle,
  Users,
  CheckCircle2,
} from "lucide-react";
import { useClinic } from "@/lib/clinic";
import { supabase } from "@/services/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  CreateTeleodontologySessionParams,
  TeleodontologyModality,
  TeleodontologySession,
} from "@/modules/teleodontology";
import {
  CFO_226_LEGAL_DISCLAIMER,
  CFO_226_MODALITY_DESCRIPTIONS,
  CFO_226_MODALITY_LABELS,
  buildTeleodontologyPrintableHtml,
  createTeleodontologySession,
  fetchTeleodontologySessions,
  generateWhatsAppInviteLink,
  updateTeleodontologyStatus,
} from "@/modules/teleodontology";
import { TeleodontologyVideoRoomModal } from "@/components/teleodontology/TeleodontologyVideoRoomModal";

export const Route = createFileRoute("/_authenticated/app/teleodontologia")({
  head: () => ({
    meta: [
      { title: "Teleodontologia (Resolução CFO 226/2020) — SondaPro" },
      {
        name: "description",
        content: "Teleorientação, telemonitoramento e teleinterconsulta odontológica regulamentada com TCLE e prontuário integrado.",
      },
    ],
  }),
  component: TeleodontologyPage,
});

function TeleodontologyPage() {
  const { clinicId, clinicName } = useClinic();
  const [sessions, setSessions] = useState<TeleodontologySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterModality, setFilterModality] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal de Criação
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [dentistId, setDentistId] = useState("");
  const [specialistId, setSpecialistId] = useState("");
  const [modality, setModality] = useState<TeleodontologyModality>("teleorientacao");
  const [scheduledDateTime, setScheduledDateTime] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 15);
    return d.toISOString().slice(0, 16);
  });
  const [submitting, setSubmitting] = useState(false);

  // Sala de Vídeo Ativa
  const [activeSession, setActiveSession] = useState<TeleodontologySession | null>(null);

  // Buscar pacientes e profissionais cadastrados
  const { data: clinicRefs } = useQuery({
    queryKey: ["teleodontology-refs", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const [patientsRes, profsRes] = await Promise.all([
        supabase
          .from("patients")
          .select("id, full_name, phone, cpf")
          .eq("clinic_id", clinicId)
          .order("full_name")
          .limit(500),
        supabase
          .from("professionals")
          .select("id, name, specialty")
          .eq("clinic_id", clinicId)
          .order("name"),
      ]);
      return {
        patients: patientsRes.data ?? [],
        professionals: profsRes.data ?? [],
      };
    },
  });

  const loadSessions = async () => {
    if (!clinicId) return;
    setLoading(true);
    const mod = filterModality === "all" ? undefined : (filterModality as TeleodontologyModality);
    const list = await fetchTeleodontologySessions(clinicId, mod);
    setSessions(list);
    setLoading(false);
  };

  useEffect(() => {
    void loadSessions();
  }, [clinicId, filterModality]);

  // Listener para realtime ou atualização periódica de sala de espera
  useEffect(() => {
    const interval = setInterval(() => {
      void loadSessions();
    }, 15000);
    return () => clearInterval(interval);
  }, [clinicId, filterModality]);

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicId) return;
    if (!patientId) {
      toast.error("Selecione um paciente para o atendimento.");
      return;
    }
    if (!dentistId) {
      toast.error("Selecione o cirurgião-dentista responsável.");
      return;
    }

    const selectedPatient = clinicRefs?.patients.find((p) => p.id === patientId);
    const selectedDentist = clinicRefs?.professionals.find((p) => p.id === dentistId);
    const selectedSpecialist = specialistId
      ? clinicRefs?.professionals.find((p) => p.id === specialistId)
      : undefined;

    setSubmitting(true);
    try {
      const params: CreateTeleodontologySessionParams = {
        clinicId,
        patientId,
        dentistId,
        interconsultaSpecialistId: specialistId || undefined,
        modality,
        scheduledFor: new Date(scheduledDateTime).toISOString(),
        patientName: selectedPatient?.full_name,
        patientPhone: selectedPatient?.phone || undefined,
        patientCpf: selectedPatient?.cpf || undefined,
        dentistName: selectedDentist?.name,
        dentistCro: undefined,
        specialistName: selectedSpecialist?.name,
        specialistCro: undefined,
      };

      const created = await createTeleodontologySession(params);
      toast.success("Teleconsulta agendada com sucesso!");
      setSessions((prev) => [created, ...prev]);
      setCreateModalOpen(false);

      // Copiar link automaticamente
      if (navigator.clipboard) {
        navigator.clipboard.writeText(created.roomUrl);
        toast.info("Link seguro da sala copiado para a área de transferência!");
      }
    } catch (err: any) {
      toast.error("Erro ao agendar teleconsulta: " + (err.message || String(err)));
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopyLink(session: TeleodontologySession) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(session.roomUrl);
      toast.success("Link seguro copiado: " + session.roomUrl);
    }
  }

  function handleOpenWhatsApp(session: TeleodontologySession) {
    if (!session.patientPhone) {
      toast.error("Paciente não possui telefone cadastrado para WhatsApp.");
      return;
    }
    const clinicTitle = clinicName || "Clínica Odontológica";
    const dentistTitle = session.dentistName || "Cirurgião-Dentista";
    const waUrl = generateWhatsAppInviteLink(
      session.patientPhone,
      session,
      clinicTitle,
      dentistTitle
    );
    window.open(waUrl, "_blank");
  }

  function handlePrintSession(session: TeleodontologySession) {
    const html = buildTeleodontologyPrintableHtml({
      clinicName: clinicName || "Clínica Odontológica",
      dentistName: session.dentistName || "Cirurgião-Dentista",
      dentistCro: session.dentistCro,
      patientName: session.patientName || "Paciente",
      patientCpf: session.patientCpf,
      session,
    });

    const printWin = window.open("", "_blank");
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
    } else {
      toast.error("Permita pop-ups no navegador para visualizar o prontuário.");
    }
  }

  async function handleCancelSession(session: TeleodontologySession) {
    if (!confirm("Deseja realmente cancelar este teleatendimento?")) return;
    await updateTeleodontologyStatus(session.id, "cancelled");
    toast.success("Teleatendimento cancelado.");
    setSessions((prev) =>
      prev.map((s) => (s.id === session.id ? { ...s, status: "cancelled" } : s))
    );
  }

  // Filtragem por busca
  const filteredSessions = sessions.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.patientName?.toLowerCase().includes(q) ||
      s.dentistName?.toLowerCase().includes(q) ||
      s.roomToken.toLowerCase().includes(q)
    );
  });

  // Métricas
  const totalWaiting = sessions.filter((s) => s.status === "waiting_room").length;
  const totalCompleted = sessions.filter((s) => s.status === "completed").length;
  const tcleCompliantCount = sessions.filter((s) => s.tcleAccepted).length;

  return (
    <div className="space-y-6">
      {/* Header Principal */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Video className="w-7 h-7 text-primary" /> Teleodontologia Integrada
            </h1>
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
              Resolução CFO 226/2020
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Plataforma homologada para <strong>Teleorientação</strong>, <strong>Telemonitoramento</strong> e <strong>Teleinterconsulta</strong> com TCLE Digital e prontuário integrado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => setCreateModalOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Nova Teleconsulta
          </Button>
        </div>
      </div>

      {/* Alerta Legal CFO 226/2020 */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30 p-4 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-blue-950 dark:text-blue-100">
            Conformidade com o Conselho Federal de Odontologia (CFO):
          </div>
          <p className="leading-relaxed">{CFO_226_LEGAL_DISCLAIMER}</p>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Total de Teleconsultas
            </CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sessions.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Sessões registradas na clínica</p>
          </CardContent>
        </Card>

        <Card className={totalWaiting > 0 ? "border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-sm" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Sala de Espera Virtual
            </CardTitle>
            <Users className={`h-4 w-4 ${totalWaiting > 0 ? "text-emerald-600 animate-pulse" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <span>{totalWaiting}</span>
              {totalWaiting > 0 && (
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Pacientes conectados aguardando início</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Atendimentos Concluídos
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCompleted}</div>
            <p className="text-xs text-muted-foreground mt-1">Com evolução no prontuário</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              TCLE CFO Aceito
            </CardTitle>
            <FileCheck className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {sessions.length > 0
                ? `${Math.round((tcleCompliantCount / sessions.length) * 100)}%`
                : "100%"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Termos assinados eletronicamente</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros e Abas de Modalidade */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs value={filterModality} onValueChange={setFilterModality} className="w-full sm:w-auto">
          <TabsList className="grid grid-cols-2 sm:flex sm:flex-row">
            <TabsTrigger value="all" className="text-xs">Todas ({sessions.length})</TabsTrigger>
            <TabsTrigger value="teleorientacao" className="text-xs">Teleorientação</TabsTrigger>
            <TabsTrigger value="telemonitoramento" className="text-xs">Telemonitoramento</TabsTrigger>
            <TabsTrigger value="teleinterconsulta" className="text-xs">Teleinterconsulta</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por paciente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs"
          />
        </div>
      </div>

      {/* Lista de Sessões */}
      {loading ? (
        <div className="p-12 text-center text-muted-foreground text-sm">
          Carregando sessões de teleodontologia...
        </div>
      ) : filteredSessions.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
            <Video className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-foreground text-base">Nenhuma teleconsulta encontrada</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-4">
            Agende atendimentos remotos regulamentados pelo CFO para acolher novos pacientes, acompanhar pós-operatórios ou discutir casos com especialistas.
          </p>
          <Button onClick={() => setCreateModalOpen(true)} size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> Agendar Primeira Teleconsulta
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredSessions.map((s) => {
            const isWaiting = s.status === "waiting_room";
            const isInProgress = s.status === "in_progress";
            const isCompleted = s.status === "completed";
            const isCancelled = s.status === "cancelled";

            return (
              <Card
                key={s.id}
                className={`transition-all ${
                  isWaiting
                    ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/10"
                    : ""
                }`}
              >
                <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 font-bold ${
                        isWaiting
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 ring-4 ring-emerald-500/20"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      <Video className="w-6 h-6" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-base text-foreground">
                          {s.patientName || "Paciente sem nome"}
                        </span>
                        <Badge variant="outline" className="text-xs font-normal">
                          {CFO_226_MODALITY_LABELS[s.modality]}
                        </Badge>
                        {isWaiting && (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs animate-pulse">
                            Paciente na Sala de Espera
                          </Badge>
                        )}
                        {isInProgress && (
                          <Badge className="bg-blue-600 text-white text-xs">Em Atendimento</Badge>
                        )}
                        {isCompleted && (
                          <Badge variant="secondary" className="text-xs">Concluída</Badge>
                        )}
                        {isCancelled && (
                          <Badge variant="destructive" className="text-xs">Cancelada</Badge>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(s.scheduledFor).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                        <span>•</span>
                        <span>Dr(a). {s.dentistName || "Dentista"}</span>
                        {s.specialistName && (
                          <>
                            <span>•</span>
                            <span className="text-teal-700 dark:text-teal-400 font-medium">
                              Especialista: Dr(a). {s.specialistName}
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          ID: {s.roomToken}
                        </span>
                      </div>

                      {s.tcleAccepted ? (
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium mt-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          TCLE Aceito pelo Paciente ({new Date(s.tcleAcceptedAt || s.createdAt).toLocaleTimeString("pt-BR")})
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Aguardando assinatura do TCLE pelo paciente ao entrar
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ações da Consulta */}
                  <div className="flex flex-wrap items-center gap-2 md:justify-end shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyLink(s)}
                      className="text-xs"
                      title="Copiar link seguro para o paciente"
                    >
                      <Copy className="w-3.5 h-3.5 mr-1" /> Copiar Link
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenWhatsApp(s)}
                      className="text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                      title="Enviar convite direto no WhatsApp"
                    >
                      <MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePrintSession(s)}
                      className="text-xs"
                      title="Imprimir prontuário e registros"
                    >
                      <Printer className="w-3.5 h-3.5 mr-1" /> Prontuário
                    </Button>

                    {isWaiting ? (
                      <Button
                        size="sm"
                        onClick={() => setActiveSession(s)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-md"
                      >
                        <Video className="w-4 h-4 mr-1.5" /> Iniciar Agora
                      </Button>
                    ) : !isCancelled ? (
                      <Button
                        size="sm"
                        onClick={() => setActiveSession(s)}
                        className="text-xs font-semibold"
                      >
                        <Video className="w-3.5 h-3.5 mr-1" /> Entrar na Sala
                      </Button>
                    ) : null}

                    {!isCompleted && !isCancelled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelSession(s)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Agendamento de Nova Teleconsulta */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleCreateSession}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Video className="w-5 h-5 text-primary" /> Agendar Nova Teleconsulta
              </DialogTitle>
              <DialogDescription className="text-xs">
                Em conformidade com a Resolução CFO-226/2020 do Conselho Federal de Odontologia.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              {/* Seleção do Paciente */}
              <div className="space-y-1.5">
                <Label htmlFor="patientSelect">Paciente</Label>
                <Select value={patientId} onValueChange={setPatientId} required>
                  <SelectTrigger id="patientSelect" className="text-xs">
                    <SelectValue placeholder="Selecione o paciente..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {clinicRefs?.patients.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.full_name} {p.cpf ? `(CPF: ${p.cpf})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cirurgião-Dentista Responsável */}
              <div className="space-y-1.5">
                <Label htmlFor="dentistSelect">Cirurgião-Dentista Responsável</Label>
                <Select value={dentistId} onValueChange={setDentistId} required>
                  <SelectTrigger id="dentistSelect" className="text-xs">
                    <SelectValue placeholder="Selecione o dentista..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clinicRefs?.professionals.map((pr) => (
                      <SelectItem key={pr.id} value={pr.id} className="text-xs">
                        Dr(a). {pr.name} {pr.specialty ? `(${pr.specialty})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Modalidade CFO */}
              <div className="space-y-1.5">
                <Label htmlFor="modalitySelect">Modalidade Regulamentada (CFO 226/2020)</Label>
                <Select
                  value={modality}
                  onValueChange={(v) => setModality(v as TeleodontologyModality)}
                >
                  <SelectTrigger id="modalitySelect" className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="teleorientacao" className="text-xs">
                      {CFO_226_MODALITY_LABELS.teleorientacao}
                    </SelectItem>
                    <SelectItem value="telemonitoramento" className="text-xs">
                      {CFO_226_MODALITY_LABELS.telemonitoramento}
                    </SelectItem>
                    <SelectItem value="teleinterconsulta" className="text-xs">
                      {CFO_226_MODALITY_LABELS.teleinterconsulta}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1 bg-muted/40 p-2 rounded">
                  {CFO_226_MODALITY_DESCRIPTIONS[modality]}
                </p>
              </div>

              {/* Se for Interconsulta, seleciona o especialista */}
              {modality === "teleinterconsulta" && (
                <div className="space-y-1.5">
                  <Label htmlFor="specialistSelect">Cirurgião-Dentista Especialista (Consultor)</Label>
                  <Select value={specialistId} onValueChange={setSpecialistId}>
                    <SelectTrigger id="specialistSelect" className="text-xs">
                      <SelectValue placeholder="Selecione o especialista para parecer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clinicRefs?.professionals
                        .filter((pr) => pr.id !== dentistId)
                        .map((pr) => (
                          <SelectItem key={pr.id} value={pr.id} className="text-xs">
                            Dr(a). {pr.name} {pr.specialty ? `(${pr.specialty})` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Data e Hora */}
              <div className="space-y-1.5">
                <Label htmlFor="scheduledDate">Data e Hora do Atendimento</Label>
                <Input
                  id="scheduledDate"
                  type="datetime-local"
                  value={scheduledDateTime}
                  onChange={(e) => setScheduledDateTime(e.target.value)}
                  required
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? "Criando Sala..." : "Agendar e Gerar Link Seguro"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Videochamada Integrada */}
      {activeSession && (
        <TeleodontologyVideoRoomModal
          session={activeSession}
          open={!!activeSession}
          onClose={() => setActiveSession(null)}
          clinicName={clinicName || "Clínica Odontológica"}
          onSessionUpdated={(updated) => {
            setActiveSession(updated);
            setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
          }}
        />
      )}
    </div>
  );
}
