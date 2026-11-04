import { z } from "zod";
import { assertClinicScope, normalizeSupabaseError, supabase } from "@/services/supabase";
import { toSaoPauloDateKey } from "@/utils/timezone";
import type {
  StockAlertStatus,
  StockItem,
  StockMovement,
  StockMovementType,
  StockSummaryIndicators,
} from "@/types";

export const STOCK_CATEGORIES = [
  "Resinas e Adesivos",
  "Anestésicos e Medicamentos",
  "Descartáveis e EPI",
  "Endodontia",
  "Implantodontia e Cirurgia",
  "Moldagem e Prótese",
  "Biossegurança e Esterilização",
  "Ortodontia",
  "Profilaxia e Prevenção",
  "Outros",
] as const;

export const STOCK_UNITS = [
  { value: "un", label: "Unidade (un)" },
  { value: "cx", label: "Caixa (cx)" },
  { value: "pct", label: "Pacote (pct)" },
  { value: "seringa", label: "Seringa" },
  { value: "tubete", label: "Tubete" },
  { value: "frasco", label: "Frasco" },
  { value: "kit", label: "Kit" },
  { value: "par", label: "Par" },
  { value: "rolo", label: "Rolo" },
] as const;

export const EXPIRING_SOON_DAYS_THRESHOLD = 30;

export const stockItemFormSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do insumo.").max(180),
  category: z.string().trim().min(2).max(100),
  sku: z.string().trim().max(80).optional(),
  unit_measure: z.string().trim().min(1).max(30).default("un"),
  current_quantity: z.number().min(0, "A quantidade inicial não pode ser negativa."),
  min_quantity: z.number().min(0, "O estoque mínimo não pode ser negativo."),
  unit_cost: z.number().min(0, "O custo unitário não pode ser negativo."),
  supplier: z.string().trim().max(160).optional(),
  batch_number: z.string().trim().max(80).optional(),
  expiration_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de validade inválida.")
    .nullable()
    .optional(),
  storage_location: z.string().trim().max(120).optional(),
  unit_id: z.string().uuid().nullable().optional(),
});

export const stockMovementFormSchema = z.object({
  item_id: z.string().uuid("Selecione um insumo válido."),
  movement_type: z.enum(["in", "out", "adjustment", "expired_loss"]),
  quantity: z.number().positive("A quantidade movimentada deve ser maior que zero."),
  unit_cost: z.number().min(0).optional(),
  batch_number: z.string().trim().max(80).optional(),
  expiration_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de validade inválida.")
    .nullable()
    .optional(),
  reason: z.string().trim().min(2, "Informe o motivo ou destino da movimentação.").max(240),
  professional_id: z.string().uuid().nullable().optional(),
  patient_id: z.string().uuid().nullable().optional(),
  unit_id: z.string().uuid().nullable().optional(),
});

/**
 * Avalia o status de alerta sanitário (ANVISA) e de reposição de um insumo odontológico.
 * Prioridade de criticidade:
 * 1. expired (lote vencido)
 * 2. out_of_stock (saldo zerado)
 * 3. expiring_soon (vence nos próximos 30 dias)
 * 4. low_stock (saldo <= estoque mínimo)
 * 5. ok (regular)
 */
export function evaluateStockItemStatus(
  item: Pick<StockItem, "current_quantity" | "min_quantity" | "expiration_date">,
  now: Date = new Date(),
): StockAlertStatus {
  const todayKey = toSaoPauloDateKey(now);
  const currentQty = Number(item.current_quantity) || 0;
  const minQty = Number(item.min_quantity) || 0;

  if (item.expiration_date) {
    if (item.expiration_date < todayKey) {
      return "expired";
    }
    const todayUtc = new Date(`${todayKey}T00:00:00Z`).getTime();
    const expUtc = new Date(`${item.expiration_date}T00:00:00Z`).getTime();
    const diffDays = Math.ceil((expUtc - todayUtc) / 86_400_000);
    if (diffDays >= 0 && diffDays <= EXPIRING_SOON_DAYS_THRESHOLD) {
      if (currentQty <= 0) return "out_of_stock";
      return "expiring_soon";
    }
  }

  if (currentQty <= 0) {
    return "out_of_stock";
  }

  if (currentQty <= minQty) {
    return "low_stock";
  }

  return "ok";
}

/**
 * Calcula a nova quantidade resultante em estoque após uma movimentação (Kardex).
 * Bloqueia saídas ou baixas que deixariam o estoque negativo.
 */
export function computeMovementResultingQuantity(
  previousQuantity: number,
  movementType: StockMovementType,
  quantity: number,
): number {
  const prev = Math.max(0, Number(previousQuantity) || 0);
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= 0) {
    throw new Error("A quantidade movimentada deve ser maior que zero.");
  }

  if (movementType === "in") {
    return Number((prev + qty).toFixed(2));
  }

  if (movementType === "out" || movementType === "expired_loss") {
    if (qty > prev) {
      throw new Error(
        `Saldo insuficiente em estoque (disponível: ${prev}, solicitado: ${qty}).`,
      );
    }
    return Number((prev - qty).toFixed(2));
  }

  // adjustment define o novo saldo físico auditado diretamente se >= 0
  return Number(qty.toFixed(2));
}

/**
 * Calcula os indicadores gerenciais do estoque odontológico em BRL.
 */
export function calculateStockSummary(
  items: Pick<
    StockItem,
    "current_quantity" | "min_quantity" | "unit_cost" | "expiration_date" | "active"
  >[],
  now: Date = new Date(),
): StockSummaryIndicators {
  const activeItems = items.filter((i) => i.active !== false);

  let totalInventoryValueBRL = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let expiringSoonCount = 0;
  let expiredCount = 0;

  for (const item of activeItems) {
    const qty = Math.max(0, Number(item.current_quantity) || 0);
    const cost = Math.max(0, Number(item.unit_cost) || 0);
    totalInventoryValueBRL += qty * cost;

    const status = evaluateStockItemStatus(item, now);
    if (status === "expired") {
      expiredCount += 1;
    } else if (status === "expiring_soon") {
      expiringSoonCount += 1;
    }

    if (qty <= 0) {
      outOfStockCount += 1;
    } else if (qty <= Number(item.min_quantity)) {
      lowStockCount += 1;
    }
  }

  return {
    totalItemsCount: activeItems.length,
    totalInventoryValueBRL: Number(totalInventoryValueBRL.toFixed(2)),
    lowStockCount,
    outOfStockCount,
    expiringSoonCount,
    expiredCount,
  };
}

// =============================================================================
// OPERAÇÕES NO BANCO DE DADOS (SUPABASE MULTI-TENANT)
// =============================================================================

type StockDbClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (c1: string, v1: string) => {
        order: (col: string, opts?: { ascending?: boolean }) => {
          limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>;
        };
      };
    };
    insert: (
      rows: Record<string, unknown> | Array<Record<string, unknown>>,
    ) => {
      select: (cols: string) => {
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

const db = supabase as unknown as StockDbClient;

export async function fetchStockItems(clinicId: string): Promise<StockItem[]> {
  assertClinicScope(clinicId);
  const { data, error } = await db
    .from("stock_items")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("name", { ascending: true })
    .limit(500);

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }
  return (data ?? []) as StockItem[];
}

export async function createStockItem(
  clinicId: string,
  input: z.infer<typeof stockItemFormSchema>,
): Promise<void> {
  assertClinicScope(clinicId);
  const parsed = stockItemFormSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados do insumo inválidos.");
  }

  const d = parsed.data;
  const { data: created, error } = await db
    .from("stock_items")
    .insert({
      clinic_id: clinicId,
      unit_id: d.unit_id ?? null,
      name: d.name,
      category: d.category,
      sku: d.sku?.trim() || null,
      unit_measure: d.unit_measure,
      current_quantity: d.current_quantity,
      min_quantity: d.min_quantity,
      unit_cost: d.unit_cost,
      supplier: d.supplier?.trim() || null,
      batch_number: d.batch_number?.trim() || null,
      expiration_date: d.expiration_date || null,
      storage_location: d.storage_location?.trim() || null,
      active: true,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }

  const createdRow = created as { id?: string } | null;
  if (createdRow?.id && d.current_quantity > 0) {
    await db.from("stock_movements").insert({
      clinic_id: clinicId,
      item_id: createdRow.id,
      unit_id: d.unit_id ?? null,
      movement_type: "in",
      quantity: d.current_quantity,
      previous_quantity: 0,
      resulting_quantity: d.current_quantity,
      unit_cost: d.unit_cost,
      batch_number: d.batch_number?.trim() || null,
      expiration_date: d.expiration_date || null,
      reason: "Saldo inicial de implantação",
    });
  }
}

export async function recordStockMovement(
  clinicId: string,
  currentItem: StockItem,
  input: z.infer<typeof stockMovementFormSchema>,
): Promise<void> {
  assertClinicScope(clinicId);
  const parsed = stockMovementFormSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados da movimentação inválidos.");
  }

  const d = parsed.data;
  const prevQty = Number(currentItem.current_quantity) || 0;
  const resultingQty = computeMovementResultingQuantity(
    prevQty,
    d.movement_type,
    d.quantity,
  );
  const effectiveCost =
    d.unit_cost !== undefined ? d.unit_cost : Number(currentItem.unit_cost) || 0;

  // 1. Insere registro imutável no Kardex (stock_movements)
  const { error: movErr } = await db.from("stock_movements").insert({
    clinic_id: clinicId,
    item_id: currentItem.id,
    unit_id: d.unit_id ?? currentItem.unit_id ?? null,
    movement_type: d.movement_type,
    quantity: d.quantity,
    previous_quantity: prevQty,
    resulting_quantity: resultingQty,
    unit_cost: effectiveCost,
    batch_number: d.batch_number?.trim() || currentItem.batch_number || null,
    expiration_date: d.expiration_date || currentItem.expiration_date || null,
    reason: d.reason,
    professional_id: d.professional_id ?? null,
    patient_id: d.patient_id ?? null,
  });

  if (movErr) {
    throw new Error(normalizeSupabaseError(movErr).message);
  }

  // 2. Atualiza saldo, lote e validade atuais no item de estoque
  const updatePayload: Record<string, unknown> = {
    current_quantity: resultingQty,
    updated_at: new Date().toISOString(),
  };
  if (d.movement_type === "in") {
    if (d.unit_cost !== undefined && d.unit_cost > 0) {
      updatePayload["unit_cost"] = d.unit_cost;
    }
    if (d.batch_number?.trim()) {
      updatePayload["batch_number"] = d.batch_number.trim();
    }
    if (d.expiration_date) {
      updatePayload["expiration_date"] = d.expiration_date;
    }
  }

  const { error: updErr } = await db
    .from("stock_items")
    .update(updatePayload)
    .eq("clinic_id", clinicId)
    .eq("id", currentItem.id);

  if (updErr) {
    throw new Error(normalizeSupabaseError(updErr).message);
  }
}

export async function deleteStockItem(clinicId: string, itemId: string): Promise<void> {
  assertClinicScope(clinicId);
  const { error } = await db
    .from("stock_items")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("id", itemId);
  if (error) {
    throw new Error(normalizeSupabaseError(error).message);
  }
}

export async function fetchStockMovements(clinicId: string): Promise<StockMovement[]> {
  assertClinicScope(clinicId);
  const { data, error } = await db
    .from("stock_movements")
    .select("*,stock_items(name,unit_measure),professionals(name),patients(full_name)")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    const norm = normalizeSupabaseError(error);
    if (norm.isSchemaPending) return [];
    throw new Error(norm.message);
  }
  return (data ?? []) as StockMovement[];
}

