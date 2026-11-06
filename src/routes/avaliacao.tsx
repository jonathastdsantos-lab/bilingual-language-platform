import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Star,
  Sparkles,
  CheckCircle2,
  Heart,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getReputationSettings,
  submitNpsFeedback,
  getNpsCategory,
  type NpsScore,
} from "@/modules/reputation";
import { toast } from "sonner";

export const Route = createFileRoute("/avaliacao")({
  validateSearch: (search: Record<string, unknown>) => {
    let clinicId = "default";
    if (typeof search["clinicId"] === "string") clinicId = search["clinicId"];
    else if (typeof search["c"] === "string") clinicId = search["c"];

    return {
      clinicId,
      patientName: typeof search["patient"] === "string" ? search["patient"] : undefined,
      phone: typeof search["phone"] === "string" ? search["phone"] : undefined,
      dentist: typeof search["dentist"] === "string" ? search["dentist"] : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Avaliação de Atendimento — SondaPro" },
      { name: "description", content: "Sua opinião é fundamental para aprimorarmos nosso atendimento odontológico." },
    ],
  }),
  component: PublicNpsReviewPage,
});

export function PublicNpsReviewPage() {
  const { clinicId, patientName, phone, dentist } = Route.useSearch();
  const settings = getReputationSettings(clinicId);

  const [selectedScore, setSelectedScore] = useState<NpsScore | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submittedCategory, setSubmittedCategory] = useState<"promoter" | "neutral" | "detractor">("promoter");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedScore === null) {
      toast.warning("Por favor, selecione uma nota de 0 a 10 antes de enviar.");
      return;
    }

    setIsSubmitting(true);
    try {
      const record = await submitNpsFeedback(clinicId, {
        patientName: patientName || "Paciente",
        patientPhone: phone || undefined,
        professionalName: dentist || undefined,
        score: selectedScore,
        comment: comment.trim() || undefined,
      });

      setSubmittedCategory(record.category);
      setSubmitted(true);
      toast.success("Obrigado pelo seu feedback!");
    } catch {
      toast.error("Erro ao enviar avaliação. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getScoreButtonColor = (score: number) => {
    if (selectedScore === score) {
      if (score >= 9) return "bg-emerald-600 text-white ring-2 ring-emerald-400 scale-110 shadow-lg";
      if (score >= 7) return "bg-amber-500 text-white ring-2 ring-amber-300 scale-110 shadow-lg";
      return "bg-red-500 text-white ring-2 ring-red-300 scale-110 shadow-lg";
    }

    if (score >= 9) return "border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300";
    if (score >= 7) return "border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-800 dark:text-amber-300";
    return "border-slate-200 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-700 dark:text-slate-300";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-8">
      {/* Top Header */}
      <header className="max-w-xl mx-auto w-full flex items-center justify-between pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-500 text-white shadow-lg shadow-sky-500/20">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-extrabold text-white">SondaPro Odontologia</h1>
            <p className="text-[11px] text-sky-400 font-medium">Experiência & Cuidado Odontológico</p>
          </div>
        </div>

        <Badge variant="outline" className="border-sky-500/30 text-sky-300 text-xs gap-1 py-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          Ambiente Seguro
        </Badge>
      </header>

      {/* Área Central: Formulário ou Tela de Sucesso com Google */}
      <main className="max-w-xl mx-auto w-full my-auto py-8">
        {!submitted ? (
          <Card className="bg-slate-900/90 border-slate-800 text-white shadow-2xl backdrop-blur-xl rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/20">
                <Heart className="w-3.5 h-3.5 text-pink-500 fill-current" />
                Sua Opinião Faz a Diferença
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {patientName ? `Olá, ${patientName}!` : "Olá!"}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
                {dentist
                  ? `Como foi seu atendimento com Dr(a). ${dentist}?`
                  : settings.surveyQuestionText}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Botões de 0 a 10 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 px-1">
                  <span>0 - Pouco Provável</span>
                  <span>10 - Altamente Provável</span>
                </div>

                <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5">
                  {([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as NpsScore[]).map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setSelectedScore(num)}
                      className={`h-11 sm:h-12 rounded-xl font-black text-sm transition-all duration-200 border flex flex-col items-center justify-center ${getScoreButtonColor(
                        num
                      )}`}
                    >
                      <span>{num}</span>
                      {num === 10 && <Star className="w-2.5 h-2.5 fill-current text-amber-400 -mt-0.5" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Campo de Comentário Opcional */}
              <div className="space-y-2 text-left">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                  Gostaria de deixar um elogio, sugestão ou detalhe do seu atendimento?
                </label>
                <Textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Conte com suas palavras o que achou da pontualidade, atendimento e conforto da clínica..."
                  className="bg-slate-950 border-slate-800 text-xs text-white placeholder:text-slate-500 rounded-xl"
                />
              </div>

              <Button
                type="submit"
                disabled={selectedScore === null || isSubmitting}
                className="w-full h-12 text-sm font-black bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 text-white shadow-lg shadow-sky-600/25 rounded-xl gap-2"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? "Enviando..." : "Enviar Avaliação"}
              </Button>
            </form>
          </Card>
        ) : (
          /* TELA DE SUCESSO & CONVITE DO GOOGLE MEU NEGÓCIO */
          <Card className="bg-slate-900/90 border-slate-800 text-white shadow-2xl backdrop-blur-xl rounded-3xl p-6 sm:p-10 text-center space-y-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-xl shadow-emerald-500/20 mx-auto">
              <CheckCircle2 className="h-9 w-9" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-black text-white">Muito Obrigado pela sua Avaliação!</h3>
              <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                {submittedCategory === "promoter"
                  ? settings.promoterThankYouText
                  : settings.detractorApologyText}
              </p>
            </div>

            {/* SE FOR PROMOTOR (Nota 9 ou 10): BOTÃO DE 5 ESTRELAS NO GOOGLE MEU NEGÓCIO */}
            {submittedCategory === "promoter" && settings.enableGoogleRedirectForPromoters && (
              <div className="p-5 rounded-2xl bg-gradient-to-b from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 space-y-4">
                <div className="flex items-center justify-center gap-1 text-amber-400">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="w-5 h-5 fill-current" />
                  ))}
                </div>

                <div className="space-y-1">
                  <h4 className="text-sm font-black text-white">
                    Compartilhe seu carinho no Google!
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Leva menos de 30 segundos e ajuda milhares de pacientes a encontrarem tratamentos odontológicos com a mesma confiança.
                  </p>
                </div>

                <Button
                  size="lg"
                  className="w-full h-12 text-sm font-black bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:opacity-95 text-white shadow-xl shadow-emerald-600/30 rounded-xl gap-2 animate-pulse"
                  onClick={() => {
                    window.open(settings.googleReviewUrl, "_blank", "noopener,noreferrer");
                  }}
                >
                  <ExternalLink className="w-4 h-4" />
                  Avaliar com 5 Estrelas no Google Meu Negócio
                </Button>
              </div>
            )}

            <p className="text-[11px] text-slate-500">
              SondaPro Dental · Sua opinião impulsiona a excelência da odontologia moderna.
            </p>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-xl mx-auto w-full text-center pt-6 border-t border-slate-900 text-xs text-slate-500">
        Desenvolvido com tecnologia SondaPro Dental Suite · Protegido pela LGPD
      </footer>
    </div>
  );
}
