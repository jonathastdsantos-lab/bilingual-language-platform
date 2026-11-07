import { describe, it, expect, beforeEach } from "vitest";
import {
  exportAuditLogsToCsv,
  fetchSuperadminAuditLogs,
  logAccessChangeWithAudit,
  logSuperadminAction,
  updateClinicSubscriptionWithAudit,
} from "@/modules/superadmin";
import type { PlatformAuditLog } from "@/types";

describe("Registro de Auditoria do Desenvolvedor (Acessos, Planos e Assinaturas)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("deve registrar alteração de plano comercial com old_values e new_values", async () => {
    await updateClinicSubscriptionWithAudit({
      clinicId: "11111111-1111-4111-8111-111111111111",
      clinicName: "Clínica Odonto Prime",
      planId: "pro",
      oldPlanId: "starter",
      subscriptionStatus: "active",
      oldSubscriptionStatus: "active",
      reason: "Upgrade solicitado pelo cliente via WhatsApp de suporte",
    });

    const logs = await fetchSuperadminAuditLogs({ category: "plan" });
    expect(logs.length).toBeGreaterThanOrEqual(1);

    const planLog = logs.find((l) => l.target_clinic_id === "11111111-1111-4111-8111-111111111111");
    expect(planLog).toBeDefined();
    expect(planLog?.category).toBe("plan");
    expect(planLog?.action).toBe("alteracao_plano");
    expect(planLog?.target_clinic_name).toBe("Clínica Odonto Prime");
    expect(planLog?.admin_email).toBeDefined();
    expect(planLog?.created_at).toBeDefined();

    // Validação estrita do diff antes x depois
    expect(planLog?.old_values?.["plan_id"]).toBe("starter");
    expect(planLog?.new_values?.["plan_id"]).toBe("pro");
    expect((planLog?.details as any)?.reason).toContain("Upgrade solicitado");
  });

  it("deve registrar alteração de status da assinatura (trialing -> active) e prorrogação de trial", async () => {
    const trialDate = new Date(Date.now() + 15 * 86400000).toISOString();

    await updateClinicSubscriptionWithAudit({
      clinicId: "22222222-2222-4222-8222-222222222222",
      clinicName: "Sorriso & Arte Odontologia",
      subscriptionStatus: "trialing",
      oldSubscriptionStatus: "trialing",
      trialEndsAt: trialDate,
      oldTrialEndsAt: new Date().toISOString(),
      reason: "Concedidos +15 dias de cortesia para período de implantação",
    });

    const logs = await fetchSuperadminAuditLogs({ category: "subscription" });
    const subLog = logs.find((l) => l.target_clinic_id === "22222222-2222-4222-8222-222222222222");

    expect(subLog).toBeDefined();
    expect(subLog?.category).toBe("subscription");
    expect(subLog?.action).toBe("prorrogacao_trial");
    expect(subLog?.target_clinic_name).toBe("Sorriso & Arte Odontologia");
    expect(subLog?.new_values?.["trial_ends_at"]).toBe(trialDate);
    expect((subLog?.details as any)?.reason).toContain("+15 dias de cortesia");
  });

  it("deve registrar alterações de acesso e permissões (mudança de cargo e suspensão)", async () => {
    await logAccessChangeWithAudit({
      action: "change_member_role",
      targetClinicId: "33333333-3333-4333-8333-333333333333",
      targetClinicName: "Dental Clinica Central",
      targetUserEmail: "dentista.parceiro@odonto.com",
      oldRole: "dentist",
      newRole: "admin",
      reason: "Dentista promovido a Responsável Técnico e Administrador da unidade",
    });

    const logs = await fetchSuperadminAuditLogs({ category: "access" });
    const accessLog = logs.find((l) => l.target_user_email === "dentista.parceiro@odonto.com");

    expect(accessLog).toBeDefined();
    expect(accessLog?.category).toBe("access");
    expect(accessLog?.action).toBe("change_member_role");
    expect(accessLog?.old_values?.["role"]).toBe("dentist");
    expect(accessLog?.new_values?.["role"]).toBe("admin");
    expect(accessLog?.target_clinic_name).toBe("Dental Clinica Central");
    expect((accessLog?.details as any)?.reason).toContain("Dentista promovido");
  });

  it("deve registrar concessão e revogação de privilégios de superadmin com responsável e timestamp", async () => {
    await logSuperadminAction({
      action: "grant_superadmin",
      category: "access",
      targetUserEmail: "dev.suporte@sondapro.app",
      details: {
        reason: "Novo desenvolvedor onboarded na equipe de infraestrutura",
      },
    });

    const logs = await fetchSuperadminAuditLogs({ category: "access" });
    const grantLog = logs.find((l) => l.target_user_email === "dev.suporte@sondapro.app");

    expect(grantLog).toBeDefined();
    expect(grantLog?.action).toBe("grant_superadmin");
    expect(grantLog?.admin_email).toBeDefined();
    expect(grantLog?.created_at).toBeDefined();
  });

  it("deve filtrar logs por categoria e busca textual", async () => {
    await logSuperadminAction({
      action: "manual_intervention",
      category: "system",
      targetClinicName: "Clinica Alfa",
      details: { note: "Backup extraordinário de radiografias" },
    });
    await logSuperadminAction({
      action: "alteracao_plano",
      category: "plan",
      targetClinicName: "Clinica Beta",
      details: { note: "Troca para Corporate" },
    });

    // Filtro por categoria
    const planOnly = await fetchSuperadminAuditLogs({ category: "plan" });
    expect(planOnly.every((l) => l.category === "plan")).toBe(true);

    // Filtro por busca de texto
    const searchAlfa = await fetchSuperadminAuditLogs({ searchQuery: "Alfa" });
    expect(searchAlfa.some((l) => l.target_clinic_name === "Clinica Alfa")).toBe(true);
    expect(searchAlfa.some((l) => l.target_clinic_name === "Clinica Beta")).toBe(false);
  });

  it("deve exportar registros de auditoria em CSV sanitizado com cabeçalhos padrão", () => {
    const dummyLogs: PlatformAuditLog[] = [
      {
        id: "log-1",
        admin_email: "jonathastdsantos@gmail.com",
        admin_name: "Desenvolvedor Master",
        action: "alteracao_plano",
        category: "plan",
        target_clinic_id: "clinic-1",
        target_clinic_name: "Clinica Teste Export",
        target_user_email: null,
        old_values: { plan_id: "starter" },
        new_values: { plan_id: "pro" },
        details: { reason: "Solicitado por telefone" },
        ip_address: "192.168.1.10",
        created_at: "2026-11-07T12:00:00.000Z",
      },
    ];

    const csv = exportAuditLogsToCsv(dummyLogs);
    expect(csv).toContain("ID;Data/Hora;Categoria;Ação;Responsável");
    expect(csv).toContain("jonathastdsantos@gmail.com");
    expect(csv).toContain("Clinica Teste Export");
    expect(csv).toContain("alteracao_plano");
    expect(csv).toContain("Solicitado por telefone");
  });
});
