import { processAsaasWebhook, processMercadoPagoWebhook } from "./index";

export async function handleWebhookRequest(request: Request, url: URL): Promise<Response> {
  const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

  // Suporte a requisição GET/HEAD para validação de endpoint pelo gateway
  if (request.method === "GET" || request.method === "HEAD") {
    return new Response(JSON.stringify({ status: "active", gateway_endpoint: url.pathname }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST for webhooks." }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  let payload: Record<string, unknown> = {};
  try {
    const rawText = await request.text();
    if (rawText) {
      payload = JSON.parse(rawText);
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  // 1. Rota Asaas
  if (url.pathname.endsWith("/asaas") || url.pathname.includes("/asaas/")) {
    const token = request.headers.get("asaas-access-token") || url.searchParams.get("token");
    const result = await processAsaasWebhook(payload, token);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  // 2. Rota Mercado Pago
  if (url.pathname.endsWith("/mercadopago") || url.pathname.includes("/mercadopago/")) {
    const signature = request.headers.get("x-signature") || url.searchParams.get("signature");
    const result = await processMercadoPagoWebhook(payload, signature);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  return new Response(JSON.stringify({ error: "Unknown gateway webhook endpoint" }), {
    status: 404,
    headers: jsonHeaders,
  });
}

