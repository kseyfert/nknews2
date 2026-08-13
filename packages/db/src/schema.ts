import {
  pgTable,
  serial, index,
  text, boolean, timestamp, integer, vector,
} from 'drizzle-orm/pg-core'

export const providers = pgTable('providers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  website: text('website').notNull().unique(),
  type: text('type', { enum: ['rss'] }).notNull().default('rss'),
  source: text('source').notNull().unique(),
  hidden: boolean('hidden').notNull().default(false),
  disabled: boolean('disabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const articles = pgTable('articles', {
  id: serial('id').primaryKey(),
  providerId: integer('provider_id').notNull().references(() => providers.id),
  clusterId: integer('cluster_id'),
  title: text('title').notNull(),
  url: text('url').notNull().unique(),
  description: text('description').notNull().default(''),
  providerCategories: text('provider_categories').array().notNull().default([]),
  imageUrl: text('image_url'),
  publishedAt: timestamp('published_at').notNull(),
  fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
  embedding: vector('embedding', { dimensions: 512 }),
}, table => [
  index('embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
])
