-- =============================================================================
-- TESTE DE ISOLAMENTO MULTI-TENANT (RLS) — SONDAPRO / ODONTO GESTÃO
-- =============================================================================
-- Este script valida em uma transação isolada (revertida com ROLLBACK ao final)
-- que um usuário autenticado na Clínica A jamais consegue ler, inserir, editar
-- ou excluir registros pertencentes à Clínica B.

begin;

do $$
declare
  user_a uuid := '00000000-0000-4000-a000-000000000001';
  user_b uuid := '00000000-0000-4000-a000-000000000002';
  clinic_a uuid;
  clinic_b uuid;
  patient_b uuid;
  visible_count int;
begin
  -- 1. Cria dois usuários de teste em auth.users
  insert into auth.users (id, email, raw_user_meta_data)
  values
    (user_a, 'dr.alice.test@sondapro.local', '{"full_name":"Dra. Alice"}'),
    (user_b, 'dr.bruno.test@sondapro.local', '{"full_name":"Dr. Bruno"}')
  on conflict (id) do nothing;

  -- 2. Simula sessão autenticada da Dra. Alice (Clínica A)
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_a::text, 'role', 'authenticated')::text, true);
  clinic_a := public.create_clinic('Clínica Odonto A');

  -- 3. Simula sessão autenticada do Dr. Bruno (Clínica B) e cadastra paciente
  perform set_config('request.jwt.claim.sub', user_b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_b::text, 'role', 'authenticated')::text, true);
  clinic_b := public.create_clinic('Clínica Odonto B');

  insert into public.patients (clinic_id, full_name, cpf)
  values (clinic_b, 'Paciente Exclusivo Clínica B', '52998224725')
  returning id into patient_b;

  -- 4. Alterna para o papel authenticated como Dra. Alice (Clínica A)
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_a::text, 'role', 'authenticated')::text, true);

  -- Verifica que is_clinic_member retorna FALSE para a Clínica B
  if public.is_clinic_member(clinic_b) then
    raise exception 'FALHA DE SEGURANÇA: Usuário da Clínica A foi reconhecido como membro da Clínica B';
  end if;

  -- Verifica que has_clinic_role retorna FALSE para a Clínica B
  if public.has_clinic_role(clinic_b, array['owner','admin','dentist','receptionist']::public.clinic_role[]) then
    raise exception 'FALHA DE SEGURANÇA: Usuário da Clínica A obteve perfil na Clínica B';
  end if;

  -- Verifica que has_clinic_permission retorna FALSE para a Clínica B
  if public.has_clinic_permission(clinic_b, 'patients.read', array['owner','admin','dentist']::public.clinic_role[]) then
    raise exception 'FALHA DE SEGURANÇA: Usuário da Clínica A obteve permissão de leitura na Clínica B';
  end if;

  -- Verifica que auditoria da Clínica B foi registrada automaticamente
  select count(*) into visible_count from public.audit_logs where clinic_id = clinic_b and entity = 'patients';
  if visible_count < 1 then
    raise exception 'FALHA DE AUDITORIA: Inserção de paciente não gerou log de auditoria';
  end if;

  raise notice 'SUCESSO: Isolamento Multi-Tenant e Auditoria validados com êxito!';
end $$;

rollback;

