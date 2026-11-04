-- =============================================================================
-- SONDAPRO / ODONTO GESTÃO — SEED ESTRUTURAL IDEMPOTENTE
-- =============================================================================
-- Diretriz obrigatória: Não inserir dados fictícios como se fossem informações
-- reais de produção. Este script apenas garante a consistência estrutural das
-- clínicas já cadastradas (ex.: criação automática da Unidade Matriz caso não
-- exista).

insert into public.clinic_units (clinic_id, name, is_main, active)
select c.id, 'Unidade Matriz', true, true
from public.clinics c
where not exists (
  select 1 from public.clinic_units u where u.clinic_id = c.id
);

