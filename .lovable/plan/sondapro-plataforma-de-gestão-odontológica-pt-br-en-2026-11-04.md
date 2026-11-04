# SondaPro — Plataforma de Gestão Odontológica (PT-BR / EN)

Plataforma SaaS multi-clínica, bilíngue (Português e Inglês, com seletor de idioma no topo; padrão Português), usando a marca SondaPro (logo e azul do material enviado).

## Entrega por fases

Fase 1 (esta etapa):
- Identidade visual SondaPro (azul marinho + azul vivo, tipografia moderna), favicon com o ícone enviado.
- Página inicial pública + login/cadastro (e-mail/senha e Google).
- Criação da clínica no primeiro acesso (usuário vira Proprietário).
- Layout do sistema: menu lateral, busca global, notificações, usuário logado, seletor PT/EN.
- Dashboard com indicadores reais e gráficos.
- Pacientes (cadastro completo, CPF validado, anamnese, alergias).
- Agenda (dia/semana/mês, por dentista, cores, bloqueio de conflitos).
- Funcionários e permissões (7 perfis).

Fase 2: Prontuário + odontograma interativo, planos de tratamento e orçamentos.
Fase 3: Financeiro (contas, fluxo de caixa, parcelas, comissões, fechamento de caixa).
Fase 4: Estoque (produtos, lotes, validade, alertas).
Fase 5: WhatsApp (confirmações e lembretes), relatórios e assistente inteligente com IA.
Fase 6: LGPD (consentimentos, exportação/exclusão de dados), auditoria completa.

## Modelo de dados (principais tabelas)

```text
clinics ─┬─ clinic_members (user_id, role)   perfis: owner, admin, dentist,
         │                                    receptionist, assistant, finance, stock
         ├─ professionals (cor, comissão %)
         ├─ rooms (consultórios)
         ├─ patients ── anamneses, patient_files
         │     └─ clinical_records ── tooth_conditions (odontograma, histórico)
         │     └─ treatment_plans ── treatment_items ── procedures
         ├─ appointments (paciente, profissional, sala, início/fim, status)
         │     └─ waitlist, schedule_blocks
         ├─ financial_entries (receber/pagar, parcelas, forma de pagamento)
         │     └─ cash_closings, commissions
         ├─ products ── product_batches ── stock_movements ── suppliers
         ├─ whatsapp_templates, whatsapp_messages
         └─ audit_logs (quem, o quê, quando)
profiles (nome, idioma preferido)
```

## Fluxo

Login → escolhe/cria clínica → menu mostra só os módulos permitidos pelo perfil → toda ação grava na clínica ativa e registra auditoria.

## Detalhes técnicos

- Lovable Cloud: banco relacional, autenticação, armazenamento de arquivos.
- Isolamento por clínica via RLS com função `is_clinic_member(clinic_id)` e `has_clinic_role(clinic_id, role)` (security definer); papéis em tabela separada.
- Conflito de horário: constraint de exclusão (btree_gist) por profissional e por sala.
- i18n: dicionários pt-BR/en em arquivo próprio, hook `useT()`, idioma salvo no perfil; datas e moeda (R$) formatadas por locale.
- Prontuário: registros só-acrescentar (sem edição destrutiva) para rastreabilidade.
- Validação com zod no cliente e no servidor.
