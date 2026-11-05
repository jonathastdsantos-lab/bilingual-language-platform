import { describe, expect, it } from "vitest";
import { assertClinicScope, normalizeSupabaseError } from "@/services/supabase";
import { buildAdministrativeAlerts } from "@/services/notifications";
import {
  STANDARD_TUSS_PROCEDURES,
  calculateProcedureEconomics,
  dentalInsuranceSchema,
  procedureCatalogSchema,
} from "@/modules/clinics";
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
import { buildPublicConfirmationUrl } from "@/modules/appointments/tokens";
import { authCredentialsSchema } from "@/modules/auth";
import {
  calculateConversionFunnel,
  calculateDetailedPlatformStats,
  calculatePlanDistributionData,
  calculateSaaSGrowthTimeline,
  exportClinicsToCsv,
  isMasterDeveloperEmail,
  MASTER_DEVELOPER_EMAIL,
} from "@/modules/superadmin";
import {
  calculateTissBillingSummary,
  tissGuideFormSchema,
  tissGuideItemSchema,
} from "@/modules/tiss";
import {
  aggregateOdontogramState,
  buildClinicalDocumentRecordPayload,
  buildPrintableDocumentHtml,
  buildTenantExamStoragePath,
  calculateTreatmentPlanSummary,
  clinicalRecordSchema,
  evaluateSurgicalRiskAndAsa,
  isValidFdiTooth,
  odontogramEntrySchema,
  patientExamUploadSchema,
  prostheticLabOrderSchema,
  sanitizeExamFileName,
  structuredAnamnesisSchema,
  summarizeProstheticLabOrders,
  verifyExamStoragePathTenant,
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

describe("Automação Clínica → Financeiro e Emissão de Receituário, Atestado (CID-10) e TCLE", () => {
  it("vincula treatment_plan_id, patient_id e professional_id ao gerar parcelas de orçamento aprovado", () => {
    const planId = "33333333-3333-4333-8333-333333333333";
    const patientId = "44444444-4444-4444-8444-444444444444";
    const profId = "55555555-5555-4555-8555-555555555555";

    const rows = generateInstallmentRows(CLINIC_A, {
      entry_type: "income",
      category: "Orçamento / Plano",
      description: "Orçamento: Reabilitação Protética Superior",
      total_amount: 1500,
      payment_method: "credit_card",
      status: "paid",
      first_due_date: "2026-11-10",
      installments: 3,
      patient_id: patientId,
      professional_id: profId,
      treatment_plan_id: planId,
    });

    expect(rows).toHaveLength(3);
    expect(rows[0]?.treatment_plan_id).toBe(planId);
    expect(rows[0]?.patient_id).toBe(patientId);
    expect(rows[0]?.professional_id).toBe(profId);
    expect(rows[0]?.status).toBe("paid");
    expect(rows[1]?.status).toBe("pending");
    expect(rows[2]?.treatment_plan_id).toBe(planId);
  });

  it("gera payloads de prontuário e HTML de impressão A4/A5 para Receituário, Atestado CID-10 e TCLE", () => {
    const certPayload = buildClinicalDocumentRecordPayload({
      kind: "certificate",
      pageSize: "A5",
      clinicName: "SondaPro Odonto",
      unitName: "Unidade Paulista",
      patientName: "Roberto Carlos",
      patientCpf: "529.982.247-25",
      professionalName: "Dra. Camila Mendes",
      professionalCro: "CRO-SP 98765",
      issueDate: "2026-11-04",
      bodyText: "Atesto necessidade de 2 dias de repouso pós-exodontia.",
      cid10Code: "K01.1",
      restDays: 2,
      authorizeCidDisclosure: true,
    });

    expect(certPayload.recordType).toBe("certificate");
    expect(certPayload.title).toContain("CID K01.1");
    expect(certPayload.content).toContain("CRO-SP 98765");

    const htmlControlled = buildPrintableDocumentHtml({
      kind: "prescription_controlled",
      pageSize: "A4",
      clinicName: "SondaPro Odonto",
      patientName: "Roberto Carlos",
      professionalName: "Dra. Camila Mendes",
      professionalCro: "CRO-SP 98765",
      issueDate: "2026-11-04",
      bodyText: "Amoxicilina 500mg — 1 cápsula de 8/8h por 7 dias.",
    });

    expect(htmlControlled).toContain("RECEITUÁRIO DE CONTROLE ESPECIAL (2 VIAS)");
    expect(htmlControlled).toContain("IDENTIFICAÇÃO DO COMPRADOR");
    expect(htmlControlled).toContain("IDENTIFICAÇÃO DO FORNECEDOR");
    expect(htmlControlled).toContain("CRO-SP 98765");
  });
});

describe("Galeria de Exames e Radiografias (Supabase Storage com Isolamento Multi-Tenant)", () => {
  it("higieniza nomes de arquivo contra Path Traversal e força prefixo <clinic_id>/<patient_id>", () => {
    const patientId = "44444444-4444-4444-8444-444444444444";
    expect(sanitizeExamFileName("../../segredo/Rx Panorâmica #36 (Inicial).png")).toBe(
      "Rx_Panoramica_36_Inicial_.png",
    );

    const pathA = buildTenantExamStoragePath(
      CLINIC_A,
      patientId,
      "Rx Periapical #11.jpg",
      "fixed-uuid",
    );
    expect(pathA).toBe(
      `${CLINIC_A}/${patientId}/fixed-uuid-Rx_Periapical_11.jpg`,
    );

    // Isolamento Cross-Tenant no Storage: Clínica A jamais valida caminhos da Clínica B
    expect(verifyExamStoragePathTenant(CLINIC_A, pathA)).toBe(true);
    expect(verifyExamStoragePathTenant(CLINIC_B, pathA)).toBe(false);
    expect(verifyExamStoragePathTenant(CLINIC_A, `${CLINIC_A}/../${CLINIC_B}/hack.jpg`)).toBe(false);
  });

  it("valida MIME types permitidos (JPG/PNG/WEBP/PDF), limite de 15 MB e dente FDI no schema de exames", () => {
    const patientId = "44444444-4444-4444-8444-444444444444";

    expect(
      patientExamUploadSchema.safeParse({
        patient_id: patientId,
        tooth_number: 36,
        exam_category: "periapical",
        title: "Rx Periapical Pré-Endo #36",
        exam_date: "2026-11-04",
        file_name: "rx36.png",
        mime_type: "image/png",
        file_size_bytes: 2 * 1024 * 1024,
      }).success,
    ).toBe(true);

    // Rejeita arquivo acima de 15 MB
    expect(
      patientExamUploadSchema.safeParse({
        patient_id: patientId,
        tooth_number: null,
        exam_category: "panoramic",
        title: "Panorâmica Pesada",
        exam_date: "2026-11-04",
        file_name: "pan.png",
        mime_type: "image/png",
        file_size_bytes: 20 * 1024 * 1024,
      }).success,
    ).toBe(false);

    // Rejeita dente FDI inexistente (ex.: 19)
    expect(
      patientExamUploadSchema.safeParse({
        patient_id: patientId,
        tooth_number: 19,
        exam_category: "periapical",
        title: "Rx Dente Inválido",
        exam_date: "2026-11-04",
        file_name: "rx.jpg",
        mime_type: "image/jpeg",
        file_size_bytes: 500000,
      }).success,
    ).toBe(false);
  });
});

describe("Catálogo de Procedimentos (Tabela TUSS / Honorários) e Convênios Odontológicos (ANS)", () => {
  it("calcula margem de contribuição líquida, percentual e receita/hora de cadeira clínica", () => {
    expect(STANDARD_TUSS_PROCEDURES.length).toBeGreaterThanOrEqual(10);

    const econ = calculateProcedureEconomics({
      base_price: 300,
      estimated_material_cost: 45,
      default_duration_minutes: 30,
    });

    expect(econ.basePrice).toBe(300);
    expect(econ.materialCost).toBe(45);
    expect(econ.netMargin).toBe(255);
    expect(econ.marginPct).toBe(85);
    expect(econ.hourlyChairRevenue).toBe(600); // R$ 300 em 30 min = R$ 600/hora
  });

  it("valida schemas de Procedimento TUSS e Convênio Odontológico (ANS / CNPJ)", () => {
    expect(
      procedureCatalogSchema.safeParse({
        tuss_code: "85100196",
        name: "Restauração em resina composta (1 face)",
        specialty: "Dentística / Restauração",
        base_price: 240,
        estimated_material_cost: 35,
        default_duration_minutes: 45,
      }).success,
    ).toBe(true);

    // Duração de cadeira abaixo de 10 min deve ser rejeitada
    expect(
      procedureCatalogSchema.safeParse({
        name: "Procedimento Inválido",
        base_price: 100,
        default_duration_minutes: 5,
      }).success,
    ).toBe(false);

    // Convênio com CNPJ válido
    expect(
      dentalInsuranceSchema.safeParse({
        name: "OdontoPrev S/A",
        ans_code: "301949",
        cnpj: "11.222.333/0001-81",
        reimbursement_days: 30,
      }).success,
    ).toBe(true);

    // Convênio com CNPJ inválido deve falhar
    expect(
      dentalInsuranceSchema.safeParse({
        name: "Convênio Inválido",
        cnpj: "11.111.111/1111-11",
        reimbursement_days: 30,
      }).success,
    ).toBe(false);
  });
});

describe("Anamnese Digital Estruturada, Classificação ASA e Alertas de Risco Cirúrgico", () => {
  it("classifica paciente hígido como ASA I (risco baixo) sem alertas cirúrgicos", () => {
    const res = evaluateSurgicalRiskAndAsa({
      has_hypertension: false,
      has_diabetes: false,
      has_heart_disease: false,
      uses_anticoagulants: false,
      uses_bisphosphonates: false,
    });

    expect(res.recommendedAsa).toBe("ASA I");
    expect(res.overallRiskLevel).toBe("low");
    expect(res.alerts).toHaveLength(0);
  });

  it("detecta alto risco cirúrgico (ASA III) para bisfosfonatos (MRONJ), anticoagulantes e alergia a penicilina", () => {
    const res = evaluateSurgicalRiskAndAsa({
      uses_bisphosphonates: true,
      uses_anticoagulants: true,
      allergy_penicillin: true,
      other_allergies: "Iodo",
    });

    expect(res.recommendedAsa).toBe("ASA III");
    expect(res.overallRiskLevel).toBe("high");
    const ids = res.alerts.map((a) => a.id);
    expect(ids).toContain("bisphosphonates-mronj");
    expect(ids).toContain("bleeding-risk");
    expect(ids).toContain("allergy-penicillin");
    expect(res.allergiesSummary).toContain("Penicilina/Amoxicilina");
    expect(res.allergiesSummary).toContain("Iodo");
  });

  it("detecta crise hipertensiva (PA >= 180x110 mmHg) como risco crítico (ASA IV) e valida schema", () => {
    const crisis = evaluateSurgicalRiskAndAsa({
      blood_pressure_systolic: 185,
      blood_pressure_diastolic: 112,
    });

    expect(crisis.recommendedAsa).toBe("ASA IV");
    expect(crisis.overallRiskLevel).toBe("critical");
    expect(crisis.alerts[0]?.id).toBe("hypertensive-crisis");

    expect(
      structuredAnamnesisSchema.safeParse({
        patient_id: "44444444-4444-4444-8444-444444444444",
        has_hypertension: true,
        blood_pressure_systolic: 130,
        blood_pressure_diastolic: 85,
      }).success,
    ).toBe(true);
  });
});

describe("Controle de Laboratório de Prótese (Rastreamento de Trabalhos Protéticos)", () => {
  it("calcula KPIs laboratoriais (em confecção, prontos na clínica, atrasados e custo acumulado)", () => {
    const summary = summarizeProstheticLabOrders(
      [
        { stage: "sent", due_date: "2026-11-01", lab_cost: 420 },
        { stage: "teeth_try_in", due_date: "2026-11-10", lab_cost: 650 },
        { stage: "delivered_to_clinic", due_date: "2026-11-02", lab_cost: 380 },
        { stage: "installed_in_patient", due_date: "2026-10-20", lab_cost: 500 },
      ],
      "2026-11-04",
    );

    expect(summary.totalOrders).toBe(4);
    expect(summary.activeInLabCount).toBe(2);
    expect(summary.readyInClinicCount).toBe(1);
    expect(summary.installedCount).toBe(1);
    expect(summary.overdueCount).toBe(1);
    expect(summary.totalLabCost).toBe(1950);
  });

  it("valida schema de Ordem de Serviço Protética e impede prazo de entrega anterior ao envio", () => {
    const valid = prostheticLabOrderSchema.safeParse({
      patient_id: "44444444-4444-4444-8444-444444444444",
      laboratory_name: "Laboratório Estética Dental",
      prosthesis_type: "Coroa Dissilicato de Lítio (E-max)",
      tooth_numbers: "11, 21",
      vita_shade: "BL2",
      stage: "sent",
      sent_date: "2026-11-04",
      due_date: "2026-11-11",
      lab_cost: 760,
    });
    expect(valid.success).toBe(true);

    const invalidDueDate = prostheticLabOrderSchema.safeParse({
      patient_id: "44444444-4444-4444-8444-444444444444",
      laboratory_name: "Laboratório Estética Dental",
      prosthesis_type: "Coroa em Zircônia Monolítica",
      stage: "sent",
      sent_date: "2026-11-10",
      due_date: "2026-11-05",
      lab_cost: 400,
    });
    expect(invalidDueDate.success).toBe(false);
  });
});

describe("SuperAdmin / Desenvolvedor da Plataforma & Métricas SaaS", () => {
  it("identifica corretamente o e-mail do desenvolvedor master", () => {
    expect(isMasterDeveloperEmail("jonathastdsantos@gmail.com")).toBe(true);
    expect(isMasterDeveloperEmail("JONATHASTDSANTOS@GMAIL.COM")).toBe(true);
    expect(isMasterDeveloperEmail("outro@clinica.com.br")).toBe(false);
    expect(isMasterDeveloperEmail(null)).toBe(false);
    expect(MASTER_DEVELOPER_EMAIL).toBe("jonathastdsantos@gmail.com");
  });

  it("calcula estatísticas e MRR da plataforma para o desenvolvedor", () => {
    const plans = [
      { id: "starter", name: "Starter", description: "", monthly_price: 149, yearly_price: 1490, max_professionals: 1, max_units: 1, whatsapp_included: false, storage_limit_mb: 2000, active: true },
      { id: "pro", name: "Pro", description: "", monthly_price: 299, yearly_price: 2990, max_professionals: 5, max_units: 2, whatsapp_included: true, storage_limit_mb: 10000, active: true },
      { id: "corporate", name: "Corporate", description: "", monthly_price: 599, yearly_price: 5990, max_professionals: 999, max_units: 10, whatsapp_included: true, storage_limit_mb: 50000, active: true },
    ];

    const clinics = [
      {
        id: "c1",
        name: "Clínica A",
        created_at: "2026-01-01",
        plan_id: "starter",
        plan_name: "Starter",
        monthly_price: 149,
        subscription_status: "active" as const,
        trial_ends_at: null,
        current_period_end: null,
        patients_count: 50,
        appointments_month_count: 20,
        members_count: 2,
        dentists_count: 1,
        last_appointment_at: "2026-11-01",
        exam_files_count: 5,
        exam_storage_bytes: 1048576,
      },
      {
        id: "c2",
        name: "Clínica B",
        created_at: "2026-02-01",
        plan_id: "pro",
        plan_name: "Pro",
        monthly_price: 299,
        subscription_status: "active" as const,
        trial_ends_at: null,
        current_period_end: null,
        patients_count: 100,
        appointments_month_count: 45,
        members_count: 4,
        dentists_count: 3,
        last_appointment_at: "2026-11-04",
        exam_files_count: 12,
        exam_storage_bytes: 5242880,
      },
      {
        id: "c3",
        name: "Clínica C",
        created_at: "2026-03-01",
        plan_id: "corporate",
        plan_name: "Corporate",
        monthly_price: 599,
        subscription_status: "trialing" as const,
        trial_ends_at: "2026-11-15",
        current_period_end: null,
        patients_count: 10,
        appointments_month_count: 2,
        members_count: 1,
        dentists_count: 1,
        last_appointment_at: null,
        exam_files_count: 0,
        exam_storage_bytes: 0,
      },
      {
        id: "c4",
        name: "Clínica D",
        created_at: "2026-04-01",
        plan_id: "pro",
        plan_name: "Pro",
        monthly_price: 299,
        subscription_status: "cancelled" as const,
        trial_ends_at: null,
        current_period_end: null,
        patients_count: 0,
        appointments_month_count: 0,
        members_count: 1,
        dentists_count: 1,
        last_appointment_at: null,
        exam_files_count: 0,
        exam_storage_bytes: 0,
      },
    ];

    const stats = calculateDetailedPlatformStats(clinics, plans);
    expect(stats.totalClinics).toBe(4);
    expect(stats.activeClinics).toBe(2);
    expect(stats.trialClinics).toBe(1);
    expect(stats.mrrEstimated).toBe(149 + 299);
    expect(stats.totalPatientsEstimate).toBe(160);
    expect(stats.totalAppointmentsMonth).toBe(67);
  });

  it("exporta lista de clínicas para CSV com formatação correta", () => {
    const csv = exportClinicsToCsv([
      {
        id: "c1",
        name: "Clínica Teste",
        cnpj: "11222333000181",
        phone: "11999998888",
        email: "contato@clinica.com",
        address: "Av Paulista 1000",
        plan_id: "pro",
        plan_name: "SondaPro Pro",
        monthly_price: 299,
        subscription_status: "active",
        trial_ends_at: null,
        current_period_end: null,
        created_at: "2026-01-01",
        owner_name: "Dr. João",
        owner_email: "joao@clinica.com",
        patients_count: 42,
        appointments_month_count: 15,
        members_count: 3,
        dentists_count: 2,
        last_appointment_at: "2026-11-04",
        exam_files_count: 8,
        exam_storage_bytes: 2097152,
      },
    ]);

    expect(csv).toContain("Clínica Teste");
    expect(csv).toContain("SondaPro Pro");
    expect(csv).toContain("Dr. João");
  });

  it("calcula curva de crescimento temporal e distribuição de planos para Recharts", () => {
    const plans = [
      { id: "starter", name: "Starter", description: "", monthly_price: 149, yearly_price: 1490, max_professionals: 1, max_units: 1, whatsapp_included: false, storage_limit_mb: 2000, active: true },
      { id: "pro", name: "Pro", description: "", monthly_price: 299, yearly_price: 2990, max_professionals: 5, max_units: 2, whatsapp_included: true, storage_limit_mb: 10000, active: true },
    ];

    const sampleClinics = [
      {
        id: "c1",
        name: "Clínica 1",
        plan_id: "starter",
        plan_name: "Starter",
        monthly_price: 149,
        subscription_status: "active" as const,
        trial_ends_at: null,
        current_period_end: null,
        created_at: new Date().toISOString(),
        patients_count: 10,
        appointments_month_count: 5,
        members_count: 1,
        dentists_count: 1,
        last_appointment_at: null,
        exam_files_count: 0,
        exam_storage_bytes: 0,
      },
      {
        id: "c2",
        name: "Clínica 2",
        plan_id: "pro",
        plan_name: "Pro",
        monthly_price: 299,
        subscription_status: "active" as const,
        trial_ends_at: null,
        current_period_end: null,
        created_at: new Date().toISOString(),
        patients_count: 20,
        appointments_month_count: 10,
        members_count: 2,
        dentists_count: 1,
        last_appointment_at: null,
        exam_files_count: 0,
        exam_storage_bytes: 0,
      },
    ];

    const timeline = calculateSaaSGrowthTimeline(sampleClinics, plans, 3);
    expect(timeline.length).toBe(3);
    expect(timeline[timeline.length - 1]?.newClinics).toBe(2);

    const dist = calculatePlanDistributionData(sampleClinics, plans);
    expect(dist).toHaveLength(2);
    expect(dist[0]?.revenue).toBe(149);
    expect(dist[1]?.revenue).toBe(299);

    const funnel = calculateConversionFunnel(sampleClinics);
    expect(funnel.activePaying).toBe(2);
    expect(funnel.conversionRatePct).toBe(100);
    expect(funnel.churnRatePct).toBe(0);
  });
});

describe("Guias TISS / Faturamento de Convênios Odontológicos (GTO — ANS)", () => {
  it("consolida indicadores de faturamento de guias TISS, valores pagos e glosas", () => {
    const guides = [
      {
        id: "g1",
        clinic_id: CLINIC_A,
        patient_id: "p1",
        insurance_id: "ins1",
        professional_id: null,
        guide_number: "GTO-101",
        auth_code: "AUT-1",
        guide_type: "treatment" as const,
        status: "billed" as const,
        card_number: "123456",
        card_expiration: null,
        cns_number: null,
        issue_date: "2026-11-01",
        billed_date: "2026-11-02",
        paid_date: null,
        total_amount: 350,
        glosed_amount: 0,
        notes: null,
        created_by: USER_ALICE,
        created_at: "2026-11-01T10:00:00Z",
        updated_at: "2026-11-01T10:00:00Z",
      },
      {
        id: "g2",
        clinic_id: CLINIC_A,
        patient_id: "p2",
        insurance_id: "ins1",
        professional_id: null,
        guide_number: "GTO-102",
        auth_code: "AUT-2",
        guide_type: "treatment" as const,
        status: "paid" as const,
        card_number: "654321",
        card_expiration: null,
        cns_number: null,
        issue_date: "2026-11-01",
        billed_date: "2026-11-02",
        paid_date: "2026-11-04",
        total_amount: 520,
        glosed_amount: 0,
        notes: null,
        created_by: USER_ALICE,
        created_at: "2026-11-01T10:00:00Z",
        updated_at: "2026-11-01T10:00:00Z",
      },
      {
        id: "g3",
        clinic_id: CLINIC_A,
        patient_id: "p3",
        insurance_id: "ins1",
        professional_id: null,
        guide_number: "GTO-103",
        auth_code: null,
        guide_type: "treatment" as const,
        status: "glosed" as const,
        card_number: "987654",
        card_expiration: null,
        cns_number: null,
        issue_date: "2026-11-02",
        billed_date: "2026-11-03",
        paid_date: null,
        total_amount: 200,
        glosed_amount: 80,
        notes: null,
        created_by: USER_ALICE,
        created_at: "2026-11-02T10:00:00Z",
        updated_at: "2026-11-02T10:00:00Z",
      },
    ];

    const summary = calculateTissBillingSummary(guides);
    expect(summary.totalGuides).toBe(3);
    expect(summary.billedCount).toBe(1);
    expect(summary.paidCount).toBe(1);
    expect(summary.glosedCount).toBe(1);
    expect(summary.totalBilledAmount).toBe(350);
    expect(summary.totalPaidAmount).toBe(520);
    expect(summary.totalGlosedAmount).toBe(80);
  });

  it("valida schema de Guia TISS com procedimentos TUSS obrigatórios", () => {
    const valid = tissGuideFormSchema.safeParse({
      patient_id: "44444444-4444-4444-8444-444444444444",
      insurance_id: "55555555-5555-5555-8555-555555555555",
      guide_number: "GTO-2026-001",
      card_number: "9988776655",
      issue_date: "2026-11-05",
      items: [
        {
          tuss_code: "81000030",
          description: "Consulta inicial odontológica",
          quantity: 1,
          unit_price: 110,
        },
      ],
    });
    expect(valid.success).toBe(true);

    const emptyItems = tissGuideFormSchema.safeParse({
      patient_id: "44444444-4444-4444-8444-444444444444",
      insurance_id: "55555555-5555-5555-8555-555555555555",
      guide_number: "GTO-2026-002",
      card_number: "9988776655",
      issue_date: "2026-11-05",
      items: [],
    });
    expect(emptyItems.success).toBe(false);
  });
});

describe("Portal do Paciente / Confirmação de Consulta via WhatsApp sem Login", () => {
  it("monta a URL segura de confirmação do paciente", () => {
    const url = buildPublicConfirmationUrl("abc123xyz789", "https://sondapro.com.br");
    expect(url).toBe("https://sondapro.com.br/confirm/abc123xyz789");
  });

  it("interpola a variável {link_confirmacao} no template de WhatsApp", () => {
    const template = "Olá, {paciente}! Confirme sua consulta em: {link_confirmacao}";
    const res = interpolateWhatsappTemplate(template, {
      paciente: "Maria Silva",
      link_confirmacao: "https://sondapro.com.br/confirm/token-123",
    });
    expect(res).toBe("Olá, Maria Silva! Confirme sua consulta em: https://sondapro.com.br/confirm/token-123");
  });
});
