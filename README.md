# PulseDP — Folha de Pagamento & eSocial (PostgreSQL + Vercel)

## Estrutura do pacote
- `index.html`: Aplicação completa do sistema PulseDP (Folha, Férias, 13º, TRCT, Recibos, Rubricas, Colaboradores eSocial S-2200/S-2300, Afastamentos S-2230, Empresa, Tabelas e Tema).
- `api/state.js`: Endpoint serverless (`GET` e `POST`) conectado ao PostgreSQL via `pg` na tabela `pulsedp_workspaces`.
- `package.json`: Dependência `pg` e `"type": "module"`.
- `vercel.json`: Configuração `cleanUrls`.

## Variáveis de ambiente no Vercel
Configure uma das variáveis de conexão PostgreSQL no projeto Vercel:
- `DATABASE_URL` ou `POSTGRES_URL` (com SSL habilitado automaticamente para hosts remotos).
