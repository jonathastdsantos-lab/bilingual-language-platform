import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles,
  CheckCircle2,
  Calendar,
  Clock,
  UserCheck,
  Building2,
  ArrowRight,
  Wifi,
  DoorOpen,
  Smartphone,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import {
  performPatientCheckin,
  getTvSettings,
  isValidUuid,
  PatientCheckinResult,
} from "@/modules/waiting-room";
import { supabase } from "@/services/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/checkin")({
  validateSearch: (search: Record<string, unknown>) => {
    let clinicId: string | undefined = undefined;
    for (const key of ["clinicId", "dinicId", "clinic_id", "dinic_id", "clinic", "id", "c"]) {
      const val = search[key];
      if (typeof val === "string" && val.trim().length > 0) {
        clinicId = val.trim();
        break;
      }
    }
    return { clinicId };
  },
  head: () => ({
    meta: [
      { title: "Auto Check-in da Sala de Espera — SondaPro" },
      { name: "description", content: "Confirme sua chegada na recepção de forma rápida pelo celular ou totem." },
    ],
  }),
  component: PatientCheckinPage,
});

export function PatientCheckinPage() {
  const search = Route.useSearch() as { clinicId?: string };
  const clinicId = search?.clinicId;
  const [identifier, setIdentifier] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<PatientCheckinResult | null>(null);
  const [clinicName, setClinicName] = useState("SondaPro Odontologia");
  const [effectiveClinicId, setEffectiveClinicId] = useState(clinicId || "");

  // Descobre a clínica pela URL ou storage
  useEffect(() => {
    let activeId = clinicId;
    if (!activeId && typeof window !== "undefined") {
      const stored = localStorage.getItem("sondapro.clinic");
      if (stored && isValidUuid(stored)) activeId = stored;
    }

    if (activeId && isValidUuid(activeId)) {
      setEffectiveClinicId(activeId);
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
    }
  }, [clinicId]);

  const tvSettings = getTvSettings(effectiveClinicId);

  // Formata automaticamente CPF ou Celular enquanto o paciente digita
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (raw.length <= 11) {
      if (raw.length > 9) {
        // Formato CPF
        setIdentifier(raw.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4"));
      } else if (raw.length > 6) {
        setIdentifier(raw.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3"));
      } else if (raw.length > 3) {
        setIdentifier(raw.replace(/(\d{3})(\d{1,3})/, "$1.$2"));
      } else {
        setIdentifier(raw);
      }
    } else {
      setIdentifier(raw.slice(0, 11));
    }
  };

  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      toast.error("Por favor, digite seu CPF ou número de celular.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await performPatientCheckin(effectiveClinicId || "9605e213-26af-441b-bc60-29c655c95590", identifier);
      setResult(res);
      if (res.success) {
        toast.success("Check-in realizado com sucesso!");
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Erro ao realizar check-in. Por favor, fale com a recepção.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setIdentifier("");
    setResult(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 text-slate-100 flex flex-col justify-between p-4 sm:p-8 select-none">
      {/* Topo / Header da Clínica */}
      <header className="max-w-md w-full mx-auto flex items-center justify-between pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 to-cyan-500 text-white shadow-lg shadow-sky-500/20">
            <Sparkles className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white uppercase truncate max-w-[220px]">
              {clinicName}
            </h1>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
              Totem & Auto Check-in
            </p>
          </div>
        </div>

        <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 bg-emerald-950/60 text-[10px] gap-1 py-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Recepção Ativa
        </Badge>
      </header>

      {/* Conteúdo Central: Card de Check-in OU Sucesso */}
      <main className="max-w-md w-full mx-auto my-auto py-8">
        {result?.success ? (
          /* TELA DE SUCESSO DO CHECK-IN */
          <Card className="border-emerald-500/40 bg-slate-900/90 text-slate-100 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-300">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 mb-3 shadow-lg">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              </div>
              <CardTitle className="text-2xl font-black text-white">
                Presença Confirmada!
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-1">
                Sua chegada foi registrada com sucesso no sistema da clínica.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 text-xs pt-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Paciente
                  </span>
                  <p className="text-base font-extrabold text-white capitalize mt-0.5">
                    {result.patientName}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      Profissional
                    </span>
                    <p className="font-semibold text-slate-200 mt-0.5">
                      {result.professionalName}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      Local
                    </span>
                    <p className="font-semibold text-sky-300 mt-0.5">
                      {result.roomName}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-sky-500/30 bg-sky-950/30 p-3.5 flex items-start gap-3">
                <DoorOpen className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                <p className="text-slate-300 text-xs leading-relaxed">
                  Por favor, <strong>tome assento na sala de espera</strong>. Fique atento ao <strong>painel da TV</strong>, seu nome será anunciado assim que o consultório estiver pronto.
                </p>
              </div>

              {tvSettings.showWifiQr && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-emerald-400" />
                    <div>
                      <p className="font-bold text-slate-200">Wi-Fi Disponível</p>
                      <p className="text-[10px] text-slate-400">Rede: {tvSettings.wifiNetworkName}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px]">
                    Senha: {tvSettings.wifiPassword}
                  </Badge>
                </div>
              )}
            </CardContent>

            <CardFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 border-slate-700 bg-slate-800/70 hover:bg-slate-800 text-white font-semibold text-xs gap-2"
                onClick={handleReset}
              >
                <RefreshCw className="w-4 h-4 text-sky-400" />
                <span>Realizar Check-in de Outro Paciente</span>
              </Button>
            </CardFooter>
          </Card>
        ) : (
          /* FORMULÁRIO DE IDENTIFICAÇÃO */
          <Card className="border-slate-800 bg-slate-900/90 text-slate-100 shadow-2xl backdrop-blur-xl">
            <CardHeader className="text-center pb-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30 mb-2">
                <Smartphone className="h-7 w-7 text-sky-400" />
              </div>
              <CardTitle className="text-xl font-black text-white">
                Auto Check-in da Recepção
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Digite seu CPF ou número de celular para confirmar sua presença na consulta de hoje sem filas no balcão.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <form onSubmit={handleCheckin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-sky-400" />
                    <span>Seu CPF ou Celular Cadastrado</span>
                  </label>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    placeholder="Ex: 123.456.789-00 ou (11) 98765-4321"
                    value={identifier}
                    onChange={handleInputChange}
                    className="h-12 bg-slate-950/80 border-slate-700 text-white text-base font-mono font-bold tracking-wide focus:border-sky-400 placeholder:text-slate-600 text-center"
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-500 text-center pt-0.5">
                    Seus dados são protegidos em conformidade com a LGPD.
                  </p>
                </div>

                {result && !result.success && (
                  <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-950/30 text-rose-200 text-xs flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{result.message}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting || !identifier.trim()}
                  className="w-full h-12 bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 text-white font-extrabold text-sm gap-2 shadow-lg shadow-sky-600/30 transition"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verificando Consulta...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>Confirmar Minha Chegada</span>
                    </>
                  )}
                </Button>
              </form>
            </CardContent>

            <CardFooter className="flex flex-col gap-2 pt-2 border-t border-slate-800/80 text-center">
              <p className="text-[11px] text-slate-500">
                Primeira vez na clínica ou precisa de ajuda? Fale com nossa recepcionista no balcão.
              </p>
              <div className="flex items-center justify-center gap-3 text-xs text-sky-400 pt-1">
                <Link to="/portal" search={{ clinicId: effectiveClinicId }} className="hover:underline flex items-center gap-1">
                  <span>Acessar Portal do Paciente</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardFooter>
          </Card>
        )}
      </main>

      {/* Rodapé institucional */}
      <footer className="max-w-md w-full mx-auto text-center border-t border-slate-900 pt-4 text-[11px] text-slate-600">
        <p>SondaPro Odontologia · Tecnologia em Saúde e Recepção Inteligente</p>
      </footer>
    </div>
  );
}
