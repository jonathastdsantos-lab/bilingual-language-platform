import { z } from "zod";
import { assertClinicScope, normalizeSupabaseError, supabase } from "@/services/supabase";
import type { TissGuide, TissGuideItem, TissGuideStatus, TissGuideType } from "@/types";

export * from "./catalogs";
export * from "./settings";
export * from "./xml-exporter";

type TissDbClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (c1: string, v1: string) => {
        order: (col: string, opts?: { ascending?: boolean }) => Promise<{ data: unknown[] | null; error: unknown }>;
      };
      in: (col: string, vals: string[]) => Promise<{ data: unknown[] | null; error: unknown }>;
    };
    insert: (rows: Record<string, unknown> | Array<Record<string, unknown>>) => {
      select: (col: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    } & Promise<{ error: unknown }>;
    update: (row: Record<string, unknown>) => {
      eq: (c1: string, v1: string) => {
        eq: (c2: string, v2: string) => Promise<{ error: unknown }>;
      };
    };
    delete: () => {
      eq: (c1: string, v1: string) => {
        eq: (c2: string, v2: string) => Promise<{ error: unknown }>;
      };
    };
  };
};

const db = supabase as unknown as TissDbClient;

export const TISS_GUIDE_STATUS_LABELS: Record<TissGuideStatus, string> = {
  draft: "Rascunho",
  authorized: "Autorizada pelo Convênio",
  billed: "Faturada / Enviada em Lote",
  paid: "Paga / Liquidada",
  glosed: "Glosada (Contestação Pendente)",
  cancelled: "Cancelada",
};

export const TISS_GUIDE_TYPE_LABELS: Record<TissGuideType, string> = {
  treatment: "GTO — Guia de Tratamento Odontológico",
  initial_exam: "Exame Inicial / Avaliação",
  urgency: "Atendimento Odontológico de Urgência",
};

export const tissGuideItemSchema = z.object({
  tuss_code: z.string().trim().min(3, "Código TUSS obrigatório.").max(20),
  description: z.string().trim().min(2, "Descrição do procedimento obrigatória.").max(200),
  tooth_number: z.number().int().nullable().optional(),
  tooth_surface: z.string().trim().max(10).nullable().optional(),
  quantity: z.number().int().min(1, "Quantidade mínima é 1.").default(1),
  unit_price: z.number().min(0, "Preço unitário não pode ser negativo."),
});

export const tissGuideFormSchema = z.object({
  patient_id: z.string().uuid("Paciente inválido."),
  insurance_id: z.string().uuid("Convênio odontológico obrigatório."),
  professional_id: z.string().uuid().nullable().optional(),
  guide_number: z.string().trim().min(2, "Número da guia obrigatório.").max(40),
  auth_code: z.string().trim().max(50).nullable().optional(),
  guide_type: z.enum(["treatment", "initial_exam", "urgency"]).default("treatment"),
  status: z.enum(["draft", "authorized", "billed", "paid", "glosed", "cancelled"]).default("draft"),
  card_number: z.string().trim().min(4, "Número da carteirinha do beneficiário obrigatório.").max(50),
  card_expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Validade inválida.").nullable().optional(),
  cns_number: z.string().trim().max(30).nullable().optional(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de emissão inválida."),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(tissGuideItemSchema).min(1, "Inclua ao menos um procedimento TUSS na guia."),
});

export type TissGuideFormInput = z.infer<typeof tissGuideFormSchema>;

export interface TissBillingSummary {
  totalGuides: number;
  draftCount: number;
  authorizedCount: number;
  billedCount: number;
  paidCount: number;
  glosedCount: number;
  totalBilledAmount: number;
  totalPaidAmount: number;
  totalGlosedAmount: number;
}

/**
 * Consolida métricas de faturamento e glosas das guias TISS.
 */
export function calculateTissBillingSummary(guides: TissGuide[]): TissBillingSummary {
  let draftCount = 0;
  let authorizedCount = 0;
  let billedCount = 0;
  let paidCount = 0;
  let glosedCount = 0;
  let totalBilledAmount = 0;
  let totalPaidAmount = 0;
  let totalGlosedAmount = 0;

  for (const g of guides) {
    const total = Number(g.total_amount) || 0;
    const glosa = Number(g.glosed_amount) || 0;

    if (g.status === "draft") draftCount += 1;
    else if (g.status === "authorized") authorizedCount += 1;
    else if (g.status === "billed") {
      billedCount += 1;
      totalBilledAmount += total;
    } else if (g.status === "paid") {
      paidCount += 1;
      totalPaidAmount += total;
    } else if (g.status === "glosed") {
      glosedCount += 1;
      totalGlosedAmount += glosa > 0 ? glosa : total;
    }
  }

  return {
    totalGuides: guides.length,
    draftCount,
    authorizedCount,
    billedCount,
    paidCount,
    glosedCount,
    totalBilledAmount: Number(totalBilledAmount.toFixed(2)),
    totalPaidAmount: Number(totalPaidAmount.toFixed(2)),
    totalGlosedAmount: Number(totalGlosedAmount.toFixed(2)),
  };
}

/**
 * Busca guias TISS da clínica com dados do paciente, convênio e itens TUSS.
 */
export async function fetchTissGuides(clinicId: string): Promise<TissGuide[]> {
  assertClinicScope(clinicId);
  const { data, error } = await db
    .from("tiss_guides")
    .select("*,patients(full_name,cpf),dental_insurances(name,ans_code),professionals(name,cro)")
    .eq("clinic_id", clinicId)
    .order("issue_date", { ascending: false });

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }

  const guides = (data ?? []) as unknown as TissGuide[];
  if (guides.length === 0) return [];

  // Busca itens vinculados
  const guideIds = guides.map((g) => g.id);
  const { data: itemsData } = await db
    .from("tiss_guide_items")
    .select("*")
    .in("guide_id", guideIds);

  const itemsByGuide = new Map<string, TissGuideItem[]>();
  for (const item of (itemsData ?? []) as unknown as TissGuideItem[]) {
    const arr = itemsByGuide.get(item.guide_id) ?? [];
    arr.push(item);
    itemsByGuide.set(item.guide_id, arr);
  }

  return guides.map((g) => ({
    ...g,
    items: itemsByGuide.get(g.id) ?? [],
  }));
}

/**
 * Cria uma nova Guia TISS com seus procedimentos TUSS e total calculado.
 */
export async function createTissGuide(clinicId: string, input: TissGuideFormInput): Promise<void> {
  assertClinicScope(clinicId);
  const parsed = tissGuideFormSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados da Guia TISS inválidos.");
  }

  const d = parsed.data;
  const totalAmount = d.items.reduce((s, it) => s + it.quantity * it.unit_price, 0);

  const { data: guideData, error: guideErr } = await db
    .from("tiss_guides")
    .insert({
      clinic_id: clinicId,
      patient_id: d.patient_id,
      insurance_id: d.insurance_id,
      professional_id: d.professional_id ?? null,
      guide_number: d.guide_number,
      auth_code: d.auth_code?.trim() || null,
      guide_type: d.guide_type,
      status: d.status,
      card_number: d.card_number,
      card_expiration: d.card_expiration || null,
      cns_number: d.cns_number?.trim() || null,
      issue_date: d.issue_date,
      total_amount: Number(totalAmount.toFixed(2)),
      notes: d.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (guideErr) throw new Error(normalizeSupabaseError(guideErr).message);

  const guideId = (guideData as { id: string }).id;

  const itemRows = d.items.map((it) => ({
    clinic_id: clinicId,
    guide_id: guideId,
    tuss_code: it.tuss_code,
    description: it.description,
    tooth_number: it.tooth_number ?? null,
    tooth_surface: it.tooth_surface?.trim() || null,
    quantity: it.quantity,
    unit_price: it.unit_price,
    total_price: Number((it.quantity * it.unit_price).toFixed(2)),
  }));

  const { error: itemsErr } = await db.from("tiss_guide_items").insert(itemRows);
  if (itemsErr) throw new Error(normalizeSupabaseError(itemsErr).message);
}

/**
 * Atualiza status da Guia TISS (ex.: de autorizada para faturada, ou paga/glosada).
 */
export async function updateTissGuideStatus(
  clinicId: string,
  guideId: string,
  status: TissGuideStatus,
  options?: { glosedAmount?: number | undefined },
): Promise<void> {
  assertClinicScope(clinicId);
  const payload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "billed") {
    payload["billed_date"] = new Date().toISOString().slice(0, 10);
  } else if (status === "paid") {
    payload["paid_date"] = new Date().toISOString().slice(0, 10);
  } else if (status === "glosed" && options?.glosedAmount !== undefined) {
    payload["glosed_amount"] = options.glosedAmount;
  }

  const { error } = await db
    .from("tiss_guides")
    .update(payload)
    .eq("clinic_id", clinicId)
    .eq("id", guideId);

  if (error) throw new Error(normalizeSupabaseError(error).message);
}

/**
 * Exclui Guia TISS.
 */
export async function deleteTissGuide(clinicId: string, guideId: string): Promise<void> {
  assertClinicScope(clinicId);
  const { error } = await db
    .from("tiss_guides")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("id", guideId);

  if (error) throw new Error(normalizeSupabaseError(error).message);
}

/**
 * Monta o documento oficial para impressão da GTO (Guia de Tratamento Odontológico - Padrão ANS).
 */
export function buildTissPrintableHtml(params: {
  clinicName: string;
  guide: TissGuide;
}): string {
  const { clinicName, guide } = params;
  const items = guide.items ?? [];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Guia TISS GTO — ${guide.guide_number}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #0f172a; margin: 20px; line-height: 1.3; }
    .box { border: 1.5px solid #0f172a; padding: 14px; border-radius: 8px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
    .title { font-size: 14px; font-weight: 800; text-transform: uppercase; }
    .ans-tag { font-size: 10px; font-weight: bold; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
    .field { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; background: #f8fafc; }
    .lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; }
    .val { font-size: 12px; font-weight: 700; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
    th { background: #0f172a; color: #fff; text-align: left; padding: 5px 6px; }
    td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; }
    .total { text-align: right; font-size: 12px; font-weight: 800; margin-top: 10px; }
    .sig-area { display: flex; justify-content: space-between; margin-top: 36px; text-align: center; font-size: 10px; }
    .sig-line { width: 45%; border-top: 1px solid #0f172a; padding-top: 4px; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <div class="box">
    <div class="header">
      <div>
        <div class="title">PADRÃO TISS — GUIA DE TRATAMENTO ODONTOLÓGICO (GTO)</div>
        <div>${clinicName} · Registro ANS da Operadora: ${guide.dental_insurances?.ans_code ?? "—"}</div>
      </div>
      <div style="text-align: right;">
        <span class="ans-tag">Nº GUIA: ${guide.guide_number}</span>
        ${guide.auth_code ? `<div style="margin-top: 4px; font-size: 10px;"><b>Senha Aut.:</b> ${guide.auth_code}</div>` : ""}
      </div>
    </div>

    <div class="grid">
      <div class="field" style="grid-column: span 2;">
        <div class="lbl">Operadora de Plano Privado de Saúde</div>
        <div class="val">${guide.dental_insurances?.name ?? "Convênio Não Informado"}</div>
      </div>
      <div class="field">
        <div class="lbl">Número da Carteira</div>
        <div class="val">${guide.card_number}</div>
      </div>
      <div class="field">
        <div class="lbl">Validade da Carteira</div>
        <div class="val">${guide.card_expiration ?? "—"}</div>
      </div>

      <div class="field" style="grid-column: span 2;">
        <div class="lbl">Nome do Beneficiário</div>
        <div class="val">${guide.patients?.full_name ?? "Paciente"}</div>
      </div>
      <div class="field">
        <div class="lbl">CPF / CNS do Beneficiário</div>
        <div class="val">${guide.patients?.cpf ?? guide.cns_number ?? "—"}</div>
      </div>
      <div class="field">
        <div class="lbl">Data de Emissão</div>
        <div class="val">${guide.issue_date}</div>
      </div>

      <div class="field" style="grid-column: span 2;">
        <div class="lbl">Cirurgião-Dentista Solicitante / Executante</div>
        <div class="val">${guide.professionals?.name ?? "Cirurgião-Dentista da Clínica"}</div>
      </div>
      <div class="field">
        <div class="lbl">Conselho Profissional (CRO)</div>
        <div class="val">${guide.professionals?.cro ?? "CRO/UF"}</div>
      </div>
      <div class="field">
        <div class="lbl">Status da Guia TISS</div>
        <div class="val">${TISS_GUIDE_STATUS_LABELS[guide.status]}</div>
      </div>
    </div>

    <div class="lbl">Procedimentos Odontológicos Realizados (Tabela TUSS)</div>
    <table>
      <thead>
        <tr>
          <th>Código TUSS</th>
          <th>Descrição do Procedimento</th>
          <th>Dente FDI</th>
          <th>Face</th>
          <th>Qtd.</th>
          <th>Vl. Unitário</th>
          <th>Vl. Total</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (it) => `<tr>
          <td><b>${it.tuss_code}</b></td>
          <td>${it.description}</td>
          <td>${it.tooth_number ?? "—"}</td>
          <td>${it.tooth_surface ?? "—"}</td>
          <td>${it.quantity}</td>
          <td>R$ ${Number(it.unit_price).toFixed(2)}</td>
          <td><b>R$ ${Number(it.total_price).toFixed(2)}</b></td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>

    <div class="total">
      VALOR TOTAL INFORMADO DA GUIA: R$ ${Number(guide.total_amount).toFixed(2)}
    </div>

    <div class="sig-area">
      <div class="sig-line">Assinatura do Beneficiário / Responsável Legal</div>
      <div class="sig-line">Assinatura e Carimbo do Cirurgião-Dentista (CRO)</div>
    </div>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}

