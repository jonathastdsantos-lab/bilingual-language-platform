import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Eraser,
  FileSignature,
  FileText,
  Lock,
  PenTool,
  ShieldCheck,
  Smartphone,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeDocumentSha256,
  fetchPublicSignatureRequest,
  submitPublicSignature,
} from "@/modules/signatures";
import type { SignerRole } from "@/types";
import { formatCPF } from "@/utils/validators";

export const Route = createFileRoute("/assinar/$token")({
  head: () => ({
    meta: [
      { title: "Assinatura Digital de Documento — SondaPro" },
      { name: "description", content: "Assine seu termo odontológico com validade jurídica pelo celular." },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
    ],
  }),
  component: PublicDocumentSigningPage,
});

function PublicDocumentSigningPage() {
  const { token } = Route.useParams();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [signerRole, setSignerRole] = useState<SignerRole>("patient");
  const [signerName, setSignerName] = useState("");
  const [signerCpf, setSignerCpf] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [generatedHash, setGeneratedHash] = useState("");

  const { data: info, isLoading, refetch } = useQuery({
    queryKey: ["publicSignatureRequest", token],
    queryFn: () => fetchPublicSignatureRequest(token),
  });

  // Preenche dados quando os detalhes do paciente chegam
  useEffect(() => {
    if (info?.valid) {
      if (info.patient_name && !signerName) {
        setSignerName(info.patient_name);
      }
      if (info.patient_cpf && !signerCpf) {
        setSignerCpf(formatCPF(info.patient_cpf));
      }
    }
  }, [info, signerName, signerCpf]);

  // Configura resolução e escala do Canvas para telas Retina de celulares
  useEffect(() => {
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
  }, [info]);

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
        throw new Error("Por favor, faça sua assinatura na tela com o dedo antes de prosseguir.");
      }

      if (!signerName.trim()) {
        throw new Error("Informe o seu nome completo.");
      }

      const cleanCpf = signerCpf.replace(/\D/g, "");
      if (cleanCpf.length !== 11) {
        throw new Error("Informe um CPF válido com 11 dígitos.");
      }

      if (!consentAccepted) {
        throw new Error("É necessário marcar o aceite das condições e da declaração legal.");
      }

      const signatureDataUrl = canvas.toDataURL("image/png");
      const content = info?.document_content || "";

      const hash = await computeDocumentSha256(content, {
        signer_name: signerName.trim(),
        signer_cpf: cleanCpf,
        signer_role: signerRole,
        document_title: info?.document_title,
      });

      const res = await submitPublicSignature({
        token,
        signerName: signerName.trim(),
        signerCpf: cleanCpf,
        signerRole,
        signatureDataUrl,
        documentHash: hash,
        userAgent: navigator.userAgent,
      });

      if (!res.success) {
        throw new Error(res.error || "Erro ao processar assinatura.");
      }

      setGeneratedHash(hash);
      return res;
    },
    onSuccess: () => {
      setIsSuccess(true);
      toast.success("Documento assinado e selado com sucesso!");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
          <Clock className="mx-auto mb-2 h-8 w-8 animate-spin text-teal" />
          <p className="text-sm font-semibold text-slate-700">Carregando documento para assinatura...</p>
        </div>
      </div>
    );
  }

  if (!info || !info.valid) {
    const isAlreadySigned = info?.already_signed;
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full rounded-2xl border bg-white p-8 text-center shadow-card space-y-4">
          {isAlreadySigned ? (
            <>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal/10 text-teal">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="text-xl font-extrabold text-navy">Documento Já Assinado</h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Este termo já foi assinado e selado criptograficamente com sucesso. Uma via autêntica está devidamente arquivada no seu prontuário odontológico.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <XCircle className="h-8 w-8" />
              </div>
              <h1 className="text-xl font-extrabold text-navy">Link Expirado ou Inválido</h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {info?.error || "Esta solicitação de assinatura expirou ou não foi encontrada. Por favor, entre em contato com a clínica para um novo envio."}
              </p>
            </>
          )}

          {info?.clinic_phone && (
            <div className="border-t pt-3 text-xs text-muted-foreground">
              Dúvidas? Entre em contato com a clínica pelo telefone <b>{info.clinic_phone}</b>.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full rounded-2xl border bg-white p-8 text-center shadow-card space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <ShieldCheck className="h-10 w-10" />
          </div>

          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 font-bold text-xs py-1">
            Assinatura Eletrônica Certificada
          </Badge>

          <h1 className="text-xl font-extrabold text-navy">Obrigado, {signerName.split(" ")[0]}!</h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            Sua assinatura para o documento <b>{info.document_title}</b> foi processada e vinculada à sua ficha clínica na <b>{info.clinic_name}</b>.
          </p>

          <div className="rounded-xl border bg-slate-50 p-3 text-left space-y-1.5 text-xs">
            <div className="text-[11px] text-muted-foreground">Signatário:</div>
            <div className="font-bold text-navy">{signerName} (CPF {formatCPF(signerCpf)})</div>
            <div className="text-[11px] text-muted-foreground pt-1">Carimbo de Integridade (SHA-256):</div>
            <div className="font-mono text-[10px] text-teal break-all">{generatedHash}</div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Você pode fechar esta página. A clínica já recebeu sua confirmação.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-6 sm:px-6">
      <div className="mx-auto max-w-xl space-y-4">
        {/* Cabeçalho da Clínica */}
        <div className="flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10 text-teal">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-navy">{info.clinic_name}</h2>
              <p className="text-[11px] text-muted-foreground">Portal Seguro de Assinatura Eletrônica</p>
            </div>
          </div>
          <Badge variant="outline" className="text-[11px] font-bold text-teal border-teal/40">
            <Lock className="mr-1 h-3 w-3" /> Lei 14.063/20
          </Badge>
        </div>

        {/* Informações do Documento */}
        <div className="rounded-2xl border bg-white p-5 shadow-card space-y-4">
          <div className="border-b pb-3">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-[10px] uppercase font-bold text-teal">
                {info.document_type}
              </Badge>
              <span className="text-[11px] text-muted-foreground">Paciente: {info.patient_name}</span>
            </div>
            <h1 className="mt-1 text-base font-extrabold text-navy">{info.document_title}</h1>
          </div>

          {/* Texto Integral do Documento com Scroll */}
          <div className="space-y-1">
            <Label className="text-xs font-bold text-navy flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-teal" /> Leia atentamente os termos abaixo:
            </Label>
            <div className="max-h-60 overflow-y-auto rounded-xl border bg-slate-50/90 p-3.5 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap font-sans">
              {info.document_content}
            </div>
          </div>

          {/* Quem está assinando */}
          <div className="rounded-xl border bg-muted/20 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-bold text-navy flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-teal" /> Quem está assinando?
              </Label>
              <div className="flex gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setSignerRole("patient");
                    setSignerName(info.patient_name || "");
                    setSignerCpf(info.patient_cpf ? formatCPF(info.patient_cpf) : "");
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
                  Responsável / Tutor
                </button>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <div>
                <Label className="text-[11px] text-muted-foreground">Nome Completo</Label>
                <Input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Nome de quem assina"
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">CPF</Label>
                <Input
                  value={signerCpf}
                  onChange={(e) => setSignerCpf(formatCPF(e.target.value))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Quadro de Assinatura Touch */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-navy flex items-center gap-1.5">
                <PenTool className="h-3.5 w-3.5 text-teal" /> Assine no quadro abaixo com o dedo:
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

            <div className="relative rounded-2xl border-2 border-dashed border-teal/40 bg-white">
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
                  <Smartphone className="h-6 w-6 stroke-1 mb-1 text-teal/70" />
                  <span className="text-xs font-medium">Desenhe sua assinatura aqui</span>
                </div>
              )}
            </div>
          </div>

          {/* Declaração de Aceite Legal */}
          <label className="flex items-start gap-2.5 rounded-xl border bg-muted/15 p-3 cursor-pointer transition hover:bg-muted/25">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal"
            />
            <span className="text-xs leading-relaxed text-slate-700">
              Declaro que li e compreendi as informações do termo acima ({info.document_title}) e concordo plenamente com seu conteúdo,
              autorizando a aposição de minha assinatura eletrônica nos termos da Lei Federal 14.063/2020.
            </span>
          </label>

          {/* Botão de Envio */}
          <Button
            type="button"
            disabled={signMutation.isPending || !hasDrawn || !consentAccepted}
            onClick={() => signMutation.mutate()}
            className="w-full h-11 text-sm font-bold bg-teal text-white hover:bg-teal-600 shadow-md"
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            {signMutation.isPending ? "Processando e Selando..." : "Confirmar e Enviar Assinatura"}
          </Button>

          <p className="text-center text-[10px] text-muted-foreground">
            Ao assinar, seu dispositivo registrará o carimbo criptográfico SHA-256 e IP para fins probatórios.
          </p>
        </div>
      </div>
    </div>
  );
}

