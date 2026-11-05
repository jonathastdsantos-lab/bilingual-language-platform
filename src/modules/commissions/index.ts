import { supabase } from "@/services/supabase";
import type {
  CommissionSettlement,
  CommissionSettlementItem,
  CommissionPreviewResult,
  CommissionRule,
  CommissionPreviewItem,
} from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = supabase as any;

/**
 * Consulta a prévia de comissões calculadas no período para um profissional.
 */
export async function calculateCommissionPreview(
  clinicId: string,
  professionalId: string,
  startDate: string,
  endDate: string
): Promise<CommissionPreviewResult> {
  const { data, error } = await client.rpc(
    "calculate_professional_commission_preview",
    {
      _clinic_id: clinicId,
      _professional_id: professionalId,
      _start_date: startDate,
      _end_date: endDate,
    }
  );

  if (error) {
    throw new Error(error.message || "Erro ao calcular prévia de comissões.");
  }

  return data as unknown as CommissionPreviewResult;
}

/**
 * Lista todos os fechamentos de repasse da clínica, opcionalmente filtrando por profissional.
 */
export async function fetchCommissionSettlements(
  clinicId: string,
  professionalId?: string | null
): Promise<CommissionSettlement[]> {
  let query = client
    .from("commission_settlements")
    .select(
      `
      *,
      professional:professionals (
        id,
        name,
        cro,
        specialty,
        color
      )
    `
    )
    .eq("clinic_id", clinicId)
    .order("period_end", { ascending: false });

  if (professionalId && professionalId !== "all") {
    query = query.eq("professional_id", professionalId);
  }

  const { data, error } = await query;
  if (error) {
    return [];
  }

  return (data as unknown as CommissionSettlement[]) || [];
}

/**
 * Obtém os detalhes de um fechamento específico com todos os seus itens individuais.
 */
export async function fetchCommissionSettlementDetails(
  settlementId: string
): Promise<{ settlement: CommissionSettlement; items: CommissionSettlementItem[] } | null> {
  const [settlementRes, itemsRes] = await Promise.all([
    client
      .from("commission_settlements")
      .select(
        `
        *,
        professional:professionals (
          id,
          name,
          cro,
          specialty,
          color
        )
      `
      )
      .eq("id", settlementId)
      .single(),
    client
      .from("commission_settlement_items")
      .select("*")
      .eq("settlement_id", settlementId)
      .order("service_date", { ascending: true }),
  ]);

  if (settlementRes.error || !settlementRes.data) {
    return null;
  }

  return {
    settlement: settlementRes.data as unknown as CommissionSettlement,
    items: (itemsRes.data as unknown as CommissionSettlementItem[]) || [],
  };
}

/**
 * Cria um novo fechamento de repasse com base na prévia de itens calculados.
 */
export async function createCommissionSettlement(
  clinicId: string,
  params: {
    professionalId: string;
    periodStart: string;
    periodEnd: string;
    items: CommissionPreviewItem[];
    notes?: string | null | undefined;
  }
): Promise<CommissionSettlement> {
  const code = `REP-${new Date().getFullYear()}${String(
    new Date().getMonth() + 1
  ).padStart(2, "0")}-${Math.floor(100 + Math.random() * 900)}`;

  const totalGross = params.items.reduce((acc, it) => acc + (Number(it.gross_amount) || 0), 0);
  const totalLab = params.items.reduce((acc, it) => acc + (Number(it.lab_cost) || 0), 0);
  const totalComm = params.items.reduce((acc, it) => acc + (Number(it.commission_amount) || 0), 0);

  // 1. Inserir settlement
  const { data: settlementData, error: settlementError } = await client
    .from("commission_settlements")
    .insert({
      clinic_id: clinicId,
      professional_id: params.professionalId,
      settlement_code: code,
      period_start: params.periodStart,
      period_end: params.periodEnd,
      total_gross_amount: totalGross,
      total_lab_deductions: totalLab,
      total_other_deductions: 0,
      net_commission_amount: totalComm,
      status: "draft",
      notes: params.notes || null,
    })
    .select("*")
    .single();

  if (settlementError || !settlementData) {
    throw new Error(settlementError?.message || "Erro ao criar fechamento de repasse.");
  }

  const settlementId = settlementData.id;

  // 2. Inserir itens
  if (params.items.length > 0) {
    const itemsPayload = params.items.map((it) => ({
      settlement_id: settlementId,
      clinic_id: clinicId,
      appointment_id: it.appointment_id || null,
      patient_id: it.patient_id || null,
      patient_name: it.patient_name,
      procedure_name: it.procedure_name,
      service_date: it.service_date,
      gross_amount: it.gross_amount,
      lab_cost: it.lab_cost,
      calculation_basis: it.calculation_basis,
      commission_rate: it.commission_rate,
      commission_amount: it.commission_amount,
    }));

    const { error: itemsError } = await client
      .from("commission_settlement_items")
      .insert(itemsPayload);

    if (itemsError) {
      console.error("Erro ao registrar itens do repasse:", itemsError);
    }
  }

  return settlementData as unknown as CommissionSettlement;
}

/**
 * Aprova e liquida um repasse, gerando a despesa correspondente no fluxo financeiro da clínica.
 */
export async function approveAndPayCommissionSettlement(
  settlementId: string,
  paymentMethod: string = "pix",
  paymentDate: string = new Date().toISOString().split("T")[0] || ""
): Promise<{ success: boolean; message?: string; error?: string }> {
  const { data, error } = await client.rpc(
    "approve_and_pay_commission_settlement",
    {
      _settlement_id: settlementId,
      _payment_method: paymentMethod,
      _payment_date: paymentDate,
    }
  );

  if (error) {
    return {
      success: false,
      error: error.message || "Erro ao aprovar repasse.",
    };
  }

  return (
    (data as { success: boolean; message?: string; error?: string }) || {
      success: true,
    }
  );
}

/**
 * Consulta as regras de comissão da clínica ou de um profissional.
 */
export async function fetchCommissionRules(
  clinicId: string,
  professionalId?: string | null
): Promise<CommissionRule[]> {
  let query = client
    .from("commission_rules")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });

  if (professionalId && professionalId !== "all") {
    query = query.eq("professional_id", professionalId);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data as unknown as CommissionRule[]) || [];
}

/**
 * Salva ou atualiza uma regra de comissão específica.
 */
export async function upsertCommissionRule(
  clinicId: string,
  rule: Partial<CommissionRule> & { professional_id: string }
): Promise<void> {
  const payload = {
    ...rule,
    clinic_id: clinicId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client.from("commission_rules").upsert(payload);
  if (error) throw new Error(error.message);
}

/**
 * Remove uma regra de comissão específica.
 */
export async function deleteCommissionRule(ruleId: string): Promise<void> {
  const { error } = await client.from("commission_rules").delete().eq("id", ruleId);
  if (error) throw new Error(error.message);
}

/**
 * Gera documento HTML para impressão e espelho de repasse do dentista parceiro.
 */
export function generateSettlementPrintableHtml(
  settlement: CommissionSettlement,
  items: CommissionSettlementItem[],
  clinicName: string
): string {
  const fmtMoney = (v: number) =>
    Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const fmtDate = (iso: string) => {
    if (!iso) return "-";
    const datePart = iso.split("T")[0] || "";
    const parts = datePart.split("-");
    if (parts.length < 3) return iso;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const rows = items
    .map(
      (it, idx) => `
      <tr>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px;">${idx + 1}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px;">${fmtDate(it.service_date)}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; font-weight: 600;">${it.patient_name}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px;">${it.procedure_name}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: right;">${fmtMoney(it.gross_amount)}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: right; color: #dc2626;">-${fmtMoney(it.lab_cost)}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: right; font-weight: 600;">${fmtMoney(it.calculation_basis)}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: right;">${it.commission_rate}%</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: right; font-weight: 700; color: #0d9488;">${fmtMoney(it.commission_amount)}</td>
      </tr>
    `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>Espelho de Repasse — ${settlement.settlement_code}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; }
        .header { border-bottom: 2px solid #0d9488; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
        .title { font-size: 20px; font-weight: 800; color: #0f172a; }
        .subtitle { font-size: 12px; color: #64748b; margin-top: 2px; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .badge-paid { background: #dcfce7; color: #15803d; }
        .badge-draft { background: #fef3c7; color: #b45309; }
        .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px; }
        .meta-item { font-size: 11px; }
        .meta-label { color: #64748b; font-weight: 500; }
        .meta-value { font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #0f172a; color: #fff; padding: 8px 10px; font-size: 11px; text-transform: uppercase; font-weight: 700; text-align: left; }
        th.text-right { text-align: right; }
        .totals-box { margin-top: 20px; margin-left: auto; width: 340px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; padding: 14px; }
        .total-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
        .total-highlight { font-size: 15px; font-weight: 800; color: #0d9488; border-top: 2px solid #cbd5e1; padding-top: 8px; margin-top: 6px; }
        .signatures { margin-top: 60px; display: flex; justify-content: space-between; gap: 40px; page-break-inside: avoid; }
        .sig-block { flex: 1; text-align: center; border-top: 1px solid #0f172a; padding-top: 6px; font-size: 11px; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">Espelho de Repasse Odontológico</div>
          <div class="subtitle">${clinicName} • Código: <strong>${settlement.settlement_code}</strong></div>
        </div>
        <div>
          <span class="badge ${settlement.status === "paid" ? "badge-paid" : "badge-draft"}">
            ${settlement.status === "paid" ? "LIQUIDADO / PAGO" : "EM ABERTO"}
          </span>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">Cirurgião-Dentista Parceiro:</div>
          <div class="meta-value">${settlement.professional?.name || "Não informado"}</div>
          <div style="font-size: 10px; color: #64748b;">${settlement.professional?.cro ? `CRO: ${settlement.professional.cro}` : ""}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Período de Apuração:</div>
          <div class="meta-value">${fmtDate(settlement.period_start)} a ${fmtDate(settlement.period_end)}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Forma de Pagamento:</div>
          <div class="meta-value">${(settlement.payment_method || "PIX").toUpperCase()}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Data de Liquidação:</div>
          <div class="meta-value">${settlement.payment_date ? fmtDate(settlement.payment_date) : "Aguardando"}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 30px;">#</th>
            <th style="width: 80px;">Data</th>
            <th>Paciente</th>
            <th>Procedimento</th>
            <th class="text-right">Bruto</th>
            <th class="text-right">Protético</th>
            <th class="text-right">Base</th>
            <th class="text-right">%</th>
            <th class="text-right">Comissão</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="9" style="text-align:center; padding: 14px; font-size: 12px; color: #64748b;">Nenhum atendimento apurado no período.</td></tr>'}
        </tbody>
      </table>

      <div class="totals-box">
        <div class="total-row">
          <span>Produção Bruta:</span>
          <strong>${fmtMoney(settlement.total_gross_amount)}</strong>
        </div>
        <div class="total-row" style="color: #dc2626;">
          <span>(-) Custos Laboratoriais / Prótese:</span>
          <strong>-${fmtMoney(settlement.total_lab_deductions)}</strong>
        </div>
        <div class="total-row total-highlight">
          <span>Valor Líquido a Repassar:</span>
          <span>${fmtMoney(settlement.net_commission_amount)}</span>
        </div>
      </div>

      <div class="signatures">
        <div class="sig-block">
          <strong>${settlement.professional?.name || "Dentista Parceiro"}</strong><br />
          Cirurgião-Dentista
        </div>
        <div class="sig-block">
          <strong>Administração / Financeiro</strong><br />
          ${clinicName}
        </div>
      </div>
    </body>
    </html>
  `;
}

