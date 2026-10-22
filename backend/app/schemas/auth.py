from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SignupRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: str
    is_onboarded: bool
    has_student_profile: bool

class AuthData(BaseModel):
    user: UserOut
    access_token: str | None = None
    token_type: str = "bearer"


class VerifyOTPRequest(BaseModel):
    challenge_id: str = Field(..., min_length=1)
    otp: str = Field(..., min_length=6, max_length=6)


class ResendOTPRequest(BaseModel):
    challenge_id: str = Field(..., min_length=1)


class OTPChallengeData(BaseModel):
    challenge_id: str
    masked_email: str
    expires_in_seconds: int = 300
    resend_cooldown_seconds: int = 60


class AuthResponse(BaseModel):
    success: bool
    data: AuthData | UserOut | OTPChallengeData | None = None
    requires_otp: bool = False
    challenge_id: str | None = None
    masked_email: str | None = None
    expires_in_seconds: int | None = None
    resend_cooldown_seconds: int | None = None
    message: str = ""


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = None
    education_level: str | None = None
    board_curriculum: str | None = None
    grade_class: str | None = None
    target_subjects: list[str] | None = None
    weak_topics: list[str] | None = None
    strong_topics: list[str] | None = None
    daily_time_minutes: int | None = None
    exam_date: str | None = None
    score_goal: int | None = None
    study_routine: str | None = None
    goals: list[str] | None = None
    preferences: dict[str, str] | None = None


class FullProfileData(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    is_onboarded: bool
    has_student_profile: bool
    education_level: str = ""
    board_curriculum: str = ""
    grade_class: str = ""
    target_subjects: list[str] = []
    weak_topics: list[str] = []
    strong_topics: list[str] = []
    daily_time_minutes: int = 180
    exam_date: str | None = None
    score_goal: int = 85
    study_routine: str | None = None
    goals: list[str] = []
    preferences: dict[str, str] = {}


class FullProfileResponse(BaseModel):
    success: bool = True
    data: FullProfileData
    message: str = "Profile retrieved successfully."


class DeviceSessionOut(BaseModel):
    id: str
    device_id: str
    device_name: str
    device_type: str
    is_current: bool = False
    last_active_at: str
    created_at: str


class DevicesResponse(BaseModel):
    success: bool = True
    max_devices: int = 2
    devices: list[DeviceSessionOut]

