-- =============================================================================
-- MIGRATION 0003: PRONTUÁRIO ODONTOLÓGICO, ODONTOGRAMA INTERATIVO E PLANOS DE TRATAMENTO
-- =============================================================================

do $$ begin
  create type public.tooth_surface as enum ('W', 'O', 'M', 'D', 'V', 'L');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tooth_condition_status as enum (
    'healthy',
    'caries',
    'restoration',
    'planned',
    'completed',
    'endodontics',
    'crown',
    'implant',
    'missing'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.treatment_plan_status as enum (
    'draft',
    'approved',
    'in_progress',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

-- 1. Entradas do Odontograma (Histórico por Dente FDI 11-48 / 51-85 e Face)
create table if not exists public.odontogram_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete set null,
  tooth_number smallint not null check ((tooth_number between 11 and 48) or (tooth_number between 51 and 85)),
  surface public.tooth_surface not null default 'W',
  condition public.tooth_condition_status not null,
  procedure text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_odontogram_clinic_patient on public.odontogram_entries(clinic_id, patient_id, created_at desc);

-- 2. Prontuário Eletrônico / Evoluções Clínicas (Imutável / Append-Only para rastreabilidade legal)
create table if not exists public.clinical_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  tooth_number smallint check (tooth_number is null or (tooth_number between 11 and 48) or (tooth_number between 51 and 85)),
  record_type text not null default 'evolution' check (record_type in ('evolution', 'anamnesis', 'prescription', 'certificate', 'exam')),
  title text not null check (char_length(title) between 2 and 200),
  content text not null check (char_length(content) between 2 and 10000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_clinical_records_clinic_patient on public.clinical_records(clinic_id, patient_id, created_at desc);

-- 3. Planos de Tratamento & Orçamentos Odontológicos
create table if not exists public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete set null,
  title text not null check (char_length(title) between 2 and 160),
  status public.treatment_plan_status not null default 'draft',
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_treatment_plans_clinic_patient on public.treatment_plans(clinic_id, patient_id, created_at desc);

create table if not exists public.treatment_plan_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  plan_id uuid not null references public.treatment_plans(id) on delete cascade,
  tooth_number smallint check (tooth_number is null or (tooth_number between 11 and 48) or (tooth_number between 51 and 85)),
  surface public.tooth_surface not null default 'W',
  procedure_name text not null check (char_length(procedure_name) between 2 and 200),
  price numeric(12,2) not null default 0 check (price >= 0),
  status text not null default 'planned' check (status in ('planned', 'completed', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_treatment_items_plan on public.treatment_plan_items(clinic_id, plan_id);

-- 4. Permissões e Row Level Security (RLS)
grant select, insert on public.clinical_records to authenticated;
grant select, insert, update, delete on public.odontogram_entries, public.treatment_plans, public.treatment_plan_items to authenticated;
grant all on public.odontogram_entries, public.clinical_records, public.treatment_plans, public.treatment_plan_items to service_role;

alter table public.odontogram_entries enable row level security;
alter table public.clinical_records enable row level security;
alter table public.treatment_plans enable row level security;
alter table public.treatment_plan_items enable row level security;

-- Odontograma: leitura e escrita restritas aos membros com permissão de prontuário na clínica
drop policy if exists "odontogram_read" on public.odontogram_entries;
create policy "odontogram_read" on public.odontogram_entries
  for select to authenticated
  using (public.has_clinic_permission(clinic_id, 'records.read', array['owner','admin','dentist','assistant']::public.clinic_role[]));

drop policy if exists "odontogram_write" on public.odontogram_entries;
create policy "odontogram_write" on public.odontogram_entries
  for all to authenticated
  using (public.has_clinic_permission(clinic_id, 'records.write', array['owner','admin','dentist']::public.clinic_role[]))
  with check (public.has_clinic_permission(clinic_id, 'records.write', array['owner','admin','dentist']::public.clinic_role[]));

-- Evoluções Clínicas: Somente leitura e inserção (Append-Only para integridade legal do prontuário)
drop policy if exists "clinical_records_read" on public.clinical_records;
create policy "clinical_records_read" on public.clinical_records
  for select to authenticated
  using (public.has_clinic_permission(clinic_id, 'records.read', array['owner','admin','dentist','assistant']::public.clinic_role[]));

drop policy if exists "clinical_records_insert" on public.clinical_records;
create policy "clinical_records_insert" on public.clinical_records
  for insert to authenticated
  with check (public.has_clinic_permission(clinic_id, 'records.write', array['owner','admin','dentist']::public.clinic_role[]));

-- Planos de Tratamento e Itens
drop policy if exists "treatment_plans_read" on public.treatment_plans;
create policy "treatment_plans_read" on public.treatment_plans
  for select to authenticated
  using (public.has_clinic_permission(clinic_id, 'records.read', array['owner','admin','dentist','assistant','receptionist','finance']::public.clinic_role[]));

drop policy if exists "treatment_plans_write" on public.treatment_plans;
create policy "treatment_plans_write" on public.treatment_plans
  for all to authenticated
  using (public.has_clinic_permission(clinic_id, 'records.write', array['owner','admin','dentist']::public.clinic_role[]))
  with check (public.has_clinic_permission(clinic_id, 'records.write', array['owner','admin','dentist']::public.clinic_role[]));

drop policy if exists "treatment_items_read" on public.treatment_plan_items;
create policy "treatment_items_read" on public.treatment_plan_items
  for select to authenticated
  using (public.has_clinic_permission(clinic_id, 'records.read', array['owner','admin','dentist','assistant','receptionist','finance']::public.clinic_role[]));

drop policy if exists "treatment_items_write" on public.treatment_plan_items;
create policy "treatment_items_write" on public.treatment_plan_items
  for all to authenticated
  using (public.has_clinic_permission(clinic_id, 'records.write', array['owner','admin','dentist']::public.clinic_role[]))
  with check (public.has_clinic_permission(clinic_id, 'records.write', array['owner','admin','dentist']::public.clinic_role[]));

-- 5. Triggers de Auditoria Automática
drop trigger if exists audit_odontogram on public.odontogram_entries;
create trigger audit_odontogram after insert or update or delete on public.odontogram_entries for each row execute function public.log_audit();

drop trigger if exists audit_clinical_records on public.clinical_records;
create trigger audit_clinical_records after insert on public.clinical_records for each row execute function public.log_audit();

drop trigger if exists audit_treatment_plans on public.treatment_plans;
create trigger audit_treatment_plans after insert or update or delete on public.treatment_plans for each row execute function public.log_audit();

drop trigger if exists audit_treatment_items on public.treatment_plan_items;
create trigger audit_treatment_items after insert or update or delete on public.treatment_plan_items for each row execute function public.log_audit();

