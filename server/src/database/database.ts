import { Pool, type QueryResultRow } from 'pg'

let databasePool: Pool | null = null

const getDatabaseUrl = (): string => {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured')
  }

  return databaseUrl
}

export const getDatabasePool = (): Pool => {
  if (!databasePool) {
    databasePool = new Pool({ connectionString: getDatabaseUrl() })
  }

  return databasePool
}

export const queryDatabase = <Row extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) => getDatabasePool().query<Row>(text, values)

export const checkDatabaseConnection = async (): Promise<void> => {
  await queryDatabase('SELECT 1')
}

export const closeDatabasePool = async (): Promise<void> => {
  if (!databasePool) return

  const pool = databasePool
  databasePool = null
  await pool.end()
}
