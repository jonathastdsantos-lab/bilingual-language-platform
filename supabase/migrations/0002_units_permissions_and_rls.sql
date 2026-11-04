-- =============================================================================
-- MIGRATION 0002: UNIDADES DA CLÍNICA, PERMISSÕES INDIVIDUAIS E AUDITORIA EXPANDIDA
-- =============================================================================

-- 1. Metadados adicionais da clínica (CNPJ, telefone, fuso horário padrão America/Sao_Paulo)
alter table public.clinics
  add column if not exists cnpj text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists timezone text not null default 'America/Sao_Paulo';

-- 2. Cadastro de Unidades (Matriz / Filiais) por Clínica
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

-- Vínculo opcional de consultórios e agendamentos com uma unidade específica
alter table public.rooms
  add column if not exists unit_id uuid references public.clinic_units(id) on delete set null;

alter table public.appointments
  add column if not exists unit_id uuid references public.clinic_units(id) on delete set null;

-- 3. Permissões Individuais por Membro da Clínica (sobreposição granular ao perfil)
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

-- 4. Função de Verificação de Permissão Híbrida (RBAC + Permissão Individual Granular)
-- Proprietário (owner) e Administrador (admin) mantêm acesso total de gestão;
-- demais membros podem receber concessão (granted = true) ou revogação (granted = false) individual.
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

-- 5. Políticas RLS para Unidades e Permissões Individuais
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

-- Atualiza políticas de pacientes e agendamentos para suportar permissões individuais
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

-- 6. Atualiza `create_clinic` para criar automaticamente a Unidade Matriz padrão
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

-- Garante que clínicas já existentes tenham ao menos uma Unidade Matriz
insert into public.clinic_units (clinic_id, name, is_main, active)
select c.id, 'Unidade Matriz', true, true
from public.clinics c
where not exists (
  select 1 from public.clinic_units u where u.clinic_id = c.id
);

-- 7. Triggers de Auditoria adicionais para Unidades, Profissionais, Consultórios e Permissões
drop trigger if exists audit_units on public.clinic_units;
create trigger audit_units after insert or update or delete on public.clinic_units for each row execute function public.log_audit();

drop trigger if exists audit_professionals on public.professionals;
create trigger audit_professionals after insert or update or delete on public.professionals for each row execute function public.log_audit();

drop trigger if exists audit_rooms on public.rooms;
create trigger audit_rooms after insert or update or delete on public.rooms for each row execute function public.log_audit();

drop trigger if exists audit_member_permissions on public.clinic_member_permissions;
create trigger audit_member_permissions after insert or update or delete on public.clinic_member_permissions for each row execute function public.log_audit();

