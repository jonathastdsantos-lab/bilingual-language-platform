/**
 * SondaPro Dental - Catálogo TUSS Odontológico e Tabela de Glosas ANS
 * Terminologia Unificada da Saúde Suplementar (TUSS) padronizada pela ANS.
 */

export interface TussProcedureItem {
  code: string;
  description: string;
  category: "Consulta" | "Prevenção" | "Dentística" | "Endodontia" | "Cirurgia" | "Periodontia" | "Prótese" | "Ortodontia" | "Radiologia";
  requiresTooth: boolean;
  requiresSurface: boolean;
  defaultPrice: number;
}

export const TUSS_ODONTO_CATALOG: TussProcedureItem[] = [
  // 1. Consultas e Diagnóstico
  {
    code: "81000030",
    description: "Consulta odontológica inicial / Exame clínico",
    category: "Consulta",
    requiresTooth: false,
    requiresSurface: false,
    defaultPrice: 90.0,
  },
  {
    code: "81000049",
    description: "Consulta odontológica de urgência",
    category: "Consulta",
    requiresTooth: false,
    requiresSurface: false,
    defaultPrice: 120.0,
  },

  // 2. Prevenção e Profilaxia
  {
    code: "85100140",
    description: "Profilaxia dental / polimento coronário",
    category: "Prevenção",
    requiresTooth: false,
    requiresSurface: false,
    defaultPrice: 85.0,
  },
  {
    code: "85100191",
    description: "Aplicação tópica de flúor (por arcada)",
    category: "Prevenção",
    requiresTooth: false,
    requiresSurface: false,
    defaultPrice: 65.0,
  },
  {
    code: "85100221",
    description: "Aplicação de selante de fóssulas e fissuras",
    category: "Prevenção",
    requiresTooth: true,
    requiresSurface: true,
    defaultPrice: 75.0,
  },

  // 3. Periodontia
  {
    code: "85200030",
    description: "Raspagem supra-gengival e alisamento por hemiarco",
    category: "Periodontia",
    requiresTooth: false,
    requiresSurface: false,
    defaultPrice: 110.0,
  },
  {
    code: "85200049",
    description: "Raspagem sub-gengival e alisamento radicular por hemiarco",
    category: "Periodontia",
    requiresTooth: false,
    requiresSurface: false,
    defaultPrice: 140.0,
  },

  // 4. Dentística / Restaurações
  {
    code: "82000850",
    description: "Restauração em resina composta - 1 face",
    category: "Dentística",
    requiresTooth: true,
    requiresSurface: true,
    defaultPrice: 115.0,
  },
  {
    code: "82000876",
    description: "Restauração em resina composta - 2 faces",
    category: "Dentística",
    requiresTooth: true,
    requiresSurface: true,
    defaultPrice: 145.0,
  },
  {
    code: "82000892",
    description: "Restauração em resina composta - 3 faces",
    category: "Dentística",
    requiresTooth: true,
    requiresSurface: true,
    defaultPrice: 175.0,
  },
  {
    code: "82000914",
    description: "Restauração em resina composta - 4 faces ou ângulo",
    category: "Dentística",
    requiresTooth: true,
    requiresSurface: true,
    defaultPrice: 210.0,
  },
  {
    code: "82000752",
    description: "Restauração em amálgama - 1 face",
    category: "Dentística",
    requiresTooth: true,
    requiresSurface: true,
    defaultPrice: 80.0,
  },
  {
    code: "82000779",
    description: "Restauração em amálgama - 2 faces",
    category: "Dentística",
    requiresTooth: true,
    requiresSurface: true,
    defaultPrice: 105.0,
  },

  // 5. Endodontia
  {
    code: "83000083",
    description: "Tratamento endodôntico dente unirradicular",
    category: "Endodontia",
    requiresTooth: true,
    requiresSurface: false,
    defaultPrice: 280.0,
  },
  {
    code: "83000105",
    description: "Tratamento endodôntico dente birradicular",
    category: "Endodontia",
    requiresTooth: true,
    requiresSurface: false,
    defaultPrice: 380.0,
  },
  {
    code: "83000121",
    description: "Tratamento endodôntico dente polirradicular (molar)",
    category: "Endodontia",
    requiresTooth: true,
    requiresSurface: false,
    defaultPrice: 520.0,
  },
  {
    code: "83000148",
    description: "Retratamento endodôntico dente unirradicular",
    category: "Endodontia",
    requiresTooth: true,
    requiresSurface: false,
    defaultPrice: 340.0,
  },
  {
    code: "83000164",
    description: "Retratamento endodôntico dente polirradicular",
    category: "Endodontia",
    requiresTooth: true,
    requiresSurface: false,
    defaultPrice: 590.0,
  },

  // 6. Cirurgia Bucomaxilofacial
  {
    code: "84000100",
    description: "Exodontia de dente permanente",
    category: "Cirurgia",
    requiresTooth: true,
    requiresSurface: false,
    defaultPrice: 130.0,
  },
  {
    code: "84000118",
    description: "Exodontia de dente decíduo",
    category: "Cirurgia",
    requiresTooth: true,
    requiresSurface: false,
    defaultPrice: 90.0,
  },
  {
    code: "84000193",
    description: "Exodontia de dente incluso / impactado (terceiro molar / siso)",
    category: "Cirurgia",
    requiresTooth: true,
    requiresSurface: false,
    defaultPrice: 320.0,
  },
  {
    code: "84000207",
    description: "Exodontia de dente semi-incluso",
    category: "Cirurgia",
    requiresTooth: true,
    requiresSurface: false,
    defaultPrice: 240.0,
  },
  {
    code: "84000177",
    description: "Ulectomia / Frenectomia labial ou lingual",
    category: "Cirurgia",
    requiresTooth: false,
    requiresSurface: false,
    defaultPrice: 200.0,
  },
  {
    code: "84000142",
    description: "Gengivoplastia / Aumento de coroa clínica",
    category: "Cirurgia",
    requiresTooth: true,
    requiresSurface: false,
    defaultPrice: 260.0,
  },

  // 7. Radiologia e Diagnóstico por Imagem
  {
    code: "86000017",
    description: "Radiografia periapical",
    category: "Radiologia",
    requiresTooth: true,
    requiresSurface: false,
    defaultPrice: 35.0,
  },
  {
    code: "86000025",
    description: "Radiografia interproximal (Bite-wing)",
    category: "Radiologia",
    requiresTooth: false,
    requiresSurface: false,
    defaultPrice: 35.0,
  },
  {
    code: "86000041",
    description: "Radiografia panorâmica de mandíbula/maxila",
    category: "Radiologia",
    requiresTooth: false,
    requiresSurface: false,
    defaultPrice: 95.0,
  },

  // 8. Prótese Dentária
  {
    code: "85400101",
    description: "Coroa provisória em resina com ou sem pino",
    category: "Prótese",
    requiresTooth: true,
    requiresSurface: false,
    defaultPrice: 160.0,
  },
  {
    code: "85400152",
    description: "Coroa total metalocerâmica / cerâmica pura",
    category: "Prótese",
    requiresTooth: true,
    requiresSurface: false,
    defaultPrice: 950.0,
  },

  // 9. Ortodontia
  {
    code: "85300019",
    description: "Manutenção de aparelho ortodôntico / sessão",
    category: "Ortodontia",
    requiresTooth: false,
    requiresSurface: false,
    defaultPrice: 150.0,
  },
];

export interface TissGlosaReason {
  code: string;
  description: string;
  category: "Elegibilidade" | "Documentação" | "Técnica Clínica" | "Faturamento";
}

export const TISS_GLOSA_REASONS: TissGlosaReason[] = [
  {
    code: "1001",
    description: "Número da carteira do beneficiário inválido ou inexistente",
    category: "Elegibilidade",
  },
  {
    code: "1009",
    description: "Beneficiário com carência não cumprida na data do atendimento",
    category: "Elegibilidade",
  },
  {
    code: "1203",
    description: "Procedimento exige envio de radiografia inicial ou final comprobatória",
    category: "Documentação",
  },
  {
    code: "1302",
    description: "Procedimento já faturado ou repetido em intervalo não permitido",
    category: "Faturamento",
  },
  {
    code: "1406",
    description: "Dente ou face informada incompatível com o procedimento TUSS",
    category: "Técnica Clínica",
  },
  {
    code: "1701",
    description: "Valor unitário cobrado em desacordo com a tabela contratada da operadora",
    category: "Faturamento",
  },
  {
    code: "1805",
    description: "Senha ou autorização prévia expirada ou inválida",
    category: "Elegibilidade",
  },
  {
    code: "2001",
    description: "Guia física ou digital sem assinatura do beneficiário ou responsável legal",
    category: "Documentação",
  },
  {
    code: "9999",
    description: "Outra justificativa de glosa / Reanálise técnica",
    category: "Faturamento",
  },
];
