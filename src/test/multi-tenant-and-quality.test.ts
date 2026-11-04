import { describe, expect, it } from "vitest";
import { assertClinicScope, normalizeSupabaseError } from "@/services/supabase";
import { buildAdministrativeAlerts } from "@/services/notifications";
import { evaluateMemberPermission } from "@/modules/permissions";
import {
  calculateAttendanceIndicators,
  calculateCashFlowSummary,
  calculateFinancialIndicators,
  calculateProfessionalCommissions,
  financialEntryFormSchema,
  generateInstallmentRows,
} from "@/modules/finance";
import {
  calculateStockSummary,
  computeMovementResultingQuantity,
  evaluateStockItemStatus,
  stockItemFormSchema,
  stockMovementFormSchema,
} from "@/modules/stock";
import { calculateClinicalDRE, serializeRowsToCsv } from "@/modules/reports";
import {
  buildWhatsAppWebUrl,
  interpolateWhatsappTemplate,
  normalizeBrazilianWhatsAppPhone,
  whatsappTemplateFormSchema,
} from "@/modules/whatsapp";
import { patientFormSchema } from "@/modules/patients";
import { appointmentFormSchema } from "@/modules/appointments";
import { authCredentialsSchema } from "@/modules/auth";
import {
  aggregateOdontogramState,
  calculateTreatmentPlanSummary,
  clinicalRecordSchema,
  isValidFdiTooth,
  odontogramEntrySchema,
} from "@/modules/records";
import { formatCurrencyBRL, getDashboardPeriodRange, toSaoPauloDateKey } from "@/utils/timezone";
import { formatCNPJ, formatCPF, hasTimeOverlap, isValidCNPJ, isValidCPF } from "@/utils/validators";
import type { ClinicRole, FinancialEntry, PermissionKey } from "@/types";

const CLINIC_A = "11111111-1111-4111-8111-111111111111";
const CLINIC_B = "22222222-2222-4222-8222-222222222222";
const USER_ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_BRUNO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/**
 * Simulador determinístico das políticas RLS do PostgreSQL definidas nas migrations
 * 0001 e 0002 (is_clinic_member + has_clinic_permission).
 */
class MultiTenantRlsSimulator {
  private memberships: Array<{ clinic_id: string; user_id: string; role: ClinicRole }> = [
    { clinic_id: CLINIC_A, user_id: USER_ALICE, role: "owner" },
    { clinic_id: CLINIC_B, user_id: USER_BRUNO, role: "owner" },
  ];

  private patients: Array<{ id: string; clinic_id: string; full_name: string }> = [
    { id: "p-a1", clinic_id: CLINIC_A, full_name: "Paciente Clínica A" },
    { id: "p-b1", clinic_id: CLINIC_B, full_name: "Paciente Secreto Clínica B" },
  ];

  isClinicMember(userId: string, clinicId: string): boolean {
    return this.memberships.some((m) => m.user_id === userId && m.clinic_id === clinicId);
  }

  hasClinicPermission(userId: string, clinicId: string, perm: PermissionKey): boolean {
    const m = this.memberships.find((row) => row.user_id === userId && row.clinic_id === clinicId);
    if (!m) return false;
    return evaluateMemberPermission(m.role, perm, []);
  }

  selectPatientsAs(userId: string, targetClinicId: string) {
    assertClinicScope(targetClinicId);
    return this.patients.filter(
      (p) =>
        p.clinic_id === targetClinicId &&
        this.hasClinicPermission(userId, p.clinic_id, "patients.read"),
    );
  }

  insertPatientAs(userId: string, targetClinicId: string, fullName: string) {
    assertClinicScope(targetClinicId);
    if (!this.hasClinicPermission(userId, targetClinicId, "patients.write")) {
      throw { code: "42501", message: "new row violates row-level security policy for table \"patients\"" };
    }
    const created = { id: `p-${Date.now()}`, clinic_id: targetClinicId, full_name: fullName };
    this.patients.push(created);
    return created;
  }

  deletePatientAs(userId: string, targetClinicId: string, patientId: string): number {
    assertClinicScope(targetClinicId);
    const before = this.patients.length;
    this.patients = this.patients.filter(
      (p) =>
        !(
          p.id === patientId &&
          p.clinic_id === targetClinicId &&
          this.hasClinicPermission(userId, p.clinic_id, "patients.write")
        ),
    );
    return before - this.patients.length;
  }
}

describe("Isolamento Multi-Tenant e Segurança RLS", () => {
  it("impede que um usuário da Clínica A leia registros da Clínica B", () => {
    const db = new MultiTenantRlsSimulator();

    const ownPatients = db.selectPatientsAs(USER_ALICE, CLINIC_A);
    expect(ownPatients).toHaveLength(1);
    expect(ownPatients[0]?.full_name).toBe("Paciente Clínica A");

    const crossTenantPatients = db.selectPatientsAs(USER_ALICE, CLINIC_B);
    expect(crossTenantPatients).toHaveLength(0);
  });

  it("bloqueia inserção e exclusão cruzada entre clínicas com erro RLS (42501)", () => {
    const db = new MultiTenantRlsSimulator();

    expect(() => db.insertPatientAs(USER_ALICE, CLINIC_B, "Invasão")).toThrow();

    try {
      db.insertPatientAs(USER_ALICE, CLINIC_B, "Invasão");
    } catch (err) {
      const normalized = normalizeSupabaseError(err);
      expect(normalized.isRlsViolation).toBe(true);
      expect(normalized.code).toBe("42501");
    }

    const deletedCount = db.deletePatientAs(USER_ALICE, CLINIC_B, "p-b1");
    expect(deletedCount).toBe(0);

    // Confirma que o dado da Clínica B permanece intacto para o Usuário B
    expect(db.selectPatientsAs(USER_BRUNO, CLINIC_B)).toHaveLength(1);
  });

  it("rejeita consultas sem clinicId válido no cliente", () => {
    expect(() => assertClinicScope("")).toThrow(/Escopo de clínica inválido/);
    expect(() => assertClinicScope(null)).toThrow(/Escopo de clínica inválido/);
    expect(() => assertClinicScope(CLINIC_A)).not.toThrow();
  });
});

describe("Controle de Acesso por Perfil (RBAC) e Permissões Individuais", () => {
  it("respeita as permissões padrão de cada perfil", () => {
    expect(evaluateMemberPermission("owner", "financial.view")).toBe(true);
    expect(evaluateMemberPermission("admin", "team.manage")).toBe(true);
    expect(evaluateMemberPermission("finance", "financial.view")).toBe(true);
    expect(evaluateMemberPermission("receptionist", "financial.view")).toBe(false);
    expect(evaluateMemberPermission("receptionist", "appointments.write")).toBe(true);
    expect(evaluateMemberPermission("stock", "patients.write")).toBe(false);
  });

  it("permite conceder ou revogar permissões individuais por membro", () => {
    // Recepcionista com permissão individual concedida para visualizar financeiro
    expect(
      evaluateMemberPermission("receptionist", "financial.view", [
        { permission: "financial.view", granted: true },
      ]),
    ).toBe(true);

    // Dentista com permissão de exclusão/edição de pacientes revogada individualmente
    expect(
      evaluateMemberPermission("dentist", "patients.write", [
        { permission: "patients.write", granted: false },
      ]),
    ).toBe(false);

    // Proprietário nunca perde acesso mesmo se houver registro de override
    expect(
      evaluateMemberPermission("owner", "settings.manage", [
        { permission: "settings.manage", granted: false },
      ]),
    ).toBe(true);
  });
});

describe("Indicadores do Dashboard, Moeda BRL e Fuso America/Sao_Paulo", () => {
  it("retorna zeros exatos quando não há movimentações (sem dados fictícios)", () => {
    const now = new Date("2026-11-04T15:00:00-03:00");
    const { start, end } = getDashboardPeriodRange("30d", now);

    const fin = calculateFinancialIndicators([], [], start, end, now);
    expect(fin.revenueToday).toBe(0);
    expect(fin.revenuePeriod).toBe(0);
    expect(fin.projectedRevenuePeriod).toBe(0);
    expect(fin.averageTicket).toBe(0);
    expect(fin.estimatedCommissions).toBe(0);

    const att = calculateAttendanceIndicators([], 0, start, end);
    expect(att.totalAppointments).toBe(0);
    expect(att.completionRatePct).toBe(0);
    expect(att.noShowRatePct).toBe(0);
  });

  it("calcula corretamente faturamento do dia, período, ticket médio e comissões em BRL", () => {
    const now = new Date("2026-11-04T14:00:00-03:00");
    const { start, end } = getDashboardPeriodRange("30d", now);

    const profs = [{ id: "prof-1", name: "Dra. Ana", color: "#1e6bff", commission_pct: 40 }];
    const appts = [
      {
        starts_at: "2026-11-04T10:00:00-03:00",
        status: "completed",
        price: 500,
        professional_id: "prof-1",
      },
      {
        starts_at: "2026-11-01T11:00:00-03:00",
        status: "completed",
        price: 300,
        professional_id: "prof-1",
      },
      {
        starts_at: "2026-11-04T16:00:00-03:00",
        status: "scheduled",
        price: 250,
        professional_id: "prof-1",
      },
    ];

    const fin = calculateFinancialIndicators(appts, profs, start, end, now);
    expect(fin.revenueToday).toBe(500);
    expect(fin.revenuePeriod).toBe(800);
    expect(fin.projectedRevenuePeriod).toBe(250);
    expect(fin.averageTicket).toBe(400);
    expect(fin.estimatedCommissions).toBe(320); // 40% de 800

    expect(formatCurrencyBRL(fin.revenuePeriod, "pt-BR")).toContain("800,00");
    expect(toSaoPauloDateKey("2026-11-04T23:30:00-03:00")).toBe("2026-11-04");
  });

  it("gera alertas administrativos reais a partir de condições operacionais", () => {
    const now = new Date("2026-11-04T09:00:00-03:00");
    const alerts = buildAdministrativeAlerts(
      {
        professionalsCount: 0,
        roomsCount: 0,
        unitsCount: 1,
        appointments: [
          {
            id: "a1",
            starts_at: "2026-11-04T14:00:00-03:00",
            status: "scheduled",
            patients: { full_name: "Carlos", allergies: "Penicilina" },
          },
        ],
        noShowRatePct: 0,
      },
      now,
    );

    const ids = alerts.map((a) => a.id);
    expect(ids).toContain("no-professionals");
    expect(ids).toContain("no-rooms");
    expect(ids).toContain("unconfirmed-today");
    expect(ids).toContain("allergy-attention");
  });
});

describe("Validação de Formulários e Integridade", () => {
  it("valida CPF e CNPJ corretamente", () => {
    expect(isValidCPF("52998224725")).toBe(true);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("12345678900")).toBe(false);
    expect(formatCPF("52998224725")).toBe("529.982.247-25");

    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("00.000.000/0000-00")).toBe(false);
    expect(formatCNPJ("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("valida schemas de autenticação, pacientes e agendamentos", () => {
    expect(
      authCredentialsSchema.safeParse({ email: "contato@clinica.com.br", password: "123" }).success,
    ).toBe(false);
    expect(
      authCredentialsSchema.safeParse({ email: "contato@clinica.com.br", password: "password123" }).success,
    ).toBe(true);

    expect(
      patientFormSchema.safeParse({ full_name: "Maria Silva", cpf: "111.111.111-11" }).success,
    ).toBe(false);
    expect(
      patientFormSchema.safeParse({ full_name: "Maria Silva", cpf: "52998224725" }).success,
    ).toBe(true);

    // Horário final anterior ao inicial deve falhar
    expect(
      appointmentFormSchema.safeParse({
        patient_id: "11111111-1111-4111-8111-111111111111",
        professional_id: "22222222-2222-4222-8222-222222222222",
        date: "2026-11-04",
        start: "14:00",
        end: "13:00",
        status: "scheduled",
      }).success,
    ).toBe(false);

    expect(
      hasTimeOverlap(
        new Date("2026-11-04T10:00:00Z"),
        new Date("2026-11-04T11:00:00Z"),
        new Date("2026-11-04T10:30:00Z"),
        new Date("2026-11-04T11:30:00Z"),
      ),
    ).toBe(true);
  });
});

describe("Prontuário Odontológico, Odontograma FDI e Planos de Tratamento", () => {
  it("valida numeração internacional FDI (permanentes 11-48 e decíduos 51-85)", () => {
    expect(isValidFdiTooth(11)).toBe(true);
    expect(isValidFdiTooth(28)).toBe(true);
    expect(isValidFdiTooth(36)).toBe(true);
    expect(isValidFdiTooth(48)).toBe(true);
    expect(isValidFdiTooth(51)).toBe(true);
    expect(isValidFdiTooth(85)).toBe(true);

    // Números inexistentes na notação FDI devem ser rejeitados
    expect(isValidFdiTooth(10)).toBe(false);
    expect(isValidFdiTooth(19)).toBe(false);
    expect(isValidFdiTooth(56)).toBe(false);
    expect(isValidFdiTooth(99)).toBe(false);

    expect(
      odontogramEntrySchema.safeParse({
        patient_id: "11111111-1111-4111-8111-111111111111",
        tooth_number: 19,
        surface: "O",
        condition: "caries",
      }).success,
    ).toBe(false);

    expect(
      clinicalRecordSchema.safeParse({
        patient_id: "11111111-1111-4111-8111-111111111111",
        tooth_number: 36,
        record_type: "evolution",
        title: "Restauração Classe I",
        content: "Isolamento absoluto e restauração em resina composta A2.",
      }).success,
    ).toBe(true);
  });

  it("agrega corretamente o estado cumulativo das 5 faces anatômicas no Odontograma", () => {
    const state = aggregateOdontogramState([
      {
        id: "e1",
        clinic_id: CLINIC_A,
        patient_id: "p1",
        professional_id: null,
        tooth_number: 36,
        surface: "O",
        condition: "caries",
        procedure: "Lesão oclusal",
        notes: null,
        created_by: null,
        created_at: "2026-11-01T10:00:00Z",
      },
      {
        id: "e2",
        clinic_id: CLINIC_A,
        patient_id: "p1",
        professional_id: null,
        tooth_number: 36,
        surface: "M",
        condition: "restoration",
        procedure: "Resina mesial",
        notes: null,
        created_by: null,
        created_at: "2026-11-02T10:00:00Z",
      },
      {
        id: "e3",
        clinic_id: CLINIC_A,
        patient_id: "p1",
        professional_id: null,
        tooth_number: 36,
        surface: "O",
        condition: "completed",
        procedure: "Restauração concluída",
        notes: null,
        created_by: null,
        created_at: "2026-11-03T10:00:00Z",
      },
    ]);

    const tooth36 = state[36];
    expect(tooth36).toBeDefined();
    expect(tooth36?.surfaces.O).toBe("completed");
    expect(tooth36?.surfaces.M).toBe("restoration");
    expect(tooth36?.surfaces.D).toBe("healthy");
    expect(tooth36?.entriesCount).toBe(3);
    expect(tooth36?.lastProcedure).toBe("Restauração concluída");
  });

  it("calcula subtotal, desconto, total líquido e progresso de planos de tratamento em BRL", () => {
    const summary = calculateTreatmentPlanSummary(
      { discount_amount: 150 },
      [
        { price: 400, status: "completed" },
        { price: 600, status: "planned" },
        { price: 300, status: "cancelled" },
      ],
    );

    expect(summary.subtotal).toBe(1000);
    expect(summary.discount).toBe(150);
    expect(summary.netTotal).toBe(850);
    expect(summary.completedTotal).toBe(400);
    expect(summary.plannedCount).toBe(2);
    expect(summary.completedCount).toBe(1);
    expect(summary.progressPct).toBe(50);
  });

  it("restringe escrita no prontuário e odontograma apenas aos perfis clínicos autorizados", () => {
    expect(evaluateMemberPermission("dentist", "records.read")).toBe(true);
    expect(evaluateMemberPermission("dentist", "records.write")).toBe(true);
    expect(evaluateMemberPermission("assistant", "records.read")).toBe(true);
    expect(evaluateMemberPermission("assistant", "records.write")).toBe(false);
    expect(evaluateMemberPermission("receptionist", "records.write")).toBe(false);
    expect(evaluateMemberPermission("stock", "records.read")).toBe(false);
  });
});

describe("Módulo Financeiro Completo: Fluxo de Caixa, Parcelamento Exato e Comissões", () => {
  it("gera parcelas sem perda de centavos (R$ 100,00 em 3x = R$ 33,34 + R$ 33,33 + R$ 33,33)", () => {
    const rows = generateInstallmentRows(CLINIC_A, {
      entry_type: "income",
      category: "Implante / Prótese",
      description: "Implante Unitário",
      total_amount: 100,
      payment_method: "credit_card",
      status: "paid",
      first_due_date: "2026-11-10",
      installments: 3,
    });

    expect(rows).toHaveLength(3);
    expect(rows[0]?.amount).toBe(33.34);
    expect(rows[1]?.amount).toBe(33.33);
    expect(rows[2]?.amount).toBe(33.33);

    const sum = rows.reduce((acc, r) => acc + r.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(100);

    expect(rows[0]?.description).toBe("Implante Unitário (1/3)");
    expect(rows[0]?.due_date).toBe("2026-11-10");
    expect(rows[1]?.due_date).toBe("2026-12-10");
    expect(rows[2]?.due_date).toBe("2027-01-10");
    expect(rows[0]?.status).toBe("paid");
    expect(rows[1]?.status).toBe("pending");
  });

  it("calcula resumo de fluxo de caixa, saldo líquido e inadimplência", () => {
    const sampleEntries: FinancialEntry[] = [
      {
        id: "fe-1",
        clinic_id: CLINIC_A,
        unit_id: null,
        patient_id: "p1",
        professional_id: "prof-1",
        appointment_id: null,
        treatment_plan_id: null,
        entry_type: "income",
        category: "Procedimento",
        description: "Prótese protocolo",
        amount: 2500,
        status: "paid",
        payment_method: "pix",
        due_date: "2026-11-01",
        paid_at: "2026-11-01T14:00:00Z",
        installment_number: 1,
        total_installments: 2,
        notes: null,
        created_by: USER_ALICE,
        created_at: "2026-11-01T14:00:00Z",
      },
      {
        id: "fe-2",
        clinic_id: CLINIC_A,
        unit_id: null,
        patient_id: "p1",
        professional_id: "prof-1",
        appointment_id: null,
        treatment_plan_id: null,
        entry_type: "income",
        category: "Procedimento",
        description: "Prótese protocolo (2/2)",
        amount: 2500,
        status: "pending",
        payment_method: "credit_card",
        due_date: "2026-11-02", // Vencido em relação a 2026-11-04
        paid_at: null,
        installment_number: 2,
        total_installments: 2,
        notes: null,
        created_by: USER_ALICE,
        created_at: "2026-11-01T14:00:00Z",
      },
      {
        id: "fe-3",
        clinic_id: CLINIC_A,
        unit_id: null,
        patient_id: null,
        professional_id: null,
        appointment_id: null,
        treatment_plan_id: null,
        entry_type: "expense",
        category: "Laboratório de Prótese",
        description: "Laboratório DentalArt",
        amount: 800,
        status: "paid",
        payment_method: "transfer",
        due_date: "2026-11-03",
        paid_at: "2026-11-03T10:00:00Z",
        installment_number: 1,
        total_installments: 1,
        notes: null,
        created_by: USER_ALICE,
        created_at: "2026-11-03T10:00:00Z",
      },
    ];

    const refDate = new Date("2026-11-04T12:00:00-03:00");
    const summary = calculateCashFlowSummary(sampleEntries, refDate);
    expect(summary.receivedIncome).toBe(2500);
    expect(summary.paidExpenses).toBe(800);
    expect(summary.netCashBalance).toBe(1700);
    expect(summary.pendingReceivables).toBe(2500);
    expect(summary.overdueReceivables).toBe(2500);
    expect(summary.overdueCount).toBe(1);

    const comms = calculateProfessionalCommissions(sampleEntries, [
      { id: "prof-1", name: "Dra. Ana", commission_pct: 30 },
    ]);
    expect(comms).toHaveLength(1);
    expect(comms[0]?.realizedRevenue).toBe(2500);
    expect(comms[0]?.realizedCommission).toBe(750); // 30% de 2500 quitado
    expect(comms[0]?.pendingCommission).toBe(750); // 30% de 2500 em aberto
  });

  it("valida schema de lançamentos financeiros e permissões RBAC de escrita financeira", () => {
    expect(
      financialEntryFormSchema.safeParse({
        entry_type: "income",
        category: "Ortodontia / Manutenção",
        description: "Manutenção aparelho safira",
        total_amount: 350,
        payment_method: "pix",
        status: "paid",
        first_due_date: "2026-11-10",
        installments: 1,
      }).success,
    ).toBe(true);

    expect(evaluateMemberPermission("finance", "financial.write")).toBe(true);
    expect(evaluateMemberPermission("admin", "financial.write")).toBe(true);
    expect(evaluateMemberPermission("dentist", "financial.write")).toBe(false);
    expect(evaluateMemberPermission("assistant", "financial.write")).toBe(false);
  });
});

describe("Módulo de Controle de Estoque, Lotes ANVISA e Kardex", () => {
  it("avalia corretamente alertas de estoque mínimo, esgotado, vencimento próximo e lote vencido", () => {
    const refDate = new Date("2026-11-04T12:00:00-03:00");

    expect(
      evaluateStockItemStatus(
        { current_quantity: 20, min_quantity: 5, expiration_date: "2027-06-01" },
        refDate,
      ),
    ).toBe("ok");

    expect(
      evaluateStockItemStatus(
        { current_quantity: 4, min_quantity: 5, expiration_date: "2027-06-01" },
        refDate,
      ),
    ).toBe("low_stock");

    expect(
      evaluateStockItemStatus(
        { current_quantity: 0, min_quantity: 5, expiration_date: "2027-06-01" },
        refDate,
      ),
    ).toBe("out_of_stock");

    expect(
      evaluateStockItemStatus(
        { current_quantity: 12, min_quantity: 5, expiration_date: "2026-11-20" },
        refDate,
      ),
    ).toBe("expiring_soon");

    expect(
      evaluateStockItemStatus(
        { current_quantity: 12, min_quantity: 5, expiration_date: "2026-10-15" },
        refDate,
      ),
    ).toBe("expired");
  });

  it("calcula movimentações do Kardex (entrada, saída, ajuste) e bloqueia saldo negativo", () => {
    expect(computeMovementResultingQuantity(10, "in", 5)).toBe(15);
    expect(computeMovementResultingQuantity(15, "out", 4)).toBe(11);
    expect(computeMovementResultingQuantity(11, "expired_loss", 2)).toBe(9);
    expect(computeMovementResultingQuantity(9, "adjustment", 25)).toBe(25);

    expect(() => computeMovementResultingQuantity(3, "out", 5)).toThrow(/Saldo insuficiente/);
  });

  it("calcula valor financeiro total do estoque em BRL e contadores de criticidade", () => {
    const refDate = new Date("2026-11-04T12:00:00-03:00");
    const summary = calculateStockSummary(
      [
        {
          current_quantity: 10,
          min_quantity: 5,
          unit_cost: 45.5,
          expiration_date: "2027-08-01",
          active: true,
        },
        {
          current_quantity: 2,
          min_quantity: 5,
          unit_cost: 120,
          expiration_date: "2026-11-15",
          active: true,
        },
        {
          current_quantity: 0,
          min_quantity: 3,
          unit_cost: 80,
          expiration_date: "2026-10-01",
          active: true,
        },
      ],
      refDate,
    );

    expect(summary.totalItemsCount).toBe(3);
    expect(summary.totalInventoryValueBRL).toBe(695); // (10 * 45.5) + (2 * 120) + 0
    expect(summary.lowStockCount).toBe(1);
    expect(summary.outOfStockCount).toBe(1);
    expect(summary.expiringSoonCount).toBe(1);
    expect(summary.expiredCount).toBe(1);
  });

  it("valida schemas de insumos, movimentações e permissões RBAC de estoque", () => {
    expect(
      stockItemFormSchema.safeParse({
        name: "Resina Filtek Z350 XT A2",
        category: "Resinas e Adesivos",
        unit_measure: "seringa",
        current_quantity: 8,
        min_quantity: 3,
        unit_cost: 139.9,
        batch_number: "LOTE-3M-99",
        expiration_date: "2027-12-31",
      }).success,
    ).toBe(true);

    expect(
      stockMovementFormSchema.safeParse({
        item_id: "11111111-1111-4111-8111-111111111111",
        movement_type: "out",
        quantity: 2,
        reason: "Consumo em restauração direta",
      }).success,
    ).toBe(true);

    expect(evaluateMemberPermission("stock", "stock.read")).toBe(true);
    expect(evaluateMemberPermission("stock", "stock.write")).toBe(true);
    expect(evaluateMemberPermission("assistant", "stock.write")).toBe(true);
    expect(evaluateMemberPermission("dentist", "stock.read")).toBe(true);
    expect(evaluateMemberPermission("dentist", "stock.write")).toBe(false);
    expect(evaluateMemberPermission("finance", "stock.write")).toBe(false);
  });
});

describe("Relatórios Gerenciais, DRE Clínico e Central WhatsApp", () => {
  it("calcula DRE Clínico (Receita Bruta, Custos Diretos, Comissões, Margem de Contribuição e Resultado Líquido)", () => {
    const dre = calculateClinicalDRE(
      [
        {
          entry_type: "income",
          status: "paid",
          category: "Implante / Prótese",
          amount: 10000,
        },
        {
          entry_type: "expense",
          status: "paid",
          category: "Laboratório de Prótese",
          amount: 1500,
        },
        {
          entry_type: "expense",
          status: "paid",
          category: "Material Odontológico",
          amount: 500,
        },
        {
          entry_type: "expense",
          status: "paid",
          category: "Aluguel / Condomínio",
          amount: 2000,
        },
        {
          entry_type: "expense",
          status: "paid",
          category: "Impostos / Taxas",
          amount: 600,
        },
      ],
      [{ realizedCommission: 2400 }],
    );

    expect(dre.grossRealizedRevenue).toBe(10000);
    expect(dre.directClinicalCosts).toBe(2000); // 1500 + 500
    expect(dre.professionalCommissions).toBe(2400);
    expect(dre.contributionMargin).toBe(5600); // 10000 - 2000 - 2400
    expect(dre.contributionMarginPct).toBe(56);
    expect(dre.administrativeExpenses).toBe(2000);
    expect(dre.taxesAndFees).toBe(600);
    expect(dre.netOperatingResult).toBe(3000); // 5600 - 2000 - 600
    expect(dre.netMarginPct).toBe(30);
  });

  it("serializa linhas para CSV com BOM UTF-8 e separador ponto-e-vírgula compatível com Excel", () => {
    const csv = serializeRowsToCsv(
      ["Indicador", "Valor (BRL)"],
      [
        ["Receita Bruta", "10000.00"],
        ['Item com ; e "aspas"', "250.50"],
      ],
    );

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Indicador;Valor (BRL)");
    expect(csv).toContain('"Item com ; e ""aspas""";250.50');
  });

  it("normaliza telefones brasileiros, interpola variáveis de template e gera URL wa.me", () => {
    expect(normalizeBrazilianWhatsAppPhone("(11) 98765-4321")).toBe("5511987654321");
    expect(normalizeBrazilianWhatsAppPhone("5521999887766")).toBe("5521999887766");

    const msg = interpolateWhatsappTemplate(
      "Olá, {paciente}! Consulta em {data} às {hora} com Dr(a). {profissional} na {clinica}.",
      {
        paciente: "Juliana Mendes",
        data: "05/11/2026",
        hora: "14:30",
        profissional: "Ana Costa",
        clinica: "SondaPro Odonto",
      },
    );

    expect(msg).toBe(
      "Olá, Juliana Mendes! Consulta em 05/11/2026 às 14:30 com Dr(a). Ana Costa na SondaPro Odonto.",
    );

    const url = buildWhatsAppWebUrl("(11) 98765-4321", msg);
    expect(url.startsWith("https://wa.me/5511987654321?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1] ?? "")).toBe(msg);

    expect(
      whatsappTemplateFormSchema.safeParse({
        name: "Confirmação Ortodontia",
        category: "confirmation",
        body_template: "Olá {paciente}, sua manutenção é dia {data} às {hora}.",
      }).success,
    ).toBe(true);

    expect(evaluateMemberPermission("finance", "reports.view")).toBe(true);
    expect(evaluateMemberPermission("receptionist", "whatsapp.manage")).toBe(true);
    expect(evaluateMemberPermission("stock", "reports.view")).toBe(false);
  });
});
