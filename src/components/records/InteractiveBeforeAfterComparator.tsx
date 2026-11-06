import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronsLeftRight,
  Maximize2,
  Minimize2,
  Columns,
  SplitSquareVertical,
  Sparkles,
  Upload,
  Eye,
  CheckCircle2,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DENTAL_AESTHETIC_PRESETS,
  type DentalBeforeAfterCase,
} from "@/modules/records/before-after-presets";
import { toast } from "sonner";

interface InteractiveBeforeAfterComparatorProps {
  beforeUrl?: string | undefined;
  afterUrl?: string | undefined;
  beforeTitle?: string | undefined;
  afterTitle?: string | undefined;
  patientName?: string | undefined;
  canUpload?: boolean | undefined;
  onCustomUpload?: ((beforeFile: File, afterFile: File) => void) | undefined;
}

export function InteractiveBeforeAfterComparator({
  beforeUrl: initialBeforeUrl,
  afterUrl: initialAfterUrl,
  beforeTitle: initialBeforeTitle = "Antes do Tratamento",
  afterTitle: initialAfterTitle = "Resultado Final (Depois)",
  patientName,
}: InteractiveBeforeAfterComparatorProps) {
  const defaultPreset = DENTAL_AESTHETIC_PRESETS[0];

  // Estado das imagens ativas
  const [activeBeforeUrl, setActiveBeforeUrl] = useState<string>(
    initialBeforeUrl || (defaultPreset?.beforeUrl ?? "")
  );
  const [activeAfterUrl, setActiveAfterUrl] = useState<string>(
    initialAfterUrl || (defaultPreset?.afterUrl ?? "")
  );
  const [activeTitle, setActiveTitle] = useState<string>(
    initialBeforeTitle ? `${initialBeforeTitle} × ${initialAfterTitle}` : (defaultPreset?.title ?? "Caso Clínico")
  );
  const [activeSubtitle, setActiveSubtitle] = useState<string>(
    defaultPreset?.subtitle ?? ""
  );

  // Sincroniza se as props externas mudarem
  useEffect(() => {
    if (initialBeforeUrl) setActiveBeforeUrl(initialBeforeUrl);
    if (initialAfterUrl) setActiveAfterUrl(initialAfterUrl);
    if (initialBeforeTitle && initialAfterTitle) {
      setActiveTitle(`${initialBeforeTitle} × ${initialAfterTitle}`);
    }
  }, [initialBeforeUrl, initialAfterUrl, initialBeforeTitle, initialAfterTitle]);

  // Controle do Slider Interativo (0 a 100%)
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Modos de visualização
  const [viewMode, setViewMode] = useState<"slider" | "side_by_side">("slider");
  const [presentationOpen, setPresentationOpen] = useState<boolean>(false);
  const [customUploadOpen, setCustomUploadOpen] = useState<boolean>(false);

  // Upload temporário para teste imediato
  const [tempBeforeFile, setTempBeforeFile] = useState<string | null>(null);
  const [tempAfterFile, setTempAfterFile] = useState<string | null>(null);

  // Manipulador de arraste suave para mouse e toque no celular/tablet
  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(Math.round(percentage));
  }, []);

  const handlePointerDown = () => {
    setIsDragging(true);
  };

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (isDragging) {
        handleMove(e.clientX);
      }
    };
    const onPointerUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    }
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [isDragging, handleMove]);

  // Aplica preset odontológico estético
  const applyPreset = (preset: DentalBeforeAfterCase) => {
    setActiveBeforeUrl(preset.beforeUrl);
    setActiveAfterUrl(preset.afterUrl);
    setActiveTitle(preset.title);
    setActiveSubtitle(preset.subtitle);
    setSliderPosition(50);
    toast.success(`Caso demonstrativo carregado: ${preset.title}`);
  };

  const handleLocalImageSelect = (e: React.ChangeEvent<HTMLInputElement>, type: "before" | "after") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (type === "before") {
      setTempBeforeFile(url);
      setActiveBeforeUrl(url);
    } else {
      setTempAfterFile(url);
      setActiveAfterUrl(url);
    }
    toast.success(`Foto ${type === "before" ? "Antes" : "Depois"} selecionada!`);
  };

  // Renderizador principal da área visual do slider
  const renderSliderViewer = (isFullscreenMode = false) => {
    return (
      <div className="flex flex-col items-center w-full select-none">
        {/* Barra de Controles Rápidos */}
        <div className="flex flex-wrap items-center justify-between w-full mb-3 gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-sky-500/40 text-sky-600 bg-sky-50 dark:bg-sky-950/40 gap-1 font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              {patientName ? `Paciente: ${patientName}` : "Demonstrador Estético de Sorriso"}
            </Badge>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Arraste a linha central para comparar
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant={viewMode === "slider" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => setViewMode("slider")}
              title="Modo Slider Sobreposto"
            >
              <SplitSquareVertical className="w-3.5 h-3.5 text-sky-600" />
              <span className="hidden md:inline">Slider Interativo</span>
            </Button>

            <Button
              type="button"
              variant={viewMode === "side_by_side" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => setViewMode("side_by_side")}
              title="Modo Lado a Lado"
            >
              <Columns className="w-3.5 h-3.5 text-sky-600" />
              <span className="hidden md:inline">Lado a Lado</span>
            </Button>

            {!isFullscreenMode && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/10 font-bold"
                onClick={() => setPresentationOpen(true)}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Apresentar ao Paciente (Tela Cheia)
              </Button>
            )}
          </div>
        </div>

        {/* Visualização: Modo Slider Sobreposto */}
        {viewMode === "slider" ? (
          <div
            ref={containerRef}
            onPointerDown={(e) => {
              handleMove(e.clientX);
              handlePointerDown();
            }}
            className={`relative w-full ${
              isFullscreenMode ? "h-[70vh] max-h-[800px]" : "h-72 sm:h-96 md:h-[480px]"
            } overflow-hidden rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl cursor-ew-resize touch-none select-none`}
          >
            {/* Imagem do "Depois" (Fundo completo) */}
            <img
              src={activeAfterUrl}
              alt="Depois"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
            <div className="absolute top-4 right-4 z-10 pointer-events-none">
              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-600/90 text-white shadow-lg backdrop-blur">
                DEPOIS
              </span>
            </div>

            {/* Imagem do "Antes" (Sobreposta com largura recortada pelo slider) */}
            <div
              className="absolute inset-0 overflow-hidden pointer-events-none"
              style={{ width: `${sliderPosition}%` }}
            >
              <img
                src={activeBeforeUrl}
                alt="Antes"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{
                  width: containerRef.current ? `${containerRef.current.clientWidth}px` : "100%",
                  maxWidth: "none",
                }}
              />
              <div className="absolute top-4 left-4 z-10">
                <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/90 text-white shadow-lg backdrop-blur">
                  ANTES
                </span>
              </div>
            </div>

            {/* Linha Divisória e Alça Central Arrastável */}
            <div
              className="absolute top-0 bottom-0 z-20 pointer-events-none flex items-center justify-center"
              style={{ left: `${sliderPosition}%`, transform: "translateX(-50%)" }}
            >
              <div className="w-0.5 h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
              <div className="absolute flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-900 shadow-2xl border-2 border-sky-500 hover:scale-110 active:scale-95 transition-transform cursor-grab">
                <ChevronsLeftRight className="h-6 w-6 text-sky-600 animate-pulse" />
              </div>
            </div>

            {/* Indicador de Porcentagem Discreto */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-black/60 text-white/90 backdrop-blur border border-white/10">
                Antes {sliderPosition}% | Depois {100 - sliderPosition}%
              </span>
            </div>
          </div>
        ) : (
          /* Visualização: Modo Lado a Lado */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 h-72 sm:h-96">
              <span className="absolute top-3 left-3 z-10 px-3 py-1 rounded-full text-xs font-black bg-amber-500/90 text-white shadow-lg backdrop-blur">
                ANTES
              </span>
              <img
                src={activeBeforeUrl}
                alt="Antes"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 h-72 sm:h-96">
              <span className="absolute top-3 right-3 z-10 px-3 py-1 rounded-full text-xs font-black bg-emerald-600/90 text-white shadow-lg backdrop-blur">
                DEPOIS
              </span>
              <img
                src={activeAfterUrl}
                alt="Depois"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        )}

        {/* Controle deslizante horizontal de acessibilidade */}
        {viewMode === "slider" && (
          <div className="w-full max-w-md mt-4 flex items-center gap-3">
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">100% Antes</span>
            <input
              type="range"
              min="0"
              max="100"
              value={sliderPosition}
              onChange={(e) => setSliderPosition(Number(e.target.value))}
              className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">100% Depois</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Visualizador Principal */}
      <div className="rounded-2xl border bg-card p-5 shadow-card">
        {renderSliderViewer(false)}

        {/* Rodapé com Informações do Caso e Presets de Tratamento */}
        <div className="mt-6 pt-5 border-t space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-extrabold text-navy text-base">{activeTitle}</h4>
              <p className="text-xs text-muted-foreground">{activeSubtitle}</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setCustomUploadOpen(true)}
              >
                <Upload className="w-3.5 h-3.5" />
                Carregar Fotos do Paciente
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5 text-slate-500"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Caso Antes & Depois: ${activeTitle} - ${activeSubtitle}`
                  );
                  toast.success("Resumo do caso copiado para envio ao paciente!");
                }}
              >
                <Share2 className="w-3.5 h-3.5" />
                Copiar Resumo
              </Button>
            </div>
          </div>

          {/* Casos Demonstrativos Prontos (Presets para Apresentação em Consulta) */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Casos Clínicos Demonstrativos (Clique para Apresentar ao Paciente):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {DENTAL_AESTHETIC_PRESETS.map((preset) => {
                const isSelected = activeBeforeUrl === preset.beforeUrl && activeAfterUrl === preset.afterUrl;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-sky-500 bg-sky-50/50 dark:bg-sky-950/30 shadow-xs ring-1 ring-sky-500"
                        : "border-slate-200 dark:border-slate-800 hover:border-sky-300 hover:bg-slate-50 dark:hover:bg-slate-900"
                    }`}
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-slate-950 border border-slate-700">
                      <img src={preset.afterUrl} alt={preset.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-navy truncate">{preset.title}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">{preset.subtitle}</p>
                      <Badge variant="outline" className="mt-1 text-[9px] px-1.5 py-0 h-4 border-slate-300">
                        {preset.category.toUpperCase()}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal 1: Modo Apresentação em Tela Cheia (Foco Total no Paciente) */}
      <Dialog open={presentationOpen} onOpenChange={setPresentationOpen}>
        <DialogContent className="max-w-6xl w-[95vw] bg-slate-950 border-slate-800 text-white p-6 sm:p-8">
          <DialogHeader className="pb-4 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-black text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  {activeTitle}
                </DialogTitle>
                <p className="text-xs text-slate-400 mt-1">{activeSubtitle}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-400 hover:text-white"
                onClick={() => setPresentationOpen(false)}
              >
                <Minimize2 className="w-4 h-4 mr-1" />
                Fechar Apresentação
              </Button>
            </div>
          </DialogHeader>

          <div className="py-4">
            {renderSliderViewer(true)}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs text-slate-400">
            <span>SondaPro Dental · Modo Apresentação Estética</span>
            <span>Arraste com o dedo ou mouse para revelar a transformação do sorriso</span>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Carregamento Rápido de Fotos do Paciente */}
      <Dialog open={customUploadOpen} onOpenChange={setCustomUploadOpen}>
        <DialogContent className="max-w-lg bg-card text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-navy flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" />
              Carregar Fotos de Antes e Depois do Paciente
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Selecione as fotos tiradas na consulta (pelo celular ou computador) para comparar no slider imediatamente:
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="border border-dashed rounded-xl p-4 text-center space-y-2">
                <span className="text-xs font-bold text-amber-700 block">Foto ANTES</span>
                {tempBeforeFile ? (
                  <img src={tempBeforeFile} alt="Antes" className="w-full h-24 object-cover rounded-lg" />
                ) : (
                  <div className="h-24 flex items-center justify-center bg-muted/40 rounded-lg text-xs text-muted-foreground">
                    Nenhuma foto
                  </div>
                )}
                <label className="cursor-pointer inline-flex items-center justify-center text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 px-3 py-1.5 rounded-lg w-full">
                  Escolher Antes
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleLocalImageSelect(e, "before")}
                  />
                </label>
              </div>

              <div className="border border-dashed rounded-xl p-4 text-center space-y-2">
                <span className="text-xs font-bold text-emerald-700 block">Foto DEPOIS</span>
                {tempAfterFile ? (
                  <img src={tempAfterFile} alt="Depois" className="w-full h-24 object-cover rounded-lg" />
                ) : (
                  <div className="h-24 flex items-center justify-center bg-muted/40 rounded-lg text-xs text-muted-foreground">
                    Nenhuma foto
                  </div>
                )}
                <label className="cursor-pointer inline-flex items-center justify-center text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 px-3 py-1.5 rounded-lg w-full">
                  Escolher Depois
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleLocalImageSelect(e, "after")}
                  />
                </label>
              </div>
            </div>

            <Button
              className="w-full font-bold"
              disabled={!tempBeforeFile && !tempAfterFile}
              onClick={() => {
                setCustomUploadOpen(false);
                toast.success("Fotos carregadas no comparador interativo com sucesso!");
              }}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Aplicar Fotos no Comparador
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
