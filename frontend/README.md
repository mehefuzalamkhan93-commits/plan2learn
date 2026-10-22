# Plan2Learn - Frontend


Modern, AI-powered adaptive study platform built with Next.js 14, Tailwind CSS, and Zustand.

## Features

- 🎯 **Intelligent Study Planning**: AI-driven adaptive scheduling based on weak topics and exam dates
- ⏱️ **Pomodoro Timer**: Built-in 25/5 focus timer with topic tracking
- 🔥 **Streak Tracking**: Gamified daily consistency with milestone rewards
- 📊 **Exam Readiness**: Real-time ML-powered readiness prediction
- 🎥 **Smart Recommendations**: Curated YouTube tutorials for weak areas
- 📅 **Dynamic Schedule**: Auto-adjusting time-boxed daily plans
- 🤝 **Group Study**: Real-time collaborative study rooms (WebSocket)

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Icons**: Lucide React
- **HTTP Client**: Axios
- **Date Handling**: date-fns

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (dashboard)/        # Protected dashboard routes
│   │   │   └── page.tsx        # Main student dashboard
│   │   ├── onboarding/         # Initial setup flow
│   │   │   └── page.tsx        # Multi-step onboarding form
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Home/redirect page
│   │   └── globals.css         # Global styles
│   ├── components/             # Reusable UI components
│   │   ├── pomodoro/           # Focus timer widget
│   │   ├── streak/             # Daily streak display
│   │   ├── slider/             # Confidence rating slider
│   │   ├── schedule/           # Daily schedule view
│   │   ├── recommendations/    # YouTube video cards
│   │   └── readiness/          # Exam readiness gauge
│   ├── store/                  # Zustand state management
│   │   └── usePlannerStore.ts  # Global app state
│   ├── hooks/                  # Custom React hooks
│   │   └── usePomodoro.ts      # Pomodoro timer logic
│   ├── services/               # API client functions
│   │   └── api.ts              # Backend API integration
│   └── types/                  # TypeScript type definitions
│       └── index.ts            # Shared interfaces
├── public/                     # Static assets
├── package.json
├── tsconfig.json
└── tailwind.config.js
```

## Key Features

### Onboarding Flow
Four-step setup wizard collecting:
1. Exam date (deadline)
2. Target score/goal
3. Weak subjects (multi-select)
4. Daily available study time

### Dashboard Components

#### 📊 Metric Cards
- **Daily Progress**: Minutes studied vs. planned
- **Exam Countdown**: Days remaining with target score
- **Topics Mastered**: Confidence-based progress tracking
- **Group Study**: Live peer count and room access

#### 📅 Daily Schedule
- Time-boxed study sessions with priority tags
- Subject, topic, duration, and confidence display
- "Start Focus" (launches Pomodoro) and "Mark Done" (triggers rating)
- Confidence slider modal post-completion

#### ⏱️ Pomodoro Timer
- 25-minute study / 5-minute break cycles
- Circular progress visualization
- Play, Pause, Reset, and Skip controls
- Session type indicator

#### 🔥 Streak Widget
- Current and longest streak display
- Dynamic flame color based on streak length
- Progress bar to next milestone (7, 14, 30 days)

#### 🎯 Exam Readiness Gauge
- ML-predicted probability percentage
- Circular progress with color-coded status
- Breakdown: avg confidence, completion rate, days remaining

#### 🎥 Video Recommendations
- YouTube video cards with thumbnails
- Filtered by user's weak topics
- Direct watch links with duration display

## Design System

### Color Palette
- **Background**: `#0f172a` (Deep slate)
- **Panel**: `#1e293b` (Navy)
- **Border**: `#334155` (Slate)
- **Accent**: `#14b8a6` (Teal)
- **Accent Cyan**: `#06b6d4`
- **Text**: `#f1f5f9` (Light)
- **Text Muted**: `#94a3b8` (Gray)

### Component Patterns
- Rounded borders (`rounded-2xl`)
- Card-based layouts
- Gradient accents
- Smooth transitions
- Micro-interactions

## State Management

The app uses Zustand for global state with the following slices:

- `userProfile`: Exam date, score goal, daily minutes, weak subjects
- `schedule`: Daily task list with completion tracking
- `pomodoro`: Timer state, session type, active topic
- `streak`: Current/longest streak, activity status
- `readinessScore`: ML prediction with contributing factors
- `recommendations`: YouTube video list

## API Integration

Backend endpoints (configured via `NEXT_PUBLIC_API_URL`):

- `POST /auth/signup` - User registration
- `POST /auth/login` - User authentication
- `POST /planner/generate-plan` - Initial schedule generation
- `POST /planner/adjust-plan` - Dynamic re-planning (<70% progress)
- `POST /progress/log` - Confidence rating submission
- `GET /users/:id/streak` - Streak data retrieval
- `GET /users/:id/readiness` - Exam readiness prediction
- `GET /users/:id/recommendations` - YouTube video suggestions

## Development

```bash
# Run dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## Dummy Data

The frontend comes pre-loaded with realistic dummy data in the Zustand store for immediate demonstration without backend dependency:

- Sample user profile with exam date and goals
- 4 scheduled study tasks for today
- Active 7-day streak
- 68% readiness score
- 3 YouTube video recommendations

## Next Steps

- Implement authentication pages (`/login`, `/register`)
- Add weekly schedule view (`/schedule`)
- Build group study WebSocket integration (`/group-study`)
- Create analytics dashboard (`/analytics`)
- Add notification system for timer completion
- Implement settings page for customization

---

Built with ❤️ for focused, adaptive learning
