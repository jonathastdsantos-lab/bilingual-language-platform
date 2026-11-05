import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Volume2, Sparkles, Building, User, DoorOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import { createWaitingRoomCall } from "@/modules/waiting-room";
import type { CallPriority } from "@/types";

interface CallPatientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  unitId?: string | null | undefined;
  patientId?: string | null | undefined;
  defaultPatientName?: string | undefined;
  professionals: Array<{ id: string; name: string }>;
  rooms: Array<{ id: string; name: string }>;
  defaultProfessionalId?: string | undefined;
  defaultRoomId?: string | undefined;
}

export function CallPatientModal({
  open,
  onOpenChange,
  clinicId,
  unitId,
  patientId,
  defaultPatientName = "",
  professionals,
  rooms,
  defaultProfessionalId,
  defaultRoomId,
}: CallPatientModalProps) {
  const { locale } = useT();
  const isEn = locale === "en";
  const qc = useQueryClient();

  const [patientName, setPatientName] = useState(defaultPatientName);
  const [selectedProfId, setSelectedProfId] = useState(defaultProfessionalId || professionals[0]?.id || "");
  const [selectedRoomId, setSelectedRoomId] = useState(defaultRoomId || rooms[0]?.id || "");
  const [priority, setPriority] = useState<CallPriority>("normal");

  // Sincroniza estados quando a modal abre ou referências carregam
  useEffect(() => {
    if (open) {
      if (defaultPatientName && !patientName) {
        setPatientName(defaultPatientName);
      }
      if (!selectedProfId && professionals.length > 0) {
        setSelectedProfId(defaultProfessionalId || professionals[0]?.id || "");
      }
      if (!selectedRoomId && rooms.length > 0) {
        setSelectedRoomId(defaultRoomId || rooms[0]?.id || "");
      }
    }
  }, [open, defaultPatientName, defaultProfessionalId, defaultRoomId, professionals, rooms, patientName, selectedProfId, selectedRoomId]);

  const callMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = (patientName || defaultPatientName || "").trim();
      if (!trimmedName) {
        throw new Error(isEn ? "Please enter the patient name." : "Por favor, informe o nome do paciente.");
      }

      const prof = professionals.find((p) => p.id === selectedProfId) || professionals[0];
      const room = rooms.find((r) => r.id === selectedRoomId) || rooms[0];

      return createWaitingRoomCall({
        clinicId,
        unitId: unitId && unitId !== "all" ? unitId : null,
        patientId: patientId || null,
        patientName: trimmedName,
        professionalId: prof?.id || (selectedProfId && selectedProfId !== "default" ? selectedProfId : null),
        professionalName: prof?.name || "Dentista Responsável",
        roomId: room?.id || (selectedRoomId && selectedRoomId !== "default" ? selectedRoomId : null),
        roomName: room?.name || "Consultório 01",
        priority,
      });
    },
    onSuccess: (call) => {
      // Invalida amplamente as queries de sala de espera em todos os componentes inscritos
      qc.invalidateQueries({ queryKey: ["waiting_room_calls"] });
      toast.success(
        isEn
          ? `Patient ${call.patient_name} called to ${call.room_name} on the TV screen!`
          : `Paciente ${call.patient_name} chamado para ${call.room_name} na tela da recepção!`
      );
      setPatientName("");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || (isEn ? "Failed to call patient." : "Erro ao chamar paciente."));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-navy">
            <Megaphone className="h-5 w-5 text-sky-600" />
            <span>{isEn ? "Call Patient to TV Screen" : "Chamar Paciente no Painel da Recepção"}</span>
          </DialogTitle>
          <DialogDescription>
            {isEn
              ? "Displays the patient name on the waiting room TV with a chime alert."
              : "Exibe o nome do paciente na TV da sala de espera acompanhado de sinal sonoro."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">{isEn ? "Patient Name" : "Nome do Paciente"}</Label>
            <Input
              value={patientName || defaultPatientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Ex: Carlos Eduardo Silva"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">{isEn ? "Professional" : "Dentista / Profissional"}</Label>
            <Select value={selectedProfId} onValueChange={setSelectedProfId}>
              <SelectTrigger className="h-9 text-xs">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isEn ? "Room / Office" : "Consultório / Sala"}</Label>
              <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione o consultório" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.length === 0 ? (
                    <SelectItem value="default">Consultório 01</SelectItem>
                  ) : (
                    rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isEn ? "Priority" : "Prioridade"}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as CallPriority)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal (Ordem)</SelectItem>
                  <SelectItem value="priority">Prioritário (Idoso / Gestante)</SelectItem>
                  <SelectItem value="urgent">Urgência / Emergência</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {isEn ? "Cancel" : "Cancelar"}
          </Button>
          <Button
            type="button"
            className="gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold"
            disabled={callMutation.isPending || (!patientName && !defaultPatientName)}
            onClick={() => callMutation.mutate()}
          >
            <Volume2 className="h-4 w-4" />
            <span>{callMutation.isPending ? (isEn ? "Calling..." : "Chamando...") : (isEn ? "Call Now on TV" : "Chamar Agora na TV")}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
