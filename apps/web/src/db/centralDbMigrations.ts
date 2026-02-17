import { type Migrations } from 'rwsdk/db';

export const migrations = {
  '001_initial_schema': {
    async up(db) {
      return [
        // user table
        await db.schema
          .createTable('user')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('email', 'text')
          .addColumn('emailVerified', 'integer', (col) => col.defaultTo(0))
          .addColumn('name', 'text')
          .addColumn('image', 'text')
          .addColumn('username', 'text')
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .addColumn('updatedAt', 'text', (col) => col.notNull())
          .execute(),

        // Create unique index on username
        await db.schema
          .createIndex('user_username_idx')
          .on('user')
          .column('username')
          .unique()
          .execute(),

        // account table for OAuth providers
        await db.schema
          .createTable('account')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('userId', 'text', (col) =>
            col.notNull().references('user.id').onDelete('cascade')
          )
          .addColumn('accountId', 'text', (col) => col.notNull())
          .addColumn('providerId', 'text', (col) => col.notNull())
          .addColumn('accessToken', 'text')
          .addColumn('refreshToken', 'text')
          .addColumn('expiresAt', 'text')
          .addColumn('scope', 'text')
          .addColumn('password', 'text')
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .addColumn('updatedAt', 'text', (col) => col.notNull())
          .addColumn('accessTokenExpiresAt', 'text')
          .addColumn('refreshTokenExpiresAt', 'text')
          .addColumn('idToken', 'text')
          .execute(),

        // Create unique index on provider + accountId
        await db.schema
          .createIndex('account_provider_account_idx')
          .on('account')
          .columns(['providerId', 'accountId'])
          .unique()
          .execute(),

        // Create index on userId for faster lookups
        await db.schema
          .createIndex('account_user_id_idx')
          .on('account')
          .column('userId')
          .execute(),

        // Session table for Better Auth
        await db.schema
          .createTable('session')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('userId', 'text', (col) =>
            col.notNull().references('user.id').onDelete('cascade')
          )
          .addColumn('expiresAt', 'integer', (col) => col.notNull())
          .addColumn('ipAddress', 'text')
          .addColumn('userAgent', 'text')
          .addColumn('createdAt', 'integer', (col) => col.notNull())
          .addColumn('updatedAt', 'integer', (col) => col.notNull())
          .addColumn('token', 'text', (col) => col.notNull())
          .execute(),

        // Create index on userId for faster lookups
        await db.schema
          .createIndex('session_user_id_idx')
          .on('session')
          .column('userId')
          .execute(),

        // Verification table for Better Auth
        await db.schema
          .createTable('verification')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('identifier', 'text', (col) => col.notNull())
          .addColumn('value', 'text', (col) => col.notNull())
          .addColumn('expiresAt', 'text', (col) => col.notNull())
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .addColumn('updatedAt', 'text', (col) => col.notNull())
          .execute(),

        // Create index on identifier for faster lookups
        await db.schema
          .createIndex('verification_identifier_idx')
          .on('verification')
          .column('identifier')
          .execute(),
      ];
    },

    async down(db) {
      await db.schema.dropTable('verification').ifExists().execute();
      await db.schema.dropTable('session').ifExists().execute();
      await db.schema.dropTable('account').ifExists().execute();
      await db.schema.dropTable('user').ifExists().execute();
    },
  },
} satisfies Migrations;
