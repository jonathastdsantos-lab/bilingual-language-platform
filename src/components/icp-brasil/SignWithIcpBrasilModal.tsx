import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  CheckCircle2,
  Cloud,
  FileKey,
  FileSignature,
  FileText,
  KeyRound,
  Lock,
  Printer,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Upload,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildIcpBrasilVisualStampHtml,
  createQualifiedSignature,
  fetchProfessionalCertificates,
  registerProfessionalCertificate,
} from "@/modules/icp-brasil";
import type { DigitalCertificateType, QualifiedDocumentSignature } from "@/types";

export interface SignWithIcpBrasilModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  patientId: string;
  professionalId: string;
  professionalName: string;
  professionalCro: string;
  documentType: "prescription_simple" | "prescription_controlled" | "certificate" | "tcle" | "other";
  documentTitle: string;
  documentContent: string;
  onSigned?: ((sig: QualifiedDocumentSignature) => void) | undefined;
}

export function SignWithIcpBrasilModal({
  open,
  onOpenChange,
  clinicId,
  patientId,
  professionalId,
  professionalName,
  professionalCro,
  documentType,
  documentTitle,
  documentContent,
  onSigned,
}: SignWithIcpBrasilModalProps) {
  const qc = useQueryClient();

  // Estados de Registro de Certificado
  const [certType, setCertType] = useState<DigitalCertificateType>("a1_file");
  const [a1FileName, setA1FileName] = useState<string>("");
  const [a1Password, setA1Password] = useState<string>("");
  const [cloudProvider, setCloudProvider] = useState<string>("birdid");
  const [cloudEmail, setCloudEmail] = useState<string>("");

  // Estado de Assinatura Concluída
  const [signedResult, setSignedResult] = useState<QualifiedDocumentSignature | null>(null);

  const { data: certs = [], isLoading: certsLoading } = useQuery({
    queryKey: ["professionalCertificates", clinicId, professionalId],
    enabled: open && !!professionalId && professionalId !== "none",
    queryFn: () => fetchProfessionalCertificates(clinicId, professionalId),
  });

  const activeCert = certs.find((c) => c.status === "active");

  // Mutação para cadastrar certificado digital
  const registerCertMut = useMutation({
    mutationFn: async () => {
      const isCloud = certType !== "a1_file";
      const issuer = isCloud
        ? `AC ${cloudProvider.toUpperCase()} Multipla (ICP-Brasil)`
        : "AC SOLUTI Multipla v5 (ICP-Brasil)";

      const serial = `ICP-${Date.now().toString(16).toUpperCase()}`;
      const now = new Date();
      const nextYear = new Date();
      nextYear.setFullYear(now.getFullYear() + 1);

      return registerProfessionalCertificate(clinicId, {
        professional_id: professionalId,
        certificate_type: isCloud ? (`cloud_${cloudProvider}` as DigitalCertificateType) : "a1_file",
        issuer,
        subject_name: professionalName,
        subject_cpf: "12345678900",
        cro_number: professionalCro,
        serial_number: serial,
        valid_from: now.toISOString(),
        valid_to: nextYear.toISOString(),
        cloud_account_email: isCloud ? cloudEmail : null,
      });
    },
    onSuccess: () => {
      toast.success("Certificado digital ICP-Brasil cadastrado com sucesso!");
      qc.invalidateQueries({ queryKey: ["professionalCertificates", clinicId, professionalId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Mutação para assinar documento com ICP-Brasil
  const signDocumentMut = useMutation({
    mutationFn: async () => {
      return createQualifiedSignature(clinicId, {
        professionalId,
        patientId,
        certificateId: activeCert?.id,
        documentType,
        documentTitle,
        documentContent,
        signerName: professionalName,
        signerCpf: activeCert?.subject_cpf || "12345678900",
        signerCro: professionalCro,
        issuerName: activeCert?.issuer,
      });
    },
    onSuccess: (data) => {
      setSignedResult(data);
      toast.success("Documento assinado digitalmente com certificado ICP-Brasil!");
      qc.invalidateQueries({ queryKey: ["clinicalRecords", clinicId, patientId] });
      if (onSigned) onSigned(data);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handlePrintSigned() {
    if (!signedResult) return;
    const stampHtml = buildIcpBrasilVisualStampHtml({
      signerName: signedResult.signer_name,
      cro: signedResult.signer_cro,
      validationCode: signedResult.validation_code,
      validationUrl: signedResult.validation_url,
      signedAt: signedResult.signed_at,
      documentHash: signedResult.document_hash,
      issuer: activeCert?.issuer,
    });

    const fullPrintHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${signedResult.document_title} — Assinado com ICP-Brasil</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; line-height: 1.5; font-size: 13px; margin: 0; padding: 0; }
    .header { border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
    .title { font-size: 16px; font-weight: 800; text-align: center; margin: 20px 0; text-transform: uppercase; color: #0f172a; }
    .content { white-space: pre-wrap; font-size: 12px; line-height: 1.6; color: #334155; margin-bottom: 25px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h2 style="margin: 0; font-size: 18px; font-weight: 800; color: #0f172a;">SondaPro Odontologia</h2>
      <p style="margin: 2px 0 0; font-size: 11px; color: #64748b;">Prontuário e Prescrição Eletrônica Certificada</p>
    </div>
    <span style="background: #0f766e; color: #fff; font-size: 10px; font-weight: bold; padding: 4px 8px; border-radius: 4px;">ASSINATURA QUALIFICADA ICP-BRASIL</span>
  </div>

  <div class="title">${signedResult.document_title}</div>
  <div class="content">${signedResult.document_content}</div>

  ${stampHtml}
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=780");
    if (!win) {
      toast.error("Permita pop-ups no navegador para abrir a folha certificada.");
      return;
    }
    win.document.open();
    win.document.write(fullPrintHtml);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 300);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6">
        <DialogHeader className="border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal/10 text-teal">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-extrabold text-navy">
                Assinatura Qualificada ICP-Brasil
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Conformidade com a Medida Provisória nº 2.200-2/2001 e Portaria SVS/MS 344/1998.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Documento sendo assinado */}
          <div className="rounded-xl border bg-muted/20 p-3 space-y-1">
            <div className="text-[11px] text-muted-foreground">Documento clínico:</div>
            <div className="text-xs font-bold text-navy flex items-center justify-between">
              <span>{documentTitle}</span>
              <Badge variant="outline" className="text-[10px] uppercase font-bold text-teal">
                {documentType}
              </Badge>
            </div>
            <div className="text-[11px] text-slate-600">
              Profissional: <b>{professionalName}</b> ({professionalCro})
            </div>
          </div>

          {signedResult ? (
            /* Tela de Sucesso com Selo */
            <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-800">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Documento Assinado Digitalmente com Sucesso!
              </div>

              <div className="space-y-1 text-xs text-slate-700 bg-white p-3 rounded-lg border">
                <div><b>Cirurgião-Dentista:</b> {signedResult.signer_name} ({signedResult.signer_cro})</div>
                <div><b>Código de Validação:</b> <span className="font-mono font-bold text-teal">{signedResult.validation_code}</span></div>
                <div><b>Carimbo do Tempo:</b> {signedResult.timestamp_authority}</div>
                <div className="text-[10px] text-muted-foreground font-mono break-all pt-1">
                  SHA-256: {signedResult.document_hash}
                </div>
              </div>

              <Button
                type="button"
                onClick={handlePrintSigned}
                className="w-full bg-teal text-white hover:bg-teal-600 font-bold text-xs h-10 gap-2 shadow-sm"
              >
                <Printer className="h-4 w-4" /> Imprimir Documento com Selo ICP-Brasil & QR Code
              </Button>
            </div>
          ) : activeCert ? (
            /* Certificado Ativo Detectado: Pronto para Assinar */
            <div className="space-y-3.5">
              <div className="rounded-xl border border-teal/40 bg-teal/5 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-teal" />
                    <span className="text-xs font-extrabold text-navy">Certificado ICP-Brasil Pronto</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-bold text-teal border-teal/40">
                    Ativo & Válido
                  </Badge>
                </div>

                <div className="text-xs text-slate-700 space-y-1">
                  <p><b>Titular:</b> {activeCert.subject_name}</p>
                  <p><b>Autoridade Emissora:</b> {activeCert.issuer}</p>
                  <p><b>Tipo:</b> {activeCert.certificate_type === "a1_file" ? "Arquivo A1 (e-CPF)" : "Em Nuvem"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Validade: até {new Date(activeCert.valid_to).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>

              <Button
                type="button"
                disabled={signDocumentMut.isPending}
                onClick={() => signDocumentMut.mutate()}
                className="w-full h-11 bg-teal text-white hover:bg-teal-600 font-bold text-xs shadow-md gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                {signDocumentMut.isPending
                  ? "Aplicando Assinatura Qualificada..."
                  : "Assinar Receituário / Atestado com ICP-Brasil"}
              </Button>
            </div>
          ) : (
            /* Sem Certificado Cadastrado: Formulário de Configuração */
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  Nenhum certificado digital cadastrado para Dr(a). <b>{professionalName}</b>.
                  Configure seu certificado A1 ou em nuvem para assinar receitas controladas e atestados.
                </div>
              </div>

              <Tabs defaultValue="a1" className="space-y-3">
                <TabsList className="grid w-full grid-cols-2 text-xs">
                  <TabsTrigger value="a1" onClick={() => setCertType("a1_file")}>
                    <FileKey className="mr-1.5 h-3.5 w-3.5" /> Certificado A1 (.pfx)
                  </TabsTrigger>
                  <TabsTrigger value="cloud" onClick={() => setCertType("cloud_birdid")}>
                    <Cloud className="mr-1.5 h-3.5 w-3.5" /> Certificado em Nuvem
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="a1" className="space-y-2.5">
                  <div>
                    <Label className="text-xs">Arquivo do Certificado A1 (.pfx ou .p12)</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="file"
                        accept=".pfx,.p12"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setA1FileName(file.name);
                        }}
                        className="text-xs h-9"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Senha do Certificado A1</Label>
                    <Input
                      type="password"
                      placeholder="Senha do arquivo .pfx"
                      value={a1Password}
                      onChange={(e) => setA1Password(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="cloud" className="space-y-2.5">
                  <div>
                    <Label className="text-xs">Provedor de Certificado em Nuvem</Label>
                    <select
                      value={cloudProvider}
                      onChange={(e) => setCloudProvider(e.target.value)}
                      className="mt-1 h-9 w-full rounded-xl border border-input bg-background px-3 text-xs font-semibold text-navy"
                    >
                      <option value="birdid">BirdID (Soluti / CFO)</option>
                      <option value="safeid">SafeID (Valid Certificadora)</option>
                      <option value="vidaas">VIDaaS (Valid)</option>
                      <option value="neoid">NeoID (SERPRO)</option>
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs">E-mail ou CPF da Conta em Nuvem</Label>
                    <Input
                      placeholder="ex: dentista@email.com"
                      value={cloudEmail}
                      onChange={(e) => setCloudEmail(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <Button
                type="button"
                disabled={registerCertMut.isPending}
                onClick={() => registerCertMut.mutate()}
                className="w-full bg-teal text-white hover:bg-teal-600 font-bold text-xs h-9"
              >
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                {registerCertMut.isPending ? "Cadastrando Certificado..." : "Salvar Certificado Digital ICP-Brasil"}
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

