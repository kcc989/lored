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
  '002_organization_tables': {
    async up(db) {
      return [
        // organization table
        await db.schema
          .createTable('organization')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('name', 'text', (col) => col.notNull())
          .addColumn('slug', 'text', (col) => col.notNull())
          .addColumn('logo', 'text')
          .addColumn('metadata', 'text')
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .execute(),

        await db.schema
          .createIndex('organization_slug_idx')
          .on('organization')
          .column('slug')
          .unique()
          .execute(),

        // member table (org membership)
        await db.schema
          .createTable('member')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('organizationId', 'text', (col) =>
            col.notNull().references('organization.id').onDelete('cascade')
          )
          .addColumn('userId', 'text', (col) =>
            col.notNull().references('user.id').onDelete('cascade')
          )
          .addColumn('role', 'text', (col) => col.notNull())
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .execute(),

        await db.schema
          .createIndex('member_org_id_idx')
          .on('member')
          .column('organizationId')
          .execute(),

        await db.schema
          .createIndex('member_user_id_idx')
          .on('member')
          .column('userId')
          .execute(),

        await db.schema
          .createIndex('member_org_user_unique_idx')
          .on('member')
          .columns(['organizationId', 'userId'])
          .unique()
          .execute(),

        // invitation table (required by Better Auth org plugin)
        await db.schema
          .createTable('invitation')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('organizationId', 'text', (col) =>
            col.notNull().references('organization.id').onDelete('cascade')
          )
          .addColumn('email', 'text', (col) => col.notNull())
          .addColumn('role', 'text', (col) => col.notNull())
          .addColumn('status', 'text', (col) => col.notNull())
          .addColumn('expiresAt', 'text', (col) => col.notNull())
          .addColumn('inviterId', 'text', (col) =>
            col.notNull().references('user.id').onDelete('cascade')
          )
          .addColumn('teamId', 'text')
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .execute(),

        await db.schema
          .createIndex('invitation_org_id_idx')
          .on('invitation')
          .column('organizationId')
          .execute(),

        // team table (with parentTeamId for hierarchy)
        await db.schema
          .createTable('team')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('name', 'text', (col) => col.notNull())
          .addColumn('organizationId', 'text', (col) =>
            col.notNull().references('organization.id').onDelete('cascade')
          )
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .addColumn('updatedAt', 'text')
          .addColumn('parentTeamId', 'text')
          .execute(),

        await db.schema
          .createIndex('team_org_id_idx')
          .on('team')
          .column('organizationId')
          .execute(),

        await db.schema
          .createIndex('team_parent_id_idx')
          .on('team')
          .column('parentTeamId')
          .execute(),

        // teamMember table
        await db.schema
          .createTable('teamMember')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('teamId', 'text', (col) =>
            col.notNull().references('team.id').onDelete('cascade')
          )
          .addColumn('userId', 'text', (col) =>
            col.notNull().references('user.id').onDelete('cascade')
          )
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .execute(),

        await db.schema
          .createIndex('team_member_team_id_idx')
          .on('teamMember')
          .column('teamId')
          .execute(),

        await db.schema
          .createIndex('team_member_user_id_idx')
          .on('teamMember')
          .column('userId')
          .execute(),

        await db.schema
          .createIndex('team_member_unique_idx')
          .on('teamMember')
          .columns(['teamId', 'userId'])
          .unique()
          .execute(),

        // Add activeOrganizationId and activeTeamId to session table
        await db.schema
          .alterTable('session')
          .addColumn('activeOrganizationId', 'text')
          .execute(),

        await db.schema
          .alterTable('session')
          .addColumn('activeTeamId', 'text')
          .execute(),
      ];
    },

    async down(db) {
      await db.schema.dropTable('teamMember').ifExists().execute();
      await db.schema.dropTable('team').ifExists().execute();
      await db.schema.dropTable('invitation').ifExists().execute();
      await db.schema.dropTable('member').ifExists().execute();
      await db.schema.dropTable('organization').ifExists().execute();
      // Note: SQLite doesn't support DROP COLUMN directly.
      // activeOrganizationId and activeTeamId on session would require table rebuild to remove.
    },
  },
} satisfies Migrations;
