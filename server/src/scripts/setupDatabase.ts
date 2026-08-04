/**
 * 本地数据库初始化入口。
 *
 * 该脚本显式读取 server/.env 中的 DATABASE_URL，并执行可重复运行的
 * sql/schema.sql；它不会读取或输出 API Key，也不会生成任何业务数据。
 */
import dotenv from 'dotenv'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeDatabasePool, getDatabasePool } from '../database/database.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const environmentPath = resolve(currentDirectory, '../../.env')
const schemaPath = resolve(currentDirectory, '../../sql/schema.sql')

dotenv.config({ path: environmentPath })

const setupDatabase = async (): Promise<void> => {
  try {
    const schema = await readFile(schemaPath, 'utf8')
    await getDatabasePool().query(schema)
    console.log('Database schema is ready.')
  } catch {
    console.error('Database initialization failed. Check DATABASE_URL and PostgreSQL service status.')
    process.exitCode = 1
  } finally {
    await closeDatabasePool()
  }
}

void setupDatabase()
