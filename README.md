# PulseDP — Front-end HTML + Back-end JS (Vercel) + Supabase PostgreSQL

## Arquivos do Projeto
- `index.html`: Front-end completo em HTML/CSS/JS puro.
- `api/state.js`: Back-end Serverless em Node.js (`pg`) já compatível com as variáveis geradas pela integração **Supabase + Vercel** (`POSTGRES_URL_POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_URL` ou `DATABASE_URL`).
- `package.json`: Dependência `pg`.
- `vercel.json`: Configuração de rotas limpas na Vercel.

## Como publicar
1. Extraia este ZIP e envie os arquivos (`index.html`, `api/state.js`, `package.json`, `vercel.json`) para a raiz do repositório GitHub `ilucasfe/PulseDP`.
2. Como as variáveis `POSTGRES_URL_*` do Supabase já estão cadastradas na sua Vercel, basta aguardar o deploy automático (ou clicar em **Redeploy**).
3. Abra `https://pulsedp-g2yp.vercel.app/` e clique em **☁️ Sync** (o botão **⚙️ API** deve ficar como `/api/state`).
