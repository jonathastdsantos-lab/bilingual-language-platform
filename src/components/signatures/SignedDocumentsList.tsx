import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FileCheck,
  FileSignature,
  FileText,
  Lock,
  Printer,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchPatientSignatures,
  revokeElectronicSignature,
  buildSignedDocumentPrintableHtml,
} from "@/modules/signatures";
import type { PatientElectronicSignature } from "@/types";
import { formatCPF } from "@/utils/validators";

export interface SignedDocumentsListProps {
  clinicId: string;
  patientId: string;
  clinicName: string;
  unitName?: string | null | undefined;
  unitAddress?: string | null | undefined;
  unitPhone?: string | null | undefined;
  onNewSignature?: (() => void) | undefined;
}

export function SignedDocumentsList({
  clinicId,
  patientId,
  clinicName,
  unitName,
  unitAddress,
  unitPhone,
  onNewSignature,
}: SignedDocumentsListProps) {
  const qc = useQueryClient();
  const [selectedSignature, setSelectedSignature] = useState<PatientElectronicSignature | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [targetToRevoke, setTargetToRevoke] = useState<PatientElectronicSignature | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const { data: signatures = [], isLoading } = useQuery({
    queryKey: ["patientSignatures", clinicId, patientId],
    queryFn: () => fetchPatientSignatures(clinicId, patientId),
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      if (!targetToRevoke || !revokeReason.trim()) {
        throw new Error("Informe a justificativa da revogação do termo.");
      }
      await revokeElectronicSignature(clinicId, targetToRevoke.id, revokeReason.trim());
    },
    onSuccess: () => {
      toast.success("Assinatura eletrônica revogada com sucesso.");
      qc.invalidateQueries({ queryKey: ["patientSignatures", clinicId, patientId] });
      setRevokeOpen(false);
      setTargetToRevoke(null);
      setRevokeReason("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handlePrint(sig: PatientElectronicSignature) {
    try {
      const html = buildSignedDocumentPrintableHtml({
        signature: sig,
        clinicName,
        unitName,
        unitAddress,
        unitPhone,
      });

      const win = window.open("", "_blank", "width=900,height=780");
      if (!win) {
        toast.error("Permita pop-ups no navegador para abrir o documento impresso.");
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        win.print();
      }, 300);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div>
          <h3 className="text-sm font-extrabold text-navy flex items-center gap-1.5">
            <FileSignature className="h-4 w-4 text-teal" /> Termos & Contratos com Assinatura Eletrônica
          </h3>
          <p className="text-xs text-muted-foreground">
            Documentos assinados na tela pelo paciente ou tutor com carimbo criptográfico SHA-256.
          </p>
        </div>
        {onNewSignature && (
          <Button
            type="button"
            size="sm"
            onClick={onNewSignature}
            className="h-8 text-xs bg-teal text-white hover:bg-teal-600"
          >
            <FileSignature className="mr-1.5 h-3.5 w-3.5" /> Nova Assinatura Touch
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-xs text-muted-foreground">Carregando termos assinados...</div>
      ) : signatures.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
          Nenhum termo ou contrato foi assinado eletronicamente para este paciente ainda.
        </div>
      ) : (
        <div className="grid gap-3">
          {signatures.map((sig) => {
            const isRevoked = sig.status === "revoked";
            const roleLabel =
              sig.signer_role === "patient"
                ? "Paciente"
                : sig.signer_role === "legal_guardian"
                ? "Responsável Legal"
                : "Representante";

            return (
              <div
                key={sig.id}
                className={`rounded-2xl border p-4 transition ${
                  isRevoked ? "bg-red-50/30 border-red-200" : "bg-muted/20 hover:border-teal"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-navy">{sig.document_title}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold ${
                          isRevoked ? "border-red-300 text-red-600" : "border-teal/40 text-teal"
                        }`}
                      >
                        {isRevoked ? "Revogado" : "Assinado & Válido"}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {sig.document_type}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600">
                      Signatário: <b>{sig.signer_name}</b> (CPF {formatCPF(sig.signer_cpf)} · {roleLabel})
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Assinado em: {new Date(sig.signed_at).toLocaleString("pt-BR")}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handlePrint(sig)}
                      className="h-8 text-xs"
                    >
                      <Printer className="mr-1.5 h-3.5 w-3.5" /> Visualizar / Imprimir
                    </Button>
                    {!isRevoked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setTargetToRevoke(sig);
                          setRevokeOpen(true);
                        }}
                        className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      >
                        <Ban className="mr-1 h-3.5 w-3.5" /> Revogar
                      </Button>
                    )}
                  </div>
                </div>

                {/* Selo Criptográfico SHA-256 e Miniatura de Assinatura */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-[11px]">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="font-mono text-muted-foreground truncate max-w-md">
                      SHA-256: {sig.document_hash}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[10px]">Assinatura:</span>
                    <img
                      src={sig.signature_data_url}
                      alt="Assinatura"
                      className="h-7 max-w-[120px] object-contain rounded border bg-white px-1"
                    />
                  </div>
                </div>

                {isRevoked && sig.revocation_reason && (
                  <div className="mt-2 text-xs text-red-600 bg-red-100/50 p-2 rounded-lg">
                    <b>Motivo da revogação:</b> {sig.revocation_reason} (em{" "}
                    {sig.revoked_at ? new Date(sig.revoked_at).toLocaleString("pt-BR") : ""})
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Confirmação de Revogação */}
      {targetToRevoke && (
        <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-extrabold text-navy flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-600" /> Revogar Assinatura de Termo
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <p className="text-muted-foreground">
                Você está prestes a revogar a validade jurídica do documento <b>{targetToRevoke.document_title}</b> assinado por{" "}
                <b>{targetToRevoke.signer_name}</b>. O registro permanecerá no histórico como revogado para fins de auditoria.
              </p>

              <div>
                <Label className="text-xs font-bold text-navy">Justificativa da Revogação *</Label>
                <Input
                  placeholder="Ex: Paciente desistiu do procedimento / erro na digitação do contrato..."
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="flex justify-between border-t pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setRevokeOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={revokeMutation.isPending || !revokeReason.trim()}
                onClick={() => revokeMutation.mutate()}
              >
                {revokeMutation.isPending ? "Revogando..." : "Confirmar Revogação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

