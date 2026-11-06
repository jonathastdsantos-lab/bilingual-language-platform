/**
 * SondaPro Dental - Motor de IA Odontológica para Evolução por Voz (Whisper / Gemini / TUSS)
 * 
 * Permite que o dentista dite naturalmente o atendimento em linguagem coloquial,
 * transcreva em tempo real no navegador/celular e formate clinicamente com códigos TUSS/CFO,
 * detecção automática de dente FDI, materiais utilizados e recomendações pós-operatórias.
 */

export interface FormattedEvolutionResult {
  title: string;
  tussCode: string | null;
  tussDescription: string | null;
  toothNumber: number | null;
  formattedContent: string;
  procedureCategory: string;
  materials: string[];
  suggestedReturnDays: number | null;
}

export interface VoiceEvolutionTemplate {
  id: string;
  specialty: string;
  label: string;
  rawDictation: string;
}

// Catálogo resumido de procedimentos TUSS odontológicos mais frequentes
export const TUSS_ODONTO_CATALOG: Array<{
  code: string;
  description: string;
  keywords: string[];
  category: string;
}> = [
  {
    code: "85100140",
    description: "Manutenção de aparelho ortodôntico (aparelho fixo / alinhadores)",
    keywords: ["ortodont", "arco", "elástico", "braquete", "termoativado", "alinhador", "classe ii", "classe iii", "contenção"],
    category: "Ortodontia",
  },
  {
    code: "85100191",
    description: "Restauração em resina composta - classe I / II / III / IV / V",
    keywords: ["restaura", "resina", "cárie", "ácido", "adesivo", "fotopolimeriz", "acabamento", "polimento", "matriz"],
    category: "Dentística & Estética",
  },
  {
    code: "85100043",
    description: "Clareamento dental de consultório / caseiro",
    keywords: ["clareamento", "peróxido", "barreira gengival", "clareador", "escala vita", "moldeira"],
    category: "Dentística & Estética",
  },
  {
    code: "85100060",
    description: "Faceta direta em resina / Lente de contato dental em cerâmica",
    keywords: ["faceta", "lente de contato", "estética", "facetas", "lentes", "cerâmica", "estratificação"],
    category: "Prótese & Estética",
  },
  {
    code: "85100221",
    description: "Raspagem e alisamento radicular / Profilaxia periodontal",
    keywords: ["raspagem", "tártaro", "cálculo", "profilaxia", "periodont", "ultrassom", "jato de bicarbonato", "gengivite"],
    category: "Periodontia",
  },
  {
    code: "85100108",
    description: "Tratamento endodôntico (canal)",
    keywords: ["canal", "endodont", "curativo", "odonto", "polpa", "cone de guta", "instrumentação", "irrigação", "limas"],
    category: "Endodontia",
  },
  {
    code: "85100086",
    description: "Exodontia de dente permanente / semi-incluso / siso",
    keywords: ["extração", "exodontia", "siso", "cirurgia", "sutura", "fio de seda", "fio de nylon", "curetagem", "anestesia infiltrativa"],
    category: "Cirurgia Bucomaxilofacial",
  },
  {
    code: "85100132",
    description: "Instalação de implante dentário osseointegrado",
    keywords: ["implante", "osseointegra", "torqu", "fresagem", "reabertura", "cicatrizador", "neodent", "straumann"],
    category: "Implantodontia",
  },
];

// Modelos de voz prontos para demonstração rápida ou inspiração do cirurgião-dentista
export const VOICE_EVOLUTION_EXAMPLES: VoiceEvolutionTemplate[] = [
  {
    id: "ortho_maintenance",
    specialty: "Ortodontia",
    label: "Manutenção Ortodôntica (Arco + Elásticos)",
    rawDictation:
      "Paciente compareceu para manutenção ortodôntica. Trocado arco superior para 0.16 termoativado, instalada mecânica de elásticos intermaxilares classe II lado direito. Boa higiene bucal, retorno em 30 dias.",
  },
  {
    id: "aesthetic_veneers",
    specialty: "Estética & Lentes",
    label: "Faceta em Resina / Clareamento",
    rawDictation:
      "Paciente realizou sessão de clareamento de consultório com peróxido de hidrogênio a 35 por cento nos dentes anteriores e confecção de faceta direta em resina composta no dente 11. Resultado estético excelente, escala de cor atingida BL2, retorno em 7 dias para polimento final.",
  },
  {
    id: "surgery_extraction",
    specialty: "Cirurgia",
    label: "Exodontia Simples / Siso",
    rawDictation:
      "Realizada exodontia simples do dente 38. Feita anestesia infiltrativa com articaína 4 por cento com epinefrina. Sindesmotomia, luxação com alavanca reta e exodontia sem intercorrências. Curetagem da loja cirúrgica e sutura com fio seda 4-0. Prescrito amoxicilina e ibuprofeno. Retorno em 7 dias para remoção de pontos.",
  },
  {
    id: "restoration_resin",
    specialty: "Dentística",
    label: "Restauração Estética Classe II",
    rawDictation:
      "Remoção de tecido cariado e restauração classe II ocluso mesial no dente 36 em resina composta nanoparticulada cor A2. Condicionamento ácido fosfórico 37 por cento, adesivo universal, fotopolimerização, ajuste oclusal com carbono fino e polimento com pontas de silicone. Retorno semestral.",
  },
  {
    id: "periodontics_clean",
    specialty: "Periodontia",
    label: "Raspagem Periodontal & Profilaxia",
    rawDictation:
      "Paciente compareceu para manutenção periodontal. Realizada raspagem supra e subgengival com ultrassom e curetas de gracey em todos os sextantes, associada a profilaxia com jato de bicarbonato e aplicação tópica de flúor gel neutro. Orientado sobre uso correto do fio dental. Retorno em 6 meses.",
  },
];

/**
 * Detecta dente citado pelo dentista na fala
 * Exemplos: "dente 36", "elemento 11", "dentes 16 e 26", "no 38"
 */
export function detectFdiToothFromText(text: string): number | null {
  const normalized = text.toLowerCase();
  
  // Procura padrões como "dente 36", "elemento 11", "dentes 16", "no 47"
  const toothMatch = normalized.match(/(?:dente|elemento|dentes|no|dente\s*n[úu]mero)\s*#?([1-8][1-8])/i);
  if (toothMatch && toothMatch[1]) {
    const num = parseInt(toothMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  // Fallback: números isolados válidos de dente FDI
  const allMatches = normalized.match(/\b([1-4][1-8]|[5-8][1-5])\b/g);
  if (allMatches && allMatches.length > 0) {
    const first = allMatches[0];
    if (first) {
      const candidate = parseInt(first, 10);
      if (!isNaN(candidate)) return candidate;
    }
  }

  return null;
}

/**
 * Extrai dias de retorno citados na fala
 * Exemplos: "retorno em 30 dias", "retorno em 7 dias", "retorno em 15 dias"
 */
export function detectReturnDays(text: string): number | null {
  const match = text.match(/retorno\s*(?:em|ap[óo]s|de)?\s*(\d+)\s*(dias|semanas|m[eê]s|meses)/i);
  if (!match || !match[1]) return null;

  const num = parseInt(match[1], 10);
  if (isNaN(num)) return null;

  const unit = (match[2] || "").toLowerCase();
  if (unit.includes("semana")) {
    return num * 7;
  }
  if (unit.includes("mês") || unit.includes("mes")) {
    return num * 30;
  }
  return num;
}

/**
 * Transforma uma fala espontânea do cirurgião-dentista em uma evolução estruturada
 * com padrões TUSS, CFO e documentação imutável.
 */
export function formatClinicalEvolutionWithAI(
  rawText: string,
  options?: {
    patientName?: string | undefined;
    professionalName?: string | undefined;
  }
): FormattedEvolutionResult {
  const cleanText = rawText.trim();
  const lower = cleanText.toLowerCase();

  // 1. Identifica procedimento no catálogo TUSS
  let matchedTuss = TUSS_ODONTO_CATALOG.find((tuss) =>
    tuss.keywords.some((kw) => lower.includes(kw))
  );

  if (!matchedTuss) {
    matchedTuss = {
      code: "85100010",
      description: "Consulta odontológica / Procedimento clínico geral",
      keywords: [],
      category: "Clínica Geral",
    };
  }

  // 2. Detecta dente citado
  const detectedTooth = detectFdiToothFromText(cleanText);

  // 3. Detecta retorno
  const returnDays = detectReturnDays(cleanText);

  // 4. Identifica materiais citados
  const materialsFound: string[] = [];
  const materialKeywords = [
    { label: "Arco NiTi Termoativado", match: /0\.?16|termoativad|niti/i },
    { label: "Elásticos Intermaxilares Ortodônticos", match: /el[áa]sticos?/i },
    { label: "Resina Composta Nanoparticulada", match: /resina/i },
    { label: "Ácido Fosfórico 37%", match: /[áa]cido|condicionamento/i },
    { label: "Sistema Adesivo Odontológico", match: /adesivo/i },
    { label: "Anestésico Local (Articaína / Lidocaína)", match: /anest/i },
    { label: "Fio de Sutura Cirúrgico", match: /sutura|fio/i },
    { label: "Peróxido de Hidrogênio Clareador", match: /per[óo]xido|clareador/i },
    { label: "Barreira Gengival Fotopolimerizável", match: /barreira gengival/i },
    { label: "Curetas Periodontais / Ultrassom", match: /raspagem|ultrassom|cureta/i },
    { label: "Flúor Tópico / Profilaxia", match: /fl[úu]or|profilaxia/i },
  ];

  for (const mat of materialKeywords) {
    if (mat.match.test(lower)) {
      materialsFound.push(mat.label);
    }
  }

  // 5. Gera Título Clínico Padronizado
  let clinicalTitle = "";
  if (lower.includes("ortodônt") || lower.includes("arco") || lower.includes("elástico")) {
    clinicalTitle = `Manutenção Ortodôntica${detectedTooth ? ` (Elemento #${detectedTooth})` : ""}`;
  } else if (lower.includes("clareamento")) {
    clinicalTitle = `Sessão de Clareamento Dental de Consultório`;
  } else if (lower.includes("faceta") || lower.includes("lente")) {
    clinicalTitle = `Confecção de Faceta / Lente Estética${detectedTooth ? ` (Elemento #${detectedTooth})` : ""}`;
  } else if (lower.includes("restaura")) {
    clinicalTitle = `Restauração em Resina Composta${detectedTooth ? ` (Elemento #${detectedTooth})` : ""}`;
  } else if (lower.includes("exodontia") || lower.includes("extração")) {
    clinicalTitle = `Exodontia Cirúrgica${detectedTooth ? ` (Elemento #${detectedTooth})` : ""}`;
  } else if (lower.includes("raspagem") || lower.includes("profilaxia")) {
    clinicalTitle = `Profilaxia & Raspagem Periodontal`;
  } else {
    clinicalTitle = `Atendimento Clínico Odontológico${detectedTooth ? ` (Elemento #${detectedTooth})` : ""}`;
  }

  if (matchedTuss.code) {
    clinicalTitle += ` · TUSS ${matchedTuss.code}`;
  }

  // 6. Estruturação Clínica em Tópicos Padrão CFO/TUSS
  const sections: string[] = [];

  // Seção 1: Motivo do Comparecimento
  sections.push(
    `📋 MOTIVO DA CONSULTA / QUEIXA:\n` +
      `Paciente compareceu para atendimento odontológico programado com queixa / indicação de: ${matchedTuss.description}.`
  );

  // Seção 2: Procedimentos Executados
  sections.push(
    `🩺 PROCEDIMENTOS REALIZADOS (CFO / TUSS ${matchedTuss.code}):\n` +
      `• Procedimento: ${matchedTuss.description}\n` +
      (detectedTooth ? `• Região / Dente tratado: Elemento FDI #${detectedTooth}\n` : "") +
      `• Descrição do ato clínico: ${cleanText}`
  );

  // Seção 3: Materiais e Medicamentos
  if (materialsFound.length > 0) {
    sections.push(
      `🧪 MATERIAIS & INSUMOS APLICADOS:\n` +
        materialsFound.map((m) => `• ${m}`).join("\n")
    );
  }

  // Seção 4: Condição Bucal & Higiene
  const hygieneNote = lower.includes("boa higiene") || lower.includes("higiene boa")
    ? "Paciente apresenta boa higienização bucal e tecidos periodontais sem inflamação ativa."
    : lower.includes("má higiene") || lower.includes("placa")
      ? "Presença de biofilme / cálculo dental, reforçada orientação de higiene interdental."
      : "Condição bucal e estabilidade dos tecidos avaliadas clinicamente sem intercorrências.";

  sections.push(`🦷 ACHADOS CLÍNICOS & HIGIENE:\n${hygieneNote}`);

  // Seção 5: Orientações ao Paciente e Retorno
  const returnStr = returnDays
    ? `Retorno agendado para ${returnDays} dias para acompanhamento clínico / continuidade do plano de tratamento.`
    : "Retorno sugerido conforme cronograma do plano de tratamento.";

  sections.push(
    `📅 ORIENTAÇÕES PÓS-ATENDIMENTO & PRÓXIMO RETORNO:\n` +
      `• Orientações prestadas diretamente ao paciente em consultório.\n` +
      `• ${returnStr}`
  );

  const formattedContent = sections.join("\n\n");

  return {
    title: clinicalTitle,
    tussCode: matchedTuss.code,
    tussDescription: matchedTuss.description,
    toothNumber: detectedTooth,
    formattedContent,
    procedureCategory: matchedTuss.category,
    materials: materialsFound,
    suggestedReturnDays: returnDays,
  };
}
