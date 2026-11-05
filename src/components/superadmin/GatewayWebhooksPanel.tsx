import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Webhook,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Key,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Code,
  CreditCard,
  QrCode,
  Radio,
  FileCode2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchPlatformGatewaySettings,
  updatePlatformGatewaySettings,
  fetchWebhookEvents,
  simulateGatewayWebhook,
} from "@/modules/webhooks";
import type { PaymentWebhookEvent, PlatformGatewaySettings } from "@/types";

interface GatewayWebhooksPanelProps {
  invoices: Array<{ id: string; clinic_id: string; amount: number; status: string }>;
  isEn?: boolean;
}

export function GatewayWebhooksPanel({ invoices, isEn = false }: GatewayWebhooksPanelProps) {
  const qc = useQueryClient();

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [inspectEvent, setInspectEvent] = useState<PaymentWebhookEvent | null>(null);

  // Queries
  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ["platform_gateway_settings"],
    queryFn: () => fetchPlatformGatewaySettings(),
  });

  const { data: webhookEvents = [], isLoading: loadingEvents, refetch: refetchEvents } = useQuery({
    queryKey: ["payment_webhook_events"],
    queryFn: () => fetchWebhookEvents(40),
    refetchInterval: 5000,
  });

  // Form states para credenciais
  const [asaasApiKey, setAsaasApiKey] = useState("");
  const [asaasWebhookToken, setAsaasWebhookToken] = useState("");
  const [asaasEnv, setAsaasEnv] = useState<"sandbox" | "production">("sandbox");
  const [mpAccessToken, setMpAccessToken] = useState("");
  const [mpSecret, setMpSecret] = useState("");
  const [mpEnv, setMpEnv] = useState<"sandbox" | "production">("sandbox");

  // Preenche states ao carregar
  useState(() => {
    if (settings) {
      setAsaasApiKey(settings.asaas_api_key || "");
      setAsaasWebhookToken(settings.asaas_webhook_token || "");
      setAsaasEnv(settings.asaas_environment || "sandbox");
      setMpAccessToken(settings.mercadopago_access_token || "");
      setMpSecret(settings.mercadopago_webhook_secret || "");
      setMpEnv(settings.mercadopago_environment || "sandbox");
    }
  });

  // Mutation: Salvar Credenciais
  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      return updatePlatformGatewaySettings({
        asaas_api_key: asaasApiKey || null,
        asaas_webhook_token: asaasWebhookToken || null,
        asaas_environment: asaasEnv,
        mercadopago_access_token: mpAccessToken || null,
        mercadopago_webhook_secret: mpSecret || null,
        mercadopago_environment: mpEnv,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform_gateway_settings"] });
      toast.success(
        isEn
          ? "Payment gateway settings updated successfully!"
          : "Configurações de gateways atualizadas com sucesso!"
      );
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao salvar configurações.");
    },
  });

  // Mutation: Simular Webhook
  const simulateMutation = useMutation({
    mutationFn: async ({
      gateway,
      invoiceId,
    }: {
      gateway: "asaas" | "mercadopago";
      invoiceId: string;
    }) => {
      return simulateGatewayWebhook(gateway, invoiceId);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["payment_webhook_events"] });
      qc.invalidateQueries({ queryKey: ["superadmin_clinics"] });
      qc.invalidateQueries({ queryKey: ["superadmin_detailed_stats"] });
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.warning(res.message);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Falha na simulação do webhook.");
    },
  });

  const getBaseOrigin = () => {
    if (typeof window !== "undefined") return window.location.origin;
    return "https://app.sondapro.com.br";
  };

  const asaasWebhookUrl = `${getBaseOrigin()}/api/webhooks/asaas`;
  const mpWebhookUrl = `${getBaseOrigin()}/api/webhooks/mercadopago`;

  const copyToClipboard = (text: string, label: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado para a área de transferência!`);
  };

  const pendingInvoices = invoices.filter((i) => i.status === "pending");
  const targetInvoiceId = selectedInvoiceId || pendingInvoices[0]?.id || (invoices[0]?.id ?? "inv-demo-123");

  return (
    <div className="space-y-6">
      {/* 1. URLs Oficiais para Configurar nos Gateways */}
      <section className="rounded-2xl border bg-gradient-to-r from-slate-900 to-slate-950 p-6 text-white shadow-xl">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md">
            <Webhook className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-lg font-bold">
              {isEn ? "Live Payment Webhook Endpoints" : "Endpoints Oficiais de Webhook de Pagamento"}
            </h3>
            <p className="text-xs text-slate-400">
              {isEn
                ? "Configure these URLs in your Asaas and Mercado Pago developer dashboard."
                : "Cadastre essas URLs no painel de desenvolvedor do Asaas e do Mercado Pago para baixa automática."}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {/* Asaas */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sky-400 text-xs flex items-center gap-1.5">
                <QrCode className="h-4 w-4" /> ASAAS Webhook (PIX & Cartão)
              </span>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
                Ativo (200 OK)
              </Badge>
            </div>
            <div className="flex gap-2">
              <Input
                readOnly
                value={asaasWebhookUrl}
                className="bg-black/40 border-slate-800 text-xs font-mono text-slate-200"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(asaasWebhookUrl, "URL do Asaas")}
                className="border-slate-800 bg-slate-800/60 hover:bg-slate-700 text-white shrink-0"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">
              Eventos recomendados: <code>PAYMENT_RECEIVED</code>, <code>PAYMENT_CONFIRMED</code>.
            </p>
          </div>

          {/* Mercado Pago */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sky-400 text-xs flex items-center gap-1.5">
                <CreditCard className="h-4 w-4" /> Mercado Pago Webhook / IPN
              </span>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
                Ativo (200 OK)
              </Badge>
            </div>
            <div className="flex gap-2">
              <Input
                readOnly
                value={mpWebhookUrl}
                className="bg-black/40 border-slate-800 text-xs font-mono text-slate-200"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(mpWebhookUrl, "URL do Mercado Pago")}
                className="border-slate-800 bg-slate-800/60 hover:bg-slate-700 text-white shrink-0"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">
              Tópicos recomendados: <code>payment</code>, <code>payments_v2</code>.
            </p>
          </div>
        </div>
      </section>

      {/* 2. Simulador de Testes de Webhook ao Vivo */}
      <section className="rounded-2xl border bg-card p-5 shadow-card space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <h4 className="font-bold text-navy text-sm">
              {isEn ? "Live Webhook Simulator & Instant Reconciliation" : "Simulador de Webhooks ao Vivo & Conciliação Automática"}
            </h4>
          </div>
          <span className="text-xs text-muted-foreground">
            {pendingInvoices.length} faturas pendentes aguardando baixa
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Selecione a fatura para simular recebimento:</Label>
            <Select value={targetInvoiceId} onValueChange={setSelectedInvoiceId}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Selecione uma fatura..." />
              </SelectTrigger>
              <SelectContent>
                {invoices.length === 0 ? (
                  <SelectItem value="inv-demo-123">Fatura Demo #INV-DEMO-123 (R$ 299,00)</SelectItem>
                ) : (
                  invoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      #{inv.id.slice(0, 8).toUpperCase()} · R$ {Number(inv.amount).toFixed(2)} ({inv.status === "paid" ? "Paga" : "Pendente"})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-9"
            disabled={simulateMutation.isPending}
            onClick={() => simulateMutation.mutate({ gateway: "asaas", invoiceId: targetInvoiceId })}
          >
            <QrCode className="h-4 w-4" />
            <span>Simular Asaas (PIX Pago)</span>
          </Button>

          <Button
            type="button"
            className="gap-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold h-9"
            disabled={simulateMutation.isPending}
            onClick={() => simulateMutation.mutate({ gateway: "mercadopago", invoiceId: targetInvoiceId })}
          >
            <CreditCard className="h-4 w-4" />
            <span>Simular Mercado Pago (Aprovado)</span>
          </Button>
        </div>
      </section>

      {/* 3. Tabela de Logs de Webhooks Recebidos */}
      <section className="rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between pb-3 border-b">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-sky-600" />
            <h4 className="font-bold text-navy text-sm">
              {isEn ? "Webhook Events Log" : "Histórico de Eventos de Webhook Recebidos"}
            </h4>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-slate-600"
            onClick={() => refetchEvents()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Atualizar Logs</span>
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-slate-500 font-semibold bg-slate-50/70">
                <th className="py-2.5 px-3">Data / Hora</th>
                <th className="py-2.5 px-3">Gateway</th>
                <th className="py-2.5 px-3">Evento</th>
                <th className="py-2.5 px-3">Fatura Associada</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {webhookEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhum evento de webhook recebido ainda. Use os botões acima para simular.
                  </td>
                </tr>
              ) : (
                webhookEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {new Date(evt.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-3 px-3 uppercase font-extrabold text-navy">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${
                        evt.gateway === "asaas" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"
                      }`}>
                        {evt.gateway}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono font-medium text-slate-800">
                      {evt.event_type}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">
                      {evt.external_reference ? `#${evt.external_reference.slice(0, 8).toUpperCase()}` : "—"}
                    </td>
                    <td className="py-3 px-3">
                      {evt.processed ? (
                        <Badge className="bg-emerald-600 text-white text-[10px]">
                          Processado
                        </Badge>
                      ) : evt.processing_error ? (
                        <Badge variant="destructive" className="text-[10px]">
                          Erro
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          Pendente
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-[11px] text-sky-700"
                        onClick={() => setInspectEvent(evt)}
                      >
                        <Code className="h-3.5 w-3.5" />
                        <span>Ver JSON</span>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal de Inspeção de JSON Bruto */}
      <Dialog open={!!inspectEvent} onOpenChange={(open) => !open && setInspectEvent(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-navy">
              <FileCode2 className="h-5 w-5 text-sky-600" />
              <span>Payload Bruto do Webhook ({inspectEvent?.gateway.toUpperCase()})</span>
            </DialogTitle>
            <DialogDescription>
              Evento: <strong>{inspectEvent?.event_type}</strong> | Recebido em:{" "}
              {inspectEvent && new Date(inspectEvent.created_at).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          {inspectEvent && (
            <div className="space-y-3">
              <pre className="max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-sky-300">
                {JSON.stringify(inspectEvent.payload, null, 2)}
              </pre>

              {inspectEvent.processing_error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  <strong>Erro reportado no processamento:</strong> {inspectEvent.processing_error}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

