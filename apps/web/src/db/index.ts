import { env } from 'cloudflare:workers';
import { type Database, createDb } from 'rwsdk/db';

import { type migrations } from '@/db/centralDbMigrations';

// Shared auth database types
export type AppDatabase = Database<typeof migrations>;

// Shared auth database instance
export const db = createDb<AppDatabase>(
  env.DATABASE,
  'auth-database' // unique key for this database instance
);
