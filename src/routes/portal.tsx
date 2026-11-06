import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  CalendarPlus,
  MessageCircle,
  FileText,
  Pill,
  ShieldCheck,
  User,
  LogOut,
  QrCode,
  Sparkles,
  ArrowRight,
  Phone,
  Building2,
  ExternalLink,
  Lock,
  Printer,
  ChevronRight,
  AlertCircle,
  Check,
  Activity,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  authenticatePatientPortal,
  getSavedPatientPortalProfile,
  logoutPatientPortal,
  fetchPatientPortalAppointments,
  fetchPatientPortalDocuments,
  confirmPatientAppointment,
  PatientPortalProfile,
  PatientPortalAppointment,
  PatientPortalDocument,
} from "@/modules/patient-portal";
import { formatCPF } from "@/utils/validators";
import { toast } from "sonner";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "Portal do Paciente — SondaPro Odontologia" },
      { name: "description", content: "Acesse suas consultas, receitas, atestados e termos odontológicos digitais de forma segura." },
    ],
  }),
  component: PatientPortalPage,
});

export function PatientPortalPage() {
  const [profile, setProfile] = useState<PatientPortalProfile | null>(null);
  const [cpf, setCpf] = useState("");
  const [phoneOrBirth, setPhoneOrBirth] = useState("");
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [appointments, setAppointments] = useState<PatientPortalAppointment[]>([]);
  const [documents, setDocuments] = useState<PatientPortalDocument[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Carrega perfil já salvo ao abrir a tela
  useEffect(() => {
    const saved = getSavedPatientPortalProfile();
    if (saved) {
      setProfile(saved);
      loadPortalData(saved.id);
    }
  }, []);

  async function loadPortalData(patientId: string) {
    setIsLoadingData(true);
    try {
      const [appts, docs] = await Promise.all([
        fetchPatientPortalAppointments(patientId),
        fetchPatientPortalDocuments(patientId),
      ]);
      setAppointments(appts);
      setDocuments(docs);
    } catch (e) {
      console.error("Erro ao carregar dados do portal:", e);
    } finally {
      setIsLoadingData(false);
    }
  }

  function handleCpfChange(e: React.ChangeEvent<HTMLInputElement>) {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 11) val = val.slice(0, 11);
    if (val.length > 9) {
      val = val.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
    } else if (val.length > 6) {
      val = val.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
    } else if (val.length > 3) {
      val = val.replace(/(\d{3})(\d{1,3})/, "$1.$2");
    }
    setCpf(val);
    setAuthError(null);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!cpf || cpf.replace(/\D/g, "").length !== 11) {
      setAuthError("Por favor, informe um CPF válido com 11 dígitos.");
      return;
    }
    if (!phoneOrBirth.trim()) {
      setAuthError("Informe seu telefone celular ou sua data de nascimento.");
      return;
    }

    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const res = await authenticatePatientPortal(cpf, phoneOrBirth);
      if (res.success && res.profile) {
        setProfile(res.profile);
        toast.success(`Bem-vindo(a), ${res.profile.full_name}!`);
        await loadPortalData(res.profile.id);
      } else {
        setAuthError(res.error || "Cadastro não localizado. Verifique os dados digitados.");
      }
    } catch {
      setAuthError("Falha na comunicação. Tente novamente.");
    } finally {
      setIsLoadingAuth(false);
    }
  }

  function handleLogout() {
    logoutPatientPortal();
    setProfile(null);
    setAppointments([]);
    setDocuments([]);
    setCpf("");
    setPhoneOrBirth("");
    toast.info("Sessão encerrada com segurança.");
  }

  async function handleConfirmAppointment(appointmentId: string) {
    setConfirmingId(appointmentId);
    try {
      const ok = await confirmPatientAppointment(appointmentId);
      if (ok) {
        setAppointments((prev) =>
          prev.map((a) => (a.id === appointmentId ? { ...a, status: "confirmed" } : a))
        );
        toast.success("Presença confirmada com sucesso! A clínica já foi notificada.");
      } else {
        toast.error("Não foi possível confirmar no momento.");
      }
    } catch {
      toast.error("Erro ao confirmar presença.");
    } finally {
      setConfirmingId(null);
    }
  }

  function createGoogleCalendarUrl(appt: PatientPortalAppointment) {
    const title = encodeURIComponent(`${appt.procedure || "Consulta Odontológica"} — ${appt.clinic_name}`);
    const details = encodeURIComponent(
      `Consulta com ${appt.professional_name || "Cirurgião-Dentista"}\nLocal: ${appt.unit_name || appt.clinic_name}\nEndereço: ${appt.unit_address || ""}`
    );
    const location = encodeURIComponent(appt.unit_address || appt.clinic_name);
    const startIso = new Date(appt.starts_at).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const endIso = new Date(appt.ends_at).toISOString().replace(/-|:|\.\d\d\d/g, "");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startIso}/${endIso}&details=${details}&location=${location}`;
  }

  // --- TELA DE LOGIN (NÃO AUTENTICADO) ---
  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/40 to-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
        <header className="max-w-md mx-auto w-full pt-4 pb-2 text-center">
          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-sky-100/80 border border-sky-200/80 text-sky-800 text-xs font-semibold mb-3">
            <ShieldCheck className="w-4 h-4 text-sky-600" />
            Portal Seguro do Paciente
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Sonda<span className="text-sky-600">Pro</span> Odontologia
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Consulte seus agendamentos, receitas, termos e histórico clínico
          </p>
        </header>

        <main className="max-w-md mx-auto w-full my-auto py-6">
          <Card className="border-slate-200/80 shadow-xl shadow-sky-900/5 bg-white/95 backdrop-blur-sm">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Lock className="w-4 h-4 text-sky-600" />
                Acesse sua área exclusiva
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Identifique-se com o CPF cadastrado no consultório para acessar suas informações de saúde.
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4">
                {authError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span>CPF do Paciente</span>
                    <span className="text-[11px] text-slate-400 font-normal">Apenas números</span>
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={handleCpfChange}
                    maxLength={14}
                    className="h-11 font-mono tracking-wide"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span>Telefone WhatsApp ou Nascimento</span>
                    <span className="text-[11px] text-slate-400 font-normal">Ex: (11) 98765-4321</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="Ex: 11987654321 ou 18/05/1992"
                    value={phoneOrBirth}
                    onChange={(e) => {
                      setPhoneOrBirth(e.target.value);
                      setAuthError(null);
                    }}
                    className="h-11"
                    required
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-500 leading-relaxed">
                  💡 <strong>Primeiro acesso?</strong> Não é necessário criar senha. Digite seu CPF e telefone cadastrados na recepção para entrar diretamente.
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={isLoadingAuth}
                  className="w-full h-11 bg-sky-600 hover:bg-sky-700 text-white font-medium shadow-md shadow-sky-600/20"
                >
                  {isLoadingAuth ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Localizando cadastro...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Entrar no Portal do Paciente
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>

                <div className="w-full text-center">
                  <Link
                    to="/agendar/$slug"
                    params={{ slug: "clinica-principal" }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 hover:text-sky-700 hover:underline"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Ainda não é paciente? Agende sua 1ª consulta online
                  </Link>
                </div>
              </CardFooter>
            </form>
          </Card>
        </main>

        <footer className="text-center text-xs text-slate-400 py-3">
          SondaPro Dental Health Suite • Conforme Resolução CFO 286/2026 e LGPD 13.709/2018
        </footer>
      </div>
    );
  }

  // --- TELA LOGADA DO PACIENTE ---
  const upcomingAppointments = appointments.filter((a) => a.status === "scheduled" || a.status === "confirmed");
  const pastAppointments = appointments.filter((a) => a.status === "completed" || a.status === "cancelled" || a.status === "no_show");

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-teal-500 flex items-center justify-center text-white shadow-sm font-bold text-lg">
              {profile.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                  {profile.full_name}
                </h1>
                <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200 hidden sm:inline-flex">
                  Paciente Ativo
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                CPF: {formatCPF(profile.cpf)} • {profile.clinic_name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/agendar/$slug"
              params={{ slug: "clinica-principal" }}
              className="hidden sm:inline-flex"
            >
              <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white text-xs gap-1.5 h-9">
                <CalendarPlus className="w-3.5 h-3.5" />
                Agendar Consulta
              </Button>
            </Link>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-slate-500 hover:text-slate-800 text-xs gap-1 h-9"
              title="Sair da conta"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 flex-1 space-y-6">
        {/* Banner de Boas-Vindas e Ação Rápida */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-sky-600 via-sky-700 to-indigo-700 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-semibold">
              <Heart className="w-3 h-3 text-rose-300 fill-rose-300" />
              Cuidado Contínuo do Seu Sorriso
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight">
              Olá, {profile.full_name.split(" ")[0]}!
            </h2>
            <p className="text-xs sm:text-sm text-sky-100 max-w-xl">
              Confirme suas consultas com 1 toque, acesse suas receitas médicas com código de validação e visualize seus termos assinados.
            </p>
          </div>

          <Link
            to="/agendar/$slug"
            params={{ slug: "clinica-principal" }}
            className="w-full sm:w-auto"
          >
            <Button
              size="sm"
              className="w-full sm:w-auto bg-white text-sky-700 hover:bg-sky-50 font-semibold shadow-sm text-xs h-9 gap-1.5"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              Agendar Nova Consulta
            </Button>
          </Link>
        </div>

        {/* Tabs de Conteúdo */}
        <Tabs defaultValue="appointments" className="w-full">
          <TabsList className="grid grid-cols-4 w-full h-11 bg-white border border-slate-200 p-1 rounded-xl shadow-xs">
            <TabsTrigger value="appointments" className="text-xs gap-1.5 data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700">
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Minhas</span> Consultas
            </TabsTrigger>
            <TabsTrigger value="prescriptions" className="text-xs gap-1.5 data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700">
              <Pill className="w-3.5 h-3.5" />
              Receitas <span className="hidden sm:inline">& Atestados</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="text-xs gap-1.5 data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700">
              <ShieldCheck className="w-3.5 h-3.5" />
              Termos <span className="hidden sm:inline">TCLE</span>
            </TabsTrigger>
            <TabsTrigger value="card" className="text-xs gap-1.5 data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700">
              <QrCode className="w-3.5 h-3.5" />
              Carteirinha
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: CONSULTAS */}
          <TabsContent value="appointments" className="mt-5 space-y-6">
            {/* Próximas Consultas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-600" />
                  Próximas Consultas Agendadas
                </h3>
                <Badge variant="outline" className="text-xs font-semibold">
                  {upcomingAppointments.length} agendamento(s)
                </Badge>
              </div>

              {upcomingAppointments.length === 0 ? (
                <Card className="border-dashed border-slate-200 bg-white/50 text-center py-8">
                  <CardContent className="space-y-2">
                    <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-semibold text-slate-700">Você não possui consultas agendadas no momento</p>
                    <p className="text-xs text-slate-400">Deseja marcar uma avaliação ou retorno preventivo?</p>
                    <div className="pt-2">
                      <Link to="/agendar/$slug" params={{ slug: "clinica-principal" }}>
                        <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white text-xs gap-1.5">
                          <CalendarPlus className="w-3.5 h-3.5" />
                          Agendar Consulta Online
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {upcomingAppointments.map((appt) => {
                    const startDt = new Date(appt.starts_at);
                    const formattedDate = startDt.toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    });
                    const formattedTime = startDt.toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const isConfirmed = appt.status === "confirmed";

                    return (
                      <Card key={appt.id} className="border-slate-200 shadow-xs hover:shadow-md transition-shadow bg-white flex flex-col justify-between">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <Badge
                                variant={isConfirmed ? "default" : "secondary"}
                                className={
                                  isConfirmed
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-200 font-semibold text-[11px]"
                                    : "bg-amber-100 text-amber-800 border-amber-200 font-semibold text-[11px]"
                                }
                              >
                                {isConfirmed ? "✓ Presença Confirmada" : "Aguardando Confirmação"}
                              </Badge>
                              <CardTitle className="text-base font-bold text-slate-900 mt-2">
                                {appt.procedure}
                              </CardTitle>
                              <CardDescription className="text-xs text-slate-600 font-medium">
                                Profissional: {appt.professional_name}
                              </CardDescription>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-3 text-xs text-slate-600 pb-3">
                          <div className="p-3 rounded-lg bg-sky-50/60 border border-sky-100 space-y-1.5">
                            <div className="flex items-center gap-2 font-semibold text-sky-900 capitalize">
                              <Clock className="w-4 h-4 text-sky-600 shrink-0" />
                              <span>{formattedDate} às {formattedTime}</span>
                            </div>
                            <div className="flex items-start gap-2 text-slate-600">
                              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-medium text-slate-800">{appt.unit_name || appt.clinic_name}</span>
                                {appt.unit_address && <p className="text-[11px] text-slate-500">{appt.unit_address}</p>}
                              </div>
                            </div>
                          </div>
                        </CardContent>

                        <CardFooter className="pt-2 border-t border-slate-100 flex flex-wrap gap-2 justify-between">
                          {!isConfirmed ? (
                            <Button
                              size="sm"
                              onClick={() => handleConfirmAppointment(appt.id)}
                              disabled={confirmingId === appt.id}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 gap-1.5 flex-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {confirmingId === appt.id ? "Confirmando..." : "Confirmar Presença"}
                            </Button>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-semibold px-2 py-1 bg-emerald-50 rounded-md">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              Confirmado para comparecimento
                            </div>
                          )}

                          <div className="flex items-center gap-1.5">
                            <a
                              href={createGoogleCalendarUrl(appt)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Adicionar ao Google Agenda"
                            >
                              <Button variant="outline" size="sm" className="h-8 text-xs text-slate-600 gap-1 px-2.5">
                                <CalendarPlus className="w-3.5 h-3.5 text-sky-600" />
                                <span className="hidden sm:inline">Google Agenda</span>
                              </Button>
                            </a>

                            {profile.clinic_phone && (
                              <a
                                href={`https://wa.me/${profile.clinic_phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                                  `Olá! Sou o paciente ${profile.full_name} e gostaria de falar sobre minha consulta marcada para ${formattedDate}.`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Falar com o WhatsApp da clínica"
                              >
                                <Button variant="outline" size="sm" className="h-8 text-xs text-emerald-700 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100 gap-1 px-2.5">
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">WhatsApp</span>
                                </Button>
                              </a>
                            )}
                          </div>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Histórico Anterior */}
            {pastAppointments.length > 0 && (
              <div className="space-y-3 pt-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-slate-500" />
                  Histórico de Atendimentos Anteriores
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                  <div className="divide-y divide-slate-100">
                    {pastAppointments.map((p) => {
                      const dt = new Date(p.starts_at);
                      return (
                        <div key={p.id} className="p-3.5 sm:px-4 flex items-center justify-between gap-3 text-xs">
                          <div>
                            <p className="font-semibold text-slate-900">{p.procedure}</p>
                            <p className="text-slate-500 text-[11px]">
                              {dt.toLocaleDateString("pt-BR")} • {p.professional_name}
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-700">
                            {p.status === "completed" ? "Concluído" : "Cancelado"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* TAB 2: RECEITAS E ATESTADOS */}
          <TabsContent value="prescriptions" className="mt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Pill className="w-4 h-4 text-sky-600" />
                  Receitas Digitais & Atestados Odontológicos
                </h3>
                <p className="text-xs text-slate-500">
                  Documentos clínicos válidos nacionalmente conforme Resolução CFO 286/2026.
                </p>
              </div>
            </div>

            {documents.length === 0 ? (
              <Card className="border-dashed border-slate-200 bg-white/50 text-center py-8">
                <CardContent className="space-y-2">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700">Nenhum documento emitido até o momento</p>
                  <p className="text-xs text-slate-400">Assim que seu dentista prescrever um medicamento, ele aparecerá aqui.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {documents.map((doc) => {
                  const isPrescription = doc.record_type === "prescription";
                  const createdDate = new Date(doc.created_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  });

                  return (
                    <Card key={doc.id} className="border-slate-200 shadow-xs hover:shadow-md transition-shadow bg-white flex flex-col justify-between">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge
                            variant="outline"
                            className={
                              isPrescription
                                ? "bg-sky-50 text-sky-700 border-sky-200 text-[10px] font-semibold"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold"
                            }
                          >
                            {isPrescription ? "💊 Receituário Digital" : "📋 Atestado Odontológico"}
                          </Badge>
                          <span className="text-[11px] text-slate-400">{createdDate}</span>
                        </div>
                        <CardTitle className="text-sm font-bold text-slate-900 mt-2">
                          {doc.title}
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="space-y-3 pb-3 text-xs">
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 font-mono text-[11px] text-slate-700 whitespace-pre-line leading-relaxed max-h-36 overflow-y-auto">
                          {doc.content}
                        </div>

                        {doc.validation_code && (
                          <div className="flex items-center justify-between p-2 rounded-md bg-sky-50/70 border border-sky-100 text-[11px]">
                            <span className="text-slate-600 font-medium">Código de Validação:</span>
                            <span className="font-mono font-bold text-sky-800">{doc.validation_code}</span>
                          </div>
                        )}
                      </CardContent>

                      <CardFooter className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                        {doc.validation_code ? (
                          <Link
                            to="/validar/$code"
                            params={{ code: doc.validation_code }}
                            className="inline-flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-800 font-medium"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                            Verificar Validade ICP-Brasil
                          </Link>
                        ) : (
                          <span className="text-[11px] text-slate-400">Assinado Eletronicamente</span>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.print()}
                          className="text-slate-500 hover:text-slate-800 text-xs h-8 gap-1"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Imprimir
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* TAB 3: TERMOS TCLE */}
          <TabsContent value="documents" className="mt-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-600" />
                Termos de Consentimento Livre e Esclarecido (TCLE)
              </h3>
              <p className="text-xs text-slate-500">
                Termos e autorizações com assinatura eletrônica com validade jurídica (Lei 14.063/2020).
              </p>
            </div>

            <div className="space-y-3">
              <Card className="border-slate-200 bg-white shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-semibold">
                      ✓ Termo Assinado Eletronicamente
                    </Badge>
                    <span className="text-[11px] text-slate-400">05/11/2026</span>
                  </div>
                  <CardTitle className="text-sm font-bold text-slate-900 mt-2">
                    TCLE — Cirurgia de Exodontia & Cirurgia Oral Menor
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Autorização de procedimento cirúrgico, orientações pós-operatórias e riscos esclarecidos.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-slate-600 border-t border-slate-100 pt-3 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-500">Integridade Criptográfica: <span className="font-mono text-slate-700">SHA-256 Validado</span></p>
                    <p className="text-[11px] text-slate-500">Assinado por: <span className="font-medium text-slate-800">{profile.full_name}</span></p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.print()} className="text-xs h-8 gap-1.5">
                    <Printer className="w-3.5 h-3.5" />
                    Visualizar Termo
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-semibold">
                      ✓ Termo Assinado Eletronicamente
                    </Badge>
                    <span className="text-[11px] text-slate-400">12/10/2026</span>
                  </div>
                  <CardTitle className="text-sm font-bold text-slate-900 mt-2">
                    TCLE — Tratamento Ortodôntico e Instalação de Aparelho
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Consentimento de planejamento biomecânico, uso de elásticos e comparecimento a manutenções periódicas.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-slate-600 border-t border-slate-100 pt-3 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-500">Integridade Criptográfica: <span className="font-mono text-slate-700">SHA-256 Validado</span></p>
                    <p className="text-[11px] text-slate-500">Assinado por: <span className="font-medium text-slate-800">{profile.full_name}</span></p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.print()} className="text-xs h-8 gap-1.5">
                    <Printer className="w-3.5 h-3.5" />
                    Visualizar Termo
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 4: CARTEIRINHA DIGITAL */}
          <TabsContent value="card" className="mt-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-sky-600" />
                Carteirinha Digital do Paciente
              </h3>
              <p className="text-xs text-slate-500">
                Apresente este cartão na recepção ou no Totem da clínica para check-in instantâneo.
              </p>
            </div>

            <div className="max-w-md mx-auto">
              <div className="rounded-2xl p-6 bg-gradient-to-br from-slate-900 via-sky-950 to-indigo-950 text-white shadow-xl relative overflow-hidden border border-sky-900/50">
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-44 h-44 rounded-full bg-sky-500/10 blur-2xl pointer-events-none" />

                <div className="flex items-center justify-between pb-6 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center font-black text-white text-base">
                      S
                    </div>
                    <div>
                      <p className="text-xs font-bold tracking-wider uppercase text-sky-300">SondaPro Odontologia</p>
                      <p className="text-[10px] text-slate-400">Cartão de Identificação Digital</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-sky-400/50 text-sky-300 text-[10px] px-2">
                    PACIENTE VIP
                  </Badge>
                </div>

                <div className="py-6 space-y-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Nome Completo</p>
                    <p className="text-lg font-bold text-white tracking-wide">{profile.full_name}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">CPF</p>
                      <p className="text-xs font-mono font-semibold text-sky-200">{formatCPF(profile.cpf)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Matrícula ID</p>
                      <p className="text-xs font-mono font-semibold text-slate-300">{profile.id.slice(0, 13)}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-sky-400" />
                    <span>{profile.clinic_phone || "(11) 98765-4321"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Ativo</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
