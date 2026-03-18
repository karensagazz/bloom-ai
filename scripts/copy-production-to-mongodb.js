#!/usr/bin/env node

/**
 * Copy data from production API to MongoDB
 *
 * This script fetches data from the production API and loads it into MongoDB.
 * Use this when Supabase is not accessible but production is still serving data.
 *
 * Usage: node scripts/copy-production-to-mongodb.js
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const PRODUCTION_URL = 'https://bloom-alpha-lime.vercel.app';
const MONGODB_URL = process.env.DATABASE_URL || 'mongodb+srv://karen_db_user:4aL4LP8CWrdaxZC7@bloom.opo7vku.mongodb.net/bloom?appName=Bloom';

let mongoClient, mongoDb;

async function connect() {
  console.log('🔗 Connecting to MongoDB...');
  mongoClient = new MongoClient(MONGODB_URL);
  await mongoClient.connect();
  mongoDb = mongoClient.db('bloom');
  console.log('✅ MongoDB connected\n');
}

async function fetchFromProduction(endpoint) {
  const url = `${PRODUCTION_URL}${endpoint}`;
  console.log(`📡 Fetching ${endpoint}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${response.statusText}`);
  }

  return await response.json();
}

// Transform API response to MongoDB document
function transformBrand(brand) {
  const doc = { ...brand };

  // Map id to _id for MongoDB
  doc._id = doc.id;
  delete doc.id;

  // Convert timestamps
  if (doc.createdAt) doc.createdAt = new Date(doc.createdAt);
  if (doc.updatedAt) doc.updatedAt = new Date(doc.updatedAt);
  if (doc.lastSyncedAt) doc.lastSyncedAt = new Date(doc.lastSyncedAt);

  // Remove count fields (these are computed)
  delete doc._count;

  return doc;
}

function transformSettings(settings) {
  const doc = { ...settings };

  // Settings uses "default" as _id
  doc._id = doc.id || 'default';
  delete doc.id;

  // Convert timestamps
  if (doc.createdAt) doc.createdAt = new Date(doc.createdAt);
  if (doc.updatedAt) doc.updatedAt = new Date(doc.updatedAt);

  return doc;
}

async function migrate() {
  try {
    await connect();

    // Fetch and migrate brands
    console.log('\n📥 Migrating Brands...');
    const brands = await fetchFromProduction('/api/brands');

    if (brands && brands.length > 0) {
      const brandsCollection = mongoDb.collection('Brand');

      // Clear existing brands
      await brandsCollection.deleteMany({});

      // Transform and insert
      const brandDocs = brands.map(transformBrand);
      await brandsCollection.insertMany(brandDocs);

      console.log(`✅ Migrated ${brandDocs.length} brands:`);
      brandDocs.forEach(b => {
        console.log(`   - ${b.name} (ID: ${b._id}, Default: ${b.isDefault})`);
      });
    } else {
      console.log('⚠️  No brands found in production');
    }

    // Fetch and migrate settings
    console.log('\n📥 Migrating Settings...');
    try {
      const settings = await fetchFromProduction('/api/settings');

      if (settings) {
        const settingsCollection = mongoDb.collection('Settings');

        // Clear existing settings
        await settingsCollection.deleteMany({});

        // Transform and insert
        const settingsDoc = transformSettings(settings);
        await settingsCollection.insertOne(settingsDoc);

        console.log(`✅ Migrated settings (Slack configured: ${!!settingsDoc.slackBotToken})`);
      }
    } catch (error) {
      console.log('⚠️  Could not fetch settings (endpoint may not exist)');

      // Create default settings with Slack token from env
      const settingsCollection = mongoDb.collection('Settings');
      await settingsCollection.deleteMany({});
      await settingsCollection.insertOne({
        _id: 'default',
        slackBotToken: process.env.SLACK_BOT_TOKEN || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('✅ Created default settings from environment variables');
    }

    console.log('\n✨ Migration complete!');
    console.log('\nNext steps:');
    console.log('1. Verify local data: npm run dev && curl http://localhost:3000/api/brands | jq');
    console.log('2. Update Vercel environment:');
    console.log('   - Go to https://vercel.com/sagazkaren-3133s-projects/bloom/settings/environment-variables');
    console.log('   - Add DATABASE_URL for Production environment');
    console.log('   - Value: mongodb+srv://karen_db_user:4aL4LP8CWrdaxZC7@bloom.opo7vku.mongodb.net/bloom?appName=Bloom');
    console.log('3. Redeploy: git commit --allow-empty -m "chore: trigger redeploy" && git push');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (mongoClient) await mongoClient.close();
  }
}

migrate();
