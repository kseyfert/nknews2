import {drizzle, PostgresJsDatabase} from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

export type Db = PostgresJsDatabase<typeof schema>

export function createDb(connectionString: string): Db {
  const client = postgres(connectionString)
  return drizzle(client, { schema })
}