# API Contract: AI Assistant Conversational Setup & Proposal

## Endpoints

### 1. Send Message / Conversational Profiling
`POST /api/v1/ai/chat`

#### Request Body
```json
{
  "message": "My exam is on December 15. I'm weak at Organic Chemistry SN1/SN2 pathways, but good at Calculus limits. I can study 3 hours daily."
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "reply": "Got it! I've noted your Dec 15 exam date, 3-hour daily time budget, and weak area in Organic Chemistry. Based on your inputs, I have generated a custom Study Plan Proposal for you to review.",
    "updated_profile": {
      "exam_date": "2026-12-15",
      "daily_time_minutes": 180,
      "weak_topics": ["Reaction Mechanisms: SN1 vs SN2 Pathways"],
      "strong_topics": ["Calculus Limits & Continuity"]
    },
    "proposal": {
      "proposal_id": "prop-88291029-3b7d-4142-913b-287900b70999",
      "planning_period": "2026-10-03 to 2026-12-15",
      "daily_time_minutes": 180,
      "summary": "High-yield preparation plan prioritizing Organic Chemistry reaction pathways and spaced revision for Calculus.",
      "tasks": [
        {
          "topic_id": "topic-2",
          "subject": "Organic Chemistry",
          "topic_name": "Reaction Mechanisms: SN1 vs SN2 Pathways",
          "scheduled_date": "2026-10-03",
          "scheduled_time": "09:00",
          "duration_minutes": 50,
          "priority_tag": "Weak Area",
          "reason": "High priority due to weak mastery and upcoming exam"
        },
        {
          "topic_id": "topic-1",
          "subject": "Calculus",
          "topic_name": "Integration Techniques & Taylor Series",
          "scheduled_date": "2026-10-03",
          "scheduled_time": "10:30",
          "duration_minutes": 50,
          "priority_tag": "Spaced Revision",
          "reason": "Scheduled revision interval for active recall"
        }
      ]
    }
  }
}
```

---

### 2. Get AI Conversation History
`GET /api/v1/ai/history`

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "conversation_id": "conv-11112222-3b7d-4142-913b-287900b70000",
    "messages": [
      {
        "id": "msg-001",
        "role": "assistant",
        "content": "Welcome Alex! Tell me about your upcoming exams, weak topics, and daily routine.",
        "created_at": "2026-10-03T10:00:00Z"
      },
      {
        "id": "msg-002",
        "role": "user",
        "content": "My exam is on December 15...",
        "created_at": "2026-10-03T10:01:00Z"
      }
    ]
  }
}
```
