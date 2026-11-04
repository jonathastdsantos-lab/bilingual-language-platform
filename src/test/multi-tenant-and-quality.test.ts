import { describe, expect, it } from "vitest";
import { assertClinicScope, normalizeSupabaseError } from "@/services/supabase";
import { buildAdministrativeAlerts } from "@/services/notifications";
import { evaluateMemberPermission } from "@/modules/permissions";
import { calculateAttendanceIndicators, calculateFinancialIndicators } from "@/modules/finance";
import { patientFormSchema } from "@/modules/patients";
import { appointmentFormSchema } from "@/modules/appointments";
import { authCredentialsSchema } from "@/modules/auth";
import { formatCurrencyBRL, getDashboardPeriodRange, toSaoPauloDateKey } from "@/utils/timezone";
import { formatCNPJ, formatCPF, hasTimeOverlap, isValidCNPJ, isValidCPF } from "@/utils/validators";
import type { ClinicRole, PermissionKey } from "@/types";

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

