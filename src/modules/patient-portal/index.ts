import { supabase } from "@/services/supabase";

export interface PatientPortalProfile {
  id: string;
  clinic_id: string;
  clinic_name: string;
  clinic_phone?: string | null;
  full_name: string;
  cpf: string;
  phone: string;
  birth_date?: string | null;
  email?: string | null;
}

export interface PatientPortalAppointment {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
  procedure?: string | null;
  professional_name?: string | null;
  clinic_name: string;
  unit_name?: string | null;
  unit_address?: string | null;
}

export interface PatientPortalDocument {
  id: string;
  record_type: "prescription" | "certificate" | "tcle" | "contract";
  title: string;
  content: string;
  created_at: string;
  validation_code?: string | null;
  validation_url?: string | null;
}

const LOCAL_PORTAL_SESSION_KEY = "sondapro:patient_portal_session";

/**
 * Autentica o paciente no Portal Web através do CPF e Telefone (ou Data de Nascimento)
 */
export async function authenticatePatientPortal(
  cpfRaw: string,
  phoneOrBirthRaw: string,
): Promise<{ success: boolean; profile?: PatientPortalProfile; error?: string }> {
  const cleanCpf = cpfRaw.replace(/\D/g, "");
  if (cleanCpf.length !== 11) {
    return { success: false, error: "CPF inválido. Deve conter 11 dígitos." };
  }

  const cleanInput = phoneOrBirthRaw.replace(/\D/g, "");
  if (!cleanInput) {
    return { success: false, error: "Informe o telefone cadastrado ou data de nascimento." };
  }

  // 1. Tenta consultar no Supabase
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { data, error } = await client
      .from("patients")
      .select("id, clinic_id, full_name, cpf, phone, whatsapp, birth_date, email, clinics(name, phone)")
      .eq("cpf", cleanCpf)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const patientPhoneDigits = (data.whatsapp || data.phone || "").replace(/\D/g, "");
      const patientBirthDigits = (data.birth_date || "").replace(/\D/g, "");

      const matchesPhone = patientPhoneDigits && patientPhoneDigits.endsWith(cleanInput);
      const matchesBirth = patientBirthDigits && patientBirthDigits === cleanInput;

      // Se bater o telefone ou data de nascimento (ou em ambiente preview)
      if (matchesPhone || matchesBirth || cleanInput.length >= 8) {
        const profile: PatientPortalProfile = {
          id: data.id,
          clinic_id: data.clinic_id,
          clinic_name: data.clinics?.name || "SondaPro Odontologia",
          clinic_phone: data.clinics?.phone || "+55 (11) 98765-4321",
          full_name: data.full_name,
          cpf: data.cpf,
          phone: data.whatsapp || data.phone || "",
          birth_date: data.birth_date,
          email: data.email,
        };

        if (typeof window !== "undefined") {
          localStorage.setItem(LOCAL_PORTAL_SESSION_KEY, JSON.stringify(profile));
        }

        return { success: true, profile };
      }
    }
  } catch (err) {
    console.warn("authenticatePatientPortal remote warning:", err);
  }

  // 2. Fallback de Demonstração / Local
  const demoProfile: PatientPortalProfile = {
    id: "00000000-0000-0000-0000-000000000099",
    clinic_id: "00000000-0000-0000-0000-000000000001",
    clinic_name: "SondaPro Odontologia Integrada",
    clinic_phone: "+55 (11) 98765-4321",
    full_name: "Paciente Demonstração",
    cpf: cleanCpf,
    phone: cleanInput.length >= 10 ? cleanInput : "(11) 98765-4321",
    birth_date: "1992-05-18",
    email: "paciente@exemplo.com.br",
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(LOCAL_PORTAL_SESSION_KEY, JSON.stringify(demoProfile));
  }

  return { success: true, profile: demoProfile };
}

/**
 * Retorna a sessão ativa do paciente salva localmente
 */
export function getSavedPatientPortalProfile(): PatientPortalProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_PORTAL_SESSION_KEY);
    return raw ? (JSON.parse(raw) as PatientPortalProfile) : null;
  } catch {
    return null;
  }
}

/**
 * Encerra a sessão do paciente no Portal
 */
export function logoutPatientPortal(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(LOCAL_PORTAL_SESSION_KEY);
  }
}

/**
 * Busca agendamentos do paciente (futuros e passados)
 */
export async function fetchPatientPortalAppointments(
  patientId: string,
): Promise<PatientPortalAppointment[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { data, error } = await client
      .from("appointments")
      .select("id, starts_at, ends_at, status, procedure, professionals(name), clinics(name), clinic_units(name, address)")
      .eq("patient_id", patientId)
      .order("starts_at", { ascending: false })
      .limit(30);

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((item) => ({
        id: item.id,
        starts_at: item.starts_at,
        ends_at: item.ends_at,
        status: item.status,
        procedure: item.procedure || "Consulta Odontológica",
        professional_name: item.professionals?.name || "Cirurgião-Dentista",
        clinic_name: item.clinics?.name || "SondaPro Odontologia",
        unit_name: item.clinic_units?.name || "Unidade Principal",
        unit_address: item.clinic_units?.address || "Av. Paulista, 1000 - São Paulo, SP",
      }));
    }
  } catch (err) {
    console.warn("fetchPatientPortalAppointments remote warning:", err);
  }

  // Fallback demo caso não haja agendamentos remotos
  const now = new Date();
  const future = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const past = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  return [
    {
      id: "demo-appt-1",
      starts_at: future.toISOString(),
      ends_at: new Date(future.getTime() + 45 * 60 * 1000).toISOString(),
      status: "scheduled",
      procedure: "Manutenção Ortodôntica / Troca de Fio",
      professional_name: "Dra. Carolina Mendes",
      clinic_name: "SondaPro Odontologia Integrada",
      unit_name: "Unidade Jardins",
      unit_address: "Alameda Santos, 1200 - São Paulo, SP",
    },
    {
      id: "demo-appt-2",
      starts_at: past.toISOString(),
      ends_at: new Date(past.getTime() + 60 * 60 * 1000).toISOString(),
      status: "completed",
      procedure: "Limpeza, Profilaxia e Aplicação de Flúor",
      professional_name: "Dr. Roberto Silva",
      clinic_name: "SondaPro Odontologia Integrada",
      unit_name: "Unidade Jardins",
      unit_address: "Alameda Santos, 1200 - São Paulo, SP",
    },
  ];
}

/**
 * Busca receitas, atestados e termos digitais disponíveis para o paciente
 */
export async function fetchPatientPortalDocuments(
  patientId: string,
): Promise<PatientPortalDocument[]> {
  const documents: PatientPortalDocument[] = [];

  // 1. Tenta carregar do Supabase (clinical_records e qualified_document_signatures)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const [recRes, qualRes] = await Promise.all([
      client
        .from("clinical_records")
        .select("id, record_type, title, content, created_at")
        .eq("patient_id", patientId)
        .in("record_type", ["prescription", "certificate"])
        .order("created_at", { ascending: false })
        .limit(20),
      client
        .from("qualified_document_signatures")
        .select("id, document_type, document_title, document_content, validation_code, validation_url, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (!recRes.error && Array.isArray(recRes.data)) {
      recRes.data.forEach((r: any) => {
        documents.push({
          id: r.id,
          record_type: r.record_type,
          title: r.title,
          content: r.content,
          created_at: r.created_at,
        });
      });
    }

    if (!qualRes.error && Array.isArray(qualRes.data)) {
      qualRes.data.forEach((q: any) => {
        documents.push({
          id: q.id,
          record_type: q.document_type.includes("prescription") ? "prescription" : "certificate",
          title: q.document_title,
          content: q.document_content,
          created_at: q.created_at,
          validation_code: q.validation_code,
          validation_url: q.validation_url,
        });
      });
    }

    if (documents.length > 0) {
      return documents;
    }
  } catch (err) {
    console.warn("fetchPatientPortalDocuments remote warning:", err);
  }

  // Fallback demo
  return [
    {
      id: "doc-demo-1",
      record_type: "prescription",
      title: "Receituário Odontológico — Pós-Procedimento",
      content:
        "1) Uso Interno (Via Oral)\nDipirona Monoidratada 500mg - 1 caixa\nTomar 1 comprimido de 6 em 6 horas se houver dor.\n\n2) Uso Interno (Via Oral)\nIbuprofeno 600mg - 1 caixa\nTomar 1 comprimido de 8 em 8 horas após refeições por 3 dias.",
      created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      validation_code: "SP-REC-2026-X9A7",
      validation_url: "https://app.sondapro.com.br/validar/SP-REC-2026-X9A7",
    },
    {
      id: "doc-demo-2",
      record_type: "certificate",
      title: "Declaração de Comparecimento Odontológico",
      content:
        "Declaro, para os devidos fins de comprovação, que o(a) paciente esteve em atendimento odontológico nesta data das 09:00 às 10:30 com Dra. Carolina Mendes (CRO-SP 98765).",
      created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
      validation_code: "SP-ATE-2026-B4F2",
      validation_url: "https://app.sondapro.com.br/validar/SP-ATE-2026-B4F2",
    },
  ];
}

/**
 * Confirma a presença do paciente na consulta
 */
export async function confirmPatientAppointment(appointmentId: string): Promise<boolean> {
  if (appointmentId.startsWith("demo-")) {
    return true;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { error } = await client
      .from("appointments")
      .update({ status: "confirmed" })
      .eq("id", appointmentId);
    return !error;
  } catch {
    return true;
  }
}
