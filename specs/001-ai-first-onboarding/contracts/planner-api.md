# API Contract: Plan Confirmation & Persistence

## Endpoints

### 1. Confirm AI Plan Proposal ("Build My Plan")
`POST /api/v1/planner/confirm-plan`

#### Request Body
```json
{
  "proposal_id": "prop-88291029-3b7d-4142-913b-287900b70999",
  "proposal": {
    "planning_period": "2026-10-03 to 2026-12-15",
    "daily_time_minutes": 180,
    "tasks": [
      {
        "topic_id": "topic-2",
        "scheduled_date": "2026-10-03",
        "scheduled_time": "09:00",
        "duration_minutes": 50,
        "priority_tag": "Weak Area"
      },
      {
        "topic_id": "topic-1",
        "scheduled_date": "2026-10-03",
        "scheduled_time": "10:30",
        "duration_minutes": 50,
        "priority_tag": "Spaced Revision"
      }
    ]
  }
}
```

#### Response (200 OK)
Executes PostgreSQL database transaction: sets `user.is_onboarded = True`, creates `StudyPlan` + `StudyPlanVersion` (v1), populates `StudyTask` rows, and returns confirmation.

```json
{
  "success": true,
  "data": {
    "plan_id": "plan-11223344-5566-7788-9900-aabbccddeeff",
    "version_id": "ver-10000000-0000-0000-0000-000000000001",
    "version_number": 1,
    "tasks_created": 2,
    "redirect_url": "/dashboard"
  },
  "message": "Study plan confirmed and committed to database successfully."
}
```
