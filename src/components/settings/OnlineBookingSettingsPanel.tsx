import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Globe,
  Copy,
  ExternalLink,
  CheckCircle2,
  Clock,
  Sparkles,
  Save,
  AlertCircle,
  QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  fetchClinicBookingSettings,
  updateClinicBookingSettings,
  generateBookingLink,
} from "@/modules/online-booking";
import { supabase } from "@/services/supabase";

interface OnlineBookingSettingsPanelProps {
  clinicId: string;
  clinicSlug?: string | null | undefined;
  canManage: boolean;
}

export function OnlineBookingSettingsPanel({
  clinicId,
  clinicSlug,
  canManage,
}: OnlineBookingSettingsPanelProps) {
  const qc = useQueryClient();

  const [slug, setSlug] = useState<string>(clinicSlug || "");
  const [enabled, setEnabled] = useState<boolean>(true);
  const [autoConfirm, setAutoConfirm] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(30);
  const [startHour, setStartHour] = useState<string>("08:00");
  const [endHour, setEndHour] = useState<string>("18:00");
  const [proceduresText, setProceduresText] = useState<string>("");
  const [instructions, setInstructions] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);

  // Consulta slug da clínica se não passado
  const { data: clinicData } = useQuery({
    queryKey: ["clinicSlug", clinicId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clinics")
        .select("name, slug")
        .eq("id", clinicId)
        .single();
      return data;
    },
  });

  const effectiveSlug = slug || clinicData?.slug || clinicId;
  const publicLink = generateBookingLink(effectiveSlug);

  // Consulta configurações existentes
  const { data: settings, isLoading } = useQuery({
    queryKey: ["clinicBookingSettings", clinicId],
    queryFn: () => fetchClinicBookingSettings(clinicId),
  });

  useEffect(() => {
    if (settings) {
      setEnabled(settings.online_booking_enabled);
      setAutoConfirm(settings.auto_confirm);
      setDuration(settings.slot_duration_minutes || 30);
      setStartHour(settings.start_hour || "08:00");
      setEndHour(settings.end_hour || "18:00");
      setProceduresText(
        (settings.available_procedures || []).join("\n")
      );
      setInstructions(settings.instructions || "");
    } else {
      setProceduresText(
        [
          "Avaliação Odontológica Geral",
          "Limpeza / Profilaxia Dental",
          "Urgência Odontológica / Dor",
          "Avaliação para Aparelho / Ortodontia",
          "Avaliação de Implantes / Prótese",
          "Clareamento Dental",
        ].join("\n")
      );
    }
  }, [settings]);

  useEffect(() => {
    if (clinicData?.slug) {
      setSlug(clinicData.slug);
    }
  }, [clinicData]);

  // Salvar configurações
  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Atualizar slug na clínica se alterado
      if (slug.trim() && slug.trim() !== clinicData?.slug) {
        const cleanSlug = slug
          .toLowerCase()
          .trim()
          .replace(/[^\w-]/g, "");
        const { error: clinicErr } = await supabase
          .from("clinics")
          .update({ slug: cleanSlug })
          .eq("id", clinicId);
        if (clinicErr) throw new Error(clinicErr.message);
      }

      // 2. Salvar settings
      const procs = proceduresText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await updateClinicBookingSettings(clinicId, {
        online_booking_enabled: enabled,
        auto_confirm: autoConfirm,
        slot_duration_minutes: Number(duration) || 30,
        start_hour: startHour,
        end_hour: endHour,
        available_procedures: procs,
        instructions: instructions.trim() || null,
      });

      if (!res.success) {
        throw new Error(res.error || "Erro ao salvar configurações.");
      }
    },
    onSuccess: () => {
      toast.success("Configurações de agendamento online salvas!");
      qc.invalidateQueries({ queryKey: ["clinicBookingSettings", clinicId] });
      qc.invalidateQueries({ queryKey: ["clinicSlug", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(publicLink);
    setCopied(true);
    toast.success("Link copiado para a área de transferência!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="space-y-6">
      {/* Banner com o Link Público */}
      <div className="rounded-3xl border border-teal/30 bg-gradient-to-br from-teal/10 via-white to-navy/5 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal text-white shadow-md">
              <Globe className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-navy">
                  Página Pública de Agendamento da Clínica
                </h3>
                <Badge
                  className={
                    enabled
                      ? "bg-emerald-500/15 text-emerald-700"
                      : "bg-slate-200 text-slate-600"
                  }
                >
                  {enabled ? "Ativo" : "Pausado"}
                </Badge>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Compartilhe com seus pacientes no WhatsApp, Instagram ou site oficial.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-1.5"
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Copiado!" : "Copiar Link"}
            </Button>

            <Button
              asChild
              size="sm"
              className="bg-teal hover:bg-teal-600 text-white gap-1.5"
            >
              <a href={publicLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                Abrir Página
              </a>
            </Button>
          </div>
        </div>

        {/* Campo com Link Visível */}
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 p-2.5 px-3.5 text-xs text-slate-700 font-mono">
          <span className="truncate flex-1 select-all">{publicLink}</span>
        </div>
      </div>

      {/* Formulário de Configurações */}
      <div className="rounded-2xl border bg-card p-6 shadow-card space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h4 className="font-bold text-navy">Preferências do Agendamento</h4>
            <p className="text-xs text-muted-foreground">
              Personalize o funcionamento dos agendamentos recebidos pela internet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="toggle-booking" className="text-xs font-semibold">
              {enabled ? "Habilitado" : "Desabilitado"}
            </Label>
            <Switch
              id="toggle-booking"
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={!canManage}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">
              Identificador Amigável (Slug da Clínica)
            </Label>
            <Input
              placeholder="ex: clinica-sorriso-saopaulo"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={!canManage}
            />
            <p className="text-[11px] text-muted-foreground">
              Define o link curto: app.sondapro.com.br/agendar/<strong>{slug || "slug"}</strong>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">
              Duração da Consulta (Minutos)
            </Label>
            <Input
              type="number"
              min={15}
              max={180}
              step={15}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              disabled={!canManage}
            />
            <p className="text-[11px] text-muted-foreground">
              Intervalo de cada horário disponível para o paciente na grade.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">
              Horário de Abertura da Agenda
            </Label>
            <Input
              type="time"
              value={startHour}
              onChange={(e) => setStartHour(e.target.value)}
              disabled={!canManage}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">
              Horário de Término da Agenda
            </Label>
            <Input
              type="time"
              value={endHour}
              onChange={(e) => setEndHour(e.target.value)}
              disabled={!canManage}
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-700">
                Procedimentos Disponíveis para Seleção Online (1 por linha)
              </Label>
              <span className="text-[11px] text-muted-foreground">
                Exibidos em cards interativos
              </span>
            </div>
            <Textarea
              rows={5}
              value={proceduresText}
              onChange={(e) => setProceduresText(e.target.value)}
              disabled={!canManage}
              className="font-mono text-xs"
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">
              Orientações ao Paciente (Exibidas na tela de confirmação)
            </Label>
            <Textarea
              rows={2}
              placeholder="Ex: Chegar com 10 minutos de antecedência e trazer documento oficial com foto."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={!canManage}
            />
          </div>
        </div>

        {canManage && (
          <div className="flex justify-end pt-4 border-t">
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="bg-navy hover:bg-navy-700 text-white gap-2"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

