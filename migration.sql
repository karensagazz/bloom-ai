-- Bloom Database Migration Script
-- Run this in Supabase SQL Editor to create all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "name" TEXT,
  "role" TEXT DEFAULT 'member' NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Brands table
CREATE TABLE IF NOT EXISTS "Brand" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "spreadsheetId" TEXT,
  "spreadsheetUrl" TEXT,
  "sheetName" TEXT,
  "slackChannelId" TEXT,
  "slackChannelName" TEXT,
  "website" TEXT,
  "websiteSummary" TEXT,
  "brandIntelligence" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "syncStatus" TEXT DEFAULT 'pending' NOT NULL,
  "syncProgress" INTEGER DEFAULT 0,
  "syncStep" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- SheetRows table
CREATE TABLE IF NOT EXISTS "SheetRow" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "rowIndex" INTEGER NOT NULL,
  "data" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SheetRow_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE,
  CONSTRAINT "SheetRow_brandId_rowIndex_key" UNIQUE ("brandId", "rowIndex")
);

-- SlackMessages table
CREATE TABLE IF NOT EXISTS "SlackMessage" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "messageTs" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "userId" TEXT,
  "userName" TEXT,
  "content" TEXT NOT NULL,
  "threadTs" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "SlackMessage_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE,
  CONSTRAINT "SlackMessage_brandId_messageTs_key" UNIQUE ("brandId", "messageTs")
);

-- BrandNotes table
CREATE TABLE IF NOT EXISTS "BrandNote" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "BrandNote_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE
);

-- Creators table
CREATE TABLE IF NOT EXISTS "Creator" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "handle" TEXT NOT NULL,
  "followers" INTEGER NOT NULL,
  "archetype" TEXT NOT NULL,
  "vertical" TEXT NOT NULL,
  "engagement" DOUBLE PRECISION,
  "categories" TEXT NOT NULL,
  "bio" TEXT,
  "location" TEXT,
  "email" TEXT,
  "status" TEXT DEFAULT 'active' NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Deals table
CREATE TABLE IF NOT EXISTS "Deal" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "creatorId" TEXT,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT DEFAULT 'open' NOT NULL,
  "dealValue" INTEGER,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "priority" TEXT DEFAULT 'medium' NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Deal_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE,
  CONSTRAINT "Deal_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id"),
  CONSTRAINT "Deal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
);

-- DealUpdates table
CREATE TABLE IF NOT EXISTS "DealUpdate" (
  "id" TEXT PRIMARY KEY,
  "dealId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "DealUpdate_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE
);

-- Messages table
CREATE TABLE IF NOT EXISTS "Message" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Matches table
CREATE TABLE IF NOT EXISTS "Match" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT DEFAULT 'pending' NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Settings table
CREATE TABLE IF NOT EXISTS "Settings" (
  "id" TEXT PRIMARY KEY DEFAULT 'default',
  "slackBotToken" TEXT,
  "slackSigningSecret" TEXT,
  "googleServiceEmail" TEXT,
  "googlePrivateKey" TEXT,
  "openaiApiKey" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CampaignTrackers table
CREATE TABLE IF NOT EXISTS "CampaignTracker" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "spreadsheetUrl" TEXT NOT NULL,
  "spreadsheetId" TEXT NOT NULL,
  "label" TEXT,
  "year" INTEGER,
  "selectedTabs" TEXT,
  "syncStatus" TEXT DEFAULT 'pending' NOT NULL,
  "lastSyncedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignTracker_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE,
  CONSTRAINT "CampaignTracker_brandId_spreadsheetId_key" UNIQUE ("brandId", "spreadsheetId")
);

-- TrackerTabs table
CREATE TABLE IF NOT EXISTS "TrackerTab" (
  "id" TEXT PRIMARY KEY,
  "trackerId" TEXT NOT NULL,
  "gid" TEXT NOT NULL,
  "tabName" TEXT NOT NULL,
  "tabIndex" INTEGER NOT NULL,
  "isEnabled" BOOLEAN DEFAULT true NOT NULL,
  "rowCount" INTEGER DEFAULT 0 NOT NULL,
  "headers" TEXT,
  "rawData" TEXT,
  "syncedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "TrackerTab_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "CampaignTracker"("id") ON DELETE CASCADE,
  CONSTRAINT "TrackerTab_trackerId_gid_key" UNIQUE ("trackerId", "gid")
);

-- BrandInfluencers table
CREATE TABLE IF NOT EXISTS "BrandInfluencer" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "platform" TEXT,
  "email" TEXT,
  "estimatedRate" TEXT,
  "totalCampaigns" INTEGER DEFAULT 0 NOT NULL,
  "notes" TEXT,
  "sourceRefs" TEXT,
  "deliverables" TEXT,
  "term" TEXT,
  "paidUsageTerms" TEXT,
  "cohort" TEXT,
  "engagementRate" TEXT,
  "followerCount" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrandInfluencer_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE,
  CONSTRAINT "BrandInfluencer_brandId_name_key" UNIQUE ("brandId", "name")
);

-- CampaignRecords table
CREATE TABLE IF NOT EXISTS "CampaignRecord" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "trackerId" TEXT NOT NULL,
  "influencerName" TEXT,
  "handle" TEXT,
  "campaignName" TEXT,
  "platform" TEXT,
  "contentType" TEXT,
  "dealValue" TEXT,
  "status" TEXT,
  "year" INTEGER,
  "quarter" TEXT,
  "tabName" TEXT,
  "rawData" TEXT,
  "recordType" TEXT DEFAULT 'campaign' NOT NULL,
  "contractType" TEXT,
  "deliverables" TEXT,
  "paymentTerms" TEXT,
  "usageRights" TEXT,
  "exclusivity" TEXT,
  "contractStart" TEXT,
  "contractEnd" TEXT,
  "totalValue" INTEGER,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "CampaignRecord_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE,
  CONSTRAINT "CampaignRecord_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "CampaignTracker"("id") ON DELETE CASCADE
);

-- CampaignInsights table
CREATE TABLE IF NOT EXISTS "CampaignInsight" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "trackerId" TEXT,
  "category" TEXT NOT NULL,
  "sentiment" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceRef" TEXT,
  "confidence" TEXT DEFAULT 'medium' NOT NULL,
  "influencerName" TEXT,
  "campaignName" TEXT,
  "platform" TEXT,
  "year" INTEGER,
  "quarter" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignInsight_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE,
  CONSTRAINT "CampaignInsight_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "CampaignTracker"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CampaignInsight_brandId_category_idx" ON "CampaignInsight"("brandId", "category");
CREATE INDEX IF NOT EXISTS "CampaignInsight_brandId_year_idx" ON "CampaignInsight"("brandId", "year");

-- InfluencerNotes table
CREATE TABLE IF NOT EXISTS "InfluencerNote" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "influencerId" TEXT NOT NULL,
  "noteType" TEXT NOT NULL,
  "sentiment" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "relatedCampaigns" TEXT,
  "confidence" TEXT DEFAULT 'medium' NOT NULL,
  "year" INTEGER,
  "verified" BOOLEAN DEFAULT false NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InfluencerNote_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE,
  CONSTRAINT "InfluencerNote_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "BrandInfluencer"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "InfluencerNote_brandId_influencerId_idx" ON "InfluencerNote"("brandId", "influencerId");
CREATE INDEX IF NOT EXISTS "InfluencerNote_brandId_noteType_idx" ON "InfluencerNote"("brandId", "noteType");

-- BrandLearnings table
CREATE TABLE IF NOT EXISTS "BrandLearning" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "priority" TEXT DEFAULT 'medium' NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "recommendation" TEXT,
  "supportingData" TEXT,
  "confidence" TEXT DEFAULT 'medium' NOT NULL,
  "sampleSize" INTEGER,
  "platforms" TEXT,
  "timeframe" TEXT,
  "status" TEXT DEFAULT 'active' NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrandLearning_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE,
  CONSTRAINT "BrandLearning_brandId_title_key" UNIQUE ("brandId", "title")
);

CREATE INDEX IF NOT EXISTS "BrandLearning_brandId_category_idx" ON "BrandLearning"("brandId", "category");
CREATE INDEX IF NOT EXISTS "BrandLearning_brandId_priority_idx" ON "BrandLearning"("brandId", "priority");
CREATE INDEX IF NOT EXISTS "BrandLearning_brandId_status_idx" ON "BrandLearning"("brandId", "status");

-- TrendAnalysis table
CREATE TABLE IF NOT EXISTS "TrendAnalysis" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "trendType" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "dataPoints" TEXT NOT NULL,
  "magnitude" DOUBLE PRECISION,
  "confidence" TEXT DEFAULT 'medium' NOT NULL,
  "timeframe" TEXT NOT NULL,
  "detectedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "platforms" TEXT,
  "influencers" TEXT,
  "status" TEXT DEFAULT 'active' NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrendAnalysis_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "TrendAnalysis_brandId_trendType_idx" ON "TrendAnalysis"("brandId", "trendType");
CREATE INDEX IF NOT EXISTS "TrendAnalysis_brandId_status_idx" ON "TrendAnalysis"("brandId", "status");
CREATE INDEX IF NOT EXISTS "TrendAnalysis_brandId_detectedAt_idx" ON "TrendAnalysis"("brandId", "detectedAt");

-- StrategicRecommendations table
CREATE TABLE IF NOT EXISTS "StrategicRecommendation" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "priority" TEXT DEFAULT 'medium' NOT NULL,
  "title" TEXT NOT NULL,
  "recommendation" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "basedOn" TEXT NOT NULL,
  "confidence" TEXT DEFAULT 'medium' NOT NULL,
  "expectedImpact" TEXT,
  "effort" TEXT,
  "timeframe" TEXT,
  "status" TEXT DEFAULT 'pending' NOT NULL,
  "feedback" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StrategicRecommendation_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "StrategicRecommendation_brandId_category_idx" ON "StrategicRecommendation"("brandId", "category");
CREATE INDEX IF NOT EXISTS "StrategicRecommendation_brandId_priority_idx" ON "StrategicRecommendation"("brandId", "priority");
CREATE INDEX IF NOT EXISTS "StrategicRecommendation_brandId_status_idx" ON "StrategicRecommendation"("brandId", "status");

-- DataQualityFlags table
CREATE TABLE IF NOT EXISTS "DataQualityFlag" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "issueType" TEXT NOT NULL,
  "severity" TEXT DEFAULT 'medium' NOT NULL,
  "description" TEXT NOT NULL,
  "affectedFields" TEXT,
  "status" TEXT DEFAULT 'open' NOT NULL,
  "resolution" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataQualityFlag_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE,
  CONSTRAINT "DataQualityFlag_brandId_entityType_entityId_issueType_key" UNIQUE ("brandId", "entityType", "entityId", "issueType")
);

CREATE INDEX IF NOT EXISTS "DataQualityFlag_brandId_entityType_entityId_idx" ON "DataQualityFlag"("brandId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "DataQualityFlag_brandId_issueType_idx" ON "DataQualityFlag"("brandId", "issueType");
CREATE INDEX IF NOT EXISTS "DataQualityFlag_brandId_status_idx" ON "DataQualityFlag"("brandId", "status");

-- KnowledgeFolders table
CREATE TABLE IF NOT EXISTS "KnowledgeFolder" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "parentId" TEXT,
  "folderType" TEXT DEFAULT 'custom' NOT NULL,
  "orderIndex" INTEGER DEFAULT 0 NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeFolder_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE,
  CONSTRAINT "KnowledgeFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KnowledgeFolder"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "KnowledgeFolder_brandId_parentId_idx" ON "KnowledgeFolder"("brandId", "parentId");
CREATE INDEX IF NOT EXISTS "KnowledgeFolder_brandId_folderType_idx" ON "KnowledgeFolder"("brandId", "folderType");

-- KnowledgeDocuments table
CREATE TABLE IF NOT EXISTS "KnowledgeDocument" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "folderId" TEXT,
  "title" TEXT NOT NULL,
  "content" TEXT,
  "documentType" TEXT NOT NULL,
  "sourceIds" TEXT,
  "isAutoGenerated" BOOLEAN DEFAULT false NOT NULL,
  "lastEditedBy" TEXT,
  "icon" TEXT,
  "orderIndex" INTEGER DEFAULT 0 NOT NULL,
  "tags" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeDocument_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE,
  CONSTRAINT "KnowledgeDocument_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "KnowledgeFolder"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "KnowledgeDocument_brandId_folderId_idx" ON "KnowledgeDocument"("brandId", "folderId");
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_brandId_documentType_idx" ON "KnowledgeDocument"("brandId", "documentType");
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_brandId_isAutoGenerated_idx" ON "KnowledgeDocument"("brandId", "isAutoGenerated");

-- Success message
SELECT 'Database migration completed successfully! All tables created.' AS result;
