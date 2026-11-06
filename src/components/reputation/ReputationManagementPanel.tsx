import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Star,
  Sparkles,
  TrendingUp,
  MessageSquare,
  Send,
  ExternalLink,
  Settings,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Heart,
  Save,
  Search,
  Phone,
  ShieldCheck,
  Award,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  fetchClinicNpsFeedbacks,
  calculateNpsScore,
  getReputationSettings,
  saveReputationSettings,
  updateFeedbackStatus,
  type NpsFeedbackRecord,
  type NpsReputationSettings,
  type NpsCategory,
} from "@/modules/reputation";
import { buildRelationshipWhatsAppUrl } from "@/modules/whatsapp/crm-relationship";

interface ReputationManagementPanelProps {
  clinicId: string;
  clinicName: string;
  patients?: Array<{ id: string; full_name: string; phone?: string | null }>;
  professionals?: Array<{ id: string; name: string }>;
  canManage?: boolean;
}

export function ReputationManagementPanel({
  clinicId,
  clinicName,
  patients = [],
  professionals = [],
  canManage = true,
}: ReputationManagementPanelProps) {
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [manualSendModalOpen, setManualSendModalOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Formulário de envio manual de pesquisa
  const [selectedPatientId, setSelectedPatientId] = useState<string>(patients[0]?.id || "");
  const [selectedDentistName, setSelectedDentistName] = useState<string>(professionals[0]?.name || "");

  // Consulta lista de feedbacks
  const { data: feedbacks = [], refetch: refetchFeedbacks } = useQuery({
    queryKey: ["npsFeedbacks", clinicId],
    queryFn: () => fetchClinicNpsFeedbacks(clinicId),
  });

  // Configurações e switches
  const [settings, setSettings] = useState<NpsReputationSettings>(() =>
    getReputationSettings(clinicId)
  );

  // Métricas calculadas do NPS
  const stats = useMemo(() => calculateNpsScore(feedbacks), [feedbacks]);

  // Filtro de feedbacks
  const filteredFeedbacks = useMemo(() => {
    return feedbacks.filter((f) => {
      const matchSearch =
        f.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (f.comment && f.comment.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchCat = categoryFilter === "all" || f.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [feedbacks, searchTerm, categoryFilter]);

  // Salva configurações com switches
  const handleSaveSettings = () => {
    saveReputationSettings(clinicId, settings);
    toast.success("Configurações de Reputação e NPS salvas com sucesso!");
    setConfigModalOpen(false);
  };

  // Alteração direta dos switches principais na tela
  const handleToggleSwitch = (key: keyof NpsReputationSettings, val: boolean) => {
    const next = { ...settings, [key]: val };
    setSettings(next);
    saveReputationSettings(clinicId, next);
    toast.success(`Recurso ${val ? "ativado" : "desativado"} com sucesso!`);
  };

  // Resposta rápida no WhatsApp para o paciente
  const handleReplyWhatsApp = (feedback: NpsFeedbackRecord) => {
    const isPromoter = feedback.score >= 9;
    const phone = feedback.patientPhone || "11988887777";
    const text = isPromoter
      ? `Olá, ${feedback.patientName}! Aqui é da ${clinicName}. Muito obrigado pela sua nota ${feedback.score} e pelo carinho no seu feedback! Se puder deixar sua avaliação no Google, ficaremos muito honrados: ${settings.googleReviewUrl}`
      : `Olá, ${feedback.patientName}! Aqui é da gerência da ${clinicName}. Agradecemos o seu feedback sincero sobre o atendimento. Gostaríamos de ouvir mais detalhes para podermos aprimorar o que for necessário. Qual o melhor momento para conversar?`;

    const url = buildRelationshipWhatsAppUrl(phone, text);
    window.open(url, "_blank", "noopener,noreferrer");
    updateFeedbackStatus(clinicId, feedback.id, "contacted");
    refetchFeedbacks();
    toast.success("Abrindo WhatsApp para falar com o paciente!");
  };

  // Disparo manual de pesquisa NPS
  const handleSendManualSurvey = () => {
    const patient = patients.find((p) => p.id === selectedPatientId);
    if (!patient || !patient.phone) {
      toast.warning("Selecione um paciente com telefone cadastrado.");
      return;
    }

    const domain = typeof window !== "undefined" ? window.location.origin : "";
    const surveyUrl = `${domain}/avaliacao?clinicId=${clinicId}&patient=${encodeURIComponent(
      patient.full_name
    )}&phone=${encodeURIComponent(patient.phone)}&dentist=${encodeURIComponent(selectedDentistName)}`;

    const text = `Olá, ${patient.full_name}! Sua opinião é essencial para nós na ${clinicName}. Poderia avaliar seu atendimento em apenas 30 segundos no link a seguir? ${surveyUrl}`;

    const url = buildRelationshipWhatsAppUrl(patient.phone, text);
    window.open(url, "_blank", "noopener,noreferrer");
    setManualSendModalOpen(false);
    toast.success("Abrindo WhatsApp com a pesquisa NPS para o paciente!");
  };

  return (
    <div className="space-y-6">
      {/* 1. Cards de Indicadores do NPS e Reputação Google */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Score NPS Geral */}
        <Card className="shadow-xs border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="p-4 pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase flex items-center justify-between">
              <span>Score NPS Geral</span>
              <Award className="w-4 h-4 text-emerald-600" />
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-emerald-700 dark:text-emerald-400">
                {stats.npsScore > 0 ? `+${stats.npsScore}` : stats.npsScore}
              </span>
              <Badge
                className={`text-[10px] font-bold ${
                  stats.zone === "excellence"
                    ? "bg-emerald-600 text-white"
                    : stats.zone === "quality"
                      ? "bg-sky-600 text-white"
                      : "bg-amber-500 text-white"
                }`}
              >
                {stats.zone === "excellence"
                  ? "ZONA DE EXCELÊNCIA"
                  : stats.zone === "quality"
                    ? "ZONA DE QUALIDADE"
                    : "APERFEIÇOAMENTO"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Baseado em {stats.totalCount} avaliações oficiais
            </p>
          </CardContent>
        </Card>

        {/* Avaliação Média no Google */}
        <Card className="shadow-xs border-l-4 border-l-amber-500">
          <CardHeader className="p-4 pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase flex items-center justify-between">
              <span>Média Google Meu Negócio</span>
              <Star className="w-4 h-4 text-amber-500 fill-current" />
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-navy">{stats.averageRating}</span>
              <div className="flex items-center text-amber-400">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="w-3.5 h-3.5 fill-current" />
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Estimativa de satisfação máxima
            </p>
          </CardContent>
        </Card>

        {/* Distribuição de Promotores */}
        <Card className="shadow-xs border-l-4 border-l-sky-500">
          <CardHeader className="p-4 pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Promotores (Notas 9-10)
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-sky-700 dark:text-sky-400">
                {stats.promotersPct}%
              </span>
              <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30">
                Convidados ao Google
              </Badge>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{ width: `${stats.promotersPct}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Detratores & Neutros (Alertas) */}
        <Card className="shadow-xs border-l-4 border-l-indigo-500">
          <CardHeader className="p-4 pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Neutros & Detratores
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-navy">
                {stats.neutralsPct + stats.detractorsPct}%
              </span>
              <Badge variant="outline" className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30">
                {stats.detractorsPct}% Detratores
              </Badge>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden flex">
              <div
                className="bg-amber-400 h-full"
                style={{ width: `${stats.neutralsPct}%` }}
              />
              <div
                className="bg-red-500 h-full"
                style={{ width: `${stats.detractorsPct}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. Barra de Controle dos Switches da Reputação */}
      <Card className="shadow-xs border bg-card">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
            {/* Switch 1: Módulo NPS Geral */}
            <div className="flex items-center justify-between pr-3 pt-2 md:pt-0">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-navy block">
                  Pesquisa NPS Pós-Consulta
                </span>
                <span className="text-[11px] text-muted-foreground block">
                  Dispara pesquisa após o atendimento.
                </span>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(val) => handleToggleSwitch("enabled", val)}
              />
            </div>

            {/* Switch 2: Redirecionamento ao Google Meu Negócio */}
            <div className="flex items-center justify-between px-0 md:px-3 pt-3 md:pt-0">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-navy block">
                  Filtro Inteligente do Google
                </span>
                <span className="text-[11px] text-muted-foreground block">
                  Convida apenas Promotores (notas 9-10).
                </span>
              </div>
              <Switch
                checked={settings.enableGoogleRedirectForPromoters}
                onCheckedChange={(val) => handleToggleSwitch("enableGoogleRedirectForPromoters", val)}
              />
            </div>

            {/* Switch 3: Alerta de Gerência para Detratores */}
            <div className="flex items-center justify-between pl-0 md:pl-3 pt-3 md:pt-0">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-navy block">
                  Blindagem contra Detratores
                </span>
                <span className="text-[11px] text-muted-foreground block">
                  Alerta WhatsApp se nota for menor que 7.
                </span>
              </div>
              <Switch
                checked={settings.enableManagerAlertOnDetractor}
                onCheckedChange={(val) => handleToggleSwitch("enableManagerAlertOnDetractor", val)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Barra de Ações: Filtros, Pesquisa e Envio */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl border bg-card shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome do paciente ou palavra no comentário..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Notas</SelectItem>
              <SelectItem value="promoter">⭐ Promotores (9-10)</SelectItem>
              <SelectItem value="neutral">😐 Neutros (7-8)</SelectItem>
              <SelectItem value="detractor">⚠️ Detratores (0-6)</SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfigModalOpen(true)}
            className="h-9 gap-1 text-xs text-slate-600 font-semibold"
          >
            <Settings className="w-3.5 h-3.5" />
            Configurar Google
          </Button>

          {canManage && (
            <Button
              type="button"
              size="sm"
              onClick={() => setManualSendModalOpen(true)}
              className="h-9 gap-1.5 text-xs font-bold bg-primary text-white shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              Enviar Pesquisa por WhatsApp
            </Button>
          )}
        </div>
      </div>

      {/* 4. Tabela de Feedbacks Recebidos */}
      <Card className="shadow-xs overflow-hidden">
        <CardHeader className="p-4 pb-2 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-extrabold text-navy flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Feedbacks e Avaliações Recebidas ({filteredFeedbacks.length})
            </CardTitle>
            <a
              href={settings.googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-sky-600 hover:underline flex items-center gap-1 font-semibold"
            >
              <span>Ver no Google Meu Negócio</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredFeedbacks.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Nenhuma avaliação localizada com os filtros selecionados.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Paciente</TableHead>
                  <TableHead className="text-xs">Dentista</TableHead>
                  <TableHead className="text-xs text-center">Nota NPS</TableHead>
                  <TableHead className="text-xs">Comentário do Paciente</TableHead>
                  <TableHead className="text-xs">Redirecionado ao Google</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFeedbacks.map((f) => {
                  const isPromoter = f.score >= 9;
                  const isDetractor = f.score <= 6;

                  return (
                    <TableRow key={f.id} className="hover:bg-muted/20">
                      <TableCell className="font-bold text-xs text-navy">
                        {f.patientName}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {f.professionalName || "Clínica Geral"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={`text-xs font-black px-2.5 py-0.5 ${
                            isPromoter
                              ? "bg-emerald-600 text-white"
                              : isDetractor
                                ? "bg-red-600 text-white"
                                : "bg-amber-500 text-white"
                          }`}
                        >
                          {f.score} / 10
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-700 max-w-sm">
                        {f.comment ? (
                          <span className="italic">"{f.comment}"</span>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">— sem comentário —</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {f.redirectedToGoogle ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-300 font-bold gap-1">
                            <Star className="w-2.5 h-2.5 fill-current" />
                            Sim (5 Estrelas)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-slate-500">
                            Não (Retido Internamente)
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(f.createdAt).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2.5 gap-1.5 text-emerald-700 font-bold hover:bg-emerald-50"
                          onClick={() => handleReplyWhatsApp(f)}
                          title="Falar no WhatsApp"
                        >
                          <Send className="w-3 h-3 text-emerald-600" />
                          Responder
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* MODAL 1: CONFIGURAÇÃO DO GOOGLE & REGRAS NPS */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="max-w-xl bg-card">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold text-navy flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Configuração de Reputação & Google Meu Negócio
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure os links, mensagens e notas de corte para alavancar sua pontuação no Google Maps.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-navy">
                Link do Perfil do Google Meu Negócio (Página de Avaliações) *
              </Label>
              <Input
                value={settings.googleReviewUrl}
                onChange={(e) => setSettings((prev) => ({ ...prev, googleReviewUrl: e.target.value }))}
                placeholder="https://g.page/r/sua-clinica/review"
                className="h-9 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Copie o link no seu Google Meu Negócio em <i>Pedir Avaliações &gt; Compartilhar Link</i>.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Nota Mínima para Enviar ao Google</Label>
                <Select
                  value={String(settings.minimumScoreForGoogle)}
                  onValueChange={(v) => setSettings((prev) => ({ ...prev, minimumScoreForGoogle: Number(v) }))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9">Nota 9 ou 10 (Recomendado)</SelectItem>
                    <SelectItem value="8">Nota 8, 9 ou 10</SelectItem>
                    <SelectItem value="10">Apenas Nota 10</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Tempo de Espera pós Consulta</Label>
                <Select
                  value={String(settings.delayHours)}
                  onValueChange={(v) => setSettings((prev) => ({ ...prev, delayHours: Number(v) }))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 horas após</SelectItem>
                    <SelectItem value="48">48 horas após (Ideal)</SelectItem>
                    <SelectItem value="72">72 horas após</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-navy">Mensagem de Agradecimento para Promotores (9-10)</Label>
              <Textarea
                rows={2}
                value={settings.promoterThankYouText}
                onChange={(e) => setSettings((prev) => ({ ...prev, promoterThankYouText: e.target.value }))}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-navy">Mensagem de Acolhimento para Detratores (0-6)</Label>
              <Textarea
                rows={2}
                value={settings.detractorApologyText}
                onChange={(e) => setSettings((prev) => ({ ...prev, detractorApologyText: e.target.value }))}
                className="text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button variant="ghost" onClick={() => setConfigModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveSettings} className="bg-primary text-white font-bold">
                Salvar Configurações
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: DISPARO MANUAL DE PESQUISA POR WHATSAPP */}
      <Dialog open={manualSendModalOpen} onOpenChange={setManualSendModalOpen}>
        <DialogContent className="max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-navy flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Enviar Pesquisa NPS por WhatsApp
            </DialogTitle>
            <DialogDescription className="text-xs">
              Gera convite exclusivo para o paciente responder no celular.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-navy">Paciente *</Label>
              <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione o paciente" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name} {p.phone ? `(${p.phone})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-navy">Dentista do Atendimento</Label>
              <Select value={selectedDentistName} onValueChange={setSelectedDentistName}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione o dentista" />
                </SelectTrigger>
                <SelectContent>
                  {professionals.map((p) => (
                    <SelectItem key={p.id} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="ghost" onClick={() => setManualSendModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSendManualSurvey}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Disparar no WhatsApp
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
