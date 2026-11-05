-- ============================================================================
-- SONDAPRO — PARTE 23: COMISSÕES ODONTOLÓGICAS AVANÇADAS & REPASSES
-- Módulo de repasse com desconto de laboratório, regras por procedimento,
-- fechamento por período, emissão de espelho e extrato individual do dentista.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.commission_settlement_status AS ENUM ('draft', 'approved', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.commission_calculation_type AS ENUM ('percentage_gross', 'percentage_net_of_lab', 'fixed_amount');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Regras de comissão por profissional / procedimento
CREATE TABLE IF NOT EXISTS public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  procedure_name text DEFAULT NULL,
  calculation_type public.commission_calculation_type NOT NULL DEFAULT 'percentage_net_of_lab',
  percentage numeric(5,2) NOT NULL DEFAULT 40.00,
  fixed_amount numeric(10,2) NOT NULL DEFAULT 0.00,
  deduct_lab_costs boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Fechamentos de Repasse (Lotes de Comissão)
CREATE TABLE IF NOT EXISTS public.commission_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  settlement_code text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_gross_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  total_lab_deductions numeric(12,2) NOT NULL DEFAULT 0.00,
  total_other_deductions numeric(12,2) NOT NULL DEFAULT 0.00,
  net_commission_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  status public.commission_settlement_status NOT NULL DEFAULT 'draft',
  payment_method text DEFAULT NULL,
  payment_date date DEFAULT NULL,
  financial_entry_id uuid REFERENCES public.financial_entries(id) ON DELETE SET NULL,
  notes text DEFAULT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Itens detalhados do fechamento de comissão
CREATE TABLE IF NOT EXISTS public.commission_settlement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.commission_settlements(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  financial_entry_id uuid REFERENCES public.financial_entries(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name text NOT NULL,
  procedure_name text NOT NULL,
  service_date date NOT NULL,
  gross_amount numeric(10,2) NOT NULL DEFAULT 0.00,
  lab_cost numeric(10,2) NOT NULL DEFAULT 0.00,
  calculation_basis numeric(10,2) NOT NULL DEFAULT 0.00,
  commission_rate numeric(5,2) NOT NULL DEFAULT 0.00,
  commission_amount numeric(10,2) NOT NULL DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_comm_settlements_clinic ON public.commission_settlements(clinic_id, professional_id);
CREATE INDEX IF NOT EXISTS idx_comm_settlements_dates ON public.commission_settlements(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_comm_items_settlement ON public.commission_settlement_items(settlement_id);

-- RLS
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_settlement_items ENABLE ROW LEVEL SECURITY;

-- Políticas: membros da clínica com permissão
CREATE POLICY "commission_rules_policy" ON public.commission_rules
  FOR ALL USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin', 'finance', 'dentist')
    )
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

CREATE POLICY "commission_settlements_policy" ON public.commission_settlements
  FOR ALL USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin', 'finance', 'dentist')
    )
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

CREATE POLICY "commission_items_policy" ON public.commission_settlement_items
  FOR ALL USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin', 'finance', 'dentist')
    )
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

GRANT ALL ON public.commission_rules TO authenticated;
GRANT ALL ON public.commission_settlements TO authenticated;
GRANT ALL ON public.commission_settlement_items TO authenticated;

-- ============================================================================
-- RPC: PRÉVIA DE CÁLCULO DE COMISSÃO POR PERÍODO
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_professional_commission_preview(
  _clinic_id uuid,
  _professional_id uuid,
  _start_date date,
  _end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_pct NUMERIC(5,2) := 40.00;
  v_items JSONB := '[]'::jsonb;
  v_total_gross NUMERIC(12,2) := 0.00;
  v_total_lab NUMERIC(12,2) := 0.00;
  v_total_comm NUMERIC(12,2) := 0.00;
  rec RECORD;
  v_lab_cost NUMERIC(10,2);
  v_calc_basis NUMERIC(10,2);
  v_rate NUMERIC(5,2);
  v_comm NUMERIC(10,2);
  v_rule RECORD;
BEGIN
  -- Obtém percentual padrão cadastrado no profissional se existir
  SELECT COALESCE(commission_pct, 40.00)
  INTO v_default_pct
  FROM public.professionals
  WHERE id = _professional_id AND clinic_id = _clinic_id;

  IF NOT FOUND THEN
    v_default_pct := 40.00;
  END IF;

  -- Percorre consultas concluídas no período
  FOR rec IN (
    SELECT 
      a.id AS appt_id,
      a.patient_id,
      COALESCE(p.full_name, 'Paciente não informado') AS patient_name,
      COALESCE(a.procedure, 'Atendimento Clínico') AS procedure_name,
      a.starts_at::date AS service_date,
      COALESCE(a.price, 0.00) AS gross_amount
    FROM public.appointments a
    LEFT JOIN public.patients p ON p.id = a.patient_id
    WHERE a.clinic_id = _clinic_id
      AND a.professional_id = _professional_id
      AND a.status = 'completed'
      AND a.starts_at::date >= _start_date
      AND a.starts_at::date <= _end_date
    ORDER BY a.starts_at ASC
  ) LOOP
    -- Verifica se houve custo de laboratório de prótese para este paciente e dentista
    SELECT COALESCE(SUM(lab_cost), 0.00)
    INTO v_lab_cost
    FROM public.prosthetic_lab_orders
    WHERE clinic_id = _clinic_id
      AND patient_id = rec.patient_id
      AND professional_id = _professional_id
      AND sent_date >= _start_date - interval '60 days'
      AND sent_date <= _end_date;

    -- Busca regra específica de procedimento se houver
    SELECT *
    INTO v_rule
    FROM public.commission_rules
    WHERE clinic_id = _clinic_id
      AND professional_id = _professional_id
      AND LOWER(procedure_name) = LOWER(rec.procedure_name)
    LIMIT 1;

    IF FOUND THEN
      IF v_rule.calculation_type = 'fixed_amount' THEN
        v_rate := 0.00;
        v_calc_basis := rec.gross_amount;
        v_comm := v_rule.fixed_amount;
      ELSIF v_rule.deduct_lab_costs THEN
        v_rate := v_rule.percentage;
        v_calc_basis := GREATEST(0.00, rec.gross_amount - v_lab_cost);
        v_comm := ROUND((v_calc_basis * v_rate) / 100.0, 2);
      ELSE
        v_rate := v_rule.percentage;
        v_calc_basis := rec.gross_amount;
        v_comm := ROUND((v_calc_basis * v_rate) / 100.0, 2);
      END IF;
    ELSE
      -- Regra geral
      v_rate := v_default_pct;
      v_calc_basis := GREATEST(0.00, rec.gross_amount - v_lab_cost);
      v_comm := ROUND((v_calc_basis * v_rate) / 100.0, 2);
    END IF;

    v_total_gross := v_total_gross + rec.gross_amount;
    v_total_lab := v_total_lab + v_lab_cost;
    v_total_comm := v_total_comm + v_comm;

    v_items := v_items || jsonb_build_object(
      'appointment_id', rec.appt_id,
      'patient_id', rec.patient_id,
      'patient_name', rec.patient_name,
      'procedure_name', rec.procedure_name,
      'service_date', rec.service_date,
      'gross_amount', rec.gross_amount,
      'lab_cost', v_lab_cost,
      'calculation_basis', v_calc_basis,
      'commission_rate', v_rate,
      'commission_amount', v_comm
    );
  END LOOP;

  RETURN jsonb_build_object(
    'professional_id', _professional_id,
    'period_start', _start_date,
    'period_end', _end_date,
    'total_gross_amount', v_total_gross,
    'total_lab_deductions', v_total_lab,
    'net_commission_amount', v_total_comm,
    'items_count', jsonb_array_length(v_items),
    'items', v_items
  );
END;
$$;

-- ============================================================================
-- RPC: APROVAR E LIQUIDAR REPASSE (CRIAÇÃO AUTOMÁTICA DE DESPESA NO FINANCEIRO)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.approve_and_pay_commission_settlement(
  _settlement_id uuid,
  _payment_method text DEFAULT 'pix',
  _payment_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settlement RECORD;
  v_prof_name TEXT;
  v_fe_id UUID;
BEGIN
  SELECT s.*, p.name AS prof_name
  INTO v_settlement
  FROM public.commission_settlements s
  JOIN public.professionals p ON p.id = s.professional_id
  WHERE s.id = _settlement_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fechamento de repasse não encontrado.');
  END IF;

  IF v_settlement.status = 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este repasse já se encontra liquidado.');
  END IF;

  -- 1. Cria lançamento no módulo financeiro (despesa de repasse de comissão)
  INSERT INTO public.financial_entries (
    clinic_id,
    entry_type,
    category,
    description,
    amount,
    status,
    payment_method,
    due_date,
    paid_at,
    professional_id,
    notes,
    created_by
  )
  VALUES (
    v_settlement.clinic_id,
    'expense',
    'Comissão Odontológica',
    'Repasse de Comissão (' || v_settlement.settlement_code || ') - ' || v_settlement.prof_name,
    v_settlement.net_commission_amount,
    'paid',
    _payment_method::public.payment_method,
    _payment_date,
    (_payment_date || ' 12:00:00')::timestamptz,
    v_settlement.professional_id,
    'Referente ao período de ' || to_char(v_settlement.period_start, 'DD/MM/YYYY') || ' a ' || to_char(v_settlement.period_end, 'DD/MM/YYYY'),
    auth.uid()
  )
  RETURNING id INTO v_fe_id;

  -- 2. Atualiza fechamento de repasse
  UPDATE public.commission_settlements
  SET status = 'paid',
      payment_method = _payment_method,
      payment_date = _payment_date,
      financial_entry_id = v_fe_id,
      updated_at = now()
  WHERE id = _settlement_id;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', _settlement_id,
    'financial_entry_id', v_fe_id,
    'status', 'paid',
    'message', 'Repasse liquidado com sucesso e lançado nas despesas da clínica!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_professional_commission_preview(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_and_pay_commission_settlement(uuid, text, date) TO authenticated;

