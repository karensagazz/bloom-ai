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

const { PrismaClient: PrismaPostgres } = require('@prisma/client');
const { MongoClient } = require('mongodb');
require('dotenv').config();

// Old connection string (PostgreSQL) - Using the active Supabase instance from screenshot
const OLD_DB_URL = 'postgresql://postgres:quj!QNZ-ckz6axm@ghy@db.adklilkoxndbcwlqxeag.supabase.co:5432/postgres';

// New connection string (MongoDB)
const NEW_DB_URL = process.env.DATABASE_URL || 'mongodb+srv://karen_db_user:4aL4LP8CWrdaxZC7@bloom.opo7vku.mongodb.net/?appName=Bloom';

let pgClient, mongoClient, mongoDb;

async function connect() {
  console.log('🔗 Connecting to Supabase PostgreSQL...');
  pgClient = new PrismaPostgres({
    datasources: {
      db: {
        url: OLD_DB_URL,
      },
    },
  });

  console.log('🔗 Connecting to MongoDB...');
  mongoClient = new MongoClient(NEW_DB_URL);
  await mongoClient.connect();
  mongoDb = mongoClient.db('bloom');
  console.log('✅ Both databases connected\n');
}

async function migrateTable(tableName, fetchFn) {
  console.log(`📥 Migrating ${tableName}...`);
  const data = await fetchFn();

  if (data.length === 0) {
    console.log(`   ℹ️  No records to migrate`);
    return;
  }

  const collection = mongoDb.collection(tableName);

  // Clear existing data in MongoDB collection
  await collection.deleteMany({});

  // Insert data
  if (data.length > 0) {
    await collection.insertMany(data);
    console.log(`   ✅ Migrated ${data.length} records`);
  }
}

async function migrate() {
  try {
    await connect();

    // Migrate all tables in dependency order
    await migrateTable('User', () => pgClient.user.findMany());
    await migrateTable('Settings', () => pgClient.settings.findMany());
    await migrateTable('Brand', () => pgClient.brand.findMany());
    await migrateTable('SheetRow', () => pgClient.sheetRow.findMany());
    await migrateTable('SlackMessage', () => pgClient.slackMessage.findMany());
    await migrateTable('BrandNote', () => pgClient.brandNote.findMany());
    await migrateTable('Creator', () => pgClient.creator.findMany());
    await migrateTable('Deal', () => pgClient.deal.findMany());
    await migrateTable('DealUpdate', () => pgClient.dealUpdate.findMany());
    await migrateTable('Message', () => pgClient.message.findMany());
    await migrateTable('Match', () => pgClient.match.findMany());
    await migrateTable('CampaignTracker', () => pgClient.campaignTracker.findMany());
    await migrateTable('TrackerTab', () => pgClient.trackerTab.findMany());
    await migrateTable('BrandInfluencer', () => pgClient.brandInfluencer.findMany());
    await migrateTable('CampaignRecord', () => pgClient.campaignRecord.findMany());
    await migrateTable('CampaignInsight', () => pgClient.campaignInsight.findMany());
    await migrateTable('InfluencerNote', () => pgClient.influencerNote.findMany());
    await migrateTable('BrandLearning', () => pgClient.brandLearning.findMany());
    await migrateTable('TrendAnalysis', () => pgClient.trendAnalysis.findMany());
    await migrateTable('StrategicRecommendation', () => pgClient.strategicRecommendation.findMany());
    await migrateTable('DataQualityFlag', () => pgClient.dataQualityFlag.findMany());
    await migrateTable('KnowledgeFolder', () => pgClient.knowledgeFolder.findMany());
    await migrateTable('KnowledgeDocument', () => pgClient.knowledgeDocument.findMany());

    console.log('\n✨ Migration complete!');
    console.log('All data has been transferred from Supabase PostgreSQL to MongoDB');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pgClient.$disconnect();
    await mongoClient.close();
  }
}

migrate();
