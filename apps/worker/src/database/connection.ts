import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class Database {
  private pool: pg.Pool;

  constructor(connectionString: string = 'postgresql://localhost:5432/ai_pop_culture') {
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    this.initialize().catch(console.error);
  }

  private async initialize() {
    try {
      const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
      await this.pool.query(schema);
      console.log('Database initialized successfully');
    } catch (err) {
      console.error('Failed to initialize database:', err);
      throw err;
    }
  }

  async run(sql: string, params: any[] = []): Promise<{ rowCount: number; rows: any[] }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return { rowCount: result.rowCount || 0, rows: result.rows };
    } finally {
      client.release();
    }
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows[0] as T;
    } finally {
      client.release();
    }
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows as T[];
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

let dbInstance: Database | null = null;

export function getDatabase(connectionString?: string): Database {
  if (!dbInstance) {
    dbInstance = new Database(connectionString);
  }
  return dbInstance;
}

export const db = getDatabase();
