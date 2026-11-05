-- =============================================================================
-- SONDAPRO — SCRIPT ÚNICO E IDEMPOTENTE DE CONFIGURAÇÃO DO BANCO DE DADOS
-- Inclui todas as Migrations (0001 a 0006) na ordem exata de dependências.
-- Cole e execute este arquivo inteiro no SQL Editor do Supabase / Lovable Cloud.
-- =============================================================================

-- =============================================================================
-- PARTE 1 (0001): FUNDAÇÃO MULTI-TENANT, AUTENTICAÇÃO, RBAC, AGENDA E AUDITORIA
-- =============================================================================

create extension if not exists btree_gist;

do $$ begin
  create type public.clinic_role as enum ('owner','admin','dentist','receptionist','assistant','finance','stock');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.appointment_status as enum ('scheduled','confirmed','completed','cancelled','no_show');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  locale text not null default 'pt',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.clinic_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null,
  role public.clinic_role not null,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);

grant select, insert, update, delete on public.clinics, public.clinic_members to authenticated;
grant all on public.clinics, public.clinic_members to service_role;

create or replace function public.is_clinic_member(_clinic uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clinic_members where clinic_id = _clinic and user_id = auth.uid())
$$;

create or replace function public.has_clinic_role(_clinic uuid, _roles public.clinic_role[]) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clinic_members where clinic_id = _clinic and user_id = auth.uid() and role = any(_roles))
$$;

alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;

drop policy if exists "members read clinic" on public.clinics;
create policy "members read clinic" on public.clinics for select to authenticated using (public.is_clinic_member(id));

drop policy if exists "owner update clinic" on public.clinics;
create policy "owner update clinic" on public.clinics for update to authenticated using (public.has_clinic_role(id, array['owner','admin']::public.clinic_role[]));

drop policy if exists "members read members" on public.clinic_members;
create policy "members read members" on public.clinic_members for select to authenticated using (public.is_clinic_member(clinic_id));

drop policy if exists "admins update members" on public.clinic_members;
create policy "admins update members" on public.clinic_members for update to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]) and role <> 'owner');

drop policy if exists "admins delete members" on public.clinic_members;
create policy "admins delete members" on public.clinic_members for delete to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]) and role <> 'owner');

create or replace function public.add_clinic_member(_clinic uuid, _email text, _role public.clinic_role) returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid; uname text; mid uuid;
begin
  if not public.has_clinic_role(_clinic, array['owner','admin']::public.clinic_role[]) then raise exception 'forbidden'; end if;
  if _role = 'owner' then raise exception 'cannot assign owner'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(_email));
  if uid is null then raise exception 'user_not_found'; end if;
  select full_name into uname from profiles where id = uid;
  insert into clinic_members(clinic_id,user_id,role,display_name,email) values (_clinic, uid, _role, uname, lower(trim(_email))) returning id into mid;
  return mid;
end $$;

create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  specialty text,
  color text not null default '#1e6bff',
  commission_pct numeric(5,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  full_name text not null,
  cpf text,
  birth_date date,
  phone text,
  whatsapp text,
  email text,
  address text,
  allergies text,
  anamnesis text,
  clinical_notes text,
  created_at timestamptz not null default now(),
  unique (clinic_id, cpf)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  procedure text,
  price numeric(12,2) not null default 0,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint no_prof_overlap exclude using gist (professional_id with =, tstzrange(starts_at, ends_at) with &&) where (status not in ('cancelled','no_show')),
  constraint no_room_overlap exclude using gist (room_id with =, tstzrange(starts_at, ends_at) with &&) where (status not in ('cancelled','no_show') and room_id is not null)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.professionals, public.rooms, public.patients, public.appointments to authenticated;
grant select on public.audit_logs to authenticated;
grant all on public.professionals, public.rooms, public.patients, public.appointments, public.audit_logs to service_role;

alter table public.professionals enable row level security;
alter table public.rooms enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "read" on public.professionals;
create policy "read" on public.professionals for select to authenticated using (public.is_clinic_member(clinic_id));

drop policy if exists "write" on public.professionals;
create policy "write" on public.professionals for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));

drop policy if exists "read" on public.rooms;
create policy "read" on public.rooms for select to authenticated using (public.is_clinic_member(clinic_id));

drop policy if exists "write" on public.rooms;
create policy "write" on public.rooms for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));

drop policy if exists "read" on public.audit_logs;
create policy "read" on public.audit_logs for select to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));

create or replace function public.log_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  r := coalesce(new, old);
  insert into audit_logs(clinic_id,user_id,action,entity,entity_id) values (r.clinic_id, auth.uid(), lower(tg_op), tg_table_name, r.id);
  return coalesce(new, old);
end $$;

drop trigger if exists audit_patients on public.patients;
create trigger audit_patients after insert or update or delete on public.patients for each row execute function public.log_audit();

drop trigger if exists audit_appointments on public.appointments;
create trigger audit_appointments after insert or update or delete on public.appointments for each row execute function public.log_audit();

drop trigger if exists audit_members on public.clinic_members;
create trigger audit_members after insert or update or delete on public.clinic_members for each row execute function public.log_audit();

-- =============================================================================
-- PARTE 2 (0002): UNIDADES DA CLÍNICA, PERMISSÕES INDIVIDUAIS E AUDITORIA
-- =============================================================================

alter table public.clinics
  add column if not exists cnpj text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists timezone text not null default 'America/Sao_Paulo';

create table if not exists public.clinic_units (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  cnpj text,
  phone text,
  address text,
  city text,
  state text check (state is null or char_length(state) = 2),
  is_main boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_clinic_units_clinic_id on public.clinic_units(clinic_id);

alter table public.rooms
  add column if not exists unit_id uuid references public.clinic_units(id) on delete set null;

alter table public.appointments
  add column if not exists unit_id uuid references public.clinic_units(id) on delete set null;

create table if not exists public.clinic_member_permissions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  member_id uuid not null references public.clinic_members(id) on delete cascade,
  permission text not null check (char_length(permission) between 3 and 80),
  granted boolean not null default true,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (member_id, permission)
);

create index if not exists idx_member_permissions_clinic_member on public.clinic_member_permissions(clinic_id, member_id);

grant select, insert, update, delete on public.clinic_units, public.clinic_member_permissions to authenticated;
grant all on public.clinic_units, public.clinic_member_permissions to service_role;

alter table public.clinic_units enable row level security;
alter table public.clinic_member_permissions enable row level security;

create or replace function public.has_clinic_permission(
  _clinic uuid,
  _permission text,
  _default_roles public.clinic_role[]
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m_id uuid;
  m_role public.clinic_role;
  override_val boolean;
begin
  select id, role into m_id, m_role
  from public.clinic_members
  where clinic_id = _clinic and user_id = auth.uid()
  limit 1;

  if m_id is null then
    return false;
  end if;

  if m_role = 'owner' then
    return true;
  end if;

  select granted into override_val
  from public.clinic_member_permissions
  where clinic_id = _clinic and member_id = m_id and permission = _permission
  limit 1;

  if override_val is not null then
    return override_val;
  end if;

  return m_role = any(_default_roles);
end $$;

drop policy if exists "units_read" on public.clinic_units;
create policy "units_read" on public.clinic_units
  for select to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists "units_write" on public.clinic_units;
create policy "units_write" on public.clinic_units
  for all to authenticated
  using (public.has_clinic_permission(clinic_id, 'units.manage', array['owner','admin']::public.clinic_role[]))
  with check (public.has_clinic_permission(clinic_id, 'units.manage', array['owner','admin']::public.clinic_role[]));

drop policy if exists "member_permissions_read" on public.clinic_member_permissions;
create policy "member_permissions_read" on public.clinic_member_permissions
  for select to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists "member_permissions_write" on public.clinic_member_permissions;
create policy "member_permissions_write" on public.clinic_member_permissions
  for all to authenticated
  using (public.has_clinic_permission(clinic_id, 'team.manage', array['owner','admin']::public.clinic_role[]))
  with check (public.has_clinic_permission(clinic_id, 'team.manage', array['owner','admin']::public.clinic_role[]));

drop policy if exists "read" on public.patients;
create policy "read" on public.patients
  for select to authenticated
  using (public.has_clinic_permission(clinic_id, 'patients.read', array['owner','admin','dentist','receptionist','assistant','finance']::public.clinic_role[]));

drop policy if exists "write" on public.patients;
create policy "write" on public.patients
  for all to authenticated
  using (public.has_clinic_permission(clinic_id, 'patients.write', array['owner','admin','dentist','receptionist']::public.clinic_role[]))
  with check (public.has_clinic_permission(clinic_id, 'patients.write', array['owner','admin','dentist','receptionist']::public.clinic_role[]));

drop policy if exists "read" on public.appointments;
create policy "read" on public.appointments
  for select to authenticated
  using (public.has_clinic_permission(clinic_id, 'appointments.read', array['owner','admin','dentist','receptionist','assistant','finance']::public.clinic_role[]));

drop policy if exists "write" on public.appointments;
create policy "write" on public.appointments
  for all to authenticated
  using (public.has_clinic_permission(clinic_id, 'appointments.write', array['owner','admin','dentist','receptionist']::public.clinic_role[]))
  with check (public.has_clinic_permission(clinic_id, 'appointments.write', array['owner','admin','dentist','receptionist']::public.clinic_role[]));

create or replace function public.create_clinic(_name text) returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; uemail text; uname text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into clinics(name) values (_name) returning id into cid;
  select email into uemail from auth.users where id = auth.uid();
  select full_name into uname from profiles where id = auth.uid();
  insert into clinic_members(clinic_id,user_id,role,display_name,email) values (cid, auth.uid(), 'owner', uname, uemail);
  insert into clinic_units(clinic_id, name, is_main, active) values (cid, 'Unidade Matriz', true, true);
  return cid;
end $$;

insert into public.clinic_units (clinic_id, name, is_main, active)
select c.id, 'Unidade Matriz', true, true
from public.clinics c
where not exists (
  select 1 from public.clinic_units u where u.clinic_id = c.id
);

drop trigger if exists audit_units on public.clinic_units;
create trigger audit_units after insert or update or delete on public.clinic_units for each row execute function public.log_audit();

drop trigger if exists audit_professionals on public.professionals;
create trigger audit_professionals after insert or update or delete on public.professionals for each row execute function public.log_audit();

drop trigger if exists audit_rooms on public.rooms;
create trigger audit_rooms after insert or update or delete on public.rooms for each row execute function public.log_audit();

drop trigger if exists audit_member_permissions on public.clinic_member_permissions;
create trigger audit_member_permissions after insert or update or delete on public.clinic_member_permissions for each row execute function public.log_audit();

-- =============================================================================
-- PARTE 3 (0003): PRONTUÁRIO ODONTOLÓGICO, ODONTOGRAMA FDI E PLANOS DE TRATAMENTO
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

grant select, insert on public.clinical_records to authenticated;
grant select, insert, update, delete on public.odontogram_entries, public.treatment_plans, public.treatment_plan_items to authenticated;
grant all on public.odontogram_entries, public.clinical_records, public.treatment_plans, public.treatment_plan_items to service_role;

alter table public.odontogram_entries enable row level security;
alter table public.clinical_records enable row level security;
alter table public.treatment_plans enable row level security;
alter table public.treatment_plan_items enable row level security;

drop policy if exists "odontogram_read" on public.odontogram_entries;
create policy "odontogram_read" on public.odontogram_entries
  for select to authenticated
  using (public.has_clinic_permission(clinic_id, 'records.read', array['owner','admin','dentist','assistant']::public.clinic_role[]));

drop policy if exists "odontogram_write" on public.odontogram_entries;
create policy "odontogram_write" on public.odontogram_entries
  for all to authenticated
  using (public.has_clinic_permission(clinic_id, 'records.write', array['owner','admin','dentist']::public.clinic_role[]))
  with check (public.has_clinic_permission(clinic_id, 'records.write', array['owner','admin','dentist']::public.clinic_role[]));

drop policy if exists "clinical_records_read" on public.clinical_records;
create policy "clinical_records_read" on public.clinical_records
  for select to authenticated
  using (public.has_clinic_permission(clinic_id, 'records.read', array['owner','admin','dentist','assistant']::public.clinic_role[]));

drop policy if exists "clinical_records_insert" on public.clinical_records;
create policy "clinical_records_insert" on public.clinical_records
  for insert to authenticated
  with check (public.has_clinic_permission(clinic_id, 'records.write', array['owner','admin','dentist']::public.clinic_role[]));

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

drop trigger if exists audit_odontogram on public.odontogram_entries;
create trigger audit_odontogram after insert or update or delete on public.odontogram_entries for each row execute function public.log_audit();

drop trigger if exists audit_clinical_records on public.clinical_records;
create trigger audit_clinical_records after insert on public.clinical_records for each row execute function public.log_audit();

drop trigger if exists audit_treatment_plans on public.treatment_plans;
create trigger audit_treatment_plans after insert or update or delete on public.treatment_plans for each row execute function public.log_audit();

drop trigger if exists audit_treatment_items on public.treatment_plan_items;
create trigger audit_treatment_items after insert or update or delete on public.treatment_plan_items for each row execute function public.log_audit();

-- =============================================================================
-- PARTE 4 (0004): MÓDULO FINANCEIRO COMPLETO (CONTAS A PAGAR/RECEBER E CAIXA)
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

drop trigger if exists audit_financial_entries on public.financial_entries;
create trigger audit_financial_entries after insert or update or delete on public.financial_entries for each row execute function public.log_audit();

drop trigger if exists audit_cash_closings on public.cash_closings;
create trigger audit_cash_closings after insert or update or delete on public.cash_closings for each row execute function public.log_audit();

-- =============================================================================
-- PARTE 5 (0005): CONTROLE DE ESTOQUE, INSUMOS ODONTOLÓGICOS E KARDEX
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_movement_type') THEN
    CREATE TYPE public.stock_movement_type AS ENUM (
      'in',
      'out',
      'adjustment',
      'expired_loss'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.clinic_units(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
  category TEXT NOT NULL,
  sku TEXT,
  unit_measure TEXT NOT NULL DEFAULT 'un',
  current_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
  min_quantity NUMERIC(12, 2) NOT NULL DEFAULT 5 CHECK (min_quantity >= 0),
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  supplier TEXT,
  batch_number TEXT,
  expiration_date DATE,
  storage_location TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_items_clinic_name
  ON public.stock_items(clinic_id, name);

CREATE INDEX IF NOT EXISTS idx_stock_items_clinic_expiration
  ON public.stock_items(clinic_id, expiration_date);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.clinic_units(id) ON DELETE SET NULL,
  movement_type public.stock_movement_type NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
  previous_quantity NUMERIC(12, 2) NOT NULL CHECK (previous_quantity >= 0),
  resulting_quantity NUMERIC(12, 2) NOT NULL CHECK (resulting_quantity >= 0),
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  batch_number TEXT,
  expiration_date DATE,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) >= 2),
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_clinic_created
  ON public.stock_movements(clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item
  ON public.stock_movements(item_id, created_at DESC);

-- =============================================================================
-- PARTE 6 (0006): RELATÓRIOS GERENCIAIS (DRE) E CENTRAL WHATSAPP MULTI-TENANT
-- =============================================================================

CREATE OR REPLACE FUNCTION public.has_clinic_permission(
  _user_id UUID,
  _clinic_id UUID,
  _permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.clinic_role;
  v_member_id UUID;
  v_override BOOLEAN;
BEGIN
  IF _user_id IS NULL OR _clinic_id IS NULL OR _permission IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id, role
    INTO v_member_id, v_role
    FROM public.clinic_members
   WHERE user_id = _user_id
     AND clinic_id = _clinic_id
   LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_role = 'owner' THEN
    RETURN TRUE;
  END IF;

  SELECT granted
    INTO v_override
    FROM public.clinic_member_permissions
   WHERE clinic_id = _clinic_id
     AND member_id = v_member_id
     AND permission = _permission
   LIMIT 1;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  CASE _permission
    WHEN 'dashboard.view' THEN
      RETURN TRUE;
    WHEN 'financial.view' THEN
      RETURN v_role IN ('admin', 'dentist', 'finance');
    WHEN 'financial.write' THEN
      RETURN v_role IN ('admin', 'finance', 'receptionist');
    WHEN 'patients.read' THEN
      RETURN v_role IN ('admin', 'dentist', 'receptionist', 'assistant', 'finance');
    WHEN 'patients.write' THEN
      RETURN v_role IN ('admin', 'dentist', 'receptionist');
    WHEN 'records.read' THEN
      RETURN v_role IN ('admin', 'dentist', 'assistant');
    WHEN 'records.write' THEN
      RETURN v_role IN ('admin', 'dentist');
    WHEN 'appointments.read' THEN
      RETURN v_role IN ('admin', 'dentist', 'receptionist', 'assistant', 'finance');
    WHEN 'appointments.write' THEN
      RETURN v_role IN ('admin', 'dentist', 'receptionist');
    WHEN 'stock.read' THEN
      RETURN v_role IN ('admin', 'dentist', 'assistant', 'stock', 'receptionist');
    WHEN 'stock.write' THEN
      RETURN v_role IN ('admin', 'stock', 'assistant');
    WHEN 'reports.view' THEN
      RETURN v_role IN ('admin', 'finance', 'dentist');
    WHEN 'whatsapp.manage' THEN
      RETURN v_role IN ('admin', 'receptionist', 'dentist', 'assistant');
    WHEN 'team.manage' THEN
      RETURN v_role IN ('admin');
    WHEN 'settings.manage' THEN
      RETURN v_role IN ('admin');
    WHEN 'units.manage' THEN
      RETURN v_role IN ('admin');
    WHEN 'audit.view' THEN
      RETURN v_role IN ('admin');
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;
GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_items, public.stock_movements TO service_role;

ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_items_select_policy" ON public.stock_items;
CREATE POLICY "stock_items_select_policy"
  ON public.stock_items FOR SELECT TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'stock.read'));

DROP POLICY IF EXISTS "stock_items_insert_policy" ON public.stock_items;
CREATE POLICY "stock_items_insert_policy"
  ON public.stock_items FOR INSERT TO authenticated
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'stock.write'));

DROP POLICY IF EXISTS "stock_items_update_policy" ON public.stock_items;
CREATE POLICY "stock_items_update_policy"
  ON public.stock_items FOR UPDATE TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'stock.write'))
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'stock.write'));

DROP POLICY IF EXISTS "stock_items_delete_policy" ON public.stock_items;
CREATE POLICY "stock_items_delete_policy"
  ON public.stock_items FOR DELETE TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'stock.write'));

DROP POLICY IF EXISTS "stock_movements_select_policy" ON public.stock_movements;
CREATE POLICY "stock_movements_select_policy"
  ON public.stock_movements FOR SELECT TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'stock.read'));

DROP POLICY IF EXISTS "stock_movements_insert_policy" ON public.stock_movements;
CREATE POLICY "stock_movements_insert_policy"
  ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'stock.write'));

DROP TRIGGER IF EXISTS trg_audit_stock_items ON public.stock_items;
CREATE TRIGGER trg_audit_stock_items
  AFTER INSERT OR UPDATE OR DELETE ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS trg_audit_stock_movements ON public.stock_movements;
CREATE TRIGGER trg_audit_stock_movements
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
  category TEXT NOT NULL CHECK (category IN ('confirmation', 'reminder', 'post_op', 'recall', 'financial')),
  body_template TEXT NOT NULL CHECK (char_length(trim(body_template)) >= 5),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_clinic
  ON public.whatsapp_templates(clinic_id, category);

CREATE TABLE IF NOT EXISTS public.whatsapp_dispatch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  template_category TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  rendered_message TEXT NOT NULL,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_dispatch_logs_clinic_created
  ON public.whatsapp_dispatch_logs(clinic_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT SELECT, INSERT ON public.whatsapp_dispatch_logs TO authenticated;
GRANT ALL ON public.whatsapp_templates, public.whatsapp_dispatch_logs TO service_role;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_dispatch_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_templates_select_policy" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates_select_policy"
  ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'whatsapp.manage'));

DROP POLICY IF EXISTS "whatsapp_templates_insert_policy" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates_insert_policy"
  ON public.whatsapp_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'whatsapp.manage'));

DROP POLICY IF EXISTS "whatsapp_templates_update_policy" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates_update_policy"
  ON public.whatsapp_templates FOR UPDATE TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'whatsapp.manage'))
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'whatsapp.manage'));

DROP POLICY IF EXISTS "whatsapp_templates_delete_policy" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates_delete_policy"
  ON public.whatsapp_templates FOR DELETE TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'whatsapp.manage'));

DROP POLICY IF EXISTS "whatsapp_dispatch_logs_select_policy" ON public.whatsapp_dispatch_logs;
CREATE POLICY "whatsapp_dispatch_logs_select_policy"
  ON public.whatsapp_dispatch_logs FOR SELECT TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'whatsapp.manage'));

DROP POLICY IF EXISTS "whatsapp_dispatch_logs_insert_policy" ON public.whatsapp_dispatch_logs;
CREATE POLICY "whatsapp_dispatch_logs_insert_policy"
  ON public.whatsapp_dispatch_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'whatsapp.manage'));

DROP TRIGGER IF EXISTS trg_audit_whatsapp_templates ON public.whatsapp_templates;
CREATE TRIGGER trg_audit_whatsapp_templates
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS trg_audit_whatsapp_dispatch_logs ON public.whatsapp_dispatch_logs;
CREATE TRIGGER trg_audit_whatsapp_dispatch_logs
  AFTER INSERT ON public.whatsapp_dispatch_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();


-- =============================================================================
-- PARTE 7 (0007): GALERIA DE EXAMES E RADIOGRAFIAS (SUPABASE STORAGE COM RLS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.patient_exam_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  tooth_number SMALLINT CHECK (
    tooth_number IS NULL
    OR (tooth_number BETWEEN 11 AND 48)
    OR (tooth_number BETWEEN 51 AND 85)
  ),
  exam_category TEXT NOT NULL CHECK (
    exam_category IN (
      'periapical',
      'panoramic',
      'bitewing',
      'tomography',
      'intraoral_before',
      'intraoral_after',
      'document'
    )
  ),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 160),
  notes TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 15728640),
  storage_path TEXT NOT NULL UNIQUE,
  exam_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_exam_files_clinic_patient
  ON public.patient_exam_files(clinic_id, patient_id, exam_date DESC);

GRANT SELECT, INSERT, DELETE ON public.patient_exam_files TO authenticated;
GRANT ALL ON public.patient_exam_files TO service_role;

ALTER TABLE public.patient_exam_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_exam_files_select_policy" ON public.patient_exam_files;
CREATE POLICY "patient_exam_files_select_policy"
  ON public.patient_exam_files FOR SELECT TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'records.read'));

DROP POLICY IF EXISTS "patient_exam_files_insert_policy" ON public.patient_exam_files;
CREATE POLICY "patient_exam_files_insert_policy"
  ON public.patient_exam_files FOR INSERT TO authenticated
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'records.write'));

DROP POLICY IF EXISTS "patient_exam_files_delete_policy" ON public.patient_exam_files;
CREATE POLICY "patient_exam_files_delete_policy"
  ON public.patient_exam_files FOR DELETE TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'records.write'));

DROP TRIGGER IF EXISTS trg_audit_patient_exam_files ON public.patient_exam_files;
CREATE TRIGGER trg_audit_patient_exam_files
  AFTER INSERT OR DELETE ON public.patient_exam_files
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinical-exams',
  'clinical-exams',
  FALSE,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = FALSE,
  file_size_limit = 15728640,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

DROP POLICY IF EXISTS "clinical_exams_storage_select" ON storage.objects;
CREATE POLICY "clinical_exams_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'clinical-exams'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.has_clinic_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'records.read')
  );

DROP POLICY IF EXISTS "clinical_exams_storage_insert" ON storage.objects;
CREATE POLICY "clinical_exams_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'clinical-exams'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.has_clinic_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'records.write')
  );

DROP POLICY IF EXISTS "clinical_exams_storage_delete" ON storage.objects;
CREATE POLICY "clinical_exams_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'clinical-exams'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.has_clinic_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'records.write')
  );

-- =============================================================================
-- PARTE 8 (0008): CATÁLOGO DE PROCEDIMENTOS (TABELA TUSS) E CONVÊNIOS (ANS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dental_insurances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  ans_code TEXT,
  cnpj TEXT,
  reimbursement_days INTEGER NOT NULL DEFAULT 30 CHECK (reimbursement_days BETWEEN 0 AND 180),
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dental_insurances_clinic
  ON public.dental_insurances(clinic_id, name);

CREATE TABLE IF NOT EXISTS public.procedure_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  insurance_id UUID REFERENCES public.dental_insurances(id) ON DELETE SET NULL,
  tuss_code TEXT,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 200),
  specialty TEXT NOT NULL DEFAULT 'Clínica Geral',
  base_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  estimated_material_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (estimated_material_cost >= 0),
  default_duration_minutes SMALLINT NOT NULL DEFAULT 60 CHECK (default_duration_minutes BETWEEN 10 AND 480),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procedure_catalog_clinic_name
  ON public.procedure_catalog(clinic_id, name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dental_insurances, public.procedure_catalog TO authenticated;
GRANT ALL ON public.dental_insurances, public.procedure_catalog TO service_role;

ALTER TABLE public.dental_insurances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedure_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dental_insurances_select_policy" ON public.dental_insurances;
CREATE POLICY "dental_insurances_select_policy"
  ON public.dental_insurances FOR SELECT TO authenticated
  USING (public.is_clinic_member(clinic_id));

DROP POLICY IF EXISTS "dental_insurances_write_policy" ON public.dental_insurances;
CREATE POLICY "dental_insurances_write_policy"
  ON public.dental_insurances FOR ALL TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'settings.manage'))
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'settings.manage'));

DROP POLICY IF EXISTS "procedure_catalog_select_policy" ON public.procedure_catalog;
CREATE POLICY "procedure_catalog_select_policy"
  ON public.procedure_catalog FOR SELECT TO authenticated
  USING (public.is_clinic_member(clinic_id));

DROP POLICY IF EXISTS "procedure_catalog_write_policy" ON public.procedure_catalog;
CREATE POLICY "procedure_catalog_write_policy"
  ON public.procedure_catalog FOR ALL TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'settings.manage'))
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'settings.manage'));

DROP TRIGGER IF EXISTS trg_audit_dental_insurances ON public.dental_insurances;
CREATE TRIGGER trg_audit_dental_insurances
  AFTER INSERT OR UPDATE OR DELETE ON public.dental_insurances
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS trg_audit_procedure_catalog ON public.procedure_catalog;
CREATE TRIGGER trg_audit_procedure_catalog
  AFTER INSERT OR UPDATE OR DELETE ON public.procedure_catalog
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- =============================================================================
-- PARTE 9 (0009): ANAMNESE DIGITAL ESTRUTURADA E ALERTAS DE RISCO CIRÚRGICO
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.patient_anamnesis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  asa_classification TEXT NOT NULL DEFAULT 'ASA I' CHECK (
    asa_classification IN ('ASA I', 'ASA II', 'ASA III', 'ASA IV')
  ),
  has_hypertension BOOLEAN NOT NULL DEFAULT FALSE,
  has_diabetes BOOLEAN NOT NULL DEFAULT FALSE,
  has_heart_disease BOOLEAN NOT NULL DEFAULT FALSE,
  uses_anticoagulants BOOLEAN NOT NULL DEFAULT FALSE,
  uses_bisphosphonates BOOLEAN NOT NULL DEFAULT FALSE,
  has_bleeding_disorder BOOLEAN NOT NULL DEFAULT FALSE,
  is_pregnant_or_lactating BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_local_anesthetic BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_penicillin BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_latex BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_nsaids BOOLEAN NOT NULL DEFAULT FALSE,
  other_allergies TEXT,
  current_medications TEXT,
  has_bruxism BOOLEAN NOT NULL DEFAULT FALSE,
  is_smoker BOOLEAN NOT NULL DEFAULT FALSE,
  blood_pressure_systolic SMALLINT CHECK (
    blood_pressure_systolic IS NULL OR (blood_pressure_systolic BETWEEN 60 AND 280)
  ),
  blood_pressure_diastolic SMALLINT CHECK (
    blood_pressure_diastolic IS NULL OR (blood_pressure_diastolic BETWEEN 30 AND 180)
  ),
  chief_complaint TEXT,
  clinical_observations TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_anamnesis_clinic_patient
  ON public.patient_anamnesis(clinic_id, patient_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_anamnesis TO authenticated;
GRANT ALL ON public.patient_anamnesis TO service_role;

ALTER TABLE public.patient_anamnesis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_anamnesis_select_policy" ON public.patient_anamnesis;
CREATE POLICY "patient_anamnesis_select_policy"
  ON public.patient_anamnesis FOR SELECT TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'records.read'));

DROP POLICY IF EXISTS "patient_anamnesis_write_policy" ON public.patient_anamnesis;
CREATE POLICY "patient_anamnesis_write_policy"
  ON public.patient_anamnesis FOR ALL TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'records.write'))
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'records.write'));

DROP TRIGGER IF EXISTS trg_audit_patient_anamnesis ON public.patient_anamnesis;
CREATE TRIGGER trg_audit_patient_anamnesis
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_anamnesis
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();


-- ============================================================================
-- PARTE 10: CONTROLE DE LABORATÓRIO DE PRÓTESE (0010)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.prosthetic_lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  laboratory_name TEXT NOT NULL,
  prosthesis_type TEXT NOT NULL,
  tooth_numbers TEXT,
  vita_shade TEXT,
  stage TEXT NOT NULL DEFAULT 'sent' CHECK (
    stage IN (
      'sent',
      'infrastructure_try_in',
      'teeth_try_in',
      'glaze_finish',
      'delivered_to_clinic',
      'installed_in_patient',
      'returned_adjustment'
    )
  ),
  sent_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  delivered_date DATE,
  lab_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (lab_cost >= 0),
  financial_entry_generated BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prosthetic_lab_orders_clinic_patient
  ON public.prosthetic_lab_orders (clinic_id, patient_id, due_date DESC);

CREATE INDEX IF NOT EXISTS idx_prosthetic_lab_orders_clinic_stage
  ON public.prosthetic_lab_orders (clinic_id, stage, due_date ASC);

ALTER TABLE public.prosthetic_lab_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prosthetic_lab_orders_select" ON public.prosthetic_lab_orders;
CREATE POLICY "prosthetic_lab_orders_select" ON public.prosthetic_lab_orders
  FOR SELECT TO authenticated
  USING (public.user_has_permission(clinic_id, 'records.read'));

DROP POLICY IF EXISTS "prosthetic_lab_orders_insert" ON public.prosthetic_lab_orders;
CREATE POLICY "prosthetic_lab_orders_insert" ON public.prosthetic_lab_orders
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(clinic_id, 'records.write'));

DROP POLICY IF EXISTS "prosthetic_lab_orders_update" ON public.prosthetic_lab_orders;
CREATE POLICY "prosthetic_lab_orders_update" ON public.prosthetic_lab_orders
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(clinic_id, 'records.write'))
  WITH CHECK (public.user_has_permission(clinic_id, 'records.write'));

DROP POLICY IF EXISTS "prosthetic_lab_orders_delete" ON public.prosthetic_lab_orders;
CREATE POLICY "prosthetic_lab_orders_delete" ON public.prosthetic_lab_orders
  FOR DELETE TO authenticated
  USING (public.user_has_permission(clinic_id, 'records.write'));

DROP TRIGGER IF EXISTS trg_audit_prosthetic_lab_orders ON public.prosthetic_lab_orders;
CREATE TRIGGER trg_audit_prosthetic_lab_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.prosthetic_lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prosthetic_lab_orders TO authenticated;


-- ============================================================================
-- PARTE 11: SUPERADMIN / DESENVOLVEDOR & GESTÃO SAAS (0011)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_superadmins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.saas_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  monthly_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  yearly_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  max_professionals INT NOT NULL DEFAULT 1,
  max_units INT NOT NULL DEFAULT 1,
  whatsapp_included BOOLEAN NOT NULL DEFAULT FALSE,
  storage_limit_mb INT NOT NULL DEFAULT 1000,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.saas_plans (id, name, description, monthly_price, yearly_price, max_professionals, max_units, whatsapp_included, storage_limit_mb)
VALUES
  ('starter', 'SondaPro Starter', 'Ideal para consultórios individuais e dentistas autônomos.', 149.00, 1490.00, 1, 1, false, 2000),
  ('pro', 'SondaPro Pro', 'Para clínicas em crescimento com equipe e múltiplos consultórios.', 299.00, 2990.00, 5, 2, true, 10000),
  ('corporate', 'SondaPro Corporate', 'Para redes de clínicas, franquias e policlínicas odontológicas.', 599.00, 5990.00, 999, 10, true, 50000)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price = EXCLUDED.monthly_price,
  yearly_price = EXCLUDED.yearly_price,
  max_professionals = EXCLUDED.max_professionals,
  max_units = EXCLUDED.max_units,
  whatsapp_included = EXCLUDED.whatsapp_included,
  storage_limit_mb = EXCLUDED.storage_limit_mb;

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES public.saas_plans(id) DEFAULT 'pro',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');

CREATE OR REPLACE FUNCTION public.is_platform_superadmin(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = user_uuid
      AND lower(u.email) = 'jonathastdsantos@gmail.com'
  )
  OR EXISTS (
    SELECT 1 FROM public.platform_superadmins sa
    WHERE sa.user_id = user_uuid
      AND sa.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_superadmin_user_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF lower(new.email) = 'jonathastdsantos@gmail.com' THEN
    INSERT INTO public.platform_superadmins (user_id, email, is_active)
    VALUES (new.id, lower(new.email), TRUE)
    ON CONFLICT (email) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      is_active = TRUE;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_superadmin_user_sync ON auth.users;
CREATE TRIGGER trg_superadmin_user_sync
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_superadmin_user_sync();

ALTER TABLE public.platform_superadmins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_superadmins_select" ON public.platform_superadmins;
CREATE POLICY "platform_superadmins_select" ON public.platform_superadmins
  FOR SELECT TO authenticated
  USING (public.is_platform_superadmin());

DROP POLICY IF EXISTS "platform_superadmins_all" ON public.platform_superadmins;
CREATE POLICY "platform_superadmins_all" ON public.platform_superadmins
  FOR ALL TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

DROP POLICY IF EXISTS "saas_plans_read" ON public.saas_plans;
CREATE POLICY "saas_plans_read" ON public.saas_plans
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "saas_plans_write" ON public.saas_plans;
CREATE POLICY "saas_plans_write" ON public.saas_plans
  FOR ALL TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

DROP POLICY IF EXISTS "superadmin_all_clinics" ON public.clinics;
CREATE POLICY "superadmin_all_clinics" ON public.clinics
  FOR ALL TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

DROP POLICY IF EXISTS "superadmin_all_members" ON public.clinic_members;
CREATE POLICY "superadmin_all_members" ON public.clinic_members
  FOR ALL TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_superadmins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_plans TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_superadmin TO authenticated;


-- ============================================================================
-- PARTE 12: GUIAS TISS / FATURAMENTO DE CONVÊNIOS ODONTOLÓGICOS (0012)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tiss_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  insurance_id UUID REFERENCES public.dental_insurances(id) ON DELETE SET NULL,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  guide_number TEXT NOT NULL,
  auth_code TEXT,
  guide_type TEXT NOT NULL DEFAULT 'treatment' CHECK (guide_type IN ('treatment', 'initial_exam', 'urgency')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'authorized', 'billed', 'paid', 'glosed', 'cancelled')
  ),
  card_number TEXT NOT NULL,
  card_expiration DATE,
  cns_number TEXT,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  billed_date DATE,
  paid_date DATE,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  glosed_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (glosed_amount >= 0),
  notes TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tiss_guide_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  guide_id UUID NOT NULL REFERENCES public.tiss_guides(id) ON DELETE CASCADE,
  tuss_code TEXT NOT NULL,
  description TEXT NOT NULL,
  tooth_number INT,
  tooth_surface TEXT,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  glosed BOOLEAN NOT NULL DEFAULT FALSE,
  glosa_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiss_guides_clinic_status
  ON public.tiss_guides (clinic_id, status, issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_tiss_guides_patient
  ON public.tiss_guides (clinic_id, patient_id);

CREATE INDEX IF NOT EXISTS idx_tiss_guide_items_guide
  ON public.tiss_guide_items (guide_id);

ALTER TABLE public.tiss_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiss_guide_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tiss_guides_select" ON public.tiss_guides;
CREATE POLICY "tiss_guides_select" ON public.tiss_guides
  FOR SELECT TO authenticated
  USING (public.user_has_permission(clinic_id, 'financial.view'));

DROP POLICY IF EXISTS "tiss_guides_insert" ON public.tiss_guides;
CREATE POLICY "tiss_guides_insert" ON public.tiss_guides
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(clinic_id, 'financial.write'));

DROP POLICY IF EXISTS "tiss_guides_update" ON public.tiss_guides;
CREATE POLICY "tiss_guides_update" ON public.tiss_guides
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(clinic_id, 'financial.write'))
  WITH CHECK (public.user_has_permission(clinic_id, 'financial.write'));

DROP POLICY IF EXISTS "tiss_guides_delete" ON public.tiss_guides;
CREATE POLICY "tiss_guides_delete" ON public.tiss_guides
  FOR DELETE TO authenticated
  USING (public.user_has_permission(clinic_id, 'financial.write'));

DROP POLICY IF EXISTS "tiss_guide_items_select" ON public.tiss_guide_items;
CREATE POLICY "tiss_guide_items_select" ON public.tiss_guide_items
  FOR SELECT TO authenticated
  USING (public.user_has_permission(clinic_id, 'financial.view'));

DROP POLICY IF EXISTS "tiss_guide_items_insert" ON public.tiss_guide_items;
CREATE POLICY "tiss_guide_items_insert" ON public.tiss_guide_items
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(clinic_id, 'financial.write'));

DROP POLICY IF EXISTS "tiss_guide_items_update" ON public.tiss_guide_items;
CREATE POLICY "tiss_guide_items_update" ON public.tiss_guide_items
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(clinic_id, 'financial.write'))
  WITH CHECK (public.user_has_permission(clinic_id, 'financial.write'));

DROP POLICY IF EXISTS "tiss_guide_items_delete" ON public.tiss_guide_items;
CREATE POLICY "tiss_guide_items_delete" ON public.tiss_guide_items
  FOR DELETE TO authenticated
  USING (public.user_has_permission(clinic_id, 'financial.write'));

DROP TRIGGER IF EXISTS trg_audit_tiss_guides ON public.tiss_guides;
CREATE TRIGGER trg_audit_tiss_guides
  AFTER INSERT OR UPDATE OR DELETE ON public.tiss_guides
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiss_guides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiss_guide_items TO authenticated;


-- ============================================================================
-- PARTE 13: PORTAL DO PACIENTE / CONFIRMAÇÃO DE CONSULTA PÚBLICA (0013)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.appointment_confirmation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  confirmed_at TIMESTAMPTZ,
  patient_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appt_tokens_lookup
  ON public.appointment_confirmation_tokens (token);

CREATE INDEX IF NOT EXISTS idx_appt_tokens_appointment
  ON public.appointment_confirmation_tokens (appointment_id);

ALTER TABLE public.appointment_confirmation_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appt_tokens_clinic_select" ON public.appointment_confirmation_tokens;
CREATE POLICY "appt_tokens_clinic_select" ON public.appointment_confirmation_tokens
  FOR SELECT TO authenticated
  USING (public.user_has_permission(clinic_id, 'appointments.read'));

DROP POLICY IF EXISTS "appt_tokens_clinic_write" ON public.appointment_confirmation_tokens;
CREATE POLICY "appt_tokens_clinic_write" ON public.appointment_confirmation_tokens
  FOR ALL TO authenticated
  USING (public.user_has_permission(clinic_id, 'appointments.write'))
  WITH CHECK (public.user_has_permission(clinic_id, 'appointments.write'));

CREATE OR REPLACE FUNCTION public.get_public_appointment_by_token(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  SELECT 
    t.id AS token_id,
    t.token,
    t.status AS token_status,
    t.expires_at,
    a.id AS appointment_id,
    a.starts_at,
    a.ends_at,
    a.status AS appointment_status,
    a.procedure,
    p.full_name AS patient_name,
    c.name AS clinic_name,
    c.phone AS clinic_phone,
    u.name AS unit_name,
    u.address AS unit_address,
    pr.name AS professional_name
  INTO rec
  FROM public.appointment_confirmation_tokens t
  JOIN public.appointments a ON a.id = t.appointment_id
  JOIN public.clinics c ON c.id = t.clinic_id
  JOIN public.patients p ON p.id = a.patient_id
  LEFT JOIN public.clinic_units u ON u.id = a.unit_id
  LEFT JOIN public.professionals pr ON pr.id = a.professional_id
  WHERE t.token = _token
    AND t.expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Token de confirmação inválido ou expirado.');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'token', rec.token,
    'token_status', rec.token_status,
    'appointment_id', rec.appointment_id,
    'starts_at', rec.starts_at,
    'ends_at', rec.ends_at,
    'appointment_status', rec.appointment_status,
    'procedure', rec.procedure,
    'patient_name', rec.patient_name,
    'clinic_name', rec.clinic_name,
    'clinic_phone', rec.clinic_phone,
    'unit_name', rec.unit_name,
    'unit_address', rec.unit_address,
    'professional_name', rec.professional_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_public_appointment_confirmation(
  _token TEXT,
  _action TEXT,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_id UUID;
  v_appt_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT id, appointment_id, expires_at
  INTO v_token_id, v_appt_id, v_expires_at
  FROM public.appointment_confirmation_tokens
  WHERE token = _token;

  IF NOT FOUND OR v_expires_at <= NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Link de confirmação inválido ou expirado.');
  END IF;

  IF _action = 'confirm' THEN
    UPDATE public.appointment_confirmation_tokens
    SET status = 'confirmed',
        confirmed_at = NOW(),
        patient_notes = _notes
    WHERE id = v_token_id;

    UPDATE public.appointments
    SET status = 'confirmed'
    WHERE id = v_appt_id;

    RETURN jsonb_build_object('success', true, 'status', 'confirmed', 'message', 'Presença confirmada com sucesso!');

  ELSIF _action = 'cancel' THEN
    UPDATE public.appointment_confirmation_tokens
    SET status = 'cancelled',
        confirmed_at = NOW(),
        patient_notes = _notes
    WHERE id = v_token_id;

    UPDATE public.appointments
    SET status = 'cancelled',
        notes = COALESCE(notes, '') || E'\n[Cancelado pelo paciente via link WhatsApp: ' || COALESCE(_notes, 'Sem justificativa') || ']'
    WHERE id = v_appt_id;

    RETURN jsonb_build_object('success', true, 'status', 'cancelled', 'message', 'Cancelamento registrado. Entraremos em contato para reagendar.');

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Ação inválida.');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_appointment_by_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_public_appointment_confirmation(TEXT, TEXT, TEXT) TO anon, authenticated;


-- ============================================================================
-- PARTE 14: SUPERADMIN EXPANDIDO / CONSOLE DE DESENVOLVEDOR (0014)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_clinic_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_notes_clinic
  ON public.platform_clinic_notes (clinic_id, created_at DESC);

ALTER TABLE public.platform_clinic_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_notes_superadmin" ON public.platform_clinic_notes;
CREATE POLICY "platform_notes_superadmin" ON public.platform_clinic_notes
  FOR ALL TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

CREATE TABLE IF NOT EXISTS public.platform_superadmin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_superadmin_audit_logs
  ON public.platform_superadmin_audit_logs (created_at DESC);

ALTER TABLE public.platform_superadmin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_audit_superadmin" ON public.platform_superadmin_audit_logs;
CREATE POLICY "platform_audit_superadmin" ON public.platform_superadmin_audit_logs
  FOR ALL TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

CREATE TABLE IF NOT EXISTS public.platform_broadcast_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent', 'maintenance')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.platform_broadcast_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_announcements_superadmin" ON public.platform_broadcast_announcements;
CREATE POLICY "platform_announcements_superadmin" ON public.platform_broadcast_announcements
  FOR ALL TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

DROP POLICY IF EXISTS "platform_announcements_clinic_read" ON public.platform_broadcast_announcements;
CREATE POLICY "platform_announcements_clinic_read" ON public.platform_broadcast_announcements
  FOR SELECT TO authenticated
  USING (target_clinic_id IS NULL OR public.user_has_permission(target_clinic_id, 'dashboard.view'));

CREATE OR REPLACE FUNCTION public.get_superadmin_clinics_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_superadmin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas o desenvolvedor master pode acessar.';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'cnpj', c.cnpj,
      'phone', c.phone,
      'email', c.email,
      'address', c.address,
      'plan_id', COALESCE(c.plan_id, 'pro'),
      'subscription_status', COALESCE(c.subscription_status, 'active'),
      'trial_ends_at', c.trial_ends_at,
      'current_period_end', c.current_period_end,
      'created_at', c.created_at,
      'plan_name', COALESCE(p.name, 'SondaPro Pro'),
      'monthly_price', COALESCE(p.monthly_price, 299.00),
      'owner_name', (
        SELECT prof.full_name
        FROM public.clinic_members cm
        JOIN public.profiles prof ON prof.id = cm.user_id
        WHERE cm.clinic_id = c.id AND cm.role = 'owner'
        LIMIT 1
      ),
      'owner_email', (
        SELECT u.email
        FROM public.clinic_members cm
        JOIN auth.users u ON u.id = cm.user_id
        WHERE cm.clinic_id = c.id AND cm.role = 'owner'
        LIMIT 1
      ),
      'patients_count', (SELECT COUNT(*) FROM public.patients WHERE clinic_id = c.id),
      'appointments_month_count', (
        SELECT COUNT(*) FROM public.appointments 
        WHERE clinic_id = c.id 
          AND starts_at >= date_trunc('month', NOW())
      ),
      'members_count', (SELECT COUNT(*) FROM public.clinic_members WHERE clinic_id = c.id),
      'dentists_count', (SELECT COUNT(*) FROM public.professionals WHERE clinic_id = c.id AND active = true),
      'last_appointment_at', (
        SELECT MAX(starts_at) FROM public.appointments WHERE clinic_id = c.id
      ),
      'exam_files_count', (SELECT COUNT(*) FROM public.patient_exam_files WHERE clinic_id = c.id),
      'exam_storage_bytes', (
        SELECT COALESCE(SUM(file_size_bytes), 0) FROM public.patient_exam_files WHERE clinic_id = c.id
      )
    ) ORDER BY c.created_at DESC
  ) INTO v_result
  FROM public.clinics c
  LEFT JOIN public.saas_plans p ON p.id = c.plan_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_create_clinic(
  _name TEXT,
  _plan_id TEXT,
  _subscription_status TEXT,
  _owner_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clinic_id UUID;
  v_user_id UUID;
BEGIN
  IF NOT public.is_platform_superadmin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas o desenvolvedor master pode criar clínicas.';
  END IF;

  INSERT INTO public.clinics (name, plan_id, subscription_status)
  VALUES (_name, _plan_id, _subscription_status)
  RETURNING id INTO v_clinic_id;

  IF _owner_email IS NOT NULL AND _owner_email <> '' THEN
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(_owner_email) LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.clinic_members (clinic_id, user_id, role)
      VALUES (v_clinic_id, v_user_id, 'owner')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.platform_superadmin_audit_logs (admin_email, action, target_clinic_id, details)
  VALUES (
    auth.jwt()->>'email',
    'create_clinic',
    v_clinic_id,
    jsonb_build_object('name', _name, 'plan_id', _plan_id, 'status', _subscription_status, 'owner_email', _owner_email)
  );

  RETURN jsonb_build_object('success', true, 'clinic_id', v_clinic_id);
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_clinic_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_superadmin_audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_broadcast_announcements TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_superadmin_clinics_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_create_clinic(TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ============================================================================
-- PARTE 15: FATURAMENTO DIRETO CARTÃO / PIX PARA ASSINATURA SAAS (0015)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.saas_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.saas_plans(id),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  payment_method TEXT NOT NULL DEFAULT 'pix' CHECK (payment_method IN ('pix', 'credit_card', 'bank_slip')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  pix_code TEXT,
  pix_qr_code_url TEXT,
  gateway_payment_id TEXT,
  card_last4 TEXT,
  card_brand TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_invoices_clinic
  ON public.saas_invoices (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saas_invoices_status
  ON public.saas_invoices (status, due_date ASC);

ALTER TABLE public.saas_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saas_invoices_clinic_select" ON public.saas_invoices;
CREATE POLICY "saas_invoices_clinic_select" ON public.saas_invoices
  FOR SELECT TO authenticated
  USING (
    public.user_has_permission(clinic_id, 'settings.manage')
    OR public.is_platform_superadmin()
  );

DROP POLICY IF EXISTS "saas_invoices_clinic_insert" ON public.saas_invoices;
CREATE POLICY "saas_invoices_clinic_insert" ON public.saas_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_permission(clinic_id, 'settings.manage')
    OR public.is_platform_superadmin()
  );

DROP POLICY IF EXISTS "saas_invoices_clinic_update" ON public.saas_invoices;
CREATE POLICY "saas_invoices_clinic_update" ON public.saas_invoices
  FOR UPDATE TO authenticated
  USING (
    public.user_has_permission(clinic_id, 'settings.manage')
    OR public.is_platform_superadmin()
  )
  WITH CHECK (
    public.user_has_permission(clinic_id, 'settings.manage')
    OR public.is_platform_superadmin()
  );

CREATE OR REPLACE FUNCTION public.pay_saas_invoice(
  _invoice_id UUID,
  _payment_method TEXT,
  _card_last4 TEXT DEFAULT NULL,
  _card_brand TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_inv RECORD;
  v_interval INTERVAL;
BEGIN
  SELECT id, clinic_id, plan_id, billing_cycle, amount, status
  INTO v_inv
  FROM public.saas_invoices
  WHERE id = _invoice_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fatura não encontrada.');
  END IF;

  IF v_inv.status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Esta fatura já foi paga anteriormente.');
  END IF;

  IF v_inv.billing_cycle = 'yearly' THEN
    v_interval := INTERVAL '1 year';
  ELSE
    v_interval := INTERVAL '30 days';
  END IF;

  UPDATE public.saas_invoices
  SET status = 'paid',
      paid_at = NOW(),
      payment_method = _payment_method,
      card_last4 = _card_last4,
      card_brand = _card_brand,
      updated_at = NOW()
  WHERE id = _invoice_id;

  UPDATE public.clinics
  SET plan_id = v_inv.plan_id,
      subscription_status = 'active',
      current_period_end = NOW() + v_interval
  WHERE id = v_inv.clinic_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Fatura liquidada com sucesso! Seu plano foi ativado/renovado.',
    'plan_id', v_inv.plan_id,
    'new_status', 'active'
  );
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.saas_invoices TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_saas_invoice(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- PARTE 16: PRONTUÁRIO ODONTOPEDIÁTRICO ESPECIALIZADO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pediatric_dental_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  dentition_stage TEXT NOT NULL DEFAULT 'deciduous' CHECK (dentition_stage IN ('deciduous', 'mixed', 'permanent')),
  pacifier_habit JSONB NOT NULL DEFAULT '{"active": false, "frequency": "none", "duration_years": 0}'::jsonb,
  thumb_sucking_habit JSONB NOT NULL DEFAULT '{"active": false, "frequency": "none", "duration_years": 0}'::jsonb,
  bottle_feeding_habit JSONB NOT NULL DEFAULT '{"active": false, "sleep_bottle": false, "sweetened": false}'::jsonb,
  mouth_breathing BOOLEAN NOT NULL DEFAULT FALSE,
  bruxism BOOLEAN NOT NULL DEFAULT FALSE,
  atypical_swallowing BOOLEAN NOT NULL DEFAULT FALSE,
  brushing_frequency_daily INT NOT NULL DEFAULT 2,
  fluoride_ppm INT NOT NULL DEFAULT 1100,
  toothpaste_amount TEXT NOT NULL DEFAULT 'rice_grain' CHECK (toothpaste_amount IN ('rice_grain', 'pea_size', 'standard')),
  floss_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (floss_frequency IN ('never', 'rarely', 'weekly', 'daily')),
  sugar_intake_frequency TEXT NOT NULL DEFAULT 'low' CHECK (sugar_intake_frequency IN ('low', 'moderate', 'high')),
  caries_risk_level TEXT NOT NULL DEFAULT 'low' CHECK (caries_risk_level IN ('low', 'moderate', 'high')),
  clinical_notes TEXT,
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pediatric_assessments_patient
  ON public.pediatric_dental_assessments (patient_id, assessment_date DESC);

CREATE INDEX IF NOT EXISTS idx_pediatric_assessments_clinic
  ON public.pediatric_dental_assessments (clinic_id);

ALTER TABLE public.pediatric_dental_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pediatric_assessments_select" ON public.pediatric_dental_assessments;
CREATE POLICY "pediatric_assessments_select" ON public.pediatric_dental_assessments
  FOR SELECT TO authenticated
  USING (
    public.user_has_permission(clinic_id, 'records.read')
    OR public.is_platform_superadmin()
  );

DROP POLICY IF EXISTS "pediatric_assessments_insert" ON public.pediatric_dental_assessments;
CREATE POLICY "pediatric_assessments_insert" ON public.pediatric_dental_assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_permission(clinic_id, 'records.write')
    OR public.is_platform_superadmin()
  );

DROP POLICY IF EXISTS "pediatric_assessments_update" ON public.pediatric_dental_assessments;
CREATE POLICY "pediatric_assessments_update" ON public.pediatric_dental_assessments
  FOR UPDATE TO authenticated
  USING (
    public.user_has_permission(clinic_id, 'records.write')
    OR public.is_platform_superadmin()
  )
  WITH CHECK (
    public.user_has_permission(clinic_id, 'records.write')
    OR public.is_platform_superadmin()
  );

DROP POLICY IF EXISTS "pediatric_assessments_delete" ON public.pediatric_dental_assessments;
CREATE POLICY "pediatric_assessments_delete" ON public.pediatric_dental_assessments
  FOR DELETE TO authenticated
  USING (
    public.user_has_permission(clinic_id, 'records.write')
    OR public.is_platform_superadmin()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pediatric_dental_assessments TO authenticated;

-- ============================================================================
-- PARTE 17: PAINEL DE CHAMADA EM SALA DE ESPERA (TV / TOTEM)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.waiting_room_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.clinic_units(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  professional_name TEXT NOT NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  room_name TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'priority', 'urgent')),
  status TEXT NOT NULL DEFAULT 'called' CHECK (status IN ('called', 'in_attendance', 'completed', 'cancelled')),
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waiting_room_calls_clinic_time
  ON public.waiting_room_calls (clinic_id, called_at DESC);

CREATE INDEX IF NOT EXISTS idx_waiting_room_calls_status
  ON public.waiting_room_calls (clinic_id, status);

ALTER TABLE public.waiting_room_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waiting_room_calls_select" ON public.waiting_room_calls;
CREATE POLICY "waiting_room_calls_select" ON public.waiting_room_calls
  FOR SELECT
  USING (
    public.user_has_permission(clinic_id, 'appointments.read')
    OR public.is_platform_superadmin()
    OR auth.role() = 'anon'
  );

DROP POLICY IF EXISTS "waiting_room_calls_insert" ON public.waiting_room_calls;
CREATE POLICY "waiting_room_calls_insert" ON public.waiting_room_calls
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_permission(clinic_id, 'appointments.write')
    OR public.is_platform_superadmin()
  );

DROP POLICY IF EXISTS "waiting_room_calls_update" ON public.waiting_room_calls;
CREATE POLICY "waiting_room_calls_update" ON public.waiting_room_calls
  FOR UPDATE TO authenticated
  USING (
    public.user_has_permission(clinic_id, 'appointments.write')
    OR public.is_platform_superadmin()
  )
  WITH CHECK (
    public.user_has_permission(clinic_id, 'appointments.write')
    OR public.is_platform_superadmin()
  );

DROP POLICY IF EXISTS "waiting_room_calls_delete" ON public.waiting_room_calls;
CREATE POLICY "waiting_room_calls_delete" ON public.waiting_room_calls
  FOR DELETE TO authenticated
  USING (
    public.user_has_permission(clinic_id, 'appointments.write')
    OR public.is_platform_superadmin()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waiting_room_calls TO authenticated;
GRANT SELECT ON public.waiting_room_calls TO anon;

-- ============================================================================
-- PARTE 18: WEBHOOKS REAIS DE GATEWAY DE PAGAMENTO (ASAAS / MERCADO PAGO)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway TEXT NOT NULL CHECK (gateway IN ('asaas', 'mercadopago', 'stripe')),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  external_reference TEXT,
  invoice_id UUID REFERENCES public.saas_invoices(id) ON DELETE SET NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_gateway_status
  ON public.payment_webhook_events (gateway, event_type, processed);

CREATE INDEX IF NOT EXISTS idx_webhook_events_ext_ref
  ON public.payment_webhook_events (external_reference);

CREATE INDEX IF NOT EXISTS idx_webhook_events_created
  ON public.payment_webhook_events (created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_gateway_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  asaas_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  asaas_environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (asaas_environment IN ('sandbox', 'production')),
  asaas_api_key TEXT,
  asaas_webhook_token TEXT,
  mercadopago_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  mercadopago_environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (mercadopago_environment IN ('sandbox', 'production')),
  mercadopago_access_token TEXT,
  mercadopago_webhook_secret TEXT,
  stripe_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_secret_key TEXT,
  stripe_webhook_secret TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.platform_gateway_settings (id, asaas_enabled, mercadopago_enabled)
VALUES ('default', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_gateway_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_events_select" ON public.payment_webhook_events;
CREATE POLICY "webhook_events_select" ON public.payment_webhook_events
  FOR SELECT TO authenticated
  USING (public.is_platform_superadmin());

DROP POLICY IF EXISTS "webhook_events_insert_all" ON public.payment_webhook_events;
CREATE POLICY "webhook_events_insert_all" ON public.payment_webhook_events
  FOR INSERT
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "webhook_events_update" ON public.payment_webhook_events;
CREATE POLICY "webhook_events_update" ON public.payment_webhook_events
  FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "gateway_settings_select" ON public.platform_gateway_settings;
CREATE POLICY "gateway_settings_select" ON public.platform_gateway_settings
  FOR SELECT TO authenticated
  USING (public.is_platform_superadmin());

DROP POLICY IF EXISTS "gateway_settings_update" ON public.platform_gateway_settings;
CREATE POLICY "gateway_settings_update" ON public.platform_gateway_settings
  FOR UPDATE TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

GRANT SELECT, INSERT, UPDATE ON public.payment_webhook_events TO authenticated, anon;
GRANT SELECT, UPDATE ON public.platform_gateway_settings TO authenticated;

-- ============================================================================
-- PARTE 19: ASSINATURA ELETRÔNICA TOUCH DE TERMOS E CONTRATOS (LEI 14.063/2020)
-- Permite coleta de assinaturas digitais na tela/tablet com integridade criptográfica SHA-256
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_electronic_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('tcle', 'contract', 'certificate', 'treatment_plan', 'prescription', 'other')),
  document_title text NOT NULL,
  document_content text NOT NULL,
  document_hash text NOT NULL,
  signer_name text NOT NULL,
  signer_cpf text NOT NULL,
  signer_role text NOT NULL DEFAULT 'patient' CHECK (signer_role IN ('patient', 'legal_guardian', 'representative', 'dentist')),
  signer_email text,
  signer_phone text,
  signature_data_url text NOT NULL,
  ip_address text,
  user_agent text,
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'revoked')),
  revocation_reason text,
  revoked_at timestamptz,
  signed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signatures_clinic_patient
  ON public.patient_electronic_signatures (clinic_id, patient_id);

CREATE INDEX IF NOT EXISTS idx_signatures_hash
  ON public.patient_electronic_signatures (document_hash);

CREATE INDEX IF NOT EXISTS idx_signatures_signed_at
  ON public.patient_electronic_signatures (clinic_id, signed_at DESC);

ALTER TABLE public.patient_electronic_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signatures_select_policy" ON public.patient_electronic_signatures
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

CREATE POLICY "signatures_insert_policy" ON public.patient_electronic_signatures
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

CREATE POLICY "signatures_update_policy" ON public.patient_electronic_signatures
  FOR UPDATE USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

GRANT SELECT, INSERT, UPDATE ON public.patient_electronic_signatures TO authenticated;
GRANT SELECT ON public.patient_electronic_signatures TO anon;




