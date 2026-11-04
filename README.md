# SondaPro — Plataforma SaaS de Gestão Odontológica (PT-BR / EN)

Plataforma SaaS Multi-Tenant profissional para gestão de clínicas odontológicas, com isolamento de dados via Row Level Security (RLS) no Supabase/PostgreSQL, controle de acesso por perfil e permissões individuais, auditoria de operações e suporte bilíngue (Português Brasileiro padrão e Inglês).

- **Documentação Técnica Completa**: [docs/ARQUITETURA.md](./docs/ARQUITETURA.md)
- **Moeda**: Real Brasileiro (`BRL`)
- **Fuso Horário**: `America/Sao_Paulo`

## Módulos Entregues (Etapas 1 a 4)

1. **Fundação Multi-Tenant & Segurança**:
   - Autenticação via Supabase Auth (E-mail/Senha, Google OAuth e recuperação de senha).
   - Criação e alternância entre múltiplas clínicas e cadastro de unidades (Matriz e Filiais).
   - 7 Perfis de acesso (`owner`, `admin`, `dentist`, `receptionist`, `assistant`, `finance`, `stock`) + Permissões individuais granulares por membro.
   - Políticas RLS reais no PostgreSQL + Triggers automáticos de auditoria (`audit_logs`).
2. **Dashboard Gerencial**:
   - Menu lateral recolhível, cabeçalho com identificação da clínica, unidade, perfil e notificações.
   - Filtros de período (`Hoje`, `7 dias`, `Mês atual`, `30 dias`, `90 dias`) e filtro por profissional.
   - Indicadores financeiros reais em `BRL` (Faturamento do dia, Faturamento no período, Receita prevista, Ticket médio e Comissões estimadas).
   - Indicadores de atendimento, agenda resumida, alertas administrativos reais e gráficos gerenciais com estados vazios informativos.
3. **Agenda, Pacientes, Equipe e Configurações**:
   - Cadastro de pacientes com validação de CPF e histórico clínico.
   - Agenda diária, semanal e mensal com bloqueio de conflito de horário no banco (`btree_gist`).

## Desenvolvimento Local

1. Copie `.env.example` para `.env` e configure as variáveis públicas do Supabase:
   ```sh
   cp .env.example .env
   ```
2. Instale as dependências e inicie o servidor:
   ```sh
   npm install
   npm run dev
   ```
3. Execute a suíte de testes automatizados:
   ```sh
   npm test
   ```
