import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  FileText,
  Lock,
  Pill,
  Printer,
  QrCode,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchPublicQualifiedValidation } from "@/modules/icp-brasil";
import { formatCPF } from "@/utils/validators";

export const Route = createFileRoute("/validar/$code")({
  head: () => ({
    meta: [
      { title: "Validador Oficial de Assinatura Digital ICP-Brasil — SondaPro" },
      { name: "description", content: "Validação pública de receitas e atestados odontológicos assinados digitalmente com certificado ICP-Brasil." },
    ],
  }),
  component: PublicQualifiedValidationPage,
});

function PublicQualifiedValidationPage() {
  const { code } = Route.useParams();

  const { data: val, isLoading } = useQuery({
    queryKey: ["publicQualifiedValidation", code],
    queryFn: () => fetchPublicQualifiedValidation(code),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
          <Clock className="mx-auto mb-2 h-8 w-8 animate-spin text-teal" />
          <p className="text-sm font-semibold text-slate-700">Validando certificado digital e assinatura ICP-Brasil...</p>
        </div>
      </div>
    );
  }

  if (!val || !val.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full rounded-2xl border bg-white p-8 text-center shadow-card space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <XCircle className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-extrabold text-navy">Documento Não Encontrado</h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            O código de verificação <b>{code}</b> não foi localizado ou não corresponde a um documento autêntico emitido pela plataforma.
          </p>
          <div className="border-t pt-3 text-xs text-muted-foreground">
            Verifique os dígitos no rodapé da receita ou atestado e tente novamente.
          </div>
        </div>
      </div>
    );
  }

  const formattedDate = val.signed_at
    ? new Date(val.signed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "";

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Banner de Validação com Sucesso */}
        <div className="rounded-2xl border-2 border-emerald-500 bg-white p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-700 text-white font-extrabold text-[10px] px-2 py-0.5 rounded tracking-wide uppercase">
                    ICP-Brasil
                  </span>
                  <span className="text-xs font-bold text-emerald-700">DOCUMENTO AUTÊNTICO & ÍNTEGRO</span>
                </div>
                <h1 className="text-lg font-extrabold text-navy mt-1">Assinatura Digital Qualificada Válida</h1>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground font-semibold">CÓDIGO DE CONTROLE</span>
              <div className="font-mono text-sm font-extrabold text-teal">{val.validation_code}</div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 pt-4 text-xs">
            {/* Cirurgião-Dentista */}
            <div className="space-y-1 rounded-xl border bg-slate-50/60 p-3">
              <span className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3 text-teal" /> Cirurgião-Dentista Titular
              </span>
              <div className="font-extrabold text-navy text-sm">{val.signer_name}</div>
              <div className="text-slate-600 font-semibold">{val.signer_cro}</div>
              <div className="text-muted-foreground text-[11px]">
                CPF: {val.signer_cpf ? formatCPF(val.signer_cpf) : "Confidencial"}
              </div>
            </div>

            {/* Clínica & Paciente */}
            <div className="space-y-1 rounded-xl border bg-slate-50/60 p-3">
              <span className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3 text-teal" /> Local & Paciente
              </span>
              <div className="font-extrabold text-navy text-sm">{val.clinic_name}</div>
              <div className="text-slate-600">Paciente: <b>{val.patient_name}</b></div>
              <div className="text-muted-foreground text-[11px]">
                Data da Assinatura: <b>{formattedDate}</b>
              </div>
            </div>
          </div>

          {/* Dados Legais e Farmacêuticos */}
          <div className="mt-4 rounded-xl border border-teal/20 bg-teal/5 p-3.5 text-xs text-slate-700 space-y-1.5 leading-relaxed">
            <div className="font-bold text-teal flex items-center gap-1.5">
              <Pill className="h-4 w-4" /> Informações para Dispensação em Farmácia & Órgãos de Controle
            </div>
            <p className="text-[11px]">
              Este documento foi emitido e assinado digitalmente com certificado digital ICP-Brasil, possuindo validade jurídica e presunção de veracidade em todo o território nacional, conforme o <b>Art. 10, § 1º da Medida Provisória nº 2.200-2/2001</b>, a <b>Lei Federal nº 14.063/2020</b> e a <b>Portaria SVS/MS nº 344/1998</b>.
            </p>
            <div className="text-[10px] font-mono text-muted-foreground pt-1 break-all">
              Hash Criptográfico SHA-256: {val.document_hash}
            </div>
          </div>
        </div>

        {/* Conteúdo Original do Documento Prescrito/Atestado */}
        <div className="rounded-2xl border bg-white p-5 shadow-card sm:p-6 space-y-3">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-teal" />
              <h2 className="text-base font-extrabold text-navy">{val.document_title}</h2>
            </div>
            <Badge variant="outline" className="text-xs uppercase font-bold text-teal">
              {val.document_type}
            </Badge>
          </div>

          <div className="rounded-xl border bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">
            {val.document_content}
          </div>

          <div className="text-center pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5 text-xs"
            >
              <Printer className="h-3.5 w-3.5" /> Imprimir Comprovante de Validação
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

