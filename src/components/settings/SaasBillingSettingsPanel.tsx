import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  QrCode,
  CheckCircle2,
  Clock,
  Sparkles,
  ShieldCheck,
  Building,
  Users,
  HardDrive,
  MessageCircle,
  Copy,
  Receipt,
  FileCheck2,
  Zap,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useT } from "@/lib/i18n";
import {
  fetchClinicSubscription,
  fetchClinicInvoices,
  createSaasInvoice,
  paySaasInvoice,
  generatePixCopyPasteCode,
} from "@/modules/saas-billing";
import type { BillingCycle, SaasInvoice } from "@/types";

interface SaasBillingSettingsPanelProps {
  clinicId: string;
  canManage: boolean;
}

const SAAS_PLANS_CONFIG = [
  {
    id: "starter",
    name: "Starter",
    badge: "Essencial",
    monthlyPrice: 149,
    yearlyPrice: 1490,
    professionals: 2,
    units: 1,
    whatsapp: false,
    storageMb: 1024,
    description: "Ideal para consultórios individuais e pequenos consultórios odontológicos.",
    descriptionEn: "Ideal for solo practitioners and small dental offices.",
    features: [
      "Até 2 profissionais",
      "1 unidade clínica",
      "Prontuário & Odontograma 2D",
      "Guias TISS / GTO padrão ANS",
      "1 GB de armazenamento de Raio-X",
    ],
    featuresEn: [
      "Up to 2 professionals",
      "1 clinic unit",
      "EHR & 2D Odontogram",
      "TISS / ANS Billing Guides",
      "1 GB X-Ray storage",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    badge: "Mais Popular",
    popular: true,
    monthlyPrice: 299,
    yearlyPrice: 2990,
    professionals: 6,
    units: 3,
    whatsapp: true,
    storageMb: 10240,
    description: "Para clínicas em expansão que exigem automação WhatsApp e controle total.",
    descriptionEn: "For growing clinics demanding WhatsApp automation and full control.",
    features: [
      "Até 6 profissionais",
      "Até 3 unidades / filiais",
      "WhatsApp & Confirmação sem login",
      "Controle de Laboratório de Prótese",
      "Gestão Financeira & DRE completa",
      "10 GB de armazenamento",
    ],
    featuresEn: [
      "Up to 6 professionals",
      "Up to 3 branch units",
      "WhatsApp & Token confirmation",
      "Prosthetic Lab tracking",
      "Full Financial & P&L reports",
      "10 GB storage",
    ],
  },
  {
    id: "corporate",
    name: "Corporate",
    badge: "Redes & Franquias",
    monthlyPrice: 599,
    yearlyPrice: 5990,
    professionals: 999,
    units: 999,
    whatsapp: true,
    storageMb: 102400,
    description: "Poder irrestrito para policlínicas, redes odontológicas e alta demanda.",
    descriptionEn: "Unrestricted power for dental chains, polyclinics, and high volume.",
    features: [
      "Profissionais ilimitados",
      "Unidades / filiais ilimitadas",
      "Disparos WhatsApp ilimitados",
      "Suporte VIP dedicado 24/7",
      "Auditoria avançada de acessos",
      "100 GB de armazenamento em nuvem",
    ],
    featuresEn: [
      "Unlimited professionals",
      "Unlimited branches",
      "Unlimited WhatsApp notifications",
      "24/7 Dedicated VIP support",
      "Advanced audit logging",
      "100 GB cloud storage",
    ],
  },
];

export function SaasBillingSettingsPanel({
  clinicId,
  canManage,
}: SaasBillingSettingsPanelProps) {
  const { locale, dateLocale } = useT();
  const isEn = locale === "en";
  const qc = useQueryClient();

  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState<string | null>(null);
  const [activePaymentModalInvoice, setActivePaymentModalInvoice] = useState<SaasInvoice | null>(null);
  const [paymentTab, setPaymentTab] = useState<"pix" | "credit_card">("pix");

  // Form states for credit card
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  // Queries
  const { data: subscription, isLoading: loadingSub } = useQuery({
    queryKey: ["clinic_subscription", clinicId],
    queryFn: () => fetchClinicSubscription(clinicId),
    enabled: !!clinicId,
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ["clinic_invoices", clinicId],
    queryFn: () => fetchClinicInvoices(clinicId),
    enabled: !!clinicId,
  });

  // Mutation: Criar Fatura
  const createInvoiceMutation = useMutation({
    mutationFn: async ({
      planId,
      method,
    }: {
      planId: string;
      method: "pix" | "credit_card";
    }) => {
      const plan = SAAS_PLANS_CONFIG.find((p) => p.id === planId) ?? SAAS_PLANS_CONFIG[1]!;
      const amount = billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
      return createSaasInvoice({
        clinicId,
        planId,
        billingCycle,
        amount,
        paymentMethod: method,
      });
    },
    onSuccess: (invoice, variables) => {
      qc.invalidateQueries({ queryKey: ["clinic_invoices", clinicId] });
      setActivePaymentModalInvoice(invoice);
      setPaymentTab(variables.method);
      toast.success(
        isEn
          ? "Invoice generated successfully. Proceed with payment below."
          : "Fatura gerada com sucesso! Prossiga com o pagamento abaixo."
      );
    },
    onError: (err: Error) => {
      toast.error(err.message || (isEn ? "Failed to create invoice." : "Erro ao gerar fatura."));
    },
  });

  // Mutation: Pagar Fatura
  const payInvoiceMutation = useMutation({
    mutationFn: async ({
      invoiceId,
      method,
    }: {
      invoiceId: string;
      method: "pix" | "credit_card";
    }) => {
      return paySaasInvoice({
        clinicId,
        invoiceId,
        paymentMethod: method,
        cardDetails:
          method === "credit_card"
            ? {
                cardNumber,
                cardHolder,
                expiryDate: cardExpiry,
                cvv: cardCvv,
              }
            : undefined,
      });
    },
    onSuccess: (res) => {
      toast.success(res.message);
      setActivePaymentModalInvoice(null);
      setSelectedPlanForPayment(null);
      qc.invalidateQueries({ queryKey: ["clinic_subscription", clinicId] });
      qc.invalidateQueries({ queryKey: ["clinic_invoices", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || (isEn ? "Payment failed." : "Falha ao processar pagamento."));
    },
  });

  const activePlanId = subscription?.planId || "pro";
  const activePlanConfig = SAAS_PLANS_CONFIG.find((p) => p.id === activePlanId) ?? SAAS_PLANS_CONFIG[1]!;

  const handleStartPayment = (planId: string, method: "pix" | "credit_card") => {
    setSelectedPlanForPayment(planId);
    createInvoiceMutation.mutate({ planId, method });
  };

  const handleCopyPix = (pixCode: string) => {
    if (!navigator.clipboard) {
      toast.error(isEn ? "Clipboard unavailable" : "Área de transferência indisponível");
      return;
    }
    navigator.clipboard.writeText(pixCode);
    toast.success(
      isEn
        ? "PIX code copied! Paste it in your banking app."
        : "Código PIX Copia e Cola copiado! Cole no aplicativo do seu banco."
    );
  };

  const handlePrintReceipt = (invoice: SaasInvoice) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error(isEn ? "Allow popups to print receipt" : "Permita popups para imprimir o recibo");
      return;
    }
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Recibo SondaPro - #${invoice.id.slice(0, 8).toUpperCase()}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; }
          .header { border-bottom: 2px solid #0284c7; padding-bottom: 20px; margin-bottom: 25px; }
          .title { font-size: 24px; font-weight: bold; color: #0369a1; }
          .meta { margin-top: 15px; font-size: 14px; color: #64748b; line-height: 1.6; }
          .amount-box { margin: 25px 0; padding: 20px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; font-size: 18px; }
          .amount { font-size: 28px; font-weight: 800; color: #0284c7; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #dcfce7; color: #166534; font-weight: bold; font-size: 12px; }
          .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 12px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">SondaPro Cloud Dental — Comprovante de Pagamento SaaS</div>
          <div class="meta">
            <strong>Fatura:</strong> #${invoice.id.toUpperCase()}<br/>
            <strong>Clínica:</strong> ${subscription?.clinicName || "Clínica Odontológica"}<br/>
            <strong>Data do Pagamento:</strong> ${invoice.paid_at ? new Date(invoice.paid_at).toLocaleString(dateLocale) : new Date().toLocaleString(dateLocale)}<br/>
            <strong>Método:</strong> ${invoice.payment_method === "pix" ? "PIX Instantâneo" : `Cartão final ${invoice.card_last4 || "4242"}`}<br/>
            <strong>Status:</strong> <span class="badge">PAGO & ATIVADO</span>
          </div>
        </div>

        <div class="amount-box">
          <div>Valor Total Liquidado:</div>
          <div class="amount">R$ ${invoice.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
          <div style="margin-top: 8px; font-size: 14px; color: #0369a1;">
            Plano <strong>${invoice.plan_id.toUpperCase()}</strong> (${invoice.billing_cycle === "yearly" ? "Anual" : "Mensal"})
          </div>
        </div>

        <p style="font-size: 14px; line-height: 1.6;">
          Este recibo comprova a regularidade da licença e assinatura SaaS para uso da plataforma odontológica SondaPro.
          Validade garantida e renovada automaticamente na nuvem.
        </p>

        <div class="footer">
          SondaPro Tecnologia Odontológica LTDA · CNPJ 48.910.123/0001-44 · Suporte: suporte@sondapro.com.br
        </div>
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* 1. Header: Status Atual da Assinatura */}
      <section className="rounded-2xl border bg-gradient-to-r from-sky-50 via-white to-blue-50/40 p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-navy">
                    {isEn ? "SondaPro SaaS Subscription" : "Minha Assinatura SondaPro SaaS"}
                  </h2>
                  <Badge
                    variant={
                      subscription?.subscriptionStatus === "active"
                        ? "default"
                        : subscription?.subscriptionStatus === "trialing"
                        ? "secondary"
                        : "destructive"
                    }
                    className="capitalize font-semibold"
                  >
                    {subscription?.subscriptionStatus === "active"
                      ? isEn ? "Active" : "Ativa"
                      : subscription?.subscriptionStatus === "trialing"
                      ? isEn ? "Free Trial" : "Período de Testes"
                      : isEn ? "Overdue" : "Pendente"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isEn
                    ? "Manage your clinic plan, generate PIX payments, and view payment receipts."
                    : "Gerencie o plano da sua clínica, gere pagamentos via PIX/Cartão e consulte recibos."}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border bg-white/80 px-4 py-2 text-right shadow-xs backdrop-blur-xs">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {isEn ? "Current Plan" : "Plano Atual"}
              </span>
              <p className="text-lg font-extrabold text-navy capitalize">
                {activePlanConfig.name}
              </p>
            </div>
            {subscription?.currentPeriodEnd && (
              <div className="rounded-xl border bg-white/80 px-4 py-2 text-right shadow-xs backdrop-blur-xs">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {isEn ? "Renews / Expires on" : "Próxima Renovação"}
                </span>
                <p className="text-sm font-semibold text-slate-800">
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString(dateLocale)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Recursos inclusos no plano ativo */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t pt-4 text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <Users className="h-4 w-4 text-sky-600" />
            <span>
              <strong>{activePlanConfig.professionals}</strong> {isEn ? "Professionals" : "Profissionais"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <Building className="h-4 w-4 text-sky-600" />
            <span>
              <strong>{activePlanConfig.units}</strong> {isEn ? "Clinic Units" : "Unidades / Filiais"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <MessageCircle className="h-4 w-4 text-sky-600" />
            <span>
              <strong>WhatsApp</strong> {activePlanConfig.whatsapp ? (isEn ? "Included" : "Incluso") : (isEn ? "Optional" : "Opcional")}
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <HardDrive className="h-4 w-4 text-sky-600" />
            <span>
              <strong>{activePlanConfig.storageMb / 1024} GB</strong> {isEn ? "Storage" : "Armazenamento"}
            </span>
          </div>
        </div>
      </section>

      {/* 2. Seleção de Planos: Mensal vs Anual */}
      <section className="space-y-4">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div>
            <h3 className="text-lg font-bold text-navy">
              {isEn ? "Upgrade or Renew Your Plan" : "Faça Upgrade ou Renove sua Licença"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isEn
                ? "Immediate activation upon PIX or Credit Card confirmation."
                : "Liberação imediata com PIX Copia e Cola instantâneo ou Cartão de Crédito."}
            </p>
          </div>

          <div className="flex items-center rounded-xl bg-slate-100 p-1 border shadow-xs">
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                billingCycle === "monthly"
                  ? "bg-white text-navy shadow-xs"
                  : "text-slate-600 hover:text-navy"
              }`}
            >
              {isEn ? "Monthly" : "Mensal"}
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("yearly")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                billingCycle === "yearly"
                  ? "bg-white text-navy shadow-xs"
                  : "text-slate-600 hover:text-navy"
              }`}
            >
              <span>{isEn ? "Yearly" : "Anual"}</span>
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                {isEn ? "15% OFF" : "-15% OFF"}
              </span>
            </button>
          </div>
        </div>

        {/* Grade de 3 Planos */}
        <div className="grid gap-4 md:grid-cols-3">
          {SAAS_PLANS_CONFIG.map((plan) => {
            const isCurrent = plan.id === activePlanId;
            const price = billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
            const periodLabel = billingCycle === "yearly" ? (isEn ? "/year" : "/ano") : (isEn ? "/month" : "/mês");

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col justify-between rounded-2xl border bg-card p-5 shadow-sm transition hover:shadow-md ${
                  plan.popular ? "border-sky-500 ring-2 ring-sky-500/20" : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-sky-600 px-3 py-0.5 text-[11px] font-bold text-white shadow-sm">
                      {isEn ? "Most Popular" : "Mais Escolhido"}
                    </span>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xl font-extrabold text-navy">{plan.name}</h4>
                    {isCurrent ? (
                      <Badge variant="outline" className="border-sky-600 text-sky-700 bg-sky-50 text-[10px]">
                        {isEn ? "Current Plan" : "Plano Atual"}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        {plan.badge}
                      </Badge>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {isEn ? plan.descriptionEn : plan.description}
                  </p>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-2xl font-black text-navy">
                      R$ {price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs text-muted-foreground">{periodLabel}</span>
                  </div>

                  <ul className="mt-5 space-y-2 border-t pt-4 text-xs">
                    {(isEn ? plan.featuresEn : plan.features).map((feat, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-slate-700">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 space-y-2 border-t pt-4">
                  {canManage ? (
                    <>
                      <Button
                        variant="default"
                        className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                        onClick={() => handleStartPayment(plan.id, "pix")}
                        disabled={createInvoiceMutation.isPending}
                      >
                        <QrCode className="h-4 w-4" />
                        <span>{isEn ? "Pay via PIX" : "Pagar com PIX Instantâneo"}</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full gap-2 text-slate-700"
                        onClick={() => handleStartPayment(plan.id, "credit_card")}
                        disabled={createInvoiceMutation.isPending}
                      >
                        <CreditCard className="h-4 w-4" />
                        <span>{isEn ? "Pay with Card" : "Pagar com Cartão"}</span>
                      </Button>
                    </>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">
                      {isEn ? "Requires settings permission" : "Requer permissão de gestão"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Modal de Pagamento: PIX Copia e Cola / Cartão */}
      <Dialog
        open={!!activePaymentModalInvoice}
        onOpenChange={(open) => !open && setActivePaymentModalInvoice(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-navy">
              <Zap className="h-5 w-5 text-amber-500" />
              <span>{isEn ? "Complete SaaS Payment" : "Finalizar Pagamento SaaS SondaPro"}</span>
            </DialogTitle>
            <DialogDescription>
              {isEn
                ? "Immediate approval and license activation upon payment confirmation."
                : "Ativação instantânea assim que o pagamento for concluído."}
            </DialogDescription>
          </DialogHeader>

          {activePaymentModalInvoice && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-slate-50 p-3.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isEn ? "Invoice:" : "Fatura:"}</span>
                  <strong className="font-mono">#{activePaymentModalInvoice.id.slice(0, 8).toUpperCase()}</strong>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">{isEn ? "Plan & Cycle:" : "Plano & Ciclo:"}</span>
                  <span className="font-medium text-navy uppercase">
                    {activePaymentModalInvoice.plan_id} (
                    {activePaymentModalInvoice.billing_cycle === "yearly"
                      ? isEn ? "Yearly" : "Anual"
                      : isEn ? "Monthly" : "Mensal"}
                    )
                  </span>
                </div>
                <div className="mt-1 flex justify-between border-t pt-1 font-semibold text-sm">
                  <span>{isEn ? "Total to Pay:" : "Total a Pagar:"}</span>
                  <span className="text-emerald-700">
                    R$ {activePaymentModalInvoice.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <Tabs
                value={paymentTab}
                onValueChange={(v) => setPaymentTab(v as "pix" | "credit_card")}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="pix" className="gap-2">
                    <QrCode className="h-4 w-4" />
                    <span>PIX Instantâneo</span>
                  </TabsTrigger>
                  <TabsTrigger value="credit_card" className="gap-2">
                    <CreditCard className="h-4 w-4" />
                    <span>Cartão de Crédito</span>
                  </TabsTrigger>
                </TabsList>

                {/* Aba PIX */}
                <TabsContent value="pix" className="space-y-4 pt-3">
                  <div className="flex flex-col items-center justify-center rounded-xl border bg-white p-4 shadow-inner">
                    {activePaymentModalInvoice.pix_qr_code_url ? (
                      <img
                        src={activePaymentModalInvoice.pix_qr_code_url}
                        alt="QR Code PIX"
                        className="h-48 w-48 rounded-lg border object-contain shadow-xs"
                      />
                    ) : (
                      <div className="flex h-48 w-48 items-center justify-center rounded-lg bg-slate-100 text-muted-foreground">
                        <QrCode className="h-16 w-16" />
                      </div>
                    )}
                    <p className="mt-3 text-center text-xs text-muted-foreground">
                      {isEn
                        ? "Scan the QR code with your banking app or use the copy-paste code below."
                        : "Escaneie o QR Code no app do seu banco ou use a chave copia e cola abaixo."}
                    </p>
                  </div>

                  {activePaymentModalInvoice.pix_code && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{isEn ? "PIX Copy-and-Paste Code" : "Código PIX Copia e Cola"}</Label>
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value={activePaymentModalInvoice.pix_code}
                          className="font-mono text-xs bg-slate-50 truncate"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => handleCopyPix(activePaymentModalInvoice.pix_code!)}
                          title={isEn ? "Copy Code" : "Copiar Código"}
                        >
                          <Copy className="h-4 w-4 text-sky-600" />
                        </Button>
                      </div>
                    </div>
                  )}

                  <Button
                    type="button"
                    className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    disabled={payInvoiceMutation.isPending}
                    onClick={() =>
                      payInvoiceMutation.mutate({
                        invoiceId: activePaymentModalInvoice.id,
                        method: "pix",
                      })
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      {payInvoiceMutation.isPending
                        ? isEn ? "Confirming..." : "Verificando..."
                        : isEn ? "I've Paid via PIX! Activate Now" : "Já fiz o PIX! Confirmar Ativação"}
                    </span>
                  </Button>
                </TabsContent>

                {/* Aba Cartão de Crédito */}
                <TabsContent value="credit_card" className="space-y-3 pt-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{isEn ? "Card Number" : "Número do Cartão"}</Label>
                    <Input
                      placeholder="0000 0000 0000 0000"
                      maxLength={19}
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{isEn ? "Cardholder Name" : "Nome no Cartão"}</Label>
                    <Input
                      placeholder="NOME COMO NO CARTAO"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{isEn ? "Expiry (MM/YY)" : "Validade (MM/AA)"}</Label>
                      <Input
                        placeholder="MM/AA"
                        maxLength={5}
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">CVV</Label>
                      <Input
                        placeholder="123"
                        maxLength={4}
                        type="password"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>
                      {isEn
                        ? "Encrypted 256-bit SSL transaction compliant with PCI-DSS standards."
                        : "Transação criptografada SSL 256-bit compatível com padrões internacionais PCI-DSS."}
                    </span>
                  </div>

                  <Button
                    type="button"
                    className="w-full gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold"
                    disabled={payInvoiceMutation.isPending || !cardNumber || !cardHolder}
                    onClick={() =>
                      payInvoiceMutation.mutate({
                        invoiceId: activePaymentModalInvoice.id,
                        method: "credit_card",
                      })
                    }
                  >
                    <CreditCard className="h-4 w-4" />
                    <span>
                      {payInvoiceMutation.isPending
                        ? isEn ? "Processing..." : "Processando..."
                        : `${isEn ? "Pay" : "Pagar"} R$ ${activePaymentModalInvoice.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                    </span>
                  </Button>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 4. Histórico de Faturas & Recibos */}
      <section className="rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between pb-3 border-b">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-sky-600" />
            <h3 className="font-bold text-navy">
              {isEn ? "Invoices & Receipts History" : "Histórico de Faturas e Comprovantes"}
            </h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {invoices.length} {isEn ? "invoices found" : "faturas emitidas"}
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-slate-500 font-medium">
                <th className="py-2.5 px-3">Fatura</th>
                <th className="py-2.5 px-3">Data</th>
                <th className="py-2.5 px-3">Plano</th>
                <th className="py-2.5 px-3">Valor</th>
                <th className="py-2.5 px-3">Método</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    {isEn ? "No invoices found for this clinic." : "Nenhuma fatura emitida ainda para esta clínica."}
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-mono font-medium text-navy">
                      #{inv.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {new Date(inv.created_at).toLocaleDateString(dateLocale)}
                    </td>
                    <td className="py-3 px-3 capitalize font-medium text-slate-800">
                      {inv.plan_id} ({inv.billing_cycle === "yearly" ? (isEn ? "Yearly" : "Anual") : (isEn ? "Monthly" : "Mensal")})
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-900">
                      R$ {inv.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3">
                      {inv.payment_method === "pix" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <QrCode className="h-3.5 w-3.5" /> PIX
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sky-700 font-medium">
                          <CreditCard className="h-3.5 w-3.5" /> Cartão {inv.card_last4 ? `• ${inv.card_last4}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <Badge
                        variant={inv.status === "paid" ? "default" : "outline"}
                        className={inv.status === "paid" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "text-amber-700 border-amber-300 bg-amber-50"}
                      >
                        {inv.status === "paid" ? (isEn ? "Paid" : "Paga") : (isEn ? "Pending" : "Pendente")}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {inv.status === "paid" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-[11px] text-sky-700 hover:text-sky-800 hover:bg-sky-50"
                          onClick={() => handlePrintReceipt(inv)}
                        >
                          <FileCheck2 className="h-3.5 w-3.5" />
                          <span>{isEn ? "Receipt" : "Recibo"}</span>
                        </Button>
                      ) : (
                        <Button
                          variant="hero"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => {
                            setActivePaymentModalInvoice(inv);
                            setPaymentTab(inv.payment_method === "credit_card" ? "credit_card" : "pix");
                          }}
                        >
                          {isEn ? "Pay Now" : "Pagar Agora"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
