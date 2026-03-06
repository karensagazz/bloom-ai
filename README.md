# Bloom - AI-Powered Influencer Marketing Platform

Bloom is a comprehensive influencer marketing platform that helps teams manage deals, clients, and creator partnerships with AI-powered insights and recommendations.

## Features

- 🤖 **AI Assistant**: Conversational AI for answering questions about clients, deals, and creators
- 📊 **Deal Management**: Track and manage influencer marketing deals with priority levels
- 👥 **Client Profiles**: Centralized database for client information and preferences
- ⭐ **Creator Roster**: Comprehensive creator database with platform stats and engagement metrics
- 🎯 **Smart Matching**: AI-powered brand-creator partnership recommendations based on archetypes and verticals
- 📧 **Email Drafting**: AI-assisted email composition for client communication
- 📈 **Analytics Dashboard**: Real-time insights into deals, clients, and creator performance

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: Prisma with SQLite (easily swappable for PostgreSQL/MySQL)
- **AI**: OpenAI GPT-4
- **UI**: Tailwind CSS with Radix UI components
- **Styling**: Clean, minimal design with stone/neutral color palette

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- OpenAI API key

### Installation

1. Clone the repository or navigate to the project directory:

```bash
cd bloom
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY="your-openai-api-key-here"
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"
```

4. Initialize the database:

```bash
npm run db:push
```

5. Seed the database with sample data:

```bash
npm run db:seed
```

6. Start the development server:

```bash
npm run dev
```

7. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
bloom/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── seed.ts            # Sample data
├── src/
│   ├── app/
│   │   ├── api/           # API routes
│   │   ├── dashboard/     # Dashboard pages
│   │   ├── layout.tsx     # Root layout
│   │   └── page.tsx       # Landing page
│   ├── components/
│   │   ├── ui/            # Reusable UI components
│   │   ├── chat-interface.tsx
│   │   ├── deal-card.tsx
│   │   └── creator-card.tsx
│   └── lib/
│       ├── db.ts          # Prisma client
│       ├── ai.ts          # OpenAI integration
│       └── utils.ts       # Utility functions
├── package.json
├── tsconfig.json
└── tailwind.config.ts
```

## Key Features Explained

### AI Assistant

The AI assistant is powered by OpenAI's GPT-4 and provides:
- Answers to questions about deals, clients, and creators
- Email drafting assistance
- Deal insights and recommendations
- Natural language interface for data queries

### Deal Management

Manage your influencer marketing pipeline:
- Track deal status (open, in progress, closed, cancelled)
- Set priority levels (low, medium, high)
- Link deals to clients and creators
- Monitor deal values and timelines

### Smart Matching

AI-powered creator recommendations:
- Analyzes client vertical and requirements
- Matches with creators based on archetype and vertical alignment
- Provides match scores and reasoning
- Considers engagement rates and audience size

### Creator Roster

Comprehensive creator database:
- Platform-specific metrics (Instagram, TikTok, YouTube, Twitter)
- Follower counts and engagement rates
- Archetype and vertical categorization
- Contact information and bio

## API Routes

- `POST /api/chat` - Chat with AI assistant
- `POST /api/matches/generate` - Generate creator matches for a client
- `POST /api/email/draft` - Draft emails with AI assistance

## Database Schema

Key models:
- **User**: Team members
- **Client**: Brand clients
- **Creator**: Influencers/content creators
- **Deal**: Partnership deals
- **Match**: AI-generated brand-creator matches
- **Message**: AI chat history

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:push` - Push database schema changes
- `npm run db:studio` - Open Prisma Studio (database GUI)
- `npm run db:seed` - Seed database with sample data

## Customization

### Switching Database

To use PostgreSQL or MySQL instead of SQLite:

1. Update `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"  // or "mysql"
  url      = env("DATABASE_URL")
}
```

2. Update `DATABASE_URL` in `.env`
3. Run `npm run db:push`

### Adding Authentication

The project includes NextAuth setup. To enable:

1. Configure providers in `src/app/api/auth/[...nextauth]/route.ts`
2. Add authentication checks to protected routes
3. Update UI to show login/logout

## Production Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import repository in Vercel
3. Add environment variables
4. Deploy

### Other Platforms

1. Build the application: `npm run build`
2. Set environment variables
3. Start the server: `npm run start`

## Support

For issues or questions, please open an issue on the repository.

## License

MIT License - feel free to use this project for your own purposes.
