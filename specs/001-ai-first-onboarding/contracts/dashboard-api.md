# API Contract: Real Database Dashboard Hydration

## Endpoints

### 1. Main Dashboard Summary
`GET /api/v1/dashboard/summary`

#### Response (200 OK)
All fields derive strictly from PostgreSQL database records. Unpopulated items return empty lists/nulls.

```json
{
  "success": true,
  "data": {
    "user_profile": {
      "id": "u-9b1deb4d-3b7d-4142-913b-287900b70123",
      "name": "Alex Johnson",
      "exam_date": "2026-12-15",
      "days_until_exam": 74,
      "score_goal": 85,
      "daily_time_minutes": 180
    },
    "today_schedule": [
      {
        "id": "task-2",
        "topic_id": "topic-2",
        "topic": {
          "id": "topic-2",
          "subject": "Organic Chemistry",
          "name": "Reaction Mechanisms: SN1 vs SN2 Pathways",
          "priority": "HIGH",
          "difficulty": 5,
          "confidence_score": 3
        },
        "scheduled_date": "2026-10-03",
        "scheduled_time": "10:30",
        "duration_minutes": 50,
        "completed": false,
        "priority_tag": "Spaced Revision"
      }
    ],
    "streak": {
      "current_streak": 0,
      "longest_streak": 0,
      "last_study_date": null,
      "is_active": false
    },
    "readiness": {
      "probability": 50,
      "last_updated": "2026-10-03T10:00:00Z",
      "factors": {
        "avg_confidence": 3.0,
        "days_remaining": 74,
        "completion_rate": 0.0
      }
    },
    "review_queue": [],
    "resources": []
  }
}
```
