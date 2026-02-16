/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  createAdapterFactory,
  type DBAdapterDebugLogOption,
} from 'better-auth/adapters';

import { db } from '@/db/index';

type FilterOperator =
  | 'eq'
  | 'ne'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'starts_with'
  | 'ends_with';

type WhereFilter = {
  field: string;
  operator: FilterOperator;
  value: unknown;
};

interface CustomAdapterConfig {
  /**
   * Helps you debug issues with the adapter.
   */
  debugLogs?: DBAdapterDebugLogOption | boolean;
  /**
   * If the table names in the schema are plural.
   */
  usePlural?: boolean;
}

/**
 * Apply a single filter object { field, operator, value }.
 */
function applyWhereFilter(query: any, filter: WhereFilter): any {
  const { field, operator, value } = filter;

  switch (operator) {
    case 'eq':
      return query.where(field, '=', value);
    case 'ne':
      return query.where(field, '!=', value);
    case 'lt':
      return query.where(field, '<', value);
    case 'lte':
      return query.where(field, '<=', value);
    case 'gt':
      return query.where(field, '>', value);
    case 'gte':
      return query.where(field, '>=', value);
    case 'in': {
      const list = Array.isArray(value) ? value : [value];
      return query.where(field, 'in', list);
    }
    case 'not_in': {
      const list = Array.isArray(value) ? value : [value];
      return query.where(field, 'not in', list);
    }
    case 'contains':
      return query.where(field, 'like', `%${String(value)}%`);
    case 'starts_with':
      return query.where(field, 'like', `${String(value)}%`);
    case 'ends_with':
      return query.where(field, 'like', `%${String(value)}`);
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

/**
 * Apply Better Auth's `where` argument.
 * Supports:
 * - Simple: { id: "xxx", email: "a@b.com" }
 * - Advanced: { someKey: { field, operator, value }, ... }
 */
function applyWhere(query: any, where: any): any {
  if (!where) return query;

  for (const [key, value] of Object.entries(where)) {
    // Advanced form: { key: { field, operator, value } }
    if (
      value &&
      typeof value === 'object' &&
      'operator' in (value as any) &&
      'field' in (value as any)
    ) {
      query = applyWhereFilter(query, value as WhereFilter);
    } else {
      // Simple equality: { id: "xxx" }
      query = query.where(key, '=', value);
    }
  }

  return query;
}

export const rwsdkAdapter = (config: CustomAdapterConfig = {}) => {
  return createAdapterFactory({
    config: {
      adapterId: 'rwsdk-adapter',
      adapterName: 'RWSDK Database Adapter',
      usePlural: config.usePlural ?? false,
      debugLogs: config.debugLogs ?? false,
      supportsJSON: false, // We handle JSON manually due to Kysely auto-parsing
      supportsDates: false, // We serialize dates manually
      supportsBooleans: false,
      supportsNumericIds: false,
    },
    adapter: ({ debugLog: _debugLog }) => {
      return {
        // CREATE ONE
        create: async ({ model, data }: any) => {
          const row = await (db as any)
            .insertInto(model)
            .values(data) // Use transformed values!
            .returningAll()
            .executeTakeFirstOrThrow();

          return row;
        },

        // UPDATE ONE
        update: async ({ model, where, update }: any) => {
          let query = (db as any).updateTable(model).set(update);
          query = applyWhere(query, where);

          const row = await query.returningAll().executeTakeFirst();
          return row;
        },

        // UPDATE MANY
        updateMany: async ({ model, where, update }: any) => {
          let query = (db as any).updateTable(model).set(update);
          query = applyWhere(query, where);

          const result = await query.execute();
          return Array.isArray(result) ? result.length : Number(result ?? 0);
        },

        // DELETE ONE
        delete: async ({ model, where }: any) => {
          let query = (db as any).deleteFrom(model);
          query = applyWhere(query, where);

          await query.execute();
        },

        // DELETE MANY
        deleteMany: async ({ model, where }: any) => {
          let query = (db as any).deleteFrom(model);
          query = applyWhere(query, where);

          const result = await query.execute();
          return Array.isArray(result) ? result.length : Number(result ?? 0);
        },

        // FIND ONE
        findOne: async ({ model, where, select }: any) => {
          let query = (db as any).selectFrom(model);

          if (Array.isArray(select) && select.length > 0) {
            query = query.select(select);
          } else {
            query = query.selectAll();
          }

          query = applyWhere(query, where);

          const row = await query.executeTakeFirst();
          return row;
        },

        // FIND MANY
        findMany: async ({ model, where, limit, sortBy, offset }: any) => {
          let query = (db as any).selectFrom(model).selectAll();

          query = applyWhere(query, where);

          if (sortBy) {
            if (typeof sortBy === 'string') {
              query = query.orderBy(sortBy);
            } else if (sortBy.field) {
              query = query.orderBy(
                sortBy.field,
                sortBy.direction === 'desc' ? 'desc' : 'asc'
              );
            }
          }

          if (typeof limit === 'number') {
            query = query.limit(limit);
          }

          if (typeof offset === 'number') {
            query = query.offset(offset);
          }

          const rows = await query.execute();

          if (model === 'verification') {
            return rows.map((row: any) => ({
              ...row,
              value:
                typeof row.value === 'object' && row.value !== null
                  ? JSON.stringify(row.value)
                  : row.value,
            }));
          }

          return rows;
        },

        // COUNT
        count: async ({ model, where }: any) => {
          let query = (db as any)
            .selectFrom(model)
            .select((eb: any) => eb.fn.countAll().as('count'));

          query = applyWhere(query, where);

          const row = await query.executeTakeFirstOrThrow();

          const raw = (row as any).count;
          if (typeof raw === 'bigint') return Number(raw);
          return Number(raw ?? 0);
        },
      };
    },
  });
};
