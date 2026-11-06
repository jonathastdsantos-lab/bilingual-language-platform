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
  Download,
  Smartphone,
  Wifi,
  WifiOff,
  Copy,
  CreditCard,
  Smile,
  Star,
  BookOpen,
  HelpCircle,
  Send,
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
  fetchPatientPortalAlignerInfo,
  advancePatientAlignerPlate,
  fetchPatientPortalInvoices,
  checkInPatientArrival,
  getPatientPortalSettings,
  POST_OP_GUIDES,
  type PatientPortalProfile,
  type PatientPortalAppointment,
  type PatientPortalDocument,
  type PatientPortalAlignerInfo,
  type PatientPortalInvoice,
  type PostOpGuideItem,
} from "@/modules/patient-portal";
import { formatCPF } from "@/utils/validators";
import { formatCurrencyBRL } from "@/utils/timezone";
import { toast } from "sonner";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "App do Paciente — SondaPro Dental PWA" },
      {
        name: "description",
        content:
          "Seu aplicativo odontológico completo: consultas, acompanhamento de alinhadores, receitas digitais, pagamentos Pix e orientações pós-operatórias.",
      },
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

  // Dados do Paciente
  const [appointments, setAppointments] = useState<PatientPortalAppointment[]>([]);
  const [documents, setDocuments] = useState<PatientPortalDocument[]>([]);
  const [alignerInfo, setAlignerInfo] = useState<PatientPortalAlignerInfo | null>(null);
  const [invoices, setInvoices] = useState<PatientPortalInvoice[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInDoneMessage, setCheckInDoneMessage] = useState<string | null>(null);

  // NPS & Avaliação
  const [npsRating, setNpsRating] = useState<number | null>(null);
  const [npsFeedback, setNpsFeedback] = useState("");
  const [npsSubmitted, setNpsSubmitted] = useState(false);

  // Suporte a PWA & Conexão
  const [isOnline, setIsOnline] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  // Monitora conectividade e evento de instalação PWA
  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  // Carrega perfil já salvo ao abrir a tela
  useEffect(() => {
    const saved = getSavedPatientPortalProfile();
    if (saved) {
      setProfile(saved);
      loadPortalData(saved.clinic_id, saved.id);
    }
  }, []);

  async function loadPortalData(clinicId: string, patientId: string) {
    setIsLoadingData(true);
    try {
      const [appts, docs, aligner, invs] = await Promise.all([
        fetchPatientPortalAppointments(patientId),
        fetchPatientPortalDocuments(patientId),
        fetchPatientPortalAlignerInfo(clinicId, patientId),
        fetchPatientPortalInvoices(clinicId, patientId),
      ]);
      setAppointments(appts);
      setDocuments(docs);
      setAlignerInfo(aligner);
      setInvoices(invs);
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
        await loadPortalData(res.profile.clinic_id, res.profile.id);
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
    setAlignerInfo(null);
    setInvoices([]);
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

  // Check-in presencial no consultório
  async function handlePatientArrivalCheckin() {
    if (!profile) return;
    setIsCheckingIn(true);
    try {
      const res = await checkInPatientArrival(profile.clinic_id, profile.id, profile.full_name);
      setCheckInDoneMessage(res.message);
      toast.success("Check-in de chegada realizado com sucesso!");
    } catch {
      toast.error("Erro ao realizar check-in.");
    } finally {
      setIsCheckingIn(false);
    }
  }

  // Avançar placa do alinhador
  function handleAdvanceAligner() {
    if (!profile || !alignerInfo) return;
    advancePatientAlignerPlate(profile.clinic_id, profile.id);
    setAlignerInfo((prev) => {
      if (!prev) return null;
      const nextPlate = Math.min(prev.totalPlates, prev.currentPlateNumber + 1);
      return {
        ...prev,
        currentPlateNumber: nextPlate,
        progressPct: Math.round((nextPlate / prev.totalPlates) * 100),
        daysUntilNextChange: 10,
      };
    });
    toast.success("Parabéns! Nova placa registrada com sucesso no seu tratamento.");
  }

  // Copiar código Pix
  function handleCopyPix(code: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      toast.success("Código Pix Copia e Cola copiado! Abra o aplicativo do seu banco para pagar.");
    }
  }

  // Instalação PWA
  async function handleInstallPwa() {
    if (!deferredPrompt) {
      toast.info("Para instalar no iPhone/Safari, toque no botão Compartilhar e selecione 'Adicionar à Tela de Início'.");
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstallable(false);
      toast.success("Aplicativo instalado na tela inicial com sucesso!");
    }
    setDeferredPrompt(null);
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 flex flex-col justify-between p-4 sm:p-6 lg:p-8 text-white">
        <header className="max-w-md mx-auto w-full pt-6 pb-2 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal/20 border border-teal/40 text-teal-300 text-xs font-semibold mb-3 backdrop-blur-xs">
            <Smartphone className="w-3.5 h-3.5 text-teal-400" />
            App Web do Paciente (PWA)
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Sonda<span className="text-teal-400">Pro</span> Dental
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            Seu consultório odontológico na palma da mão
          </p>
        </header>

        <main className="max-w-md mx-auto w-full my-auto py-6">
          <Card className="border-slate-800 shadow-2xl bg-slate-900/90 backdrop-blur-md text-white">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
                <Lock className="w-4 h-4 text-teal-400" />
                Acesse sua área do paciente
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Identifique-se com o CPF cadastrado na clínica para ver consultas, alinhadores e receitas.
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4">
                {authError && (
                  <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>CPF do Paciente</span>
                    <span className="text-[11px] text-slate-500 font-normal">Apenas números</span>
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={handleCpfChange}
                    maxLength={14}
                    className="h-11 font-mono tracking-wide bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>Telefone WhatsApp ou Nascimento</span>
                    <span className="text-[11px] text-slate-500 font-normal">Ex: (11) 98765-4321</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="Ex: 11987654321 ou 18/05/1992"
                    value={phoneOrBirth}
                    onChange={(e) => {
                      setPhoneOrBirth(e.target.value);
                      setAuthError(null);
                    }}
                    className="h-11 bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500"
                    required
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 text-[11px] text-slate-400 leading-relaxed">
                  💡 <strong>Sem burocracia:</strong> Não precisa de senha. Digite seu CPF e telefone cadastrados na recepção para entrar diretamente no seu aplicativo.
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={isLoadingAuth}
                  className="w-full h-11 bg-teal hover:bg-teal-600 text-white font-bold shadow-lg shadow-teal/20 rounded-xl"
                >
                  {isLoadingAuth ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Localizando prontuário...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Entrar no App do Paciente
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>

                <div className="w-full text-center">
                  <Link
                    to="/agendar/$slug"
                    params={{ slug: "clinica-principal" }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-400 hover:text-teal-300 hover:underline"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Ainda não é paciente? Agende sua avaliação online
                  </Link>
                </div>
              </CardFooter>
            </form>
          </Card>
        </main>

        <footer className="text-center text-xs text-slate-500 py-3">
          SondaPro Dental • PWA em conformidade com Resolução CFO 286/2026 e LGPD 13.709/2018
        </footer>
      </div>
    );
  }

  // --- TELA LOGADA DO PACIENTE (APP WEB PWA) ---
  const upcomingAppointments = appointments.filter(
    (a) => a.status === "scheduled" || a.status === "confirmed"
  );
  const pastAppointments = appointments.filter(
    (a) => a.status === "completed" || a.status === "cancelled" || a.status === "no_show"
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* BANNER OFFLINE (SE A CONEXÃO CAIR) */}
      {!isOnline && (
        <div className="bg-amber-500 text-slate-900 px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 sticky top-0 z-50 shadow-sm">
          <WifiOff className="h-4 w-4" />
          <span>Modo Offline: Seus agendamentos e receitas continuam disponíveis pelo armazenamento local.</span>
        </div>
      )}

      {/* BANNER INSTALAR APLICATIVO PWA */}
      {isInstallable && (
        <div className="bg-gradient-to-r from-teal-700 via-teal-600 to-indigo-700 text-white px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 shrink-0 text-teal-200" />
            <span>Instale o App SondaPro no seu celular para acesso rápido em 1 toque!</span>
          </div>
          <Button
            size="sm"
            onClick={handleInstallPwa}
            className="h-7 px-3 bg-white text-teal-800 hover:bg-teal-50 font-bold text-xs rounded-lg shadow-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            Instalar App
          </Button>
        </div>
      )}

      {/* TOP HEADER BAR */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal to-teal-700 flex items-center justify-center text-white shadow-md font-bold text-lg">
              {profile.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-navy leading-tight">
                  {profile.full_name}
                </h1>
                <Badge variant="outline" className="text-[10px] bg-teal/10 text-teal border-teal/20 font-bold">
                  Paciente Ativo
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                CPF: {formatCPF(profile.cpf)} • {profile.clinic_name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Botão de Check-in Presencial Imediato */}
            <Button
              size="sm"
              onClick={handlePatientArrivalCheckin}
              disabled={isCheckingIn}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 h-9 rounded-xl font-bold shadow-xs"
              title="Avisar a recepção que você chegou na clínica"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cheguei na Clínica</span>
              <span className="sm:hidden">Cheguei</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-slate-500 hover:text-destructive text-xs gap-1 h-9 rounded-xl"
              title="Sair do aplicativo"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-5 flex-1 space-y-5">
        {/* Aviso de Confirmação de Check-in */}
        {checkInDoneMessage && (
          <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-900 text-xs flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="font-medium">{checkInDoneMessage}</span>
            </div>
            <button
              onClick={() => setCheckInDoneMessage(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold text-xs"
            >
              Fechar
            </button>
          </div>
        )}

        {/* HERO CARD DE SAUDAÇÃO & PRÓXIMA ETAPA */}
        <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-navy via-slate-900 to-teal-950 text-white shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-teal-300 text-[11px] font-bold">
              <Smile className="w-3.5 h-3.5 text-teal-300" />
              Seu Sorriso em Boas Mãos
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Olá, {profile.full_name.split(" ")[0]}! ✨
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
              Confirme consultas em 1 clique, acompanhe seus alinhadores, baixe receitas digitais e pague com Pix Copia e Cola direto do celular.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-col items-stretch gap-2 w-full sm:w-auto">
            <Link to="/agendar/$slug" params={{ slug: "clinica-principal" }} className="w-full sm:w-auto">
              <Button size="sm" className="w-full bg-teal hover:bg-teal-600 text-white font-bold text-xs h-9 rounded-xl gap-1.5 shadow-md">
                <CalendarPlus className="w-3.5 h-3.5" />
                Agendar Consulta
              </Button>
            </Link>

            {profile.clinic_phone && (
              <a
                href={`https://wa.me/${profile.clinic_phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                  `Olá! Sou o paciente ${profile.full_name} e gostaria de tirar uma dúvida pelo WhatsApp.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="w-full border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-emerald-400 font-bold text-xs h-9 rounded-xl gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp Clínica
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* NAVEGAÇÃO EM ABAS DO APP */}
        <Tabs defaultValue="appointments" className="w-full space-y-5">
          <TabsList className="grid grid-cols-6 w-full h-12 bg-white border border-slate-200 p-1 rounded-2xl shadow-xs">
            <TabsTrigger value="appointments" className="text-xs gap-1.5 data-[state=active]:bg-teal data-[state=active]:text-white rounded-xl font-bold">
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Consultas</span>
            </TabsTrigger>
            <TabsTrigger value="aligners" className="text-xs gap-1.5 data-[state=active]:bg-teal data-[state=active]:text-white rounded-xl font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Alinhadores</span>
            </TabsTrigger>
            <TabsTrigger value="prescriptions" className="text-xs gap-1.5 data-[state=active]:bg-teal data-[state=active]:text-white rounded-xl font-bold">
              <Pill className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Receitas</span>
            </TabsTrigger>
            <TabsTrigger value="invoices" className="text-xs gap-1.5 data-[state=active]:bg-teal data-[state=active]:text-white rounded-xl font-bold">
              <CreditCard className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Faturas / Pix</span>
            </TabsTrigger>
            <TabsTrigger value="postop" className="text-xs gap-1.5 data-[state=active]:bg-teal data-[state=active]:text-white rounded-xl font-bold">
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pós-Op</span>
            </TabsTrigger>
            <TabsTrigger value="card" className="text-xs gap-1.5 data-[state=active]:bg-teal data-[state=active]:text-white rounded-xl font-bold">
              <QrCode className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cartão</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: CONSULTAS */}
          <TabsContent value="appointments" className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-navy flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal" />
                Próximas Consultas Agendadas
              </h3>
              <Badge variant="outline" className="text-xs font-bold text-teal bg-teal/10 border-teal/20">
                {upcomingAppointments.length} agendamento(s)
              </Badge>
            </div>

            {upcomingAppointments.length === 0 ? (
              <Card className="border-dashed border-slate-300 bg-white text-center py-10 rounded-3xl">
                <CardContent className="space-y-3">
                  <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-navy">Você não possui consultas agendadas no momento</p>
                  <p className="text-xs text-muted-foreground">Que tal agendar sua consulta de rotina preventiva?</p>
                  <div className="pt-2">
                    <Link to="/agendar/$slug" params={{ slug: "clinica-principal" }}>
                      <Button size="sm" className="bg-teal hover:bg-teal-600 text-white text-xs font-bold gap-1.5 rounded-xl">
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
                    <Card key={appt.id} className="border-slate-200 shadow-sm bg-white rounded-3xl flex flex-col justify-between hover:shadow-md transition">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <Badge
                              className={
                                isConfirmed
                                  ? "bg-emerald-500/15 text-emerald-800 font-bold text-[11px]"
                                  : "bg-amber-500/15 text-amber-800 font-bold text-[11px]"
                              }
                            >
                              {isConfirmed ? "✓ Presença Confirmada" : "Aguardando Confirmação"}
                            </Badge>
                            <CardTitle className="text-base font-extrabold text-navy mt-2">
                              {appt.procedure}
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-600 font-medium">
                              Dr(a). {appt.professional_name}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-3 text-xs text-slate-600 pb-3">
                        <div className="p-3.5 rounded-2xl bg-teal/5 border border-teal/15 space-y-2">
                          <div className="flex items-center gap-2 font-bold text-navy capitalize">
                            <Clock className="w-4 h-4 text-teal shrink-0" />
                            <span>{formattedDate} às {formattedTime}</span>
                          </div>
                          <div className="flex items-start gap-2 text-slate-600">
                            <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold text-navy">{appt.unit_name || appt.clinic_name}</span>
                              {appt.unit_address && <p className="text-[11px] text-muted-foreground">{appt.unit_address}</p>}
                            </div>
                          </div>
                        </div>
                      </CardContent>

                      <CardFooter className="pt-3 border-t border-slate-100 flex flex-wrap gap-2 justify-between">
                        {!isConfirmed ? (
                          <Button
                            size="sm"
                            onClick={() => handleConfirmAppointment(appt.id)}
                            disabled={confirmingId === appt.id}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 gap-1.5 flex-1 rounded-xl font-bold"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {confirmingId === appt.id ? "Confirmando..." : "Confirmar Presença"}
                          </Button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 text-xs text-emerald-800 font-bold px-3 py-1.5 bg-emerald-50 rounded-xl">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Presença Confirmada
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          <a href={createGoogleCalendarUrl(appt)} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="h-9 text-xs rounded-xl gap-1">
                              <CalendarPlus className="w-3.5 h-3.5 text-teal" />
                              <span className="hidden sm:inline">Google Agenda</span>
                            </Button>
                          </a>
                        </div>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Histórico Anterior */}
            {pastAppointments.length > 0 && (
              <div className="space-y-3 pt-3">
                <h3 className="text-xs font-extrabold uppercase text-navy flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-teal" />
                  Histórico de Atendimentos Anteriores
                </h3>
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs divide-y divide-slate-100">
                  {pastAppointments.map((p) => {
                    const dt = new Date(p.starts_at);
                    return (
                      <div key={p.id} className="p-3.5 sm:px-4 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-bold text-navy">{p.procedure}</p>
                          <p className="text-muted-foreground text-[11px]">
                            {dt.toLocaleDateString("pt-BR")} • {p.professional_name}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          {p.status === "completed" ? "Concluído" : "Cancelado"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* TAB 2: ALINHADORES INVISÍVEIS */}
          <TabsContent value="aligners" className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-navy flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal" />
                  Meu Tratamento com Alinhadores Invisíveis
                </h3>
                <p className="text-xs text-muted-foreground">
                  Acompanhe sua evolução de placas, meta diária de uso e próximas trocas.
                </p>
              </div>
            </div>

            {alignerInfo && alignerInfo.hasTreatment ? (
              <div className="space-y-4">
                {/* Card de Progresso Principal */}
                <div className="rounded-3xl border-2 border-teal/20 bg-gradient-to-br from-teal/10 via-white to-slate-50 p-6 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
                    <div>
                      <Badge className="bg-teal text-white font-bold text-xs mb-1">
                        {alignerInfo.brand}
                      </Badge>
                      <h4 className="text-2xl font-black text-navy">
                        Placa {alignerInfo.currentPlateNumber} de {alignerInfo.totalPlates}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Você completou <strong>{alignerInfo.progressPct}%</strong> do seu plano de alinhamento!
                      </p>
                    </div>

                    <Button
                      type="button"
                      onClick={handleAdvanceAligner}
                      className="bg-teal hover:bg-teal-600 text-white font-bold rounded-2xl h-11 px-5 shadow-md gap-2"
                    >
                      <Check className="h-4 w-4" />
                      Troquei de Placa Hoje!
                    </Button>
                  </div>

                  {/* Barra de Progresso */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-navy">
                      <span>Início</span>
                      <span>Progresso: {alignerInfo.progressPct}%</span>
                      <span>Sorriso Alinhado ✨</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-teal to-emerald-500 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${alignerInfo.progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Indicadores em Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div className="bg-white p-3.5 rounded-2xl border shadow-xs space-y-1">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                        Próxima Troca
                      </span>
                      <span className="text-base font-extrabold text-navy">
                        Em {alignerInfo.daysUntilNextChange} dias
                      </span>
                      <span className="text-[11px] text-muted-foreground block">
                        Previsão: {new Date(alignerInfo.nextChangeDate).toLocaleDateString("pt-BR")}
                      </span>
                    </div>

                    <div className="bg-white p-3.5 rounded-2xl border shadow-xs space-y-1">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                        Meta de Uso Diário
                      </span>
                      <span className="text-base font-extrabold text-teal">
                        {alignerInfo.dailyWearHoursGoal} horas / dia
                      </span>
                      <span className="text-[11px] text-muted-foreground block">
                        Retire apenas para comer e escovar
                      </span>
                    </div>

                    <div className="bg-white p-3.5 rounded-2xl border shadow-xs space-y-1">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                        Placas Restantes
                      </span>
                      <span className="text-base font-extrabold text-indigo-600">
                        {alignerInfo.totalPlates - alignerInfo.currentPlateNumber} placas
                      </span>
                      <span className="text-[11px] text-muted-foreground block">
                        Mantenha a disciplina de uso!
                      </span>
                    </div>
                  </div>

                  {alignerInfo.iprNotice && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{alignerInfo.iprNotice}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <Card className="border-dashed border-slate-300 bg-white text-center py-8 rounded-3xl">
                <CardContent className="space-y-2">
                  <Sparkles className="w-8 h-8 text-teal mx-auto" />
                  <p className="text-sm font-bold text-navy">Sem alinhadores registrados</p>
                  <p className="text-xs text-muted-foreground">
                    Quando seu planejamento de alinhadores for cadastrado, você acompanhará suas placas aqui.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* TAB 3: RECEITAS E ATESTADOS */}
          <TabsContent value="prescriptions" className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-navy flex items-center gap-2">
                  <Pill className="w-4 h-4 text-teal" />
                  Receitas Digitais & Atestados Odontológicos
                </h3>
                <p className="text-xs text-muted-foreground">
                  Documentos válidos em farmácias e empresas de todo o Brasil (Resolução CFO 286/2026).
                </p>
              </div>
            </div>

            {documents.length === 0 ? (
              <Card className="border-dashed border-slate-300 bg-white text-center py-8 rounded-3xl">
                <CardContent className="space-y-2">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-navy">Nenhum documento emitido até o momento</p>
                  <p className="text-xs text-muted-foreground">
                    Assim que seu dentista prescrever uma receita ou emitir um atestado, ele aparecerá aqui.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {documents.map((doc) => {
                  const isPrescription = doc.record_type === "prescription";
                  const createdDate = new Date(doc.created_at).toLocaleDateString("pt-BR");

                  return (
                    <Card key={doc.id} className="border-slate-200 shadow-sm rounded-3xl bg-white flex flex-col justify-between hover:shadow-md transition">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge className={isPrescription ? "bg-teal/15 text-teal font-bold text-[10px]" : "bg-emerald-500/15 text-emerald-800 font-bold text-[10px]"}>
                            {isPrescription ? "💊 Receituário Digital" : "📋 Atestado Odontológico"}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">{createdDate}</span>
                        </div>
                        <CardTitle className="text-sm font-extrabold text-navy mt-2">
                          {doc.title}
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="space-y-3 pb-3 text-xs">
                        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-800 whitespace-pre-line leading-relaxed max-h-36 overflow-y-auto">
                          {doc.content}
                        </div>

                        {doc.validation_code && (
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-teal/5 border border-teal/20 text-[11px]">
                            <span className="text-slate-600 font-medium">Código de Validação:</span>
                            <span className="font-mono font-bold text-teal">{doc.validation_code}</span>
                          </div>
                        )}
                      </CardContent>

                      <CardFooter className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                        {doc.validation_code ? (
                          <Link to="/validar/$code" params={{ code: doc.validation_code }} className="inline-flex items-center gap-1.5 text-xs text-teal hover:underline font-bold">
                            <ShieldCheck className="w-3.5 h-3.5 text-teal" />
                            Validar ICP-Brasil
                          </Link>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Assinado Eletronicamente</span>
                        )}

                        <Button variant="ghost" size="sm" onClick={() => window.print()} className="text-slate-600 text-xs h-8 gap-1 rounded-xl">
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

          {/* TAB 4: FATURAS & PIX */}
          <TabsContent value="invoices" className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-navy flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-teal" />
                  Minhas Faturas & Pagamentos com Pix
                </h3>
                <p className="text-xs text-muted-foreground">
                  Pague com facilidade usando Pix Copia e Cola instantâneo ou código de barras de boleto.
                </p>
              </div>
            </div>

            {invoices.length === 0 ? (
              <Card className="border-dashed border-slate-300 bg-white text-center py-8 rounded-3xl">
                <CardContent className="space-y-2">
                  <CreditCard className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-navy">Nenhuma fatura em aberto</p>
                  <p className="text-xs text-muted-foreground">Você está em dia com seus pagamentos!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {invoices.map((inv) => {
                  const isPaid = inv.status === "paid";
                  return (
                    <Card key={inv.id} className="border-slate-200 shadow-sm rounded-3xl bg-white flex flex-col justify-between hover:shadow-md transition">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge className={isPaid ? "bg-emerald-500/15 text-emerald-800 font-bold" : "bg-amber-500/15 text-amber-800 font-bold"}>
                            {isPaid ? "✓ Liquidado / Pago" : "Aguardando Pagamento"}
                          </Badge>
                          <span className="text-xs font-bold text-navy">
                            {formatCurrencyBRL(inv.value)}
                          </span>
                        </div>
                        <CardTitle className="text-sm font-extrabold text-navy mt-1">
                          {inv.description}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">
                          Vencimento: {new Date(inv.dueDate).toLocaleDateString("pt-BR")}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="pt-2 pb-3">
                        {!isPaid && inv.pixCopyPasteCode && (
                          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                              Pix Copia e Cola:
                            </span>
                            <div className="font-mono text-[10px] break-all bg-white p-2 rounded-xl border line-clamp-2">
                              {inv.pixCopyPasteCode}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleCopyPix(inv.pixCopyPasteCode!)}
                              className="w-full bg-teal hover:bg-teal-600 text-white font-bold text-xs h-8 rounded-xl gap-1.5"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Copiar Código Pix
                            </Button>
                          </div>
                        )}
                      </CardContent>

                      {isPaid && (
                        <CardFooter className="pt-2 border-t border-slate-100 text-xs text-emerald-700 font-semibold">
                          <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
                          Pagamento confirmado no sistema
                        </CardFooter>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* TAB 5: MANUAIS PÓS-OPERATÓRIOS */}
          <TabsContent value="postop" className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-navy flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-teal" />
                  Manuais de Cuidados Pós-Operatórios & Dicas
                </h3>
                <p className="text-xs text-muted-foreground">
                  Consulte as recomendações de higiene, alimentação e repouso após seus procedimentos.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {POST_OP_GUIDES.map((guide) => (
                <Card key={guide.id} className="border-slate-200 shadow-sm rounded-3xl bg-white hover:shadow-md transition">
                  <CardHeader className="pb-2">
                    <Badge variant="outline" className="w-fit text-[10px] font-bold border-teal/30 text-teal mb-1">
                      {guide.category}
                    </Badge>
                    <CardTitle className="text-sm font-extrabold text-navy">
                      {guide.title}
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      {guide.summary}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-2 text-xs">
                    <div>
                      <span className="font-bold text-emerald-800 block mb-1">✓ O que você DEVE fazer:</span>
                      <ul className="list-disc pl-4 space-y-1 text-slate-700 text-[11px]">
                        {guide.recommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <span className="font-bold text-rose-800 block mb-1">⚠️ O que você NÃO deve fazer:</span>
                      <ul className="list-disc pl-4 space-y-1 text-slate-700 text-[11px]">
                        {guide.warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* TAB 6: CARTEIRINHA DIGITAL */}
          <TabsContent value="card" className="space-y-5">
            <div>
              <h3 className="text-sm font-extrabold text-navy flex items-center gap-2">
                <QrCode className="w-4 h-4 text-teal" />
                Carteirinha Digital do Paciente
              </h3>
              <p className="text-xs text-muted-foreground">
                Apresente este cartão na recepção ou no Totem da clínica para identificação rápida.
              </p>
            </div>

            <div className="max-w-md mx-auto">
              <div className="rounded-3xl p-6 bg-gradient-to-br from-slate-900 via-navy to-teal-950 text-white shadow-xl relative overflow-hidden border border-teal/20">
                <div className="flex items-center justify-between pb-5 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-teal flex items-center justify-center font-black text-white text-base">
                      S
                    </div>
                    <div>
                      <p className="text-xs font-bold tracking-wider uppercase text-teal-300">SondaPro Odontologia</p>
                      <p className="text-[10px] text-slate-400">Cartão de Identificação Digital</p>
                    </div>
                  </div>
                  <Badge className="bg-teal text-white text-[10px] font-bold">
                    PACIENTE VIP
                  </Badge>
                </div>

                <div className="py-5 space-y-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Nome Completo</p>
                    <p className="text-base font-extrabold text-white tracking-wide">{profile.full_name}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">CPF</p>
                      <p className="text-xs font-mono font-bold text-teal-200">{formatCPF(profile.cpf)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Matrícula</p>
                      <p className="text-xs font-mono font-bold text-slate-300">{profile.id.slice(0, 13)}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-teal-300" />
                    <span>{profile.clinic_phone || "(11) 98765-4321"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Cadastro Ativo</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* PESQUISA DE SATISFAÇÃO & NPS NO RODAPÉ */}
        <div className="rounded-3xl border bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <h4 className="text-xs font-extrabold uppercase text-navy">
                Como foi sua experiência no último atendimento?
              </h4>
            </div>
            {npsSubmitted && (
              <Badge className="bg-emerald-500/15 text-emerald-800 font-bold text-[10px]">
                ✓ Avaliação Registrada
              </Badge>
            )}
          </div>

          {!npsSubmitted ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setNpsRating(num)}
                    className={`w-8 h-8 rounded-xl font-bold text-xs transition ${
                      npsRating === num
                        ? "bg-teal text-white shadow-md scale-105"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>

              {npsRating !== null && (
                <div className="space-y-2 pt-1 animate-in fade-in">
                  <Input
                    placeholder="Deixe um comentário sobre o atendimento (opcional)..."
                    value={npsFeedback}
                    onChange={(e) => setNpsFeedback(e.target.value)}
                    className="text-xs rounded-xl"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setNpsSubmitted(true);
                        toast.success("Muito obrigado pelo seu feedback! Ele nos ajuda a evoluir.");
                      }}
                      className="bg-teal hover:bg-teal-600 text-white font-bold text-xs rounded-xl h-8 gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Enviar Avaliação
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Agradecemos sua avaliação! Se quiser, deixe também sua avaliação pública no Google para ajudar outros pacientes a conhecerem a clínica.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
