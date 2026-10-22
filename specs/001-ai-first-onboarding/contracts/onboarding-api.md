# API Contract: Baseline Student Onboarding

## Endpoints

### 1. Save Baseline Student Profile
`POST /api/v1/onboarding`

#### Request Body
```json
{
  "education_level": "High School",
  "board_curriculum": "CBSE",
  "grade_class": "Class 12",
  "target_subjects": ["Calculus", "Organic Chemistry", "Physics"]
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "profile": {
      "id": "p-12345678-abcd-ef01-2345-6789abcdef01",
      "user_id": "u-9b1deb4d-3b7d-4142-913b-287900b70123",
      "education_level": "High School",
      "board_curriculum": "CBSE",
      "grade_class": "Class 12",
      "target_subjects": ["Calculus", "Organic Chemistry", "Physics"],
      "daily_time_minutes": 180,
      "weak_topics": [],
      "strong_topics": [],
      "completed_topics": []
    },
    "next_route": "/ai"
  },
  "message": "Baseline student profile created. Proceeding to AI Assistant setup."
}
```
