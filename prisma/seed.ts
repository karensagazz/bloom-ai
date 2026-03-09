import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Database ready for real data import.')
  console.log('')
  console.log('Next steps:')
  console.log('  1. Go to Settings and configure:')
  console.log('     - Google Sheets service account credentials')
  console.log('     - Slack bot token')
  console.log('  2. Add brands by connecting campaign tracker spreadsheets')
  console.log('  3. Sync to pull data from your spreadsheets')
  console.log('')
  console.log('No mock data created - connect your real campaign trackers!')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
