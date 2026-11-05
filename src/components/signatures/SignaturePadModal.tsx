import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Eraser,
  FileSignature,
  FileText,
  Lock,
  PenTool,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createElectronicSignature } from "@/modules/signatures";
import type { ElectronicSignatureDocumentType, PatientElectronicSignature, SignerRole } from "@/types";
import { formatCPF } from "@/utils/validators";

export interface SignaturePadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  patientId: string;
  patientName: string;
  patientCpf?: string | null;
  documentType: ElectronicSignatureDocumentType;
  documentTitle: string;
  documentContent: string;
  onSuccess?: (sig?: PatientElectronicSignature) => void;
}

export function SignaturePadModal({
  open,
  onOpenChange,
  clinicId,
  patientId,
  patientName,
  patientCpf,
  documentType,
  documentTitle,
  documentContent,
  onSuccess,
}: SignaturePadModalProps) {
  const qc = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [signerRole, setSignerRole] = useState<SignerRole>("patient");
  const [signerName, setSignerName] = useState(patientName);
  const [signerCpf, setSignerCpf] = useState(patientCpf ? formatCPF(patientCpf) : "");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  // Redefine campos quando abre o modal ou muda o paciente
  useEffect(() => {
    if (open) {
      setSignerRole("patient");
      setSignerName(patientName);
      setSignerCpf(patientCpf ? formatCPF(patientCpf) : "");
      setConsentAccepted(false);
      setHasDrawn(false);
      clearCanvas();
    }
  }, [open, patientName, patientCpf]);

  // Configura resolução retina no canvas
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
  }, [open]);

  function getCanvasCoordinates(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    setHasDrawn(true);

    const { x, y } = getCanvasCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // no-op
      }
    }
    setIsDrawing(false);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  const signMutation = useMutation({
    mutationFn: async () => {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) {
        throw new Error("Por favor, aponha a assinatura no quadro antes de confirmar.");
      }

      if (!signerName.trim()) {
        throw new Error("Informe o nome completo do signatário.");
      }

      const cleanCpf = signerCpf.replace(/\D/g, "");
      if (cleanCpf.length !== 11) {
        throw new Error("Informe um CPF válido com 11 dígitos.");
      }

      if (!consentAccepted) {
        throw new Error("É necessário marcar o aceite das condições e da declaração legal.");
      }

      const signatureDataUrl = canvas.toDataURL("image/png");

      return createElectronicSignature(clinicId, {
        patient_id: patientId,
        document_type: documentType,
        document_title: documentTitle,
        document_content: documentContent,
        signer_name: signerName.trim(),
        signer_cpf: cleanCpf,
        signer_role: signerRole,
        signature_data_url: signatureDataUrl,
      });
    },
    onSuccess: (data) => {
      toast.success("Termo assinado e selado com hash criptográfico com sucesso!");
      qc.invalidateQueries({ queryKey: ["patientSignatures", clinicId, patientId] });
      onOpenChange(false);
      if (onSuccess) onSuccess(data);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-5 sm:p-6">
        <DialogHeader className="border-b pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal/10 text-teal">
                <FileSignature className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-extrabold text-navy">
                  Coleta de Assinatura Eletrônica Touch
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Validade probatória garantida nos termos da Lei Federal nº 14.063/2020.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs font-bold text-teal border-teal/40">
              <Lock className="mr-1 h-3 w-3" /> Criptografia SHA-256
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Identificação do Signatário */}
          <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-navy flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-teal" /> Quem está assinando?
              </Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSignerRole("patient");
                    setSignerName(patientName);
                    setSignerCpf(patientCpf ? formatCPF(patientCpf) : "");
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    signerRole === "patient"
                      ? "bg-teal text-white shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Próprio Paciente
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSignerRole("legal_guardian");
                    setSignerName("");
                    setSignerCpf("");
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    signerRole === "legal_guardian"
                      ? "bg-teal text-white shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Responsável Legal / Tutor
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-[11px] text-muted-foreground">Nome Completo do Signatário</Label>
                <Input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Nome de quem assina"
                  className="h-8 text-xs font-medium"
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">CPF do Signatário</Label>
                <Input
                  value={signerCpf}
                  onChange={(e) => setSignerCpf(formatCPF(e.target.value))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="h-8 text-xs font-medium"
                />
              </div>
            </div>
          </div>

          {/* Visualização Resumida do Documento */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-navy flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-teal" /> Texto do Termo a ser Assinado ({documentTitle})
            </Label>
            <div className="max-h-36 overflow-y-auto rounded-xl border bg-slate-50/80 p-3 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap font-sans">
              {documentContent}
            </div>
          </div>

          {/* Área de Toque / Assinatura (Canvas) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-navy flex items-center gap-1.5">
                <PenTool className="h-3.5 w-3.5 text-teal" /> Assinatura na Tela (Touch / Caneta / Mouse)
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearCanvas}
                className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              >
                <Eraser className="mr-1 h-3.5 w-3.5" /> Limpar
              </Button>
            </div>

            <div className="relative rounded-2xl border-2 border-dashed border-slate-300 bg-white transition hover:border-teal">
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className="h-44 w-full cursor-crosshair touch-none rounded-2xl"
              />
              {!hasDrawn && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/60">
                  <PenTool className="h-6 w-6 stroke-1 mb-1" />
                  <span className="text-xs font-medium">Assine aqui com o dedo, caneta stylus ou mouse</span>
                </div>
              )}
            </div>
          </div>

          {/* Declaração de Aceite Legal */}
          <label className="flex items-start gap-2.5 rounded-xl border bg-muted/10 p-3 cursor-pointer transition hover:bg-muted/20">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal"
            />
            <span className="text-xs leading-relaxed text-slate-700">
              Declaro que li e compreendi integralmente o teor deste termo ({documentTitle}) e concordo com suas cláusulas,
              reconhecendo a validade jurídica da presente assinatura eletrônica (Lei Federal 14.063/2020).
            </span>
          </label>
        </div>

        <DialogFooter className="flex items-center justify-between border-t pt-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={signMutation.isPending || !hasDrawn || !consentAccepted}
            onClick={() => signMutation.mutate()}
            className="bg-teal text-white hover:bg-teal-600"
          >
            <ShieldCheck className="mr-1.5 h-4 w-4" />
            {signMutation.isPending ? "Selando Criptografia..." : "Confirmar e Selar Termo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

