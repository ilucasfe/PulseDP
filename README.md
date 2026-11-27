# PulseDP — Front-end HTML + Back-end JS (Node/Vercel) + PostgreSQL

## Estrutura do Projeto
- `index.html`: Front-end completo em HTML/CSS/JS puro.
- `api/state.js`: Back-end Serverless em JavaScript (Node.js) conectado ao PostgreSQL (`pg`). Cria automaticamente a tabela `pulsedp_workspaces` (`JSONB`) no primeiro acesso.
- `package.json`: Dependência `pg` para conexão com PostgreSQL.

## Como publicar na Vercel com PostgreSQL (Neon, Supabase, Vercel Postgres, Railway, etc.)
1. Extraia este ZIP e envie todos os arquivos para a raiz do seu repositório GitHub (`index.html`, `api/state.js`, `package.json`).
2. Na Vercel, vá em **Settings -> Environment Variables** e adicione:
   - **Key:** `DATABASE_URL` (ou `POSTGRES_URL`)
   - **Value:** `postgresql://usuario:senha@host:5432/banco?sslmode=require`
3. Faça um **Redeploy** na Vercel.
4. Ao abrir o sistema, deixe o botão **⚙️ API** como `/api/state` (padrão) e clique em **☁️ Sync**.
