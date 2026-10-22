# API Contract: Authentication

## Endpoints

### 1. Register User
`POST /api/v1/auth/signup`

#### Request Body
```json
{
  "full_name": "Alex Johnson",
  "email": "alex@example.com",
  "password": "Password123!",
  "confirm_password": "Password123!"
}
```

#### Response (201 Created)
Sets HttpOnly `access_token` cookie.
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "u-9b1deb4d-3b7d-4142-913b-287900b70123",
      "email": "alex@example.com",
      "full_name": "Alex Johnson",
      "is_onboarded": false
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Account created successfully."
}
```

#### Error Response (400 Bad Request / 409 Conflict)
```json
{
  "success": false,
  "data": null,
  "message": "An account with this email address already exists."
}
```

---

### 2. Login User
`POST /api/v1/auth/login`

#### Request Body
```json
{
  "email": "alex@example.com",
  "password": "Password123!"
}
```

#### Response (200 OK)
Sets HttpOnly `access_token` cookie.
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "u-9b1deb4d-3b7d-4142-913b-287900b70123",
      "email": "alex@example.com",
      "full_name": "Alex Johnson",
      "is_onboarded": true
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Login successful."
}
```

---

### 3. Logout User
`POST /api/v1/auth/logout`

#### Response (200 OK)
Clears HttpOnly `access_token` cookie.
```json
{
  "success": true,
  "data": null,
  "message": "Logged out successfully."
}
```

---

### 4. Current User Session
`GET /api/v1/auth/me`

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "u-9b1deb4d-3b7d-4142-913b-287900b70123",
    "email": "alex@example.com",
    "full_name": "Alex Johnson",
    "is_onboarded": false
  }
}
```
