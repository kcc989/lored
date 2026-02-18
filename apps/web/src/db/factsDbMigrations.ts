import { type Migrations } from 'rwsdk/db';

export const migrations = {
  '001_facts_schema': {
    async up(db) {
      return [
        // brain table — a knowledge base owned by a team
        await db.schema
          .createTable('brain')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('teamId', 'text', (col) => col.notNull())
          .addColumn('name', 'text', (col) => col.notNull())
          .addColumn('description', 'text')
          .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .addColumn('updatedAt', 'text', (col) => col.notNull())
          .addColumn('createdBy', 'text', (col) => col.notNull())
          .execute(),

        await db.schema
          .createIndex('brain_team_id_idx')
          .on('brain')
          .column('teamId')
          .execute(),

        await db.schema
          .createIndex('brain_team_name_idx')
          .on('brain')
          .columns(['teamId', 'name'])
          .unique()
          .execute(),

        // fact table — a versioned statement of knowledge within a brain
        await db.schema
          .createTable('fact')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('brainId', 'text', (col) =>
            col.notNull().references('brain.id').onDelete('cascade')
          )
          .addColumn('content', 'text', (col) => col.notNull())
          .addColumn('type', 'text', (col) => col.notNull().defaultTo('general'))
          .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
          .addColumn('trustScore', 'real', (col) => col.notNull().defaultTo(0.5))
          .addColumn('citationCount', 'integer', (col) => col.notNull().defaultTo(0))
          .addColumn('questionCount', 'integer', (col) => col.notNull().defaultTo(0))
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .addColumn('updatedAt', 'text', (col) => col.notNull())
          .addColumn('createdBy', 'text', (col) => col.notNull())
          .execute(),

        await db.schema
          .createIndex('fact_brain_id_idx')
          .on('fact')
          .column('brainId')
          .execute(),

        await db.schema
          .createIndex('fact_status_idx')
          .on('fact')
          .column('status')
          .execute(),

        await db.schema
          .createIndex('fact_type_idx')
          .on('fact')
          .column('type')
          .execute(),

        await db.schema
          .createIndex('fact_trust_score_idx')
          .on('fact')
          .column('trustScore')
          .execute(),

        // fact_version table — content history for a fact
        await db.schema
          .createTable('fact_version')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('factId', 'text', (col) =>
            col.notNull().references('fact.id').onDelete('cascade')
          )
          .addColumn('version', 'integer', (col) => col.notNull())
          .addColumn('content', 'text', (col) => col.notNull())
          .addColumn('type', 'text', (col) => col.notNull())
          .addColumn('changeReason', 'text')
          .addColumn('changedBy', 'text', (col) => col.notNull())
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .execute(),

        await db.schema
          .createIndex('fact_version_fact_id_idx')
          .on('fact_version')
          .column('factId')
          .execute(),

        await db.schema
          .createIndex('fact_version_fact_version_idx')
          .on('fact_version')
          .columns(['factId', 'version'])
          .unique()
          .execute(),

        // fact_source table — documents, links, or people that back a fact
        await db.schema
          .createTable('fact_source')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('factId', 'text', (col) =>
            col.notNull().references('fact.id').onDelete('cascade')
          )
          .addColumn('sourceType', 'text', (col) => col.notNull())
          .addColumn('title', 'text')
          .addColumn('url', 'text')
          .addColumn('userId', 'text')
          .addColumn('description', 'text')
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .addColumn('createdBy', 'text', (col) => col.notNull())
          .execute(),

        await db.schema
          .createIndex('fact_source_fact_id_idx')
          .on('fact_source')
          .column('factId')
          .execute(),

        await db.schema
          .createIndex('fact_source_type_idx')
          .on('fact_source')
          .column('sourceType')
          .execute(),

        // fact_tag table — context tags (text or external IDs) on facts
        await db.schema
          .createTable('fact_tag')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('factId', 'text', (col) =>
            col.notNull().references('fact.id').onDelete('cascade')
          )
          .addColumn('tagType', 'text', (col) => col.notNull().defaultTo('text'))
          .addColumn('tagValue', 'text', (col) => col.notNull())
          .addColumn('tagNamespace', 'text')
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .addColumn('createdBy', 'text', (col) => col.notNull())
          .execute(),

        await db.schema
          .createIndex('fact_tag_fact_id_idx')
          .on('fact_tag')
          .column('factId')
          .execute(),

        await db.schema
          .createIndex('fact_tag_value_idx')
          .on('fact_tag')
          .column('tagValue')
          .execute(),

        await db.schema
          .createIndex('fact_tag_namespace_value_idx')
          .on('fact_tag')
          .columns(['tagNamespace', 'tagValue'])
          .execute(),

        await db.schema
          .createIndex('fact_tag_unique_idx')
          .on('fact_tag')
          .columns(['factId', 'tagType', 'tagValue', 'tagNamespace'])
          .unique()
          .execute(),

        // fact_citation table — explicit references to a fact by users/agents
        await db.schema
          .createTable('fact_citation')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('factId', 'text', (col) =>
            col.notNull().references('fact.id').onDelete('cascade')
          )
          .addColumn('citedBy', 'text', (col) => col.notNull())
          .addColumn('citationContext', 'text')
          .addColumn('sourceType', 'text', (col) => col.notNull().defaultTo('user'))
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .execute(),

        await db.schema
          .createIndex('fact_citation_fact_id_idx')
          .on('fact_citation')
          .column('factId')
          .execute(),

        await db.schema
          .createIndex('fact_citation_created_at_idx')
          .on('fact_citation')
          .column('createdAt')
          .execute(),

        // fact_question table — challenges to a fact's accuracy
        await db.schema
          .createTable('fact_question')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('factId', 'text', (col) =>
            col.notNull().references('fact.id').onDelete('cascade')
          )
          .addColumn('questionedBy', 'text', (col) => col.notNull())
          .addColumn('reason', 'text', (col) => col.notNull())
          .addColumn('status', 'text', (col) => col.notNull().defaultTo('open'))
          .addColumn('resolution', 'text')
          .addColumn('resolvedBy', 'text')
          .addColumn('resolvedAt', 'text')
          .addColumn('createdAt', 'text', (col) => col.notNull())
          .execute(),

        await db.schema
          .createIndex('fact_question_fact_id_idx')
          .on('fact_question')
          .column('factId')
          .execute(),

        await db.schema
          .createIndex('fact_question_status_idx')
          .on('fact_question')
          .column('status')
          .execute(),

        // team_membership_cache — avoids repeated recursive CTEs against auth DB
        await db.schema
          .createTable('team_membership_cache')
          .addColumn('userId', 'text', (col) => col.notNull())
          .addColumn('teamId', 'text', (col) => col.notNull())
          .addColumn('isDirect', 'integer', (col) => col.notNull())
          .addColumn('cachedAt', 'text', (col) => col.notNull())
          .execute(),

        // Composite primary key via unique index
        await db.schema
          .createIndex('tmc_pk_idx')
          .on('team_membership_cache')
          .columns(['userId', 'teamId'])
          .unique()
          .execute(),

        await db.schema
          .createIndex('tmc_user_idx')
          .on('team_membership_cache')
          .column('userId')
          .execute(),

        await db.schema
          .createIndex('tmc_cached_at_idx')
          .on('team_membership_cache')
          .column('cachedAt')
          .execute(),
      ];
    },

    async down(db) {
      await db.schema.dropTable('team_membership_cache').ifExists().execute();
      await db.schema.dropTable('fact_question').ifExists().execute();
      await db.schema.dropTable('fact_citation').ifExists().execute();
      await db.schema.dropTable('fact_tag').ifExists().execute();
      await db.schema.dropTable('fact_source').ifExists().execute();
      await db.schema.dropTable('fact_version').ifExists().execute();
      await db.schema.dropTable('fact').ifExists().execute();
      await db.schema.dropTable('brain').ifExists().execute();
    },
  },
} satisfies Migrations;
