# Documentação Técnica — SondaPro (Odonto Gestão SaaS Multi-Tenant)

## 1. Visão Geral da Arquitetura

O **SondaPro** é uma plataforma SaaS Multi-Tenant para gestão de clínicas odontológicas, construída com foco em isolamento rigoroso de dados por clínica (`clinic_id`), controle de acesso baseado em funções (RBAC) combinado com permissões individuais granulares, trilha de auditoria automática no PostgreSQL e suporte bilíngue (Português Brasileiro `pt-BR` como idioma padrão e Inglês `en-US`).

- **Moeda padrão**: Real Brasileiro (`BRL` / `R$`)
- **Fuso horário operacional**: `America/Sao_Paulo`
- **Banco de Dados & Auth**: Supabase (PostgreSQL + Supabase Auth + Row Level Security)
- **Estilização & UI**: Tailwind CSS v4 + shadcn/ui (identidade visual Azul-Marinho, Azul Principal, Azul-Claro e Branco)
- **Sincronização**: Compatível com Lovable Cloud e execução local via Vite / TanStack Start.

---

## 2. Estrutura de Diretórios

```text
bilingual-language-platform/
├── docs/
│   └── ARQUITETURA.md                        # Documentação técnica do projeto
├── drizzle/
│   └── migrations/                           # Migrations sincronizadas com Lovable Cloud
├── supabase/
│   ├── config.toml                           # Configuração do projeto Supabase
│   ├── migrations/
│   │   ├── 0001_initial_schema.sql           # Fundação multi-tenant, perfis, pacientes, agenda, auditoria
│   │   └── 0002_units_permissions_and_rls.sql# Unidades (matriz/filiais), permissões individuais e RLS
│   ├── seed.sql                              # Seed estrutural idempotente (sem dados fictícios)
│   └── tests/
│       └── rls_isolation.test.sql            # Teste transacional SQL de isolamento entre clínicas
├── src/
│   ├── components/
│   │   ├── layout/                           # AppSidebar (recolhível), AppHeader, ClinicOnboarding
│   │   ├── dashboard/                        # Filtros de período, KPIs financeiros/atendimento, alertas, empty state
│   │   ├── charts/                           # RevenueTrendChart, ProfessionalsBarChart, AppointmentStatusChart
│   │   ├── forms/                            # ClinicUnitForm, MemberPermissionsDialog
│   │   ├── tables/                           # AuditLogsTable
│   │   └── ui/                               # Componentes base shadcn/ui
│   ├── modules/
│   │   ├── auth/                             # Schemas e utilitários de autenticação
│   │   ├── clinics/                          # Gestão de clínicas e unidades (Matriz / Filiais)
│   │   ├── permissions/                      # RBAC + matriz de permissões individuais por membro
│   │   ├── patients/                         # Regras de negócio e validação de pacientes (CPF)
│   │   ├── appointments/                     # Regras de agendamento e prevenção de conflito de horários
│   │   └── finance/                          # Cálculo de indicadores financeiros e operacionais reais
│   ├── services/
│   │   ├── supabase/                         # Cliente Supabase, assertClinicScope e normalização de erros
│   │   ├── notifications/                    # Motor de alertas administrativos baseados em dados reais
│   │   └── integrations/                     # Conectores OAuth e futuras integrações (WhatsApp)
│   ├── routes/                               # Rotas protegidas e públicas (TanStack Router)
│   ├── types/                                # Contratos TypeScript do domínio SaaS
│   ├── utils/                                # Fuso horário America/Sao_Paulo, moeda BRL, CPF/CNPJ
│   └── test/                                 # Suíte de testes automatizados (Vitest)
└── .env.example                              # Exemplo documentado de variáveis de ambiente
```

---

## 3. Modelo de Dados e Segurança Multi-Tenant (RLS)

### 3.1 Tabelas Principais

| Tabela | Descrição | Escopo Multi-Tenant |
| :--- | :--- | :--- |
| `public.profiles` | Perfil vinculado ao `auth.users` (`full_name`, `locale`) | `id = auth.uid()` |
| `public.clinics` | Cadastro da clínica (`name`, `cnpj`, `phone`, `timezone`) | `is_clinic_member(id)` |
| `public.clinic_units` | Unidades da clínica — Matriz e Filiais (`name`, `cnpj`, `city`, `state`, `is_main`) | `clinic_id` |
| `public.clinic_members` | Associação usuário ↔ clínica com perfil (`role`) | `clinic_id` |
| `public.clinic_member_permissions` | Concessão ou revogação individual de permissões por membro | `clinic_id`, `member_id` |
| `public.professionals` | Dentistas e profissionais (`specialty`, `color`, `commission_pct`, `active`) | `clinic_id` |
| `public.rooms` | Consultórios / salas de atendimento (`name`, `unit_id`) | `clinic_id` |
| `public.patients` | Pacientes (`full_name`, `cpf` único por clínica, `allergies`, `anamnesis`) | `clinic_id` |
| `public.appointments` | Consultas com bloqueio GiST contra conflito de horário (`no_prof_overlap`, `no_room_overlap`) | `clinic_id` |
| `public.audit_logs` | Auditoria imutável gerada via triggers (`action`, `entity`, `entity_id`, `user_id`) | `clinic_id` |

### 3.2 Funções de Segurança (`SECURITY DEFINER`)

1. `public.is_clinic_member(_clinic uuid)`: Verifica se `auth.uid()` pertence à clínica informada.
2. `public.has_clinic_role(_clinic uuid, _roles clinic_role[])`: Verifica se `auth.uid()` possui um dos perfis exigidos na clínica.
3. `public.has_clinic_permission(_clinic uuid, _permission text, _default_roles clinic_role[])`:
   - Se o membro for `owner`, retorna `true`.
   - Se houver permissão individual registrada em `clinic_member_permissions` para `(member_id, _permission)`, respeita o valor `granted` (`true` ou `false`).
   - Caso contrário, verifica se o `role` do membro está em `_default_roles`.

### 3.3 Auditoria Automática

Triggers PostgreSQL (`public.log_audit()`) registram automaticamente operações de `insert`, `update` e `delete` em `public.audit_logs` para:
- `patients`
- `appointments`
- `clinic_members`
- `clinic_units`
- `clinic_member_permissions`
- `professionals`
- `rooms`

