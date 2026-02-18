import { SqliteDurableObject } from 'rwsdk/db';

import { migrations } from '@/db/factsDbMigrations';

export class FactsDatabase extends SqliteDurableObject {
  migrations = migrations;
}
