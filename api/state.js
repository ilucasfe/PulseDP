import pg from 'pg';

const { Pool } = pg;

const rawConnectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_POSTGRES_PRISMA_URL;

function sanitizeConnectionString(connStr) {
  if (!connStr) return '';
  try {
    const url = new URL(connStr);
    url.searchParams.delete('pgbouncer');
    url.searchParams.delete('supa');
    return url.toString();
  } catch {
    return connStr;
  }
}

const connectionString = sanitizeConnectionString(rawConnectionString);

const globalForPg = globalThis;
let tableReady = Boolean(globalForPg.__pulsedpTableReady);

function getPool() {
  if (!connectionString) {
    throw new Error(
      'Variável de ambiente de conexão PostgreSQL não encontrada (DATABASE_URL, POSTGRES_URL ou POSTGRES_URL_POSTGRES_URL).'
    );
  }
  if (!globalForPg.__pulsedpPgPool) {
    const isLocal =
      connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    globalForPg.__pulsedpPgPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: isLocal ? false : { rejectUnauthorized: false }
    });
  }
  return globalForPg.__pulsedpPgPool;
}

async function ensureTable(db) {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS pulsedp_workspaces (
      workspace VARCHAR(120) PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  tableReady = true;
  globalForPg.__pulsedpTableReady = true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-workspace-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawWorkspace = String(
    req.query?.workspace || req.headers['x-workspace-id'] || 'default'
  ).trim();
  const workspace = rawWorkspace.slice(0, 120) || 'default';

  try {
    const db = getPool();
    await ensureTable(db);

    if (req.method === 'GET') {
      const result = await db.query(
        'SELECT data FROM pulsedp_workspaces WHERE workspace = $1 LIMIT 1',
        [workspace]
      );
      const row = result.rows[0];
      return res.status(200).json({
        ok: true,
        workspace,
        data: row ? row.data : null
      });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ ok: false, error: 'JSON inválido no corpo da requisição.' });
        }
      }
      const data = body && typeof body === 'object' ? (body.data ?? null) : null;
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ ok: false, error: 'Payload "data" ausente ou inválido.' });
      }

      await db.query(
        `INSERT INTO pulsedp_workspaces (workspace, data, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (workspace)
         DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [workspace, JSON.stringify(data)]
      );
      return res.status(200).json({ ok: true, workspace });
    }

    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : 'Erro interno no PostgreSQL.'
    });
  }
}
