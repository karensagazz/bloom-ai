#!/usr/bin/env node

/**
 * Set up fresh MongoDB database with initial data
 *
 * Creates:
 * - Settings record with Slack bot token
 * - Default brand
 */

const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function setup() {
  try {
    console.log('🚀 Setting up fresh MongoDB database...\n');

    // 1. Create Settings with Slack bot token
    console.log('📝 Creating Settings record...');
    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      update: {},
      create: {
        id: 'default',
        // Add your Slack bot token here - it should start with xoxb-
        slackBotToken: process.env.SLACK_BOT_TOKEN || 'xoxb-your-slack-bot-token-here',
      },
    });
    console.log('✅ Settings created:', settings.id);

    // 2. Create a default brand
    console.log('\n📝 Creating default brand...');

    // Check if any brands exist first
    const existingBrand = await prisma.brand.findFirst();

    let brand;
    if (existingBrand) {
      console.log('   Brand already exists:', existingBrand.name);
      brand = existingBrand;
    } else {
      brand = await prisma.brand.create({
        data: {
          name: 'My Brand',
          isDefault: true,  // Set as default so bot can use it
          syncStatus: 'pending',
        },
      });
    }
    console.log('✅ Brand created:', brand.name);
    console.log('   - ID:', brand.id);
    console.log('   - Is Default:', brand.isDefault);

    console.log('\n✨ Setup complete!');
    console.log('\nNext steps:');
    console.log('1. Add your actual Slack bot token to .env as SLACK_BOT_TOKEN=xoxb-...');
    console.log('2. Update the brand name via the dashboard or API');
    console.log('3. Connect a Google Sheets tracker to the brand');
    console.log('4. Test the bot in Slack with @Bloom');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

setup();
