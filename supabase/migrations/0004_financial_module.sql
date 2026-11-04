-- =============================================================================
-- MIGRATION 0004: MÓDULO FINANCEIRO COMPLETO (CONTAS A PAGAR/RECEBER, PARCELAS E FECHAMENTO DE CAIXA)
-- =============================================================================

do $$ begin
  create type public.financial_entry_type as enum ('income', 'expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.financial_entry_status as enum ('pending', 'paid', 'overdue', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum (
    'pix',
    'credit_card',
    'debit_card',
    'cash',
    'bank_slip',
    'transfer',
    'insurance'
  );
exception when duplicate_object then null; end $$;

-- 1. Lançamentos Financeiros (Receitas, Despesas e Parcelamentos)
create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  unit_id uuid references public.clinic_units(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  professional_id uuid references public.professionals(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  treatment_plan_id uuid references public.treatment_plans(id) on delete set null,
  entry_type public.financial_entry_type not null,
  category text not null default 'Procedimento' check (char_length(category) between 2 and 100),
  description text not null check (char_length(description) between 2 and 240),
  amount numeric(12,2) not null check (amount > 0),
  payment_method public.payment_method not null default 'pix',
  status public.financial_entry_status not null default 'pending',
  due_date date not null,
  paid_at timestamptz,
  installment_number smallint not null default 1 check (installment_number >= 1),
  total_installments smallint not null default 1 check (total_installments >= 1),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_financial_entries_clinic_due on public.financial_entries(clinic_id, due_date desc);
create index if not exists idx_financial_entries_clinic_status on public.financial_entries(clinic_id, status);

-- 2. Fechamento de Caixa Auditado
create table if not exists public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  unit_id uuid references public.clinic_units(id) on delete set null,
  closing_date date not null,
  total_income numeric(12,2) not null default 0,
  total_expense numeric(12,2) not null default 0,
  net_balance numeric(12,2) not null default 0,
  notes text,
  closed_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (clinic_id, closing_date)
);

create index if not exists idx_cash_closings_clinic_date on public.cash_closings(clinic_id, closing_date desc);

-- 3. Permissões e Row Level Security (RLS)
grant select, insert, update, delete on public.financial_entries, public.cash_closings to authenticated;
grant all on public.financial_entries, public.cash_closings to service_role;

alter table public.financial_entries enable row level security;
alter table public.cash_closings enable row level security;

drop policy if exists "financial_entries_read" on public.financial_entries;
create policy "financial_entries_read" on public.financial_entries
  for select to authenticated
  using (public.has_clinic_permission(clinic_id, 'financial.view', array['owner','admin','dentist','finance']::public.clinic_role[]));

drop policy if exists "financial_entries_write" on public.financial_entries;
create policy "financial_entries_write" on public.financial_entries
  for all to authenticated
  using (public.has_clinic_permission(clinic_id, 'financial.write', array['owner','admin','finance','receptionist']::public.clinic_role[]))
  with check (public.has_clinic_permission(clinic_id, 'financial.write', array['owner','admin','finance','receptionist']::public.clinic_role[]));

drop policy if exists "cash_closings_read" on public.cash_closings;
create policy "cash_closings_read" on public.cash_closings
  for select to authenticated
  using (public.has_clinic_permission(clinic_id, 'financial.view', array['owner','admin','dentist','finance']::public.clinic_role[]));

drop policy if exists "cash_closings_write" on public.cash_closings;
create policy "cash_closings_write" on public.cash_closings
  for all to authenticated
  using (public.has_clinic_permission(clinic_id, 'financial.write', array['owner','admin','finance']::public.clinic_role[]))
  with check (public.has_clinic_permission(clinic_id, 'financial.write', array['owner','admin','finance']::public.clinic_role[]));

-- 4. Triggers de Auditoria Automática
drop trigger if exists audit_financial_entries on public.financial_entries;
create trigger audit_financial_entries after insert or update or delete on public.financial_entries for each row execute function public.log_audit();

drop trigger if exists audit_cash_closings on public.cash_closings;
create trigger audit_cash_closings after insert or update or delete on public.cash_closings for each row execute function public.log_audit();

