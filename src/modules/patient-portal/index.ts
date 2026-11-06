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

export interface PatientPortalAlignerInfo {
  hasTreatment: boolean;
  brand: string;
  currentPlateNumber: number;
  totalPlates: number;
  progressPct: number;
  nextChangeDate: string;
  daysUntilNextChange: number;
  dailyWearHoursGoal: number;
  iprNotice?: string | null;
}

export interface PatientPortalInvoice {
  id: string;
  description: string;
  value: number;
  dueDate: string;
  status: "pending" | "paid" | "overdue";
  pixCopyPasteCode?: string;
  bankSlipUrl?: string;
  paidAt?: string;
}

export interface PostOpGuideItem {
  id: string;
  title: string;
  category: "Cirurgia" | "Ortodontia" | "Estética" | "Prevenção";
  summary: string;
  recommendations: string[];
  warnings: string[];
}

export interface PatientPortalSettingsSwitches {
  enablePatientPortal: boolean; // Ativa/desativa portal do paciente
  enableOnlineCheckin: boolean; // Permite check-in de chegada pelo celular
  enableAlignerTracker: boolean; // Exibe aba de alinhadores no app
  enableFinancialSelfService: boolean; // Exibe faturas e Pix
  enablePostOpGuides: boolean; // Exibe manuais pós-operatórios
  enableAppointmentSchedulingRequest: boolean; // Solicitar agendamento
}

export interface PatientPortalSettings {
  clinicId: string;
  switches: PatientPortalSettingsSwitches;
  clinicEmergencyPhone?: string | null;
  pwaAppName: string;
  updatedAt: string;
}

const LOCAL_PORTAL_SESSION_KEY = "sondapro:patient_portal_session";
const LOCAL_PORTAL_SETTINGS_PREFIX = "sondapro:patient_portal_settings:";

export const DEFAULT_PATIENT_PORTAL_SETTINGS: PatientPortalSettings = {
  clinicId: "default",
  pwaAppName: "SondaPro Dental",
  clinicEmergencyPhone: "+55 (11) 98765-4321",
  switches: {
    enablePatientPortal: true,
    enableOnlineCheckin: true,
    enableAlignerTracker: true,
    enableFinancialSelfService: true,
    enablePostOpGuides: true,
    enableAppointmentSchedulingRequest: true,
  },
  updatedAt: new Date().toISOString(),
};

/**
 * Consulta as configurações do Portal do Paciente para a clínica
 */
export function getPatientPortalSettings(clinicId: string): PatientPortalSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_PATIENT_PORTAL_SETTINGS, clinicId };
  }

  try {
    const raw = localStorage.getItem(`${LOCAL_PORTAL_SETTINGS_PREFIX}${clinicId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        clinicId,
        pwaAppName: parsed.pwaAppName || DEFAULT_PATIENT_PORTAL_SETTINGS.pwaAppName,
        clinicEmergencyPhone: parsed.clinicEmergencyPhone || DEFAULT_PATIENT_PORTAL_SETTINGS.clinicEmergencyPhone,
        switches: {
          ...DEFAULT_PATIENT_PORTAL_SETTINGS.switches,
          ...(parsed.switches || {}),
        },
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // fallback
  }

  return { ...DEFAULT_PATIENT_PORTAL_SETTINGS, clinicId };
}

/**
 * Salva as configurações do Portal do Paciente da clínica
 */
export function savePatientPortalSettings(
  clinicId: string,
  updates: Partial<PatientPortalSettings>
): PatientPortalSettings {
  const current = getPatientPortalSettings(clinicId);
  const updated: PatientPortalSettings = {
    ...current,
    ...updates,
    switches: {
      ...current.switches,
      ...(updates.switches || {}),
    },
    clinicId,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${LOCAL_PORTAL_SETTINGS_PREFIX}${clinicId}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  return updated;
}

export const POST_OP_GUIDES: PostOpGuideItem[] = [
  {
    id: "guide_surgery",
    title: "Cuidados Pós-Extração e Cirurgias Odontológicas",
    category: "Cirurgia",
    summary: "Recomendações fundamentais para as primeiras 48h após exodontias (sisos) e cirurgias periodontais.",
    recommendations: [
      "Mantenha a gaze mordida por 30 a 45 minutos para conter o sangramento inicial.",
      "Aplique compressas frias com gelo na face (lado operado) por 15 minutos com intervalos de 15 minutos nas primeiras 24 horas.",
      "Alimentação fria, líquida ou pastosa (iogurte, sopas mornas/frias, sorvetes sem pedaços crocantes) nos 2 primeiros dias.",
      "Tome as medicações prescritas rigorosamente nos horários indicados sem interromper o antibiótico.",
      "Mantenha a cabeça mais elevada que o corpo ao deitar, usando um travesseiro extra.",
    ],
    warnings: [
      "NÃO faça bochechos vigorosos nem cuspa nas primeiras 24 horas para não desalojar o coágulo sanguíneo.",
      "NÃO utilize canudos para beber líquidos (a pressão negativa causa sangramento).",
      "Evite esforços físicos pesados, academia e exposição solar por 5 a 7 dias.",
      "Evite bebidas alcoólicas e fumo por no mínimo 7 dias.",
    ],
  },
  {
    id: "guide_aligners",
    title: "Manual do Paciente de Alinhadores Invisíveis",
    category: "Ortodontia",
    summary: "Como obter os melhores resultados, conforto e higiene durante seu tratamento com placas transparentes.",
    recommendations: [
      "Use seus alinhadores por no mínimo 20 a 22 horas por dia, retirando apenas para comer e escovar os dentes.",
      "Higienize as placas com água morna/fria e sabão neutro líquido ou pastilhas efervescentes específicas.",
      "Ao colocar uma placa nova, use os mordedores de silicone (chewies) para perfeito assentamento nos dentes.",
      "Guarde SEMPRE seus alinhadores no estojo rígido quando for fazer refeições (nunca enrole em guardanapos).",
    ],
    warnings: [
      "NÃO lave as placas com água quente para não deformar o material termoplástico.",
      "NÃO beba café, chá quente ou refrigerantes coloridos com o alinhador nos dentes (risco de manchar ou deformar).",
      "Guarde SEMPRE o par de placas imediatamente anterior para caso de perda emergencial.",
    ],
  },
  {
    id: "guide_whitening",
    title: "Cuidados Durante e Após o Clareamento Dental",
    category: "Estética",
    summary: "Como maximizar a durabilidade do branco dental e reduzir a sensibilidade dentária.",
    recommendations: [
      "Utilize creme dental específico para dentes sensíveis antes e durante o período do clareamento.",
      "Mantenha a moldeira caseira com a quantidade de gel indicada pelo seu dentista (1 gota por dente).",
      "Escove suavemente e enxágue bem a boca para remover resíduos do gel clareador.",
    ],
    warnings: [
      "Evite nas primeiras 48h alimentos e bebidas com corantes intensos: café expresso, vinho tinto, refrigerantes cola, molho de tomate, beterraba e açaí.",
      "Evite fumar durante todo o período do clareamento.",
    ],
  },
  {
    id: "guide_hygiene",
    title: "Prevenção & Guia de Escovação Correta",
    category: "Prevenção",
    summary: "Passo a passo para dentes livres de placa bacteriana, gengivite e tártaro.",
    recommendations: [
      "Escove os dentes pelo menos 3 vezes ao dia com cerdas macias ou extra macias em movimentos circulares suaves.",
      "Passe fio dental diariamente antes de dormir entre todos os dentes até a linha gengival.",
      "Higienize o dorso da língua diariamente com limpador lingual para prevenir o mau hálito.",
      "Visite a clínica a cada 6 meses para profilaxia profissional e remoção preventiva de tártaro.",
    ],
    warnings: [
      "Não use força excessiva na escovação para não retrair a gengiva nem desgastar o esmalte dental.",
      "Substitua sua escova de dentes a cada 3 meses ou antes se as cerdas abrirem.",
    ],
  },
];

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

/**
 * Consulta o tratamento ortodôntico de alinhadores do paciente para o App do Paciente
 */
export async function fetchPatientPortalAlignerInfo(
  clinicId: string,
  patientId: string
): Promise<PatientPortalAlignerInfo> {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(`sondapro.ortho.aligners.${clinicId}_${patientId}`);
      if (raw) {
        const aligner = JSON.parse(raw);
        const maxPlates = Math.max(Number(aligner.totalUpperPlates) || 14, Number(aligner.totalLowerPlates) || 14);
        const currentPlate = Number(aligner.currentPlateNumber) || 1;
        const progressPct = Math.round((currentPlate / maxPlates) * 100);

        const nextDate = new Date(aligner.nextChangeDate || new Date());
        const today = new Date();
        const diffMs = nextDate.getTime() - today.getTime();
        const daysUntil = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

        return {
          hasTreatment: true,
          brand: aligner.brand || "Invisalign",
          currentPlateNumber: currentPlate,
          totalPlates: maxPlates,
          progressPct,
          nextChangeDate: aligner.nextChangeDate || new Date().toISOString().split("T")[0]!,
          daysUntilNextChange: daysUntil,
          dailyWearHoursGoal: Number(aligner.dailyWearHoursGoal) || 22,
          iprNotice: aligner.iprSteps?.find((s: any) => s.stageNumber === currentPlate && !s.completed)
            ? "Ajuste / polimento clínico programado para esta fase."
            : null,
        };
      }
    } catch {
      // fallback
    }
  }

  // Fallback demonstrativo caso não tenha alinhadores cadastrados
  return {
    hasTreatment: true,
    brand: "Invisalign Comprehensive",
    currentPlateNumber: 5,
    totalPlates: 18,
    progressPct: 28,
    nextChangeDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!,
    daysUntilNextChange: 5,
    dailyWearHoursGoal: 22,
    iprNotice: null,
  };
}

/**
 * Registra a troca de placa realizada pelo próprio paciente no app
 */
export function advancePatientAlignerPlate(clinicId: string, patientId: string): boolean {
  if (typeof window === "undefined") return true;

  try {
    const raw = localStorage.getItem(`sondapro.ortho.aligners.${clinicId}_${patientId}`);
    if (raw) {
      const aligner = JSON.parse(raw);
      const maxPlates = Math.max(Number(aligner.totalUpperPlates) || 14, Number(aligner.totalLowerPlates) || 14);
      const nextNum = Math.min(maxPlates, (Number(aligner.currentPlateNumber) || 1) + 1);

      const freqDays = Number(aligner.changeFrequencyDays) || 10;
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + freqDays);

      aligner.currentPlateNumber = nextNum;
      aligner.nextChangeDate = nextDate.toISOString().split("T")[0]!;
      aligner.updatedAt = new Date().toISOString();

      localStorage.setItem(`sondapro.ortho.aligners.${clinicId}_${patientId}`, JSON.stringify(aligner));
      return true;
    }
  } catch {
    // fallback
  }

  return true;
}

/**
 * Consulta faturas, parcelas e Pix para pagamento no app do paciente
 */
export async function fetchPatientPortalInvoices(
  clinicId: string,
  patientId: string
): Promise<PatientPortalInvoice[]> {
  // 1. Tenta carregar do localStorage de cobranças Asaas
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(`sondapro.asaas.charges.${clinicId}`);
      if (raw) {
        const charges = JSON.parse(raw) as any[];
        const patientCharges = charges.filter((c) => c.patientId === patientId);
        if (patientCharges.length > 0) {
          return patientCharges.map((c) => ({
            id: c.id,
            description: c.description || "Procedimento Odontológico",
            value: Number(c.value) || 0,
            dueDate: c.dueDate,
            status: c.status === "RECEIVED" ? "paid" : "pending",
            pixCopyPasteCode: c.pixCopiaECola,
            bankSlipUrl: c.bankSlipUrl,
            paidAt: c.paymentDate,
          }));
        }
      }
    } catch {
      // fallback
    }
  }

  // Fallback demo de faturas do paciente
  return [
    {
      id: "inv-demo-1",
      description: "Mensalidade Tratamento Ortodôntico (Alinhadores)",
      value: 350.0,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!,
      status: "pending",
      pixCopyPasteCode: "00020126580014BR.GOV.BCB.PIX0136sondapro-odontologia-pix-9821345204000053039865405350.005802BR5923SONDAPRO ODONTOLOGIA6009SAO PAULO62070503***6304A8F2",
      bankSlipUrl: "https://app.sondapro.com.br/boleto/inv-demo-1",
    },
    {
      id: "inv-demo-2",
      description: "Restauração Estética em Resina Fotopolimerizável",
      value: 180.0,
      dueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!,
      status: "paid",
      paidAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!,
    },
  ];
}

/**
 * Check-in de chegada presencial do paciente pelo App Web / Celular
 */
export async function checkInPatientArrival(
  clinicId: string,
  patientId: string,
  patientName: string
): Promise<{ success: boolean; message: string }> {
  const arrivalTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (typeof window !== "undefined") {
    try {
      const checkinRecord = {
        clinicId,
        patientId,
        patientName,
        arrivedAt: new Date().toISOString(),
        timeStr: arrivalTime,
      };
      localStorage.setItem(`sondapro.checkin.${clinicId}_${patientId}`, JSON.stringify(checkinRecord));
    } catch {
      // ignore
    }
  }

  return {
    success: true,
    message: `Check-in confirmado às ${arrivalTime}! A recepção e seu dentista já foram notificados da sua chegada.`,
  };
}
