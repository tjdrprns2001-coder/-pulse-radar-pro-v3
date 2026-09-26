import {sqliteTable, text, integer, index} from 'drizzle-orm/sqlite-core';
export const jobs = sqliteTable('jobs', {id:text('id').primaryKey(), kind:text('kind').notNull(), status:text('status').notNull(), data:text('data').notNull(), updated:integer('updated').notNull(), lease:integer('lease').notNull().default(0)});
export const cache = sqliteTable('cache', {key:text('key').primaryKey(), data:text('data').notNull(), expires:integer('expires').notNull()}, t=>[index('cache_expiry').on(t.expires)]);
export const samples = sqliteTable('samples', {id:text('id').primaryKey(), symbol:text('symbol').notNull(), cutoff:integer('cutoff').notNull(), data:text('data').notNull()}, t=>[index('sample_cutoff').on(t.cutoff)]);
