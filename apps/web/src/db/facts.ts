import { env } from 'cloudflare:workers';
import { type Database, createDb } from 'rwsdk/db';

import { type migrations } from '@/db/factsDbMigrations';

export type FactsAppDatabase = Database<typeof migrations>;

/**
 * Get the facts database for an organization.
 * Each organization gets its own isolated Durable Object instance.
 * All data within a DO belongs to a single org — no organizationId columns needed.
 */
export function getFactsDb(orgId: string): FactsAppDatabase {
  return createDb<FactsAppDatabase>(
    env.FACTS_DATABASE,
    `org-${orgId}-facts-db`
  );
}
