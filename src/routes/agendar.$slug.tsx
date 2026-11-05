import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  CalendarCheck,
  AlertCircle,
  Building2,
  Stethoscope,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ExternalLink,
  MessageCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchPublicClinicBookingData,
  fetchAvailableBookingSlots,
  submitPublicBooking,
  generateGoogleCalendarUrl,
  generateBookingWhatsAppMessage,
} from "@/modules/online-booking";
import { formatCPF, isValidCPF } from "@/utils/validators";

export const Route = createFileRoute("/agendar/$slug")({
  head: () => ({
    meta: [
      { title: "Agendamento Online de Consulta — SondaPro" },
      {
        name: "description",
        content:
          "Agende sua consulta odontológica online de forma rápida, prática e segura.",
      },
    ],
  }),
  component: PublicOnlineBookingPage,
});

function PublicOnlineBookingPage() {
  const { slug } = Route.useParams();

  // Estados do formulário de agendamento
  const [step, setStep] = useState<number>(1);
  const [selectedProcedure, setSelectedProcedure] = useState<string>("");
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0] || ""
  );
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [patientName, setPatientName] = useState<string>("");
  const [patientCpf, setPatientCpf] = useState<string>("");
  const [patientPhone, setPatientPhone] = useState<string>("");
  const [patientEmail, setPatientEmail] = useState<string>("");
  const [patientNotes, setPatientNotes] = useState<string>("");

  const [cpfError, setCpfError] = useState<string>("");
  const [bookingSuccess, setBookingSuccess] = useState<any>(null);

  // Consulta de dados da clínica
  const { data: clinicData, isLoading: isLoadingClinic } = useQuery({
    queryKey: ["publicClinicBookingData", slug],
    queryFn: () => fetchPublicClinicBookingData(slug),
  });

  // Consulta de horários disponíveis
  const {
    data: availableSlots = [],
    isLoading: isLoadingSlots,
    refetch: refetchSlots,
  } = useQuery({
    queryKey: [
      "availableSlots",
      clinicData?.clinic_id,
      selectedProfessionalId,
      selectedDate,
    ],
    queryFn: () =>
      clinicData?.clinic_id
        ? fetchAvailableBookingSlots(
            clinicData.clinic_id,
            selectedProfessionalId || null,
            selectedDate
          )
        : Promise.resolve([]),
    enabled: Boolean(clinicData?.clinic_id && clinicData.valid && selectedDate),
  });

  // Mutação de envio de agendamento
  const bookingMutation = useMutation({
    mutationFn: async () => {
      if (!clinicData?.clinic_id) throw new Error("Clínica inválida.");
      const unitId =
        selectedUnitId ||
        clinicData.units?.[0]?.id ||
        "";
      if (!unitId) throw new Error("Unidade de atendimento não selecionada.");

      const startsAt = `${selectedDate}T${selectedTime}:00`;

      const result = await submitPublicBooking({
        clinic_id: clinicData.clinic_id,
        unit_id: unitId,
        professional_id: selectedProfessionalId || null,
        procedure: selectedProcedure || "Avaliação Odontológica",
        starts_at: startsAt,
        patient_name: patientName,
        patient_cpf: patientCpf ? patientCpf.replace(/\D/g, "") : null,
        patient_phone: patientPhone,
        patient_email: patientEmail || null,
        notes: patientNotes || null,
      });

      if (!result.success) {
        throw new Error(result.error || "Erro ao confirmar agendamento.");
      }

      return result;
    },
    onSuccess: (data) => {
      setBookingSuccess(data);
    },
  });

  if (isLoadingClinic) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
          <Clock className="mx-auto mb-2 h-8 w-8 animate-spin text-teal" />
          <p className="text-sm font-semibold text-slate-700">
            Carregando agenda online da clínica...
          </p>
        </div>
      </div>
    );
  }

  if (!clinicData || !clinicData.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full rounded-2xl border bg-white p-8 text-center shadow-card space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-extrabold text-navy">
            Agendamento Indisponível
          </h1>
          <p className="text-sm text-muted-foreground">
            {clinicData?.error ||
              "Não foi possível localizar as informações da clínica para agendamento online."}
          </p>
        </div>
      </div>
    );
  }

  // Se concluído com sucesso
  if (bookingSuccess) {
    const selectedUnit = clinicData.units?.find((u) => u.id === selectedUnitId);
    const selectedPro = clinicData.professionals?.find(
      (p) => p.id === selectedProfessionalId
    );

    const startsAtIso = `${selectedDate}T${selectedTime}:00`;
    const durMin = clinicData.slot_duration_minutes || 30;
    const endsDateObj = new Date(new Date(startsAtIso).getTime() + durMin * 60000);
    const endsAtIso = endsDateObj.toISOString();

    const gcalUrl = generateGoogleCalendarUrl({
      title: selectedProcedure || "Consulta Odontológica",
      clinicName: clinicData.clinic_name || "Clínica Odontológica",
      address: selectedUnit?.address || null,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      details: `Agendamento confirmado via SondaPro.\nProcedimento: ${selectedProcedure}\nProfissional: ${selectedPro?.name || "Corpo Clínico"}`,
    });

    const clinicPhoneClean = selectedUnit?.phone?.replace(/\D/g, "") || "";
    const waText = generateBookingWhatsAppMessage({
      clinicName: clinicData.clinic_name || "Clínica Odontológica",
      patientName,
      procedure: selectedProcedure || "Avaliação",
      startsAt: startsAtIso,
      professionalName: selectedPro?.name || null,
    });
    const waUrl = clinicPhoneClean
      ? `https://wa.me/55${clinicPhoneClean}?text=${waText}`
      : null;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal/5 to-navy/5 p-4 sm:p-8 flex items-center justify-center">
        <div className="max-w-xl w-full rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-xl space-y-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-teal/10 text-teal shadow-inner">
            <CheckCircle2 className="h-12 w-12" />
          </div>

          <div>
            <Badge className="bg-emerald-500/10 text-emerald-700 font-semibold mb-2">
              Consulta Confirmada
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-navy">
              Agendamento Realizado!
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Obrigado, <strong className="text-navy">{patientName}</strong>. Sua
              consulta foi agendada na{" "}
              <strong className="text-teal">{clinicData.clinic_name}</strong>.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 text-left space-y-3">
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <CalendarCheck className="h-5 w-5 text-teal shrink-0" />
              <span>
                <strong>Data e Horário:</strong>{" "}
                {new Date(startsAtIso).toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}{" "}
                às <strong>{selectedTime}</strong>
              </span>
            </div>

            <div className="flex items-center gap-3 text-sm text-slate-700">
              <Sparkles className="h-5 w-5 text-teal shrink-0" />
              <span>
                <strong>Procedimento:</strong> {selectedProcedure}
              </span>
            </div>

            {selectedPro && (
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Stethoscope className="h-5 w-5 text-teal shrink-0" />
                <span>
                  <strong>Cirurgião-Dentista:</strong> {selectedPro.name}
                  {selectedPro.cro ? ` (CRO ${selectedPro.cro})` : ""}
                </span>
              </div>
            )}

            {selectedUnit && (
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <MapPin className="h-5 w-5 text-teal shrink-0" />
                <span>
                  <strong>Unidade:</strong> {selectedUnit.name}
                  {selectedUnit.address ? ` — ${selectedUnit.address}` : ""}
                </span>
              </div>
            )}
          </div>

          {clinicData.instructions && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs text-blue-900 text-left">
              <strong>Orientações da Clínica:</strong>
              <p className="mt-0.5">{clinicData.instructions}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              asChild
              className="flex-1 bg-teal hover:bg-teal-600 text-white font-bold"
            >
              <a href={gcalUrl} target="_blank" rel="noopener noreferrer">
                <Calendar className="mr-2 h-4 w-4" />
                Adicionar ao Google Agenda
              </a>
            </Button>

            {waUrl && (
              <Button
                asChild
                variant="outline"
                className="flex-1 border-emerald-500 text-emerald-700 hover:bg-emerald-50"
              >
                <a href={waUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4 text-emerald-600" />
                  Abrir no WhatsApp
                </a>
              </Button>
            )}
          </div>

          <div className="border-t pt-4 text-xs text-muted-foreground">
            SondaPro • Plataforma de Gestão e Saúde Integrada
          </div>
        </div>
      </div>
    );
  }

  // Procedimentos padrão ou configurados
  const procedures = clinicData.available_procedures && clinicData.available_procedures.length > 0
    ? clinicData.available_procedures
    : [
        "Avaliação Odontológica Geral",
        "Limpeza / Profilaxia Dental",
        "Urgência Odontológica / Dor",
        "Avaliação para Aparelho / Ortodontia",
        "Avaliação de Implantes / Prótese",
        "Clareamento Dental",
      ];

  const handleNextStep1 = () => {
    if (!selectedProcedure) return;
    setStep(2);
  };

  const handleNextStep2 = () => {
    setStep(3);
  };

  const handleNextStep3 = () => {
    if (!selectedDate || !selectedTime) return;
    setStep(4);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (patientCpf && !isValidCPF(patientCpf)) {
      setCpfError("CPF inválido. Por favor, verifique os dígitos.");
      return;
    }
    setCpfError("");
    bookingMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-teal via-navy to-teal" />
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              Agendamento Online Aberto
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-navy">
            {clinicData.clinic_name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Escolha o procedimento, data e horário ideais para o seu atendimento.
          </p>

          {/* Stepper Indicator */}
          <div className="flex items-center justify-center gap-2 sm:gap-4 mt-6 text-xs font-semibold">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                step === 1
                  ? "bg-teal text-white"
                  : step > 1
                  ? "bg-teal/10 text-teal"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                1
              </span>
              <span>Procedimento</span>
            </div>

            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />

            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                step === 2
                  ? "bg-teal text-white"
                  : step > 2
                  ? "bg-teal/10 text-teal"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                2
              </span>
              <span>Profissional</span>
            </div>

            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />

            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                step === 3
                  ? "bg-teal text-white"
                  : step > 3
                  ? "bg-teal/10 text-teal"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                3
              </span>
              <span>Horário</span>
            </div>

            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />

            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                step === 4
                  ? "bg-teal text-white"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                4
              </span>
              <span>Seus Dados</span>
            </div>
          </div>
        </div>

        {/* Card principal com o conteúdo da etapa */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          {/* ETAPA 1: Procedimento */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-navy flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-teal" />
                  Qual o motivo ou procedimento do seu atendimento?
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Selecione uma das opções disponíveis na clínica para iniciarmos.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {procedures.map((proc) => {
                  const isSelected = selectedProcedure === proc;
                  return (
                    <button
                      key={proc}
                      type="button"
                      onClick={() => setSelectedProcedure(proc)}
                      className={`text-left p-4 rounded-2xl border-2 transition-all flex items-start gap-3 ${
                        isSelected
                          ? "border-teal bg-teal/5 shadow-sm text-navy font-semibold"
                          : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/50 text-slate-700"
                      }`}
                    >
                      <div
                        className={`p-2 rounded-xl shrink-0 ${
                          isSelected
                            ? "bg-teal text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        <Stethoscope className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold">{proc}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {clinicData.slot_duration_minutes || 30} minutos •
                          Atendimento humanizado
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button
                  type="button"
                  onClick={handleNextStep1}
                  disabled={!selectedProcedure}
                  className="bg-teal hover:bg-teal-600 text-white font-bold"
                >
                  Continuar
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ETAPA 2: Unidade & Profissional */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-navy flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-teal" />
                  Onde e com quem você deseja ser atendido?
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Escolha a unidade mais próxima e o cirurgião-dentista da sua preferência.
                </p>
              </div>

              {/* Unidades */}
              {clinicData.units && clinicData.units.length > 1 && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">
                    Unidade de Atendimento:
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {clinicData.units.map((unit) => {
                      const isSel = selectedUnitId === unit.id;
                      return (
                        <button
                          key={unit.id}
                          type="button"
                          onClick={() => setSelectedUnitId(unit.id)}
                          className={`text-left p-3.5 rounded-2xl border-2 transition-all ${
                            isSel
                              ? "border-teal bg-teal/5 text-navy font-semibold"
                              : "border-slate-100 bg-white hover:border-slate-200 text-slate-700"
                          }`}
                        >
                          <div className="text-sm font-bold">{unit.name}</div>
                          {unit.address && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <MapPin className="h-3 w-3" />
                              {unit.address}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Profissionais */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">
                  Cirurgião-Dentista:
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Opção qualquer profissional */}
                  <button
                    type="button"
                    onClick={() => setSelectedProfessionalId("")}
                    className={`text-left p-3.5 rounded-2xl border-2 transition-all ${
                      selectedProfessionalId === ""
                        ? "border-teal bg-teal/5 text-navy font-semibold"
                        : "border-slate-100 bg-white hover:border-slate-200 text-slate-700"
                    }`}
                  >
                    <div className="text-sm font-bold">
                      Primeiro Horário Disponível
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Qualquer dentista qualificado da equipe
                    </div>
                  </button>

                  {clinicData.professionals?.map((pro) => {
                    const isSel = selectedProfessionalId === pro.id;
                    return (
                      <button
                        key={pro.id}
                        type="button"
                        onClick={() => setSelectedProfessionalId(pro.id)}
                        className={`text-left p-3.5 rounded-2xl border-2 transition-all ${
                          isSel
                            ? "border-teal bg-teal/5 text-navy font-semibold"
                            : "border-slate-100 bg-white hover:border-slate-200 text-slate-700"
                        }`}
                      >
                        <div className="text-sm font-bold">{pro.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {pro.specialty || "Cirurgião-Dentista"}{" "}
                          {pro.cro ? `• CRO ${pro.cro}` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-between pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <Button
                  type="button"
                  onClick={handleNextStep2}
                  className="bg-teal hover:bg-teal-600 text-white font-bold"
                >
                  Continuar
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ETAPA 3: Data e Horário */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-navy flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-teal" />
                  Escolha o dia e o horário da sua consulta
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Os horários abaixo são atualizados em tempo real conforme a disponibilidade da clínica.
                </p>
              </div>

              {/* Seletor de Data */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">
                  Selecione a Data:
                </Label>
                <Input
                  type="date"
                  value={selectedDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedTime("");
                  }}
                  className="w-full sm:w-64 font-semibold text-navy"
                />
              </div>

              {/* Grade de Horários */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-700">
                    Horários Disponíveis ({selectedDate}):
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    Duração média: {clinicData.slot_duration_minutes || 30} min
                  </span>
                </div>

                {isLoadingSlots ? (
                  <div className="p-8 text-center border rounded-2xl bg-slate-50">
                    <Clock className="h-6 w-6 animate-spin text-teal mx-auto mb-2" />
                    <p className="text-xs text-slate-600">
                      Verificando horários livres na agenda...
                    </p>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="p-8 text-center border border-dashed rounded-2xl bg-slate-50/50 space-y-2">
                    <AlertCircle className="h-6 w-6 text-amber-500 mx-auto" />
                    <p className="text-sm font-semibold text-slate-700">
                      Nenhum horário livre nesta data
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Por favor, selecione outra data acima ou outro profissional.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1">
                    {availableSlots.map((time) => {
                      const isSelected = selectedTime === time;
                      return (
                        <button
                          key={time}
                          type="button"
                          onClick={() => setSelectedTime(time)}
                          className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all border ${
                            isSelected
                              ? "bg-teal text-white border-teal shadow-md"
                              : "bg-white border-slate-200 text-slate-700 hover:border-teal/50 hover:bg-teal/5"
                          }`}
                        >
                          {time}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(2)}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <Button
                  type="button"
                  onClick={handleNextStep3}
                  disabled={!selectedTime}
                  className="bg-teal hover:bg-teal-600 text-white font-bold"
                >
                  Continuar
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ETAPA 4: Dados do Paciente e Confirmação */}
          {step === 4 && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-navy flex items-center gap-2">
                  <User className="h-5 w-5 text-teal" />
                  Seus dados para confirmar a reserva
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Informe suas informações para que a clínica prepare sua ficha de atendimento.
                </p>
              </div>

              {/* Resumo visual do agendamento */}
              <div className="rounded-2xl border border-teal/20 bg-teal/5 p-4 text-xs space-y-1.5 text-navy">
                <div className="font-bold text-teal text-sm flex items-center gap-1.5">
                  <CalendarCheck className="h-4 w-4" /> Resumo do seu Agendamento:
                </div>
                <div>
                  <strong>Procedimento:</strong> {selectedProcedure}
                </div>
                <div>
                  <strong>Data e Horário:</strong> {selectedDate} às {selectedTime}
                </div>
                {selectedProfessionalId && (
                  <div>
                    <strong>Profissional:</strong>{" "}
                    {
                      clinicData.professionals?.find(
                        (p) => p.id === selectedProfessionalId
                      )?.name
                    }
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">
                    Nome Completo *
                  </Label>
                  <Input
                    required
                    placeholder="Ex: Mariana Silva Rodrigues"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">
                    CPF (opcional, agiliza a ficha)
                  </Label>
                  <Input
                    placeholder="000.000.000-00"
                    value={patientCpf}
                    onChange={(e) => {
                      setPatientCpf(formatCPF(e.target.value));
                      setCpfError("");
                    }}
                  />
                  {cpfError && (
                    <p className="text-[11px] text-destructive font-semibold">
                      {cpfError}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">
                    Celular / WhatsApp *
                  </Label>
                  <Input
                    required
                    placeholder="(11) 99999-9999"
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">
                    E-mail (para confirmação)
                  </Label>
                  <Input
                    type="email"
                    placeholder="seu.email@exemplo.com"
                    value={patientEmail}
                    onChange={(e) => setPatientEmail(e.target.value)}
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">
                    Observações ou sintomas (opcional)
                  </Label>
                  <Textarea
                    placeholder="Ex: Sinto sensibilidade ao beber água gelada no molar inferior..."
                    rows={2}
                    value={patientNotes}
                    onChange={(e) => setPatientNotes(e.target.value)}
                  />
                </div>
              </div>

              {bookingMutation.isError && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    {(bookingMutation.error as Error)?.message ||
                      "Não foi possível concluir o agendamento."}
                  </span>
                </div>
              )}

              <div className="flex justify-between pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(3)}
                  disabled={bookingMutation.isPending}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !patientName.trim() ||
                    !patientPhone.trim() ||
                    bookingMutation.isPending
                  }
                  className="bg-teal hover:bg-teal-600 text-white font-bold px-6"
                >
                  {bookingMutation.isPending ? (
                    <>
                      <Clock className="mr-2 h-4 w-4 animate-spin" />
                      Confirmando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Confirmar Agendamento
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

