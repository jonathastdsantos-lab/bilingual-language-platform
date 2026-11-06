import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MessageCircle,
  Send,
  CheckCircle2,
  Sparkles,
  Calendar,
  Gift,
  RotateCcw,
  Star,
  Activity,
  UserCheck,
  Search,
  ExternalLink,
  Phone,
  RefreshCw,
  Copy,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeCrmPatientsQueue,
  buildRelationshipWhatsAppUrl,
  type CrmPatientLead,
  type RelationshipStageKey,
} from "@/modules/whatsapp/crm-relationship";
import { toast } from "sonner";

interface WhatsappCrmKanbanPanelProps {
  clinicId: string;
  clinicName: string;
}

export function WhatsappCrmKanbanPanel({
  clinicId,
  clinicName,
}: WhatsappCrmKanbanPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>("all");
  const [sentLeads, setSentLeads] = useState<Record<string, boolean>>({});

  // Carrega fila de pacientes da régua do CRM
  const {
    data: leads = [],
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["crmRelationshipLeads", clinicId],
    queryFn: () => computeCrmPatientsQueue(clinicId, clinicName),
    refetchInterval: 60000,
  });

  // Filtra por busca e estágio
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchSearch =
        lead.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.phone.includes(searchTerm);
      const matchStage =
        selectedStageFilter === "all" || lead.stage === selectedStageFilter;
      return matchSearch && matchStage;
    });
  }, [leads, searchTerm, selectedStageFilter]);

  // Agrupamento por colunas do Kanban
  const kanbanColumns: Array<{
    key: RelationshipStageKey;
    title: string;
    icon: React.ReactNode;
    color: string;
    badgeBg: string;
  }> = [
    {
      key: "welcome",
      title: "Boas-vindas",
      icon: <UserCheck className="w-4 h-4 text-sky-500" />,
      color: "border-sky-500/30",
      badgeBg: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    },
    {
      key: "confirmation_48h",
      title: "Confirmação 48h",
      icon: <Calendar className="w-4 h-4 text-emerald-500" />,
      color: "border-emerald-500/30",
      badgeBg: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      key: "post_op_care",
      title: "Pós-Operatório",
      icon: <Activity className="w-4 h-4 text-indigo-500" />,
      color: "border-indigo-500/30",
      badgeBg: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
    },
    {
      key: "nps_survey",
      title: "NPS & Google",
      icon: <Star className="w-4 h-4 text-amber-500" />,
      color: "border-amber-500/30",
      badgeBg: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    },
    {
      key: "birthday_greeting",
      title: "Aniversariantes",
      icon: <Gift className="w-4 h-4 text-pink-500" />,
      color: "border-pink-500/30",
      badgeBg: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
    },
    {
      key: "preventive_recall",
      title: "Recall (6 Meses)",
      icon: <RotateCcw className="w-4 h-4 text-purple-500" />,
      color: "border-purple-500/30",
      badgeBg: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
    },
  ];

  // Ação de envio via WhatsApp Web / App
  const handleSendLeadWhatsApp = (lead: CrmPatientLead) => {
    const url = buildRelationshipWhatsAppUrl(lead.phone, lead.messageText);
    setSentLeads((prev) => ({ ...prev, [`${lead.patientId}_${lead.stage}`]: true }));
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success(`Abrindo WhatsApp para enviar a mensagem de ${lead.stageName}!`);
  };

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Mensagem copiada para a área de transferência!");
  };

  return (
    <div className="space-y-6">
      {/* 1. Métricas do CRM & Régua de Relacionamento */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-xs border-l-4 border-l-sky-500">
          <CardHeader className="p-4 pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Fila Ativa do CRM
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-navy">{leads.length}</span>
            <Badge variant="outline" className="text-[10px] text-sky-600">
              Pacientes Elegíveis
            </Badge>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-l-4 border-l-emerald-500">
          <CardHeader className="p-4 pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Confirmações 48h
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
              {leads.filter((l) => l.stage === "confirmation_48h").length}
            </span>
            <Badge variant="outline" className="text-[10px] text-emerald-600">
              Próximos 2 Dias
            </Badge>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-l-4 border-l-amber-500">
          <CardHeader className="p-4 pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Pós-Op & NPS
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-700 dark:text-amber-400">
              {leads.filter((l) => l.stage === "post_op_care" || l.stage === "nps_survey").length}
            </span>
            <Badge variant="outline" className="text-[10px] text-amber-600">
              Fidelização Ativa
            </Badge>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-l-4 border-l-purple-500">
          <CardHeader className="p-4 pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Recall Preventivo
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-purple-700 dark:text-purple-400">
              {leads.filter((l) => l.stage === "preventive_recall").length}
            </span>
            <Badge variant="outline" className="text-[10px] text-purple-600">
              Reativação (+180d)
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* 2. Barra de Busca, Filtros e Atualização */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl border bg-card shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar paciente por nome ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar Fila
          </Button>
        </div>
      </div>

      {/* 3. Funil Visual Kanban do Relacionamento */}
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground text-sm">
          Carregando pacientes do CRM Odontológico...
        </div>
      ) : leads.length === 0 ? (
        <div className="p-12 rounded-2xl border border-dashed text-center bg-card shadow-xs space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <h4 className="font-bold text-navy text-sm">Régua de Relacionamento em Dia!</h4>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Não há mensagens pendentes de envio no momento. Novos pacientes cadastrados, agendamentos futuros e aniversariantes aparecerão automaticamente aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
          {kanbanColumns.map((col) => {
            const colLeads = filteredLeads.filter((l) => l.stage === col.key);

            return (
              <div
                key={col.key}
                className={`flex flex-col rounded-2xl border ${col.color} bg-slate-50/60 dark:bg-slate-900/40 p-3 min-h-[420px] shadow-xs`}
              >
                {/* Header da Coluna */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {col.icon}
                    <h5 className="font-extrabold text-navy text-xs truncate">{col.title}</h5>
                  </div>
                  <Badge className={`text-[10px] font-bold px-1.5 py-0 ${col.badgeBg}`}>
                    {colLeads.length}
                  </Badge>
                </div>

                {/* Lista de Cards de Pacientes */}
                <div className="space-y-3 flex-1 overflow-y-auto max-h-[600px] pr-1">
                  {colLeads.length === 0 ? (
                    <div className="p-4 text-center text-[11px] text-muted-foreground italic">
                      Nenhum paciente nesta etapa
                    </div>
                  ) : (
                    colLeads.map((lead) => {
                      const isSent = !!sentLeads[`${lead.patientId}_${lead.stage}`];

                      return (
                        <div
                          key={`${lead.patientId}_${lead.stage}`}
                          className={`p-3.5 rounded-xl border bg-card transition-all shadow-xs space-y-2.5 ${
                            isSent
                              ? "opacity-60 border-emerald-300 dark:border-emerald-900"
                              : "hover:border-primary/40 hover:shadow-md"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <h6 className="font-bold text-navy text-xs line-clamp-1">
                                {lead.fullName}
                              </h6>
                              {isSent && (
                                <Badge className="bg-emerald-600 text-white text-[9px] px-1 py-0">
                                  Enviado
                                </Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Phone className="w-2.5 h-2.5 text-slate-400" />
                              {lead.phone}
                            </p>
                          </div>

                          {/* Detalhes Clínicos do Lead */}
                          {(lead.procedureName || lead.lastVisitDaysAgo) && (
                            <div className="text-[10px] bg-muted/40 p-1.5 rounded-md text-slate-600 dark:text-slate-300 space-y-0.5">
                              {lead.procedureName && (
                                <p className="truncate">
                                  <b>Procedimento:</b> {lead.procedureName}
                                </p>
                              )}
                              {lead.lastVisitDaysAgo && (
                                <p>
                                  <b>Última consulta:</b> há {lead.lastVisitDaysAgo} dias
                                </p>
                              )}
                            </div>
                          )}

                          {/* Preview da Mensagem */}
                          <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[10px] text-slate-700 dark:text-slate-300 line-clamp-3 italic">
                            "{lead.messageText}"
                          </div>

                          {/* Ações Rápidas: Copiar e Disparar WhatsApp */}
                          <div className="flex items-center gap-1.5 pt-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] flex-1 gap-1 text-slate-600"
                              onClick={() => handleCopyMessage(lead.messageText)}
                              title="Copiar mensagem"
                            >
                              <Copy className="w-3 h-3" />
                              Copiar
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              className={`h-7 text-[10px] flex-1 gap-1 font-bold ${
                                isSent
                                  ? "bg-slate-700 hover:bg-slate-800 text-white"
                                  : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                              }`}
                              onClick={() => handleSendLeadWhatsApp(lead)}
                            >
                              <MessageCircle className="w-3 h-3" />
                              {isSent ? "Reenviar" : "Enviar"}
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

