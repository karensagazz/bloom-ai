#!/usr/bin/env node

/**
 * Migrate all data from Supabase PostgreSQL to MongoDB
 *
 * Usage: node scripts/migrate-to-mongodb.js
 *
 * Requires:
 * - OLD_DATABASE_URL (PostgreSQL/Supabase) - for reading
 * - NEW_DATABASE_URL (MongoDB) - for writing
 */

const { Pool } = require('pg');
const { MongoClient } = require('mongodb');
require('dotenv').config();

// Old connection string (PostgreSQL) - Correct Supabase instance
const OLD_DB_URL = 'postgresql://postgres:Yc0RXVbzcVGJ4Nm5@db.obgjnmqbezpzshhfkida.supabase.co:5432/postgres';

// New connection string (MongoDB)
const NEW_DB_URL = process.env.DATABASE_URL || 'mongodb+srv://karen_db_user:4aL4LP8CWrdaxZC7@bloom.opo7vku.mongodb.net/bloom?appName=Bloom';

let pgPool, mongoClient, mongoDb;

async function connect() {
  console.log('🔗 Connecting to Supabase PostgreSQL...');
  pgPool = new Pool({ connectionString: OLD_DB_URL });

  // Test connection
  await pgPool.query('SELECT 1');
  console.log('✅ PostgreSQL connected');

  console.log('🔗 Connecting to MongoDB...');
  mongoClient = new MongoClient(NEW_DB_URL);
  await mongoClient.connect();
  mongoDb = mongoClient.db('bloom');
  console.log('✅ MongoDB connected\n');
}

// Transform PostgreSQL row to MongoDB document
function transformRow(row, collectionName) {
  const doc = { ...row };

  // Map id to _id for MongoDB
  if (doc.id) {
    doc._id = doc.id;
    delete doc.id;
  }

  // Special handling for Settings table - use "default" as _id
  if (collectionName === 'Settings' && doc._id === 'default') {
    // Keep _id as "default" string
  }

  // Convert timestamps to Date objects if needed
  if (doc.createdAt && typeof doc.createdAt === 'string') {
    doc.createdAt = new Date(doc.createdAt);
  }
  if (doc.updatedAt && typeof doc.updatedAt === 'string') {
    doc.updatedAt = new Date(doc.updatedAt);
  }

  return doc;
}

async function migrateTable(tableName, postgresTableName = null) {
  const pgTable = postgresTableName || tableName;
  console.log(`📥 Migrating ${tableName}...`);

  try {
    // Query PostgreSQL table
    const result = await pgPool.query(`SELECT * FROM "${pgTable}"`);
    const rows = result.rows;

    if (rows.length === 0) {
      console.log(`   ℹ️  No records found`);
      return;
    }

    const collection = mongoDb.collection(tableName);

    // Clear existing data in MongoDB collection
    await collection.deleteMany({});

    // Transform and insert data
    const documents = rows.map(row => transformRow(row, tableName));
    await collection.insertMany(documents);
    console.log(`   ✅ Migrated ${documents.length} records`);

  } catch (error) {
    if (error.message.includes('does not exist')) {
      console.log(`   ℹ️  Table does not exist in PostgreSQL, skipping`);
    } else {
      throw error;
    }
  }
}

async function migrate() {
  try {
    await connect();

    // Migrate all tables in dependency order
    await migrateTable('User');
    await migrateTable('Settings');
    await migrateTable('Brand');
    await migrateTable('SheetRow');
    await migrateTable('SlackMessage');
    await migrateTable('BrandNote');
    await migrateTable('Creator');
    await migrateTable('Deal');
    await migrateTable('DealUpdate');
    await migrateTable('Message');
    await migrateTable('Match');
    await migrateTable('CampaignTracker');
    await migrateTable('TrackerTab');
    await migrateTable('BrandInfluencer');
    await migrateTable('CampaignRecord');
    await migrateTable('CampaignInsight');
    await migrateTable('InfluencerNote');
    await migrateTable('BrandLearning');
    await migrateTable('TrendAnalysis');
    await migrateTable('StrategicRecommendation');
    await migrateTable('DataQualityFlag');
    await migrateTable('KnowledgeFolder');
    await migrateTable('KnowledgeDocument');

    console.log('\n✨ Migration complete!');
    console.log('All data has been transferred from Supabase PostgreSQL to MongoDB');
    console.log('\nNext steps:');
    console.log('1. Verify data: curl http://localhost:3000/api/brands');
    console.log('2. Update Vercel environment: Add DATABASE_URL to production');
    console.log('3. Redeploy: git push');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (pgPool) await pgPool.end();
    if (mongoClient) await mongoClient.close();
  }
}

migrate();
