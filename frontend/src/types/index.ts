// User Profile & Settings
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  exam_date: string;
  score_goal: number;
  weak_subjects: string[];
  daily_time_minutes: number;
  education_level?: string;
  board_curriculum?: string;
  grade_class?: string;
  target_subjects?: string[];
  weak_topics?: string[];
  strong_topics?: string[];
  completed_topics?: string[];
  study_routine?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  full_name: string;
  is_onboarded: boolean;
  has_student_profile: boolean;
}

export interface OTPChallengeResponse {
  success: boolean;
  requires_otp?: boolean;
  challenge_id?: string;
  masked_email?: string;
  expires_in_seconds?: number;
  resend_cooldown_seconds?: number;
  message?: string;
  data?: {
    user?: AuthenticatedUser;
    access_token?: string;
    challenge_id?: string;
    masked_email?: string;
    expires_in_seconds?: number;
    resend_cooldown_seconds?: number;
  };
}

export interface DeviceSession {
  id: string;
  device_id?: string;
  device_name: string;
  device_type: 'mobile' | 'desktop' | 'tablet' | 'unknown' | string;
  is_current: boolean;
  last_active?: string;
  last_active_at?: string;
  created_at: string;
  ip_address?: string;
}

export interface DevicesResponse {
  success?: boolean;
  max_devices?: number;
  max_allowed?: number;
  current_count?: number;
  devices: DeviceSession[];
}

export type DeviceSessionOut = DeviceSession;

export interface SyncStatus {
  success: boolean;
  session_valid: boolean;
  active_devices_count: number;
  streak_count: number;
  readiness_score: number;
  server_time: string;
}


export interface SignupRequest {
  full_name: string;
  email: string;
  password: string;
  confirm_password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface BaselineOnboardingRequest {
  education_level: string;
  board_curriculum: string;
  grade_class: string;
  target_subjects: string[];
}

export interface BaselineOnboardingResponse {
  success: boolean;
  data: {
    profile: {
      id: string;
      user_id: string;
      education_level: string;
      board_curriculum: string;
      grade_class: string;
      target_subjects: string[];
      daily_time_minutes: number;
      weak_topics: string[];
      strong_topics: string[];
      completed_topics: string[];
    };
    next_route: string;
  };
  message: string;
}

// Study Topics & Subjects
export interface Topic {
  id: string;
  subject: string;
  name: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  difficulty: number;
  confidence_score: number;
  last_studied?: string;
  next_review_date?: string;
}

// Study Plan Item
export interface PlanItem {
  id: string;
  topic_id: string;
  topic: Topic;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  completed: boolean;
  priority_tag: 'High' | 'Weak Area' | 'Spaced Revision' | 'Regular';
}

// Progress Log
export interface ProgressLog {
  id: string;
  topic_id: string;
  confidence_rating: number;
  duration_minutes: number;
  completed_at: string;
}

// Streak Data
export interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_study_date: string;
  is_active: boolean;
}

// Pomodoro Timer State
export type PomodoroStatus = 'IDLE' | 'RUNNING' | 'PAUSED';
export type SessionType = 'STUDY' | 'BREAK';

export interface PomodoroState {
  status: PomodoroStatus;
  sessionType: SessionType;
  secondsRemaining: number;
  totalSeconds: number;
  activeTopic?: Topic;
}

// YouTube Recommendation
export interface VideoRecommendation {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  channel: string;
  url: string;
  topic: string;
}

// Exam Readiness
export interface ReadinessScore {
  probability: number;
  last_updated: string;
  factors: {
    avg_confidence: number;
    days_remaining: number;
    completion_rate: number;
  };
}

// Onboarding Form
export interface OnboardingData {
  exam_date: string;
  score_goal: number;
  weak_subjects: string[];
  daily_time_minutes: number;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface GeneratePlanResponse {
  plan: PlanItem[];
  message: string;
}

export type AIProviderId = 'omniroute' | 'opencode_zen';
export type AIProviderStatus =
  | 'healthy'
  | 'unavailable'
  | 'not_configured'
  | 'model_unavailable'
  | 'unsupported_capability';

export interface AIProviderHealth {
  provider: AIProviderId;
  status: AIProviderStatus;
  model: string | null;
  protocol: string | null;
  missing_configuration: string[];
  error_type: string | null;
  capabilities: string[];
}

export interface AIProviderDiagnostics {
  mode: 'auto' | AIProviderId;
  primary_provider: AIProviderId;
  fallback_provider: AIProviderId;
  fallback_enabled: boolean;
  providers: AIProviderHealth[];
}

// AI Chat Types
export interface AIChatRequest {
  message: string;
  conversation_id?: string;
  notebook_id?: string;
  response_style?: string;
  selected_source_ids?: string[];
}

export interface StructuredProfileUpdate {
  education_level?: string;
  board_curriculum?: string;
  grade_class?: string;
  target_subjects?: string[];
  weak_topics?: string[];
  strong_topics?: string[];
  completed_topics?: string[];
  current_topics?: string[];
  daily_time_minutes?: number;
  exam_date?: string;
  score_goal?: number;
  study_routine?: string;
  goals?: string[];
  constraints?: string[];
  preferences?: Record<string, string>;
  planning_preferences?: Record<string, string>;
}

export interface StructuredAcademicContextUpdate {
  exams?: Array<Record<string, any>>;
}

export interface MissingInformation {
  fields: string[];
  questions: string[];
}

export interface AIChatResponse {
  success: boolean;
  message: string;
  conversation_id: string;
  ai_response: string;
  title?: string;
  profile_updates?: StructuredProfileUpdate;
  academic_context_updates?: StructuredAcademicContextUpdate;
  missing_information?: MissingInformation;
  next_question?: string;
  confidence: number;
  provider_used?: string;
  model_used?: string;
  citations?: Array<{
    source_id: string;
    source_title: string;
    passage?: string;
  }>;
}

export interface ChatMessage {
  role: string;
  content: string;
  provider_used?: string;
  model_used?: string;
  created_at: string;
  citations?: Array<{
    source_id: string;
    source_title: string;
    passage?: string;
    page_number?: number;
  }>;
}

export interface AIConversationHistoryResponse {
  success: boolean;
  conversation_id: string;
  title?: string | null;
  is_pinned?: boolean;
  response_style?: string;
  messages: ChatMessage[];
  message: string;
}

export interface ConversationOut {
  id: string;
  user_id: string;
  title?: string | null;
  is_pinned?: boolean;
  custom_title?: boolean;
  notebook_id?: string | null;
  response_style?: string;
  created_at: string;
  last_active_at: string;
  message_count: number;
}

export interface AIConversationListResponse {
  success: boolean;
  conversations: ConversationOut[];
  message: string;
}

// Planner Types
export interface StudyTaskProposal {
  topic_id: string;
  topic_name: string;
  subject: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  priority_tag: string;
  rationale?: string;
}

export interface StudyPlanProposal {
  planning_period_start: string;
  planning_period_end: string;
  subjects: string[];
  tasks: StudyTaskProposal[];
  revision_schedule?: Array<Record<string, any>>;
  practice_schedule?: Array<Record<string, any>>;
  exam_preparation?: Array<Record<string, any>>;
  weak_area_focus?: Array<Record<string, any>>;
  total_planned_hours: number;
  summary?: string;
  daily_study_minutes?: number;
  daily_break_minutes?: number;
  total_planned_minutes?: number;
}

export interface PlanPreviewResponse {
  success: boolean;
  proposal: StudyPlanProposal;
  message: string;
}

export interface PlanConfirmRequest {
  proposal: StudyPlanProposal;
  confirmed: boolean;
}

export interface PlanConfirmResponse {
  success: boolean;
  data: {
    plan_version: {
      id: string;
      plan_id: string;
      version_number: number;
      source: string;
      summary: string | null;
      created_at: string;
    };
    tasks: Array<{
      id: string;
      plan_version_id: string;
      user_id: string;
      topic_id: string;
      scheduled_date: string;
      scheduled_time: string;
      duration_minutes: number;
      completed: boolean;
      priority_tag: string;
      created_at: string;
    }>;
    next_route: string;
  };
  message: string;
}

// Dashboard Types
export interface TopicInfo {
  id: string;
  name: string;
  subject: string;
  difficulty: number;
}

export interface TodayTaskOut {
  id: string;
  plan_version_id: string;
  user_id: string;
  topic_id: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  completed: boolean;
  priority_tag: string;
  created_at: string;
  topic: TopicInfo | null;
}

export interface UpcomingTaskOut {
  id: string;
  plan_version_id: string;
  user_id: string;
  topic_id: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  completed: boolean;
  priority_tag: string;
  created_at: string;
  topic: TopicInfo | null;
}

export interface StudyTaskDetailOut {
  id: string;
  plan_version_id: string;
  user_id: string;
  topic_id: string;
  topic_name: string;
  subject: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  completed: boolean;
  priority_tag: string;
  created_at: string;
}

export interface CreateTaskRequest {
  title: string;
  subject: string;
  scheduled_date: string;
  scheduled_time?: string;
  duration_minutes?: number;
  priority_tag?: string;
}

export interface StreakOut {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_study_date: string | null;
  is_active: boolean;
}

export interface ReadinessOut {
  user_id: string;
  probability: number;
  avg_confidence: number;
  completion_rate: number;
  days_remaining: number;
  last_updated: string;
}

export interface ReviewItemOut {
  id: string;
  user_id: string;
  topic_id: string;
  topic_name: string;
  subject: string;
  last_studied: string | null;
  next_review_date: string | null;
  confidence_score: number | null;
  difficulty: number | null;
  priority: string | null;
}

export interface ExamOut {
  id: string;
  user_id: string;
  name: string;
  subject_name: string | null;
  exam_date: string;
  target_score: number | null;
  created_at: string;
}

export interface DashboardSummary {
  today_tasks: TodayTaskOut[];
  upcoming_tasks: UpcomingTaskOut[];
  streak: StreakOut | null;
  readiness: ReadinessOut | null;
  review_queue: ReviewItemOut[];
  exams: ExamOut[];
  active_plan_version_id: string | null;
  total_planned_today_minutes: number;
  completed_today_minutes: number;
}

// AI Study Notebook & Source Types
export interface NotebookOut {
  id: string;
  title: string;
  description: string | null;
  source_count: number;
  created_at: string;
}

export interface NotebookCreateRequest {
  title: string;
  description?: string;
}

export interface SourceListItem {
  id: string;
  title: string;
  source_type: 'pdf' | 'docx' | 'txt' | 'pptx' | 'google_drive' | 'note' | 'youtube' | 'url';
  origin: 'upload' | 'folder' | 'google_drive' | 'note' | 'youtube' | 'url';
  file_size: number;
  page_count: number | null;
  status: 'processing' | 'ready' | 'failed' | 'no_transcript' | 'unsupported';
  is_selected: boolean;
  meta_info: Record<string, any> | null;
  created_at: string;
}

export interface NoteOut {
  id: string;
  notebook_id: string;
  title: string;
  content: string;
  note_type: string;
  created_at: string;
}

export interface StudyToolRequest {
  topic?: string;
  context?: string;
  notebook_id?: string;
}

export interface StudyToolCitation {
  source_id: string;
  source_title: string;
  passage?: string;
}

export interface StudyToolResponse {
  success: boolean;
  topic: string;
  content: string;
  generated_at: string;
  source_references?: StudyToolCitation[];
}

export interface YouTubeVideoResult {
  video_id: string;
  title: string;
  channel: string;
  url: string;
  thumbnail?: string;
  description?: string;
}

export interface YouTubeSearchResponse {
  results: YouTubeVideoResult[];
  query: string;
  configured: boolean;
  message?: string;
}

export interface DriveStatusResponse {
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  message: string;
  account_email?: string | null;
  scopes?: string[];
  picker_ready?: boolean;
  connect_url?: string | null;
}

export interface DrivePickerConfig {
  client_id: string;
  api_key: string;
  app_id: string;
}

export interface DrivePickerToken {
  access_token: string;
  expires_in: number;
  client_id: string;
}

export interface ProfileUpdateRequest {
  full_name?: string;
  education_level?: string;
  board_curriculum?: string;
  grade_class?: string;
  target_subjects?: string[];
  weak_topics?: string[];
  strong_topics?: string[];
  daily_time_minutes?: number;
  exam_date?: string;
  score_goal?: number;
  study_routine?: string;
}

export interface FullProfileData {
  user_id?: string;
  id?: string;
  email: string;
  full_name: string;
  is_onboarded: boolean;
  has_student_profile: boolean;
  education_level: string | null;
  board_curriculum: string | null;
  grade_class: string | null;
  target_subjects: string[];
  weak_topics: string[];
  strong_topics: string[];
  daily_time_minutes: number;
  exam_date: string | null;
  score_goal: number | null;
  study_routine: string | null;
}

export interface PlanProposalGenerateRequest {
  start_date?: string;
  subject?: string;
  understanding_level?: 'beginner' | 'intermediate' | 'advanced' | string;
  weakness_details?: string;
  daily_hours?: number;
  exam_date?: string;
}

