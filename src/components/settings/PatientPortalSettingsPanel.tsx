import { useState } from "react";
import { toast } from "sonner";
import {
  Smartphone,
  Copy,
  ExternalLink,
  CheckCircle2,
  QrCode,
  Share2,
  Printer,
  ShieldCheck,
  Sparkles,
  Save,
  MessageCircle,
  Clock,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  getPatientPortalSettings,
  savePatientPortalSettings,
  type PatientPortalSettings,
} from "@/modules/patient-portal";

interface PatientPortalSettingsPanelProps {
  clinicId: string;
  clinicName: string;
  canManage: boolean;
}

export function PatientPortalSettingsPanel({
  clinicId,
  clinicName,
  canManage,
}: PatientPortalSettingsPanelProps) {
  const [settings, setSettings] = useState<PatientPortalSettings>(() =>
    getPatientPortalSettings(clinicId)
  );
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);

  const portalUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/portal`
      : "https://app.sondapro.com.br/portal";

  const handleCopyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(portalUrl);
      setCopiedLink(true);
      toast.success("Link do App do Paciente copiado!");
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const whatsappInviteMessage = `Olá! Para seu maior conforto e agilidade, a *${clinicName}* disponibiliza um aplicativo exclusivo para você acompanhar suas consultas, receitas digitais, alinhadores e faturas.\n\nAcesse agora pelo seu celular e adicione à sua tela inicial:\n👉 ${portalUrl}\n\nQualquer dúvida, estamos à disposição! ✨`;

  const handleCopyWhatsappInvite = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(whatsappInviteMessage);
      setCopiedWhatsapp(true);
      toast.success("Mensagem de convite para WhatsApp copiada!");
      setTimeout(() => setCopiedWhatsapp(false), 2000);
    }
  };

  const handlePrintCounterDisplay = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Permita pop-ups no navegador para imprimir o display.");
      return;
    }

    const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
      portalUrl
    )}`;

    printWindow.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Display Balcão — App do Paciente — ${clinicName}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; text-align: center; margin: 40px; color: #0f172a; }
    .card { max-width: 440px; margin: 0 auto; border: 3px solid #0d9488; border-radius: 24px; padding: 36px 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); }
    .badge { display: inline-block; background: #e6fffa; color: #0d9488; font-weight: 800; font-size: 12px; padding: 6px 14px; border-radius: 999px; text-transform: uppercase; margin-bottom: 16px; }
    h1 { font-size: 24px; font-weight: 800; margin: 0 0 8px 0; color: #0f172a; }
    p { font-size: 13px; color: #475569; margin: 0 0 24px 0; line-height: 1.4; }
    .qr-box { padding: 16px; background: #f8fafc; border-radius: 16px; display: inline-block; margin-bottom: 20px; border: 1px solid #cbd5e1; }
    .steps { text-align: left; background: #f1f5f9; padding: 16px 20px; border-radius: 14px; font-size: 12px; color: #334155; margin-top: 16px; }
    .steps ol { margin: 0; padding-left: 18px; }
    .steps li { margin-bottom: 6px; }
    .footer { font-size: 11px; color: #94a3b8; margin-top: 24px; font-weight: 600; }
    @media print { body { margin: 0; } .card { border: 2px solid #000; box-shadow: none; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Aplicativo do Paciente</div>
    <h1>${clinicName}</h1>
    <p>Aponte a câmera do seu celular para fazer seu check-in, ver suas receitas e acompanhar seus alinhadores!</p>
    <div class="qr-box">
      <img src="${qrImgUrl}" width="220" height="220" alt="QR Code App do Paciente" />
    </div>
    <div class="steps">
      <ol>
        <li>Abra a <strong>Câmera</strong> do seu smartphone.</li>
        <li>Aponte para o QR Code acima.</li>
        <li>Digite seu <strong>CPF</strong> para acessar sua área de saúde.</li>
      </ol>
    </div>
    <div class="footer">SondaPro Dental • Saúde Digital Integrada</div>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`);
    printWindow.document.close();
  };

  const handleSave = () => {
    savePatientPortalSettings(clinicId, settings);
    toast.success("Configurações do App do Paciente salvas com sucesso!");
  };

  return (
    <div className="space-y-6">
      {/* BANNER PRINCIPAL */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border-2 border-teal/20 bg-gradient-to-r from-teal/10 via-white to-slate-50 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal text-white shadow-md">
            <Smartphone className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-navy">
                Portal / App Web do Paciente (PWA)
              </h3>
              <Badge
                className={
                  settings.switches.enablePatientPortal
                    ? "bg-teal text-white font-bold"
                    : "bg-slate-200 text-slate-700 font-bold"
                }
              >
                {settings.switches.enablePatientPortal ? "Ativo" : "Desativado"}
              </Badge>
              <Badge variant="outline" className="border-teal/30 text-teal text-[10px] font-mono">
                PWA Instalável
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Seu aplicativo na tela inicial do paciente com check-in presencial, acompanhamento de alinhadores, receitas digitais e faturas Pix.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={settings.switches.enablePatientPortal}
            disabled={!canManage}
            onCheckedChange={(checked) =>
              setSettings((s) => ({
                ...s,
                switches: { ...s.switches, enablePatientPortal: checked },
              }))
            }
          />
          <Label className="text-xs font-bold text-slate-700">
            {settings.switches.enablePatientPortal ? "App Habilitado" : "App Pausado"}
          </Label>
        </div>
      </div>

      {/* CARD DO LINK PÚBLICO E COMPARTILHAMENTO */}
      <div className="rounded-3xl border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-extrabold text-navy flex items-center gap-2">
            <Share2 className="h-4 w-4 text-teal" />
            Link de Acesso & Display para Balcão da Clínica
          </h4>
          <span className="text-xs text-muted-foreground">Disponível 24h para seus pacientes</span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Input
              readOnly
              value={portalUrl}
              className="pr-10 h-10 font-mono text-xs rounded-xl bg-slate-50 border-slate-200"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            className="rounded-xl gap-1.5 font-bold h-10 text-xs"
          >
            {copiedLink ? <CheckCircle2 className="h-4 w-4 text-teal" /> : <Copy className="h-4 w-4" />}
            {copiedLink ? "Copiado!" : "Copiar Link"}
          </Button>

          <a href={portalUrl} target="_blank" rel="noopener noreferrer">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl gap-1.5 font-bold h-10 text-xs w-full sm:w-auto"
            >
              <ExternalLink className="h-4 w-4 text-sky-600" />
              Abrir App
            </Button>
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="p-4 rounded-2xl border bg-slate-50 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-navy block">Display com QR Code para Balcão</span>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                Imprima um display para a recepção para os pacientes escanearem ao chegar.
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrintCounterDisplay}
              className="rounded-xl gap-1.5 text-xs font-bold h-9 shrink-0"
            >
              <Printer className="h-3.5 w-3.5 text-teal" />
              Imprimir Display
            </Button>
          </div>

          <div className="p-4 rounded-2xl border bg-emerald-50/60 border-emerald-200 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-emerald-950 block">Convite via WhatsApp</span>
              <span className="text-[11px] text-emerald-700 block mt-0.5">
                Copie a mensagem de apresentação pronta para enviar aos novos pacientes.
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyWhatsappInvite}
              className="rounded-xl gap-1.5 text-xs font-bold h-9 shrink-0 bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-100"
            >
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
              {copiedWhatsapp ? "Copiado!" : "Copiar Mensagem"}
            </Button>
          </div>
        </div>
      </div>

      {/* SWITCHES DE RECURSOS NO APP */}
      <div className="rounded-3xl border bg-card p-6 shadow-sm space-y-5">
        <h4 className="text-sm font-extrabold text-navy">
          Recursos Disponíveis para o Paciente no Aplicativo
        </h4>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start justify-between p-4 rounded-2xl border bg-slate-50 gap-3">
            <div>
              <span className="text-xs font-bold text-slate-800 block">Check-in Presencial Online</span>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                Botão "Cheguei na Clínica 📍" que avisa a recepção e a sala de espera que o paciente já está no consultório.
              </span>
            </div>
            <Switch
              checked={settings.switches.enableOnlineCheckin}
              disabled={!canManage}
              onCheckedChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  switches: { ...s.switches, enableOnlineCheckin: checked },
                }))
              }
            />
          </div>

          <div className="flex items-start justify-between p-4 rounded-2xl border bg-slate-50 gap-3">
            <div>
              <span className="text-xs font-bold text-slate-800 block">Rastreador de Alinhadores Invisíveis</span>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                Exibe a placa atual vs total, meta de 22h/dia e permite registrar a troca de placa pelo celular.
              </span>
            </div>
            <Switch
              checked={settings.switches.enableAlignerTracker}
              disabled={!canManage}
              onCheckedChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  switches: { ...s.switches, enableAlignerTracker: checked },
                }))
              }
            />
          </div>

          <div className="flex items-start justify-between p-4 rounded-2xl border bg-slate-50 gap-3">
            <div>
              <span className="text-xs font-bold text-slate-800 block">Autoatendimento Financeiro & Pix</span>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                Permite ao paciente consultar faturas em aberto e copiar o código Pix Copia e Cola direto no celular.
              </span>
            </div>
            <Switch
              checked={settings.switches.enableFinancialSelfService}
              disabled={!canManage}
              onCheckedChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  switches: { ...s.switches, enableFinancialSelfService: checked },
                }))
              }
            />
          </div>

          <div className="flex items-start justify-between p-4 rounded-2xl border bg-slate-50 gap-3">
            <div>
              <span className="text-xs font-bold text-slate-800 block">Manuais Pós-Operatórios</span>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                Guias práticos de cuidados pós-extração de siso, higiene com alinhadores e clareamento dental.
              </span>
            </div>
            <Switch
              checked={settings.switches.enablePostOpGuides}
              disabled={!canManage}
              onCheckedChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  switches: { ...s.switches, enablePostOpGuides: checked },
                }))
              }
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">Nome do Aplicativo PWA</Label>
            <Input
              value={settings.pwaAppName}
              disabled={!canManage}
              onChange={(e) => setSettings((s) => ({ ...s, pwaAppName: e.target.value }))}
              placeholder="Ex.: SondaPro Dental"
              className="text-xs h-9 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">WhatsApp de Emergência da Clínica</Label>
            <Input
              value={settings.clinicEmergencyPhone || ""}
              disabled={!canManage}
              onChange={(e) => setSettings((s) => ({ ...s, clinicEmergencyPhone: e.target.value }))}
              placeholder="Ex.: +55 (11) 98765-4321"
              className="text-xs h-9 rounded-xl"
            />
          </div>
        </div>

        {canManage && (
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleSave}
              className="bg-teal hover:bg-teal-600 text-white font-bold text-xs h-9 px-5 rounded-xl gap-1.5 shadow-sm"
            >
              <Save className="h-4 w-4" />
              Salvar Configurações do App
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

