import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Create a default user
  const user = await prisma.user.upsert({
    where: { email: 'demo@bloom.app' },
    update: {},
    create: {
      email: 'demo@bloom.app',
      name: 'Demo User',
      role: 'admin',
    },
  })

  // Create clients
  const clients = await Promise.all([
    prisma.client.create({
      data: {
        name: 'TechFlow Inc',
        industry: 'Technology',
        vertical: 'Tech',
        description: 'Leading tech company specializing in productivity software',
        budget: 50000000, // $500,000
        status: 'active',
        contactName: 'Sarah Johnson',
        contactEmail: 'sarah@techflow.com',
      },
    }),
    prisma.client.create({
      data: {
        name: 'GlowBeauty',
        industry: 'Beauty & Cosmetics',
        vertical: 'Beauty',
        description: 'Premium skincare and beauty products brand',
        budget: 30000000, // $300,000
        status: 'active',
        contactName: 'Emily Chen',
        contactEmail: 'emily@glowbeauty.com',
      },
    }),
    prisma.client.create({
      data: {
        name: 'FitLife Athletics',
        industry: 'Fitness & Wellness',
        vertical: 'Fitness',
        description: 'Athletic wear and fitness equipment company',
        budget: 40000000, // $400,000
        status: 'active',
        contactName: 'Mike Rodriguez',
        contactEmail: 'mike@fitlife.com',
      },
    }),
  ])

  // Create creators
  const creators = await Promise.all([
    prisma.creator.create({
      data: {
        name: 'Alex Thompson',
        platform: 'Instagram',
        handle: 'alextech',
        followers: 850000,
        archetype: 'Tech Reviewer',
        vertical: 'Tech',
        engagement: 4.2,
        categories: JSON.stringify(['Technology', 'Gadgets', 'Reviews']),
        bio: 'Tech enthusiast sharing honest reviews and tech tips',
        location: 'San Francisco, CA',
        email: 'alex@alextech.com',
        status: 'active',
      },
    }),
    prisma.creator.create({
      data: {
        name: 'Sophia Martinez',
        platform: 'TikTok',
        handle: 'sophiabeauty',
        followers: 2500000,
        archetype: 'Beauty Influencer',
        vertical: 'Beauty',
        engagement: 6.8,
        categories: JSON.stringify(['Beauty', 'Skincare', 'Makeup']),
        bio: 'Beauty content creator | Skincare obsessed | Cruelty-free advocate',
        location: 'Los Angeles, CA',
        email: 'sophia@sophiabeauty.com',
        status: 'active',
      },
    }),
    prisma.creator.create({
      data: {
        name: 'Jake Williams',
        platform: 'YouTube',
        handle: 'jakefitness',
        followers: 1200000,
        archetype: 'Fitness Coach',
        vertical: 'Fitness',
        engagement: 5.5,
        categories: JSON.stringify(['Fitness', 'Nutrition', 'Lifestyle']),
        bio: 'Certified personal trainer helping you reach your fitness goals',
        location: 'Austin, TX',
        email: 'jake@jakefitness.com',
        status: 'active',
      },
    }),
    prisma.creator.create({
      data: {
        name: 'Emma Davis',
        platform: 'Instagram',
        handle: 'emmastyle',
        followers: 950000,
        archetype: 'Fashion & Lifestyle',
        vertical: 'Fashion',
        engagement: 4.9,
        categories: JSON.stringify(['Fashion', 'Lifestyle', 'Travel']),
        bio: 'Fashion blogger | Sustainable style | NYC based',
        location: 'New York, NY',
        email: 'emma@emmastyle.com',
        status: 'active',
      },
    }),
    prisma.creator.create({
      data: {
        name: 'David Kim',
        platform: 'YouTube',
        handle: 'davidtechreview',
        followers: 1800000,
        archetype: 'Tech Reviewer',
        vertical: 'Tech',
        engagement: 7.2,
        categories: JSON.stringify(['Technology', 'Gaming', 'Reviews']),
        bio: 'In-depth tech reviews and comparisons',
        location: 'Seattle, WA',
        email: 'david@davidtech.com',
        status: 'active',
      },
    }),
  ])

  // Create deals
  await Promise.all([
    prisma.deal.create({
      data: {
        title: 'TechFlow Product Launch Campaign',
        description: 'Q2 product launch with tech influencers',
        status: 'open',
        dealValue: 15000000, // $150,000
        priority: 'high',
        clientId: clients[0].id,
        creatorId: creators[0].id,
        userId: user.id,
      },
    }),
    prisma.deal.create({
      data: {
        title: 'GlowBeauty Summer Collection',
        description: 'Summer skincare line promotion',
        status: 'in_progress',
        dealValue: 8000000, // $80,000
        priority: 'high',
        clientId: clients[1].id,
        creatorId: creators[1].id,
        userId: user.id,
      },
    }),
    prisma.deal.create({
      data: {
        title: 'FitLife New Year Campaign',
        description: 'New Year fitness motivation campaign',
        status: 'open',
        dealValue: 12000000, // $120,000
        priority: 'medium',
        clientId: clients[2].id,
        creatorId: creators[2].id,
        userId: user.id,
      },
    }),
  ])

  console.log('Database seeded successfully!')
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
