import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CreditCard,
  QrCode,
  FileText,
  DollarSign,
  Plus,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  ExternalLink,
  Settings,
  Share2,
  TrendingUp,
  Percent,
  Layers,
  ArrowRight,
  ShieldCheck,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  fetchClinicCharges,
  createAsaasCharge,
  markChargeAsPaid,
  getAsaasAccountConfig,
  saveAsaasAccountConfig,
  buildWhatsAppPaymentLinkMessage,
  type AsaasCharge,
  type AsaasBillingType,
  type AsaasAccountConfig,
} from "@/modules/finance/asaas-payments";
import { buildRelationshipWhatsAppUrl } from "@/modules/whatsapp/crm-relationship";

interface AsaasPaymentsPanelProps {
  clinicId: string;
  clinicName: string;
  patients: Array<{ id: string; full_name: string; phone?: string | null }>;
  professionals: Array<{ id: string; name: string; specialty?: string | null; commission_pct?: number | string }>;
  canManage: boolean;
  onRefreshEntries?: () => void;
}

export function AsaasPaymentsPanel({
  clinicId,
  clinicName,
  patients,
  professionals,
  canManage,
  onRefreshEntries,
}: AsaasPaymentsPanelProps) {
  const qc = useQueryClient();

  // Estados de modais
  const [newChargeModalOpen, setNewChargeModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [viewChargeModalOpen, setViewChargeModalOpen] = useState(false);
  const [activeCharge, setActiveCharge] = useState<AsaasCharge | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Formulário de Nova Cobrança
  const [selectedPatientId, setSelectedPatientId] = useState<string>(patients[0]?.id || "");
  const [description, setDescription] = useState<string>("");
  const [amount, setAmount] = useState<number>(350);
  const [billingType, setBillingType] = useState<AsaasBillingType>("PIX");
  const [installments, setInstallments] = useState<number>(1);
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split("T")[0] || "";
  });

  // Configuração de Split de Pagamento
  const [enableSplit, setEnableSplit] = useState<boolean>(true);
  const [selectedProfId, setSelectedProfId] = useState<string>(professionals[0]?.id || "");
  const [splitPercentage, setSplitPercentage] = useState<number>(40);

  // Consulta cobranças emitidas
  const { data: charges = [], refetch: refetchCharges } = useQuery({
    queryKey: ["asaasCharges", clinicId],
    queryFn: () => fetchClinicCharges(clinicId),
  });

  // Configurações do Asaas
  const [asaasConfig, setAsaasConfig] = useState<AsaasAccountConfig>(() =>
    getAsaasAccountConfig(clinicId)
  );

  // Métricas calculadas
  const metrics = useMemo(() => {
    let totalBilled = 0;
    let totalReceived = 0;
    let totalPending = 0;
    let totalSplitPaid = 0;

    for (const c of charges) {
      totalBilled += c.value;
      if (c.status === "CONFIRMED" || c.status === "RECEIVED") {
        totalReceived += c.value;
        if (c.split) {
          totalSplitPaid += c.split.professionalAmount;
        }
      } else if (c.status === "PENDING") {
        totalPending += c.value;
      }
    }

    return { totalBilled, totalReceived, totalPending, totalSplitPaid };
  }, [charges]);

  // Filtro de busca na tabela
  const filteredCharges = useMemo(() => {
    return charges.filter(
      (c) =>
        c.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [charges, searchTerm]);

  // Criação de Nova Cobrança
  const createChargeMutation = useMutation({
    mutationFn: async () => {
      const patient = patients.find((p) => p.id === selectedPatientId);
      const prof = professionals.find((p) => p.id === selectedProfId);

      const created = await createAsaasCharge(clinicId, {
        patientId: selectedPatientId,
        patientName: patient?.full_name || "Paciente",
        patientPhone: patient?.phone || undefined,
        billingType,
        value: amount,
        dueDate,
        installmentCount: installments,
        description: description.trim() || "Procedimento Odontológico",
        splitProfessionalId: enableSplit && prof ? prof.id : undefined,
        splitProfessionalName: enableSplit && prof ? prof.name : undefined,
        splitPercentage: enableSplit ? splitPercentage : undefined,
        clinicName,
      });

      return created;
    },
    onSuccess: (created) => {
      toast.success("Cobrança gerada com sucesso via Asaas!");
      setNewChargeModalOpen(false);
      refetchCharges();
      if (onRefreshEntries) onRefreshEntries();
      setActiveCharge(created);
      setViewChargeModalOpen(true);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Baixa manual de cobrança
  const handleConfirmPayment = (chargeId: string) => {
    const updated = markChargeAsPaid(clinicId, chargeId);
    if (updated) {
      toast.success("Pagamento confirmado e conciliado no fluxo de caixa!");
      refetchCharges();
      if (onRefreshEntries) onRefreshEntries();
      if (activeCharge && activeCharge.id === chargeId) {
        setActiveCharge(updated);
      }
    }
  };

  // Disparo de Cobrança no WhatsApp do Paciente
  const handleSendChargeWhatsApp = (charge: AsaasCharge) => {
    const msg = buildWhatsAppPaymentLinkMessage(charge, clinicName);
    const targetPhone = charge.patientPhone || "11999998888";
    const url = buildRelationshipWhatsAppUrl(targetPhone, msg);
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success("Abrindo WhatsApp com o link de pagamento do paciente!");
  };

  const fmtCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  return (
    <div className="space-y-6">
      {/* 1. KPIs Financeiros do Gateway Asaas / Clinicorp Pay */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-xs border-l-4 border-l-sky-500">
          <CardHeader className="p-4 pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Total Faturado (Asaas)
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-navy">{fmtCurrency(metrics.totalBilled)}</span>
            <Badge variant="outline" className="text-[10px] text-sky-600">
              {charges.length} cobranças
            </Badge>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-l-4 border-l-emerald-500">
          <CardHeader className="p-4 pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Recebido (Pix / Cartão)
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
              {fmtCurrency(metrics.totalReceived)}
            </span>
            <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30">
              Conciliado
            </Badge>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-l-4 border-l-amber-500">
          <CardHeader className="p-4 pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              A Receber / Carnês
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-700 dark:text-amber-400">
              {fmtCurrency(metrics.totalPending)}
            </span>
            <Badge variant="outline" className="text-[10px] text-amber-600">
              Em Aberto
            </Badge>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-l-4 border-l-purple-500">
          <CardHeader className="p-4 pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Split Dentistas (Anti-Bitributação)
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-purple-700 dark:text-purple-400">
              {fmtCurrency(metrics.totalSplitPaid)}
            </span>
            <Badge variant="outline" className="text-[10px] text-purple-600 bg-purple-50 dark:bg-purple-950/30">
              Conta do Parceiro
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* 2. Barra de Ações: Nova Cobrança + Configurações Asaas */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl border bg-card shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por paciente, descrição ou ID da cobrança..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfigModalOpen(true)}
            className="h-9 gap-1.5 text-xs text-slate-600 font-semibold"
          >
            <Settings className="w-3.5 h-3.5" />
            Configurar Gateway
          </Button>

          {canManage && (
            <Button
              type="button"
              size="sm"
              onClick={() => setNewChargeModalOpen(true)}
              className="h-9 gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <CreditCard className="w-3.5 h-3.5" />
              Nova Cobrança (Pix / Boleto / Cartão / Split)
            </Button>
          )}
        </div>
      </div>

      {/* 3. Tabela de Cobranças Emitidas */}
      <Card className="shadow-xs overflow-hidden">
        <CardHeader className="p-4 pb-2 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-extrabold text-navy flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Cobranças Odontológicas Emitidas ({filteredCharges.length})
            </CardTitle>
            <Badge variant="outline" className="text-[10px]">
              Asaas API v3 · Split Ativo
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredCharges.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Nenhuma cobrança registrada com os filtros aplicados.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Paciente</TableHead>
                  <TableHead className="text-xs">Procedimento / Tratamento</TableHead>
                  <TableHead className="text-xs">Meio de Pagamento</TableHead>
                  <TableHead className="text-xs">Valor Total</TableHead>
                  <TableHead className="text-xs">Vencimento</TableHead>
                  <TableHead className="text-xs">Split com Dentista</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Ações Rápidas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCharges.map((charge) => {
                  const isPaid = charge.status === "CONFIRMED" || charge.status === "RECEIVED";

                  return (
                    <TableRow key={charge.id} className="hover:bg-muted/20">
                      <TableCell className="font-semibold text-xs text-navy">
                        {charge.patientName}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 max-w-xs truncate">
                        {charge.description}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            charge.billingType === "PIX"
                              ? "border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30"
                              : charge.billingType === "CARNE"
                                ? "border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/30"
                                : "border-sky-300 text-sky-700 bg-sky-50 dark:bg-sky-950/30"
                          }`}
                        >
                          {charge.billingType} {charge.installmentCount > 1 ? `(${charge.installmentCount}x)` : ""}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-extrabold text-xs text-navy">
                        {fmtCurrency(charge.value)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(`${charge.dueDate}T12:00:00`).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {charge.split ? (
                          <div className="space-y-0.5">
                            <span className="font-semibold text-[11px] text-purple-700 dark:text-purple-300 block">
                              {charge.split.percentage}% ({fmtCurrency(charge.split.professionalAmount)})
                            </span>
                            <span className="text-[10px] text-muted-foreground block truncate">
                              {charge.split.professionalName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-[10px] font-bold ${
                            isPaid
                              ? "bg-emerald-600 text-white"
                              : charge.status === "PENDING"
                                ? "bg-amber-500 text-white"
                                : "bg-red-600 text-white"
                          }`}
                        >
                          {isPaid ? "PAGO / CONCILIADO" : charge.status === "PENDING" ? "PENDENTE" : "ATRASADO"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2 gap-1 text-slate-600"
                            onClick={() => {
                              setActiveCharge(charge);
                              setViewChargeModalOpen(true);
                            }}
                            title="Ver QR Code e Detalhes"
                          >
                            <QrCode className="w-3 h-3 text-sky-600" />
                            Ver
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2 gap-1 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 font-bold"
                            onClick={() => handleSendChargeWhatsApp(charge)}
                            title="Enviar Cobrança no WhatsApp"
                          >
                            <Send className="w-3 h-3 text-emerald-600" />
                            WhatsApp
                          </Button>

                          {!isPaid && canManage && (
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 text-xs px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                              onClick={() => handleConfirmPayment(charge.id)}
                              title="Marcar como recebido"
                            >
                              Baixar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* MODAL 1: NOVA COBRANÇA (Pix / Boleto / Cartão / Split) */}
      <Dialog open={newChargeModalOpen} onOpenChange={setNewChargeModalOpen}>
        <DialogContent className="max-w-xl bg-card">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold text-navy flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              Emitir Nova Cobrança Odontológica (Asaas)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Gera link de pagamento instantâneo com Pix Copia e Cola, Boleto Registrado ou Carnê parcelado com split automático.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              createChargeMutation.mutate();
            }}
            className="space-y-4 py-2"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Paciente *</Label>
                <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o paciente" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Forma de Cobrança *</Label>
                <Select value={billingType} onValueChange={(v) => setBillingType(v as AsaasBillingType)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIX">⚡ Pix Dinâmico (QR Code Instantâneo)</SelectItem>
                    <SelectItem value="CREDIT_CARD">💳 Cartão de Crédito Online (Checkout Seguro)</SelectItem>
                    <SelectItem value="BOLETO">📄 Boleto Bancário Registrado</SelectItem>
                    <SelectItem value="CARNE">📚 Carnê Odontológico Parcelado (Até 24x)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-navy">Descrição do Procedimento / Tratamento *</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Clareamento de Consultório + Moldeiras (2 Sessões)"
                required
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Valor Total (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  required
                  className="h-9 text-xs font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Parcelas</Label>
                <Select
                  value={String(installments)}
                  onValueChange={(v) => setInstallments(Number(v))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 10, 12, 18, 24].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}x de {fmtCurrency(amount / n)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Vencimento *</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Seção de Split de Pagamento com Dentista (Anti-bitributação) */}
            <div className="p-3.5 rounded-xl border border-purple-200 dark:border-purple-900 bg-purple-50/40 dark:bg-purple-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-bold text-purple-900 dark:text-purple-300">
                    Split Automático de Pagamento (Regra Receita Federal / CRO)
                  </span>
                </div>
                <Switch checked={enableSplit} onCheckedChange={setEnableSplit} />
              </div>

              {enableSplit && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-600">Dentista Executor</Label>
                    <Select value={selectedProfId} onValueChange={setSelectedProfId}>
                      <SelectTrigger className="h-8 text-xs bg-card">
                        <SelectValue placeholder="Selecione o dentista" />
                      </SelectTrigger>
                      <SelectContent>
                        {professionals.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-600">Comissão do Dentista (%):</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="99"
                        value={splitPercentage}
                        onChange={(e) => setSplitPercentage(Number(e.target.value))}
                        className="h-8 text-xs font-bold w-20 bg-card"
                      />
                      <span className="text-[11px] text-purple-700 font-bold">
                        = {fmtCurrency((amount * splitPercentage) / 100)} para o dentista
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setNewChargeModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createChargeMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                {createChargeMutation.isPending ? "Gerando no Asaas..." : "Emitir Cobrança Agora"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: VISUALIZADOR DE QR CODE PIX / BOLETO / WHATSAPP */}
      <Dialog open={viewChargeModalOpen} onOpenChange={setViewChargeModalOpen}>
        <DialogContent className="max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-navy flex items-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-600" />
              Cobrança Odontológica Gerada
            </DialogTitle>
          </DialogHeader>

          {activeCharge && (
            <div className="space-y-4 py-1 text-center">
              <div>
                <span className="text-xs text-muted-foreground block">Valor Total</span>
                <span className="text-3xl font-black text-navy">{fmtCurrency(activeCharge.value)}</span>
                <p className="text-xs text-slate-600 mt-0.5">{activeCharge.description}</p>
              </div>

              {/* QR Code Pix */}
              {activeCharge.pixQrCodeUrl && (
                <div className="p-4 bg-white rounded-2xl border shadow-sm max-w-[220px] mx-auto">
                  <img
                    src={activeCharge.pixQrCodeUrl}
                    alt="QR Code Pix"
                    className="w-full h-auto object-contain mx-auto"
                  />
                  <span className="text-[10px] font-bold text-slate-600 mt-1 block">
                    Escaneie com o app do banco
                  </span>
                </div>
              )}

              {/* Chave Pix Copia e Cola */}
              {activeCharge.pixCopiaECola && (
                <div className="space-y-1.5 text-left">
                  <Label className="text-[11px] font-bold text-slate-500">Pix Copia e Cola:</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      readOnly
                      value={activeCharge.pixCopiaECola}
                      className="h-8 text-[10px] font-mono bg-muted/40"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-xs font-bold gap-1"
                      onClick={() => {
                        if (activeCharge.pixCopiaECola) {
                          navigator.clipboard.writeText(activeCharge.pixCopiaECola);
                          toast.success("Código Pix Copia e Cola copiado com sucesso!");
                        }
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copiar
                    </Button>
                  </div>
                </div>
              )}

              {/* Botões de Ação Imediata */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSendChargeWhatsApp(activeCharge)}
                  className="gap-1.5 text-xs text-emerald-700 hover:bg-emerald-50 font-bold"
                >
                  <Send className="w-3.5 h-3.5 text-emerald-600" />
                  Enviar no WhatsApp
                </Button>

                {activeCharge.status === "PENDING" ? (
                  <Button
                    type="button"
                    onClick={() => handleConfirmPayment(activeCharge.id)}
                    className="gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirmar Pagamento
                  </Button>
                ) : (
                  <Badge className="bg-emerald-600 text-white justify-center h-9">
                    ✓ PAGO E CONCILIADO
                  </Badge>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL 3: CONFIGURAÇÕES DA CONTA ASAAS */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="max-w-lg bg-card">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold text-navy flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Configurações do Gateway Asaas / Clinicorp Pay
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Ambiente</Label>
                <Select
                  value={asaasConfig.environment}
                  onValueChange={(v: "sandbox" | "production") =>
                    setAsaasConfig((prev) => ({ ...prev, environment: v }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox (Testes Gratuitos)</SelectItem>
                    <SelectItem value="production">Produção Oficial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Wallet ID da Clínica</Label>
                <Input
                  value={asaasConfig.walletId}
                  onChange={(e) => setAsaasConfig((prev) => ({ ...prev, walletId: e.target.value }))}
                  placeholder="Ex.: wallet_sondapro_123"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-navy">Chave de API do Asaas (API Key / Access Token)</Label>
              <Input
                type="password"
                value={asaasConfig.apiKey}
                onChange={(e) => setAsaasConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="$aact_YTU5YTE0M2M6N2Z..."
                className="h-9 text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Gere sua chave no painel do Asaas em <i>Configurações da Conta &gt; Integração &gt; Gerar API Key</i>.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Multa por Atraso (%)</Label>
                <Input
                  type="number"
                  value={asaasConfig.fineValuePercent}
                  onChange={(e) => setAsaasConfig((prev) => ({ ...prev, fineValuePercent: Number(e.target.value) }))}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Juros Mensais (%)</Label>
                <Input
                  type="number"
                  value={asaasConfig.interestValueMonthPercent}
                  onChange={(e) => setAsaasConfig((prev) => ({ ...prev, interestValueMonthPercent: Number(e.target.value) }))}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="ghost" onClick={() => setConfigModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  saveAsaasAccountConfig(clinicId, asaasConfig);
                  toast.success("Credenciais do Asaas salvas com sucesso!");
                  setConfigModalOpen(false);
                }}
                className="bg-primary text-white font-bold"
              >
                Salvar Credenciais
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

