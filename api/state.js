import pg from 'pg';

const { Pool } = pg;

const rawConnectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_POSTGRES_PRISMA_URL;

// Remove parâmetros específicos do pgbouncer/supa da query string para o node-postgres (pg) funcionar sem erro
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

let pool = null;
let tableReady = false;

function getPool() {
  if (!connectionString) {
    throw new Error(
      'Variável de ambiente de conexão PostgreSQL não encontrada (DATABASE_URL, POSTGRES_URL ou POSTGRES_URL_POSTGRES_URL).'
    );
  }
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl:
        connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
          ? false
          : { rejectUnauthorized: false }
    });
  }
  return pool;
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
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-workspace-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const workspace = String(req.query.workspace || req.headers['x-workspace-id'] || 'default').trim();

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
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const data = body && body.data ? body.data : null;
      if (!data) {
        return res.status(400).json({ ok: false, error: 'Payload "data" ausente.' });
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
