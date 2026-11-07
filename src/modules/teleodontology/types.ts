/**
 * Módulo de Teleodontologia Integrada (Resolução CFO 226/2020)
 * 
 * Regulamenta o exercício da Odontologia a distância mediado por tecnologias de
 * informação e comunicação (TICs), nas modalidades exclusivas de:
 * 1. Teleorientação
 * 2. Telemonitoramento
 * 3. Teleinterconsulta
 */

export type TeleodontologyModality = "teleorientacao" | "telemonitoramento" | "teleinterconsulta";

export type TeleodontologyStatus =
  | "scheduled"
  | "waiting_room"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export interface TeleodontologyPrescriptionItem {
  id: string;
  name: string;
  dosage: string;
  instructions: string;
  quantity?: string | undefined;
}

export interface TeleodontologyPhoto {
  id: string;
  url: string;
  description: string;
  uploadedAt: string;
}

export interface TeleodontologySession {
  id: string;
  clinicId: string;
  patientId: string;
  dentistId: string;
  interconsultaSpecialistId?: string | undefined;
  appointmentId?: string | undefined;
  modality: TeleodontologyModality;
  status: TeleodontologyStatus;
  roomToken: string;
  roomUrl: string;
  scheduledFor: string;
  startedAt?: string | undefined;
  endedAt?: string | undefined;
  durationSeconds: number;
  tcleAccepted: boolean;
  tcleAcceptedAt?: string | undefined;
  tcleIp?: string | undefined;
  tcleSignatureHash?: string | undefined;
  clinicalNotes?: string | undefined;
  prescriptions: TeleodontologyPrescriptionItem[];
  patientPhotos: TeleodontologyPhoto[];
  interconsultaNotes?: string | undefined;
  patientName?: string | undefined;
  patientPhone?: string | undefined;
  patientCpf?: string | undefined;
  dentistName?: string | undefined;
  dentistCro?: string | undefined;
  specialistName?: string | undefined;
  specialistCro?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeleodontologySessionParams {
  clinicId: string;
  patientId: string;
  dentistId: string;
  interconsultaSpecialistId?: string | undefined;
  appointmentId?: string | undefined;
  modality: TeleodontologyModality;
  scheduledFor: string;
  patientName?: string | undefined;
  patientPhone?: string | undefined;
  patientCpf?: string | undefined;
  dentistName?: string | undefined;
  dentistCro?: string | undefined;
  specialistName?: string | undefined;
  specialistCro?: string | undefined;
}

export const CFO_226_MODALITY_LABELS: Record<TeleodontologyModality, string> = {
  teleorientacao: "Teleorientação Odontológica",
  telemonitoramento: "Telemonitoramento Clínico",
  teleinterconsulta: "Teleinterconsulta entre CDs",
};

export const CFO_226_MODALITY_DESCRIPTIONS: Record<TeleodontologyModality, string> = {
  teleorientacao:
    "Identificação prévia, pelo cirurgião-dentista, do melhor momento para a realização do atendimento presencial, acolhimento de queixas e orientações de higiene/alívio sintomático (Art. 2º, I).",
  telemonitoramento:
    "Acompanhamento a distância dos pacientes que estejam em tratamento ou pós-operatório (ortodontia/alinhadores, pós-cirúrgico, implantes ou clareamento) (Art. 2º, II).",
  teleinterconsulta:
    "Troca de informações e opiniões exclusivamente entre cirurgiões-dentistas, com ou sem a presença do paciente, para assistência diagnóstica ou terapêutica com parecer de especialista (Art. 2º, III).",
};

export const CFO_226_LEGAL_DISCLAIMER =
  "De acordo com a Resolução CFO-226/2020 do Conselho Federal de Odontologia, é expressamente vedada a realização de consultas com o objetivo de diagnóstico presuntivo definitivo, prescrição invasiva ou plano de tratamento sem o exame clínico presencial direto, exceto orientações profiláticas, suporte pós-operatório ou triagem inicial.";

export const CFO_226_TCLE_TEXT = `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO PARA TELEODONTOLOGIA
(Conforme Resolução CFO-226/2020 do Conselho Federal de Odontologia)

1. FINALIDADE: O presente atendimento odontológico a distância destina-se exclusivamente às finalidades regulamentadas pelo CFO: Teleorientação (orientação prévia e triagem), Telemonitoramento (acompanhamento de tratamento ativo ou pós-operatório) ou Teleinterconsulta (discussão entre cirurgiões-dentistas).

2. LIMITAÇÕES DA TECNOLOGIA: Declaro estar ciente de que o atendimento mediado por tecnologias de comunicação não substitui, em hipótese alguma, o exame físico intraoral presencial quando este for julgado clinicamente necessário pelo cirurgião-dentista para diagnóstico de lesões, patologias ósseas ou realização de procedimentos invasivos.

3. PRIVACIDADE E SEGURANÇA DE DADOS (LGPD): Declaro ciência de que a transmissão de áudio, vídeo e fotografias clínicas é realizada em ambiente criptografado e seguro, e que os dados clínicos e imagens coletados serão anexados exclusivamente ao meu prontuário odontológico sob sigilo profissional do Código de Ética Odontológica.

4. AUTONOMIA E CONSENTIMENTO: Autorizo expressamente o cirurgião-dentista a realizar este teleatendimento, ciente de que posso solicitar a qualquer momento a interrupção da sessão e o agendamento de uma consulta presencial.`;

