# Smart Learning Planner - AI-Driven Adaptive SaaS

## Product Overview
An AI-powered adaptive study platform for students preparing for competitive and board exams. It generates dynamic, time-boxed study timetables using spaced repetition (SM-2), tracks confidence, recalculates schedules when tasks are missed (<70%), predicts exam readiness via regression, and provides real-time collaborative Pomodoro study rooms.

## Implementation Status

The current application is a frontend prototype backed by in-memory Zustand demo data. The backend architecture below describes the intended target, not existing production capabilities. The initial FastAPI increment is a versioned health endpoint; authentication, PostgreSQL persistence, planner APIs, and AI integration are still pending. See [BACKEND_IMPLEMENTATION_PLAN.md](BACKEND_IMPLEMENTATION_PLAN.md) for the repository audit, implementation phases, and risks.

## Technology Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Icons**: Lucide React
- **HTTP Client**: Axios
- **Date Handling**: date-fns

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL (via SQLAlchemy)
- **Migrations**: Alembic
- **Caching & Real-time**: Redis + WebSockets
- **Auth**: JWT / OAuth2

### AI/ML
- **ML Library**: Scikit-learn (Readiness Regressor)
- **Scheduling**: Heuristic + SM-2 Spaced Repetition
- **LLM Integration**: LangChain (future)

## Project Structure

```
smart-learning-planner/
├── frontend/               # Next.js 14 application
│   ├── src/
│   │   ├── app/           # App Router pages
│   │   ├── components/    # React components
│   │   ├── store/         # Zustand state
│   │   ├── hooks/         # Custom hooks
│   │   ├── services/      # API clients
│   │   └── types/         # TypeScript types
│   └── package.json
│
├── backend/               # FastAPI application
│   ├── app/
│   │   ├── api/          # Route handlers
│   │   ├── core/         # Config & security
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic
│   │   │   └── ai_engine/  # ML & scheduling
│   │   ├── db/           # Database session
│   │   └── main.py       # App entrypoint
│   └── requirements.txt
│
├── docker-compose.yml    # Local services
├── .env.example          # Environment template
└── README.md             # This file
```

## Non-Negotiable Rules

1. **Plan First, Code Second**: Always propose a plan before generating code
2. **Server is Source of Truth**: Never trust client validation or authorization alone
3. **Database Changes via Migrations**: Every schema change must go through Alembic
4. **Input Validation**: Use Pydantic schemas on every request boundary
5. **Secrets Management**: All secrets in `.env`, never committed or hardcoded
6. **Quality Gates**: Run linting, typecheck, and tests before claiming done
7. **Background Jobs**: Heavy work must never block request threads

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL 14+
- Redis 7+
- Docker & Docker Compose (optional)

### Installation

#### Using Docker (Recommended)
```bash
# Start all services
docker-compose up -d

# Check services are running
docker-compose ps
```

#### Manual Setup

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with your API URL
npm run dev
```

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your database credentials
alembic upgrade head
uvicorn app.main:app --reload
```

### Commands

**Frontend Development:**
```bash
cd frontend
npm run dev          # Start dev server (port 3000)
npm run build        # Build for production
npm run lint         # Run ESLint
npm test             # Run tests
```

**Backend Development:**
```bash
cd backend
uvicorn app.main:app --reload  # Start dev server (port 8000)
pytest                          # Run tests
alembic revision --autogenerate -m "description"  # Create migration
alembic upgrade head           # Apply migrations
python -m black .              # Format code
python -m mypy .               # Type check
```

## Core Features

### 1. Adaptive Study Planning
- Time-boxed schedules based on exam date and daily availability
- Weighted priority calculation (confidence score + difficulty + days to exam)
- SM-2 spaced repetition (D+1, D+7 intervals)
- Automatic replanning when progress drops below 70%

### 2. Pomodoro Focus Timer
- 25-minute study / 5-minute break cycles
- Topic tracking during sessions
- State synchronized across devices

### 3. Confidence Tracking
- 1-5 rating scale after each study session
- Triggers dynamic rescheduling for low scores (<3)
- Feeds into exam readiness prediction

### 4. Exam Readiness Prediction
- Scikit-learn regression model
- Factors: avg confidence, completion rate, days remaining
- Real-time probability score (0-100%)

### 5. Smart Recommendations
- YouTube Data API v3 integration
- Video suggestions for weak topics
- Thumbnail, duration, and channel metadata

### 6. Streak & Gamification
- Daily study streak tracking
- Milestone badges (7, 14, 30 days)
- Fire visual with dynamic coloring

### 7. Group Study Rooms
- WebSocket-based real-time collaboration
- Synchronized Pomodoro timers
- Peer presence indicators

## API Endpoints

### Authentication
- `POST /api/v1/auth/signup` - User registration
- `POST /api/v1/auth/login` - User login (JWT)

### Planner
- `POST /api/v1/planner/generate-plan` - Initial schedule generation
- `POST /api/v1/planner/adjust-plan/:userId` - Dynamic replanning

### Progress
- `POST /api/v1/progress/log` - Log study session + confidence
- `GET /api/v1/progress/weekly-report/:userId` - Weekly analytics

### User Data
- `GET /api/v1/users/:userId` - User profile
- `GET /api/v1/users/:userId/streak` - Streak data
- `GET /api/v1/users/:userId/readiness` - Exam readiness score
- `GET /api/v1/users/:userId/recommendations` - YouTube videos

### WebSocket
- `WS /ws/study-room/:roomId` - Real-time group study

## Environment Variables

**Frontend (.env.local):**
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
```

**Backend (.env):**
```
DATABASE_URL=postgresql://user:password@localhost:5432/smart_planner
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=your-secret-key-here
YOUTUBE_API_KEY=your-youtube-api-key
```

## Database Schema

### Core Tables
- `users` - User profiles, exam dates, goals
- `subjects` - Subject catalog
- `topics` - Individual topics with metadata
- `study_plans` - Time-boxed task schedule
- `progress_logs` - Completed sessions with confidence ratings
- `streaks` - Daily consistency tracking

## AI Engine Components

### 1. Scheduler (`services/ai_engine/scheduler.py`)
- Weighted priority formula
- Time-boxing algorithm
- Break insertion logic

### 2. SM-2 Algorithm (`services/ai_engine/sm2.py`)
- Spaced repetition intervals
- D+1, D+7 review scheduling

### 3. Predictor (`services/ai_engine/predictor.py`)
- Scikit-learn regression model
- Features: avg_confidence, completion_rate, days_remaining
- Trained on historical success patterns

### 4. YouTube Connector (`services/ai_engine/youtube.py`)
- YouTube Data API v3 client
- Search by topic + difficulty
- Thumbnail + metadata extraction

## Development Workflow

1. **Feature Planning**: Create design doc, get approval
2. **Database Changes**: Write Alembic migration
3. **Backend**: Implement models → schemas → routes → services
4. **Frontend**: Build components → integrate API → test UI
5. **Testing**: Write unit + integration tests
6. **Quality Check**: Lint, typecheck, test coverage
7. **Documentation**: Update API docs, README

## Testing Strategy

**Backend:**
- Unit tests for business logic
- Integration tests for API endpoints
- Mock external services (YouTube API, Redis)

**Frontend:**
- Component unit tests (Jest + React Testing Library)
- E2E tests for critical flows (Playwright)
- Visual regression tests

## Deployment

**Frontend (Vercel):**
```bash
npm run build
# Deploy to Vercel
```

**Backend (Docker):**
```bash
docker build -t smart-planner-backend .
docker run -p 8000:8000 --env-file .env smart-planner-backend
```

## Roadmap

### Phase 1 (Current) - MVP
- ✅ Frontend UI with dummy data
- ⏳ Backend API implementation
- ⏳ Database setup with Alembic
- ⏳ Basic AI scheduler

### Phase 2 - Core AI
- ML model training for readiness prediction
- YouTube API integration
- WebSocket group study rooms
- Streak calculation service

### Phase 3 - Advanced Features
- Mobile app (React Native)
- Calendar sync (Google Calendar)
- Flashcard generation (LangChain)
- Study analytics dashboard

### Phase 4 - Scale
- Multi-tenant architecture
- Payment integration (Stripe)
- Email notifications (SendGrid)
- Performance optimization

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the Non-Negotiable Rules
4. Write tests for new features
5. Run quality checks before committing
6. Submit pull request with detailed description

## License

Proprietary - All Rights Reserved

## Support

For questions or issues:
- Email: support@smartlearningplanner.com
- Documentation: docs.smartlearningplanner.com
- GitHub Issues: github.com/yourorg/smart-learning-planner/issues

---

Built with ❤️ for focused, adaptive learning
