/**
 * Presets e utilitários para Comparador Antes & Depois com Slider Interativo (Estética Odontológica)
 * Inspirado nas melhores ferramentas de apresentação estética (Clinicorp, Simples Dental, Smile Cloud)
 */

export interface DentalBeforeAfterCase {
  id: string;
  category: "clareamento" | "lentes" | "facetas" | "ortodontia" | "restauracao";
  title: string;
  subtitle: string;
  beforeUrl: string;
  afterUrl: string;
  description: string;
  treatmentsUsed: string[];
  durationWeeks?: number;
}

export const DENTAL_AESTHETIC_PRESETS: DentalBeforeAfterCase[] = [
  {
    id: "preset_whitening_in_office",
    category: "clareamento",
    title: "Clareamento Dental de Consultório + Caseiro",
    subtitle: "Remoção de pigmentações e salto de 5 tons na escala VITA",
    beforeUrl: "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=1200&q=80",
    afterUrl: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=1200&q=80",
    description: "Protocolo combinado: 2 sessões de consultório com Peróxido de Hidrogênio 35% seguidas de 14 noites com gel a 16% em moldeira personalizada.",
    treatmentsUsed: ["Peróxido de Hidrogênio 35%", "Barreira Gengival Fotopolimerizável", "Dessensibilizante Fluoretado"],
    durationWeeks: 3,
  },
  {
    id: "preset_porcelain_veneers",
    category: "lentes",
    title: "Lentes de Contato Dental em Porcelana (Cerâmica E-Max)",
    subtitle: "Harmonização de cor, proporção áurea e fechamento de diastemas",
    beforeUrl: "https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&w=1200&q=80",
    afterUrl: "https://images.unsplash.com/photo-1609840114035-3c981b782dfe?auto=format&fit=crop&w=1200&q=80",
    description: "Reabilitação estética superior de 15 a 25 com cerâmica feldspática ultrafina (0.3mm), devolvendo guia canina e textura natural do esmalte.",
    treatmentsUsed: ["Planejamento Digital DSD", "Mockup Guiado", "Cimentação Adesiva Dual"],
    durationWeeks: 4,
  },
  {
    id: "preset_composite_veneers",
    category: "facetas",
    title: "Facetas Diretas em Resina Composta Nanoparticulada",
    subtitle: "Transformação estética do sorriso em sessão única",
    beforeUrl: "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=1200&q=80",
    afterUrl: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=1200&q=80",
    description: "Estratificação policromática com resina de esmalte e dentina, reproduzindo mamelos, opalescência e halo incisal dos dentes 12, 11, 21 e 22.",
    treatmentsUsed: ["Resina Nanoparticulada A1/BL2", "Corantes de Esmalte", "Polimento com Disco de Feltro"],
    durationWeeks: 1,
  },
  {
    id: "preset_clear_aligners",
    category: "ortodontia",
    title: "Ortodontia Estética com Alinhadores Invisíveis",
    subtitle: "Correção de apinhamento anterior e mordida profunda",
    beforeUrl: "https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&w=1200&q=80",
    afterUrl: "https://images.unsplash.com/photo-1609840114035-3c981b782dfe?auto=format&fit=crop&w=1200&q=80",
    description: "Alinhamento e nivelamento completo com 18 estágios de alinhadores transparentes, garantindo conforto e estética durante todo o tratamento.",
    treatmentsUsed: ["Escaneamento Intraoral 3D", "Attachments Estéticos", "Contenção Vivera"],
    durationWeeks: 24,
  },
];

