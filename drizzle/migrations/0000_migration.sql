create extension if not exists btree_gist;

create type public.clinic_role as enum ('owner','admin','dentist','receptionist','assistant','finance','stock');
create type public.appointment_status as enum ('scheduled','confirmed','completed','cancelled','no_show');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  locale text not null default 'pt',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_at timestamptz not null default now()
);
create table public.clinic_members (
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
create policy "members read clinic" on public.clinics for select to authenticated using (public.is_clinic_member(id));
create policy "owner update clinic" on public.clinics for update to authenticated using (public.has_clinic_role(id, array['owner','admin']::public.clinic_role[]));
create policy "members read members" on public.clinic_members for select to authenticated using (public.is_clinic_member(clinic_id));
create policy "admins update members" on public.clinic_members for update to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]) and role <> 'owner');
create policy "admins delete members" on public.clinic_members for delete to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]) and role <> 'owner');

create or replace function public.create_clinic(_name text) returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; uemail text; uname text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into clinics(name) values (_name) returning id into cid;
  select email into uemail from auth.users where id = auth.uid();
  select full_name into uname from profiles where id = auth.uid();
  insert into clinic_members(clinic_id,user_id,role,display_name,email) values (cid, auth.uid(), 'owner', uname, uemail);
  return cid;
end $$;

-- add existing user by email
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

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  specialty text,
  color text not null default '#1e6bff',
  commission_pct numeric(5,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create table public.patients (
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
create table public.appointments (
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
create table public.audit_logs (
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

create policy "read" on public.professionals for select to authenticated using (public.is_clinic_member(clinic_id));
create policy "write" on public.professionals for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));
create policy "read" on public.rooms for select to authenticated using (public.is_clinic_member(clinic_id));
create policy "write" on public.rooms for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));
create policy "read" on public.patients for select to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','dentist','receptionist','assistant','finance']::public.clinic_role[]));
create policy "write" on public.patients for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','dentist','receptionist']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin','dentist','receptionist']::public.clinic_role[]));
create policy "read" on public.appointments for select to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','dentist','receptionist','assistant','finance']::public.clinic_role[]));
create policy "write" on public.appointments for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','dentist','receptionist']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin','dentist','receptionist']::public.clinic_role[]));
create policy "read" on public.audit_logs for select to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));

create or replace function public.log_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  r := coalesce(new, old);
  insert into audit_logs(clinic_id,user_id,action,entity,entity_id) values (r.clinic_id, auth.uid(), lower(tg_op), tg_table_name, r.id);
  return coalesce(new, old);
end $$;
create trigger audit_patients after insert or update or delete on public.patients for each row execute function public.log_audit();
create trigger audit_appointments after insert or update or delete on public.appointments for each row execute function public.log_audit();
create trigger audit_members after insert or update or delete on public.clinic_members for each row execute function public.log_audit();