import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  authenticatePatientPortal,
  getSavedPatientPortalProfile,
  logoutPatientPortal,
  fetchPatientPortalAppointments,
  fetchPatientPortalDocuments,
  confirmPatientAppointment,
} from "../modules/patient-portal";

describe("Patient Portal & Online Booking Module", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("should reject authentication if CPF has fewer than 11 digits", async () => {
    const result = await authenticatePatientPortal("123.456", "11988887777");
    expect(result.success).toBe(false);
    expect(result.error).toContain("CPF inválido");
  });

  it("should reject authentication if phone or birth date is empty", async () => {
    const result = await authenticatePatientPortal("123.456.789-00", "   ");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Informe o telefone");
  });

  it("should authenticate with CPF and phone and persist session profile", async () => {
    const result = await authenticatePatientPortal("123.456.789-00", "11987654321");
    expect(result.success).toBe(true);
    expect(result.profile).toBeDefined();
    expect(result.profile?.cpf).toBe("12345678900");

    const saved = getSavedPatientPortalProfile();
    expect(saved).not.toBeNull();
    expect(saved?.cpf).toBe("12345678900");
  });

  it("should clear session on logout", async () => {
    await authenticatePatientPortal("123.456.789-00", "11987654321");
    expect(getSavedPatientPortalProfile()).not.toBeNull();

    logoutPatientPortal();
    expect(getSavedPatientPortalProfile()).toBeNull();
  });

  it("should fetch patient appointments list with required fields", async () => {
    const appts = await fetchPatientPortalAppointments("test-patient-id");
    expect(Array.isArray(appts)).toBe(true);
    expect(appts.length).toBeGreaterThan(0);

    const first = appts[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("starts_at");
    expect(first).toHaveProperty("procedure");
    expect(first).toHaveProperty("professional_name");
  });

  it("should fetch clinical documents with validation code and url", async () => {
    const docs = await fetchPatientPortalDocuments("test-patient-id");
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBeGreaterThan(0);

    const prescription = docs.find((d) => d.record_type === "prescription");
    expect(prescription).toBeDefined();
    expect(prescription?.validation_code).toBeDefined();
    expect(prescription?.title).toContain("Receituário");
  });

  it("should allow confirming appointment presence", async () => {
    const ok = await confirmPatientAppointment("demo-appt-1");
    expect(ok).toBe(true);
  });
});

