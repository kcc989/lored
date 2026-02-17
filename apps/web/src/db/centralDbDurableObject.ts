import { SqliteDurableObject } from 'rwsdk/db';

import { migrations } from '@/db/centralDbMigrations';

export class Database extends SqliteDurableObject {
  migrations = migrations;
}
