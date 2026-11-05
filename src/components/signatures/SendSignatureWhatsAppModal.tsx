import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  MessageCircle,
  Phone,
  Send,
  ShieldCheck,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  buildWhatsAppSignatureInviteUrl,
  createSignatureRequest,
} from "@/modules/signatures";
import type { ElectronicSignatureDocumentType } from "@/types";

export interface SendSignatureWhatsAppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  patientId: string;
  patientName: string;
  patientPhone?: string | null | undefined;
  patientCpf?: string | null | undefined;
  clinicName: string;
  documentType: ElectronicSignatureDocumentType;
  documentTitle: string;
  documentContent: string;
  onSuccess?: (() => void) | undefined;
}

export function SendSignatureWhatsAppModal({
  open,
  onOpenChange,
  clinicId,
  patientId,
  patientName,
  patientPhone,
  patientCpf,
  clinicName,
  documentType,
  documentTitle,
  documentContent,
  onSuccess,
}: SendSignatureWhatsAppModalProps) {
  const qc = useQueryClient();

  const [phone, setPhone] = useState(patientPhone || "");
  const [expiresInHours, setExpiresInHours] = useState<number>(72);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Muta para gerar token no banco
  const createRequestMut = useMutation({
    mutationFn: async () => {
      if (!phone.replace(/\D/g, "")) {
        throw new Error("Informe o número de WhatsApp do paciente.");
      }

      const req = await createSignatureRequest(clinicId, {
        patient_id: patientId,
        document_type: documentType,
        document_title: documentTitle,
        document_content: documentContent,
        signer_name: patientName,
        signer_cpf: patientCpf || null,
        signer_phone: phone,
        expiresInHours,
      });

      return req;
    },
    onSuccess: (data) => {
      setCreatedToken(data.token);
      qc.invalidateQueries({ queryKey: ["signatureRequests", clinicId, patientId] });
      toast.success("Solicitação criada! Você já pode enviar pelo WhatsApp.");
      if (onSuccess) onSuccess();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const fullUrl = createdToken
    ? `${typeof window !== "undefined" ? window.location.origin : "https://app.sondapro.com.br"}/assinar/${createdToken}`
    : "";

  function handleCopy() {
    if (!fullUrl) return;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    toast.success("Link seguro copiado para a área de transferência!");
    setTimeout(() => setCopied(false), 2500);
  }

  function handleOpenWhatsApp() {
    if (!createdToken) return;
    const waUrl = buildWhatsAppSignatureInviteUrl({
      phone,
      patientName,
      documentTitle,
      token: createdToken,
      clinicName,
    });
    window.open(waUrl, "_blank");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader className="border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-extrabold text-navy">
                Enviar para Assinatura via WhatsApp
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                O paciente assina pelo celular com o dedo antes da consulta.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Informações do Documento */}
          <div className="rounded-xl border bg-muted/20 p-3 space-y-1">
            <div className="text-[11px] text-muted-foreground">Documento a ser assinado:</div>
            <div className="text-xs font-bold text-navy flex items-center justify-between">
              <span>{documentTitle}</span>
              <Badge variant="outline" className="text-[10px] uppercase font-bold text-teal">
                {documentType}
              </Badge>
            </div>
            <div className="text-[11px] text-slate-600">
              Paciente: <b>{patientName}</b>
            </div>
          </div>

          {!createdToken ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-bold text-navy flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-teal" /> Celular / WhatsApp do Paciente *
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(DDD) 99999-9999"
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-navy flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-teal" /> Prazo de Validade do Link
                </Label>
                <select
                  value={expiresInHours}
                  onChange={(e) => setExpiresInHours(Number(e.target.value))}
                  className="mt-1 h-9 w-full rounded-xl border border-input bg-background px-3 text-xs font-medium text-navy"
                >
                  <option value={24}>24 horas (Recomendado para consultas hoje)</option>
                  <option value={48}>48 horas</option>
                  <option value={72}>72 horas (3 dias)</option>
                  <option value={168}>7 dias</option>
                </select>
              </div>

              <Button
                type="button"
                disabled={createRequestMut.isPending}
                onClick={() => createRequestMut.mutate()}
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-xs h-9 mt-2"
              >
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {createRequestMut.isPending ? "Gerando Link Seguro..." : "Gerar Link de Assinatura"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Link de Assinatura Gerado com Sucesso!
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Envie o link para o paciente. Quando ele assinar no smartphone, o termo ficará automaticamente disponível no prontuário.
              </p>

              <div className="flex gap-2">
                <Input
                  readOnly
                  value={fullUrl}
                  className="h-8 text-xs bg-white font-mono select-all"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="h-8 shrink-0 text-xs gap-1"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiado!" : "Copiar"}
                </Button>
              </div>

              <Button
                type="button"
                onClick={handleOpenWhatsApp}
                className="w-full h-10 bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-xs shadow-sm gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                Disparar Mensagem no WhatsApp
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between border-t pt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

