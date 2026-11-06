import { useState } from "react";
import {
  Save,
  RotateCcw,
  Sparkles,
  Link as LinkIcon,
  CheckCircle2,
  BellRing,
  HelpCircle,
  ExternalLink,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  getRelationshipRuleSettings,
  saveRelationshipRuleSettings,
  DEFAULT_RELATIONSHIP_STAGES,
  type RelationshipRuleSettings,
  type RelationshipStageKey,
} from "@/modules/whatsapp/crm-relationship";
import { toast } from "sonner";

interface WhatsappRelationshipRuleConfigPanelProps {
  clinicId: string;
  clinicName: string;
}

export function WhatsappRelationshipRuleConfigPanel({
  clinicId,
  clinicName,
}: WhatsappRelationshipRuleConfigPanelProps) {
  const [settings, setSettings] = useState<RelationshipRuleSettings>(() =>
    getRelationshipRuleSettings(clinicId)
  );
  const [isSaving, setIsSaving] = useState(false);

  // Manipulador de switch de cada etapa da régua
  const handleToggleStage = (stageKey: RelationshipStageKey, enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      stages: {
        ...prev.stages,
        [stageKey]: {
          ...prev.stages[stageKey],
          enabled,
        },
      },
    }));
  };

  // Manipulador de edição de texto do template
  const handleTemplateChange = (stageKey: RelationshipStageKey, template: string) => {
    setSettings((prev) => ({
      ...prev,
      stages: {
        ...prev.stages,
        [stageKey]: {
          ...prev.stages[stageKey],
          template,
        },
      },
    }));
  };

  // Insere tag dinâmica no template da etapa
  const insertTag = (stageKey: RelationshipStageKey, tag: string) => {
    const current = settings.stages[stageKey].template;
    handleTemplateChange(stageKey, `${current} ${tag}`);
    toast.success(`Variável ${tag} inserida no modelo!`);
  };

  // Salva no armazenamento local e notifica
  const handleSave = () => {
    setIsSaving(true);
    try {
      saveRelationshipRuleSettings(clinicId, settings);
      toast.success("Configurações da Régua de Relacionamento salvas com sucesso!");
    } catch {
      toast.error("Erro ao salvar configurações da régua.");
    } finally {
      setIsSaving(false);
    }
  };

  // Restaura mensagens padrão
  const handleResetDefaults = () => {
    if (confirm("Tem certeza que deseja restaurar todas as mensagens da régua para o padrão de fábrica?")) {
      const reseted: RelationshipRuleSettings = {
        ...settings,
        stages: DEFAULT_RELATIONSHIP_STAGES,
      };
      setSettings(reseted);
      saveRelationshipRuleSettings(clinicId, reseted);
      toast.success("Mensagens da régua restauradas para o padrão com sucesso!");
    }
  };

  const stageKeys = Object.keys(settings.stages) as RelationshipStageKey[];

  return (
    <div className="space-y-6">
      {/* 1. Header com Configuração Geral e Google Avaliações */}
      <Card className="shadow-xs border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-black text-navy flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                Régua de Relacionamento Automática no WhatsApp
              </CardTitle>
              <CardDescription className="text-xs">
                Automatize o acompanhamento do paciente desde o cadastro inicial até o recall preventivo de 6 meses.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetDefaults}
                className="h-8 text-xs gap-1 text-slate-500"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restaurar Padrão
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="h-8 text-xs font-bold gap-1.5 bg-primary text-white"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar Régua
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-navy flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-primary" />
                Link do Google Meu Negócio da Clínica (Avaliações 5 Estrelas)
              </Label>
              <Input
                value={settings.googleReviewUrl}
                onChange={(e) => setSettings((prev) => ({ ...prev, googleReviewUrl: e.target.value }))}
                placeholder="Ex.: https://g.page/r/sua-clinica/review"
                className="h-9 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Usado automaticamente na etapa 4 (Pesquisa NPS) para enviar pacientes satisfeitos diretamente para avaliar sua clínica no Google.
              </p>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl border bg-card/80">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-navy block">
                  Envio Automático em Segundo Plano
                </span>
                <span className="text-[11px] text-muted-foreground block">
                  Dispara as mensagens da régua automaticamente via instância conectada por QR Code.
                </span>
              </div>
              <Switch
                checked={settings.autoDispatchActive}
                onCheckedChange={(val) => setSettings((prev) => ({ ...prev, autoDispatchActive: val }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Lista das 7 Etapas da Régua com Switches e Editores */}
      <div className="space-y-4">
        {stageKeys.map((key, idx) => {
          const stage = settings.stages[key];
          const availableTags = [
            "{paciente}",
            "{clinica}",
            "{profissional}",
            "{data}",
            "{hora}",
            "{procedimento}",
            key === "welcome" ? "{link_portal}" : null,
            key === "confirmation_48h" ? "{link_confirmacao}" : null,
            key === "nps_survey" ? "{link_google}" : null,
          ].filter(Boolean) as string[];

          return (
            <Card
              key={key}
              className={`transition-all shadow-xs border ${
                stage.enabled
                  ? "border-slate-300 dark:border-slate-700 bg-card"
                  : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 opacity-75"
              }`}
            >
              <CardHeader className="p-4 pb-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary font-black text-xs">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-bold text-navy">{stage.name}</CardTitle>
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1.5 py-0 uppercase font-semibold ${
                            stage.category === "acquisition"
                              ? "border-sky-300 text-sky-700 dark:text-sky-300"
                              : stage.category === "retention"
                                ? "border-emerald-300 text-emerald-700 dark:text-emerald-300"
                                : stage.category === "care"
                                  ? "border-indigo-300 text-indigo-700 dark:text-indigo-300"
                                  : stage.category === "nps"
                                    ? "border-amber-300 text-amber-700 dark:text-amber-300"
                                    : "border-purple-300 text-purple-700 dark:text-purple-300"
                          }`}
                        >
                          {stage.category}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{stage.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {stage.enabled ? "Ativo" : "Desativado"}
                    </span>
                    <Switch
                      checked={stage.enabled}
                      onCheckedChange={(val) => handleToggleStage(key, val)}
                    />
                  </div>
                </div>
              </CardHeader>

              {stage.enabled && (
                <CardContent className="p-4 pt-2 space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-semibold text-slate-500">
                        Texto da Mensagem no WhatsApp:
                      </Label>
                      <span className="text-[10px] text-muted-foreground">
                        {stage.template.length} caracteres
                      </span>
                    </div>
                    <Textarea
                      rows={3}
                      value={stage.template}
                      onChange={(e) => handleTemplateChange(key, e.target.value)}
                      className="text-xs font-sans bg-background"
                    />
                  </div>

                  {/* Variáveis Dinâmicas */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">
                      Inserir Variável:
                    </span>
                    {availableTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => insertTag(key, tag)}
                        className="px-2 py-0.5 rounded-md border text-[10px] font-mono bg-muted/40 hover:bg-primary/10 hover:text-primary transition"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="h-10 px-6 font-bold gap-2 bg-primary text-white shadow-md"
        >
          <Save className="w-4 h-4" />
          Salvar Todas as Configurações da Régua
        </Button>
      </div>
    </div>
  );
}

