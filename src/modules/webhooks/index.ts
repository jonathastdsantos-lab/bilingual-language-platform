import { supabase, normalizeSupabaseError } from "@/services/supabase";
import type { PaymentGateway, PaymentWebhookEvent, PlatformGatewaySettings } from "@/types";

export interface WebhookProcessResult {
  success: boolean;
  message: string;
  invoiceId?: string | null;
  eventId?: string;
  alreadyProcessed?: boolean;
}

/**
 * Busca as configurações e credenciais de gateways do SuperAdmin
 */
export async function fetchPlatformGatewaySettings(): Promise<PlatformGatewaySettings> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("platform_gateway_settings")
    .select("*")
    .eq("id", "default")
    .single();

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) {
      return {
        id: "default",
        asaas_enabled: true,
        asaas_environment: "sandbox",
        mercadopago_enabled: true,
        mercadopago_environment: "sandbox",
        stripe_enabled: false,
        updated_at: new Date().toISOString(),
      };
    }
    throw new Error(norm.message);
  }

  return data as PlatformGatewaySettings;
}

/**
 * Salva as configurações de gateways do SuperAdmin
 */
export async function updatePlatformGatewaySettings(
  settings: Partial<PlatformGatewaySettings>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { error } = await client
    .from("platform_gateway_settings")
    .update({
      ...settings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

/**
 * Busca o histórico de eventos de webhooks recebidos
 */
export async function fetchWebhookEvents(limit = 50): Promise<PaymentWebhookEvent[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("payment_webhook_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }

  return (data as PaymentWebhookEvent[]) ?? [];
}

/**
 * Processador oficial de webhooks do ASAAS
 * Trata eventos PAYMENT_RECEIVED, PAYMENT_CONFIRMED
 */
export async function processAsaasWebhook(
  payload: Record<string, unknown>,
  receivedToken?: string | null,
): Promise<WebhookProcessResult> {
  const event = String(payload["event"] || "");
  const payment = (payload["payment"] as Record<string, unknown>) || {};
  const externalRef = (payment["externalReference"] as string) || (payload["externalReference"] as string) || null;
  const paymentId = (payment["id"] as string) || (payload["id"] as string) || "asaas_pay";
  const billingType = String(payment["billingType"] || "PIX").toUpperCase();

  // Detecção de cartão se presente
  const creditCard = (payment["creditCard"] as Record<string, unknown>) || {};
  const cardLast4 = (creditCard["creditCardNumber"] as string) || null;
  const cardBrand = (creditCard["creditCardBrand"] as string) || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;

  // 1. Registra evento no log
  const eventRecord = {
    gateway: "asaas" as const,
    event_type: event,
    payload,
    external_reference: externalRef,
    invoice_id: externalRef,
    processed: false,
  };

  const { data: eventData } = await client
    .from("payment_webhook_events")
    .insert(eventRecord)
    .select("id")
    .single();

  const eventId = eventData?.id || crypto.randomUUID();

  // Verifica se o evento é de confirmação de pagamento
  const isPaymentSuccess = event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED";
  if (!isPaymentSuccess) {
    return {
      success: true,
      message: `Evento Asaas ${event} registrado com sucesso (sem ação de baixa necessária).`,
      eventId,
    };
  }

  if (!externalRef) {
    await client
      .from("payment_webhook_events")
      .update({ processing_error: "Fatura não identificada (externalReference ausente)." })
      .eq("id", eventId);

    return {
      success: false,
      message: "externalReference não encontrada no payload do Asaas.",
      eventId,
    };
  }

  // 2. Executa baixa via RPC pay_saas_invoice (idempotente)
  const method = billingType === "CREDIT_CARD" ? "credit_card" : "pix";

  try {
    const { data: rpcRes, error: rpcErr } = await client.rpc("pay_saas_invoice", {
      _invoice_id: externalRef,
      _payment_method: method,
      _card_last4: cardLast4,
      _card_brand: cardBrand,
    });

    if (rpcErr) throw rpcErr;

    // Atualiza fatura com id de transação do gateway
    await client
      .from("saas_invoices")
      .update({ gateway_payment_id: paymentId })
      .eq("id", externalRef);

    // Marca evento como processado
    await client
      .from("payment_webhook_events")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventId);

    return {
      success: true,
      message: `Fatura ${externalRef} baixada com sucesso via Webhook Asaas!`,
      invoiceId: externalRef,
      eventId,
    };
  } catch (err: unknown) {
    const msg = (err as Error)?.message || "Erro desconhecido ao processar fatura.";
    await client
      .from("payment_webhook_events")
      .update({ processing_error: msg })
      .eq("id", eventId);

    return {
      success: false,
      message: msg,
      invoiceId: externalRef,
      eventId,
    };
  }
}

/**
 * Processador oficial de webhooks do MERCADO PAGO
 * Trata notificações IPN e Webhook v1/v2
 */
export async function processMercadoPagoWebhook(
  payload: Record<string, unknown>,
  signature?: string | null,
): Promise<WebhookProcessResult> {
  const action = String(payload["action"] || payload["type"] || "payment");
  const data = (payload["data"] as Record<string, unknown>) || {};
  const paymentId = String(data["id"] || payload["id"] || "");
  const externalRef = (payload["external_reference"] as string) || (data["external_reference"] as string) || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;

  // 1. Registra evento no log
  const eventRecord = {
    gateway: "mercadopago" as const,
    event_type: action,
    payload,
    external_reference: externalRef,
    invoice_id: externalRef,
    processed: false,
  };

  const { data: eventData } = await client
    .from("payment_webhook_events")
    .insert(eventRecord)
    .select("id")
    .single();

  const eventId = eventData?.id || crypto.randomUUID();

  if (!externalRef) {
    return {
      success: true,
      message: `Notificação Mercado Pago ${action} [ID ${paymentId}] registrada.`,
      eventId,
    };
  }

  // 2. Executa liquidação da fatura
  try {
    const { error: rpcErr } = await client.rpc("pay_saas_invoice", {
      _invoice_id: externalRef,
      _payment_method: "credit_card",
      _card_last4: "4242",
      _card_brand: "Mastercard",
    });

    if (rpcErr) throw rpcErr;

    await client
      .from("payment_webhook_events")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventId);

    return {
      success: true,
      message: `Fatura ${externalRef} liquidada com sucesso via Webhook Mercado Pago!`,
      invoiceId: externalRef,
      eventId,
    };
  } catch (err: unknown) {
    const msg = (err as Error)?.message || "Erro ao liquidar fatura.";
    await client
      .from("payment_webhook_events")
      .update({ processing_error: msg })
      .eq("id", eventId);

    return {
      success: false,
      message: msg,
      invoiceId: externalRef,
      eventId,
    };
  }
}

/**
 * Simula o disparo de webhook para testes ao vivo no SuperAdmin
 */
export async function simulateGatewayWebhook(
  gateway: "asaas" | "mercadopago",
  invoiceId: string,
): Promise<WebhookProcessResult> {
  if (gateway === "asaas") {
    const fakeAsaasPayload = {
      event: "PAYMENT_RECEIVED",
      payment: {
        id: `pay_sim_${Date.now()}`,
        customer: "cus_simulated_dental",
        value: 299.0,
        billingType: "PIX",
        status: "RECEIVED",
        externalReference: invoiceId,
        dateCreated: new Date().toISOString(),
      },
    };
    return processAsaasWebhook(fakeAsaasPayload);
  }

  const fakeMercadoPagoPayload = {
    action: "payment.updated",
    type: "payment",
    external_reference: invoiceId,
    data: {
      id: `mp_sim_${Date.now()}`,
      status: "approved",
      external_reference: invoiceId,
    },
  };
  return processMercadoPagoWebhook(fakeMercadoPagoPayload);
}

