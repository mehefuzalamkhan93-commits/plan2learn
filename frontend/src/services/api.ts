import axios from 'axios';
import {
  OnboardingData,
  GeneratePlanResponse,
  ProgressLog,
  ApiResponse,
  UserProfile,
  StreakData,
  ReadinessScore,
  VideoRecommendation,
  AIProviderDiagnostics,
  AuthenticatedUser,
  LoginRequest,
  SignupRequest,
  BaselineOnboardingRequest,
  BaselineOnboardingResponse,
  AIChatRequest,
  AIChatResponse,
  AIConversationHistoryResponse,
  AIConversationListResponse,
  ConversationOut,
  StudyPlanProposal,
  PlanPreviewResponse,
  PlanConfirmRequest,
  PlanConfirmResponse,
  DashboardSummary,
  NotebookOut,
  NotebookCreateRequest,
  SourceListItem,
  NoteOut,
  StudyToolRequest,
  StudyToolResponse,
  YouTubeSearchResponse,
  DriveStatusResponse,
  DrivePickerConfig,
  DrivePickerToken,
  FullProfileData,
  ProfileUpdateRequest,
  PlanProposalGenerateRequest,
  StudyTaskDetailOut,
  CreateTaskRequest,
  UpdateTaskRequest,
  DeviceSession,
  DevicesResponse,
  SyncStatus,
} from '@/types';
import { getDeviceHeaders } from '@/lib/device';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

/** Origin of the backend (used to build absolute links to backend routes,
 * e.g. the Google Drive OAuth connect endpoint). */
export const getApiBaseOrigin = (): string => {
  const match = API_URL.match(/^(https?:\/\/[^/]+)/);
  return match ? match[1] : 'http://localhost:8000';
};

export const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
};

export const setStoredToken = (token: string | null) => {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem('access_token', token);
  } else {
    localStorage.removeItem('access_token');
  }
};

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Authorization header if access token exists; strip Content-Type for FormData
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = getStoredToken();
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const deviceHeaders = getDeviceHeaders();
    for (const [key, value] of Object.entries(deviceHeaders)) {
      if (!config.headers[key]) {
        config.headers[key] = value;
      }
    }
  }

  // When uploading FormData, remove Content-Type so Axios/browser sets boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  return config;
});

// Response interceptor: on 401 on authenticated routes, clear token cleanly without loop
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      if (!url.includes('/auth/login') && !url.includes('/auth/signup')) {
        setStoredToken(null);
      }
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const authAPI = {
  signup: async (data: SignupRequest) => {
    const response = await apiClient.post<any>('/auth/signup', data);
    const token =
      response.data?.data?.access_token ||
      response.data?.access_token ||
      (response.data as any)?.token;
    if (token) {
      setStoredToken(token);
    }
    const rawUser = response.data?.data?.user || response.data?.user || response.data?.data || response.data;
    const user: AuthenticatedUser = {
      id: rawUser?.id || '',
      email: rawUser?.email || '',
      full_name: rawUser?.full_name || '',
      is_onboarded: Boolean(rawUser?.is_onboarded),
      has_student_profile: Boolean(rawUser?.has_student_profile),
    };
    return {
      ...response.data,
      data: {
        ...(response.data?.data || {}),
        user,
        access_token: token,
      },
    };
  },

  login: async (data: LoginRequest) => {
    const response = await apiClient.post<any>('/auth/login', data);
    const token =
      response.data?.data?.access_token ||
      response.data?.access_token ||
      (response.data as any)?.token;
    if (token) {
      setStoredToken(token);
    }
    const rawUser = response.data?.data?.user || response.data?.user || response.data?.data || response.data;
    const user: AuthenticatedUser = {
      id: rawUser?.id || '',
      email: rawUser?.email || '',
      full_name: rawUser?.full_name || '',
      is_onboarded: Boolean(rawUser?.is_onboarded),
      has_student_profile: Boolean(rawUser?.has_student_profile),
    };
    return {
      ...response.data,
      data: {
        ...(response.data?.data || {}),
        user,
        access_token: token,
      },
    };
  },

  verifyOTP: async (challenge_id: string, otp: string) => {
    const response = await apiClient.post<any>('/auth/verify-otp', { challenge_id, otp });
    const token =
      response.data?.data?.access_token ||
      response.data?.access_token ||
      (response.data as any)?.token;
    if (token) {
      setStoredToken(token);
    }
    const rawUser = response.data?.data?.user || response.data?.user || response.data?.data || response.data;
    const user: AuthenticatedUser = {
      id: rawUser?.id || '',
      email: rawUser?.email || '',
      full_name: rawUser?.full_name || '',
      is_onboarded: Boolean(rawUser?.is_onboarded),
      has_student_profile: Boolean(rawUser?.has_student_profile),
    };
    return {
      ...response.data,
      data: {
        ...(response.data?.data || {}),
        user,
        access_token: token,
      },
    };
  },

  resendOTP: async (challenge_id: string) => {
    const response = await apiClient.post<any>('/auth/resend-otp', { challenge_id });
    return response.data;
  },

  googleLogin: async (credential: string) => {
    const response = await apiClient.post<any>('/auth/google', { credential });
    const token =
      response.data?.data?.access_token ||
      response.data?.access_token ||
      (response.data as any)?.token;
    if (token) {
      setStoredToken(token);
    }
    const rawUser = response.data?.data?.user || response.data?.user || response.data?.data || response.data;
    const user: AuthenticatedUser = {
      id: rawUser?.id || '',
      email: rawUser?.email || '',
      full_name: rawUser?.full_name || '',
      is_onboarded: Boolean(rawUser?.is_onboarded),
      has_student_profile: Boolean(rawUser?.has_student_profile),
    };
    return {
      ...response.data,
      data: {
        ...(response.data?.data || {}),
        user,
        access_token: token,
      },
    };
  },

  getGoogleAuthConfig: async () => {
    const response = await apiClient.get<{ client_id: string | null }>('/auth/google/config');
    return response.data;
  },

  logout: async (options?: { allDevices?: boolean }) => {
    try {
      const params = options?.allDevices ? { all_devices: true } : {};
      const response = await apiClient.post<ApiResponse<null>>('/auth/logout', null, { params });
      return response.data;
    } finally {
      setStoredToken(null);
    }
  },

  forgotPassword: async (email: string) => {
    const response = await apiClient.post<any>('/auth/forgot-password', { email });
    return response.data;
  },

  verifyResetOTP: async (challenge_id: string, otp: string) => {
    const response = await apiClient.post<any>('/auth/verify-reset-otp', { challenge_id, otp });
    return response.data;
  },

  resetPassword: async (reset_token: string, new_password: string, confirm_password: string) => {
    const response = await apiClient.post<any>('/auth/reset-password', {
      reset_token,
      new_password,
      confirm_password,
    });
    return response.data;
  },

  resendResetOTP: async (challenge_id: string) => {
    const response = await apiClient.post<any>('/auth/resend-otp', { challenge_id });
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await apiClient.get<any>('/auth/me');
    const rawUser = response.data?.data?.user || response.data?.user || response.data?.data || response.data;
    const user: AuthenticatedUser = {
      id: rawUser?.id || '',
      email: rawUser?.email || '',
      full_name: rawUser?.full_name || '',
      is_onboarded: Boolean(rawUser?.is_onboarded),
      has_student_profile: Boolean(rawUser?.has_student_profile),
    };
    return {
      ...response.data,
      data: user,
    };
  },

  getProfile: async () => {
    const response = await apiClient.get<ApiResponse<FullProfileData>>('/auth/profile');
    return response.data;
  },

  updateProfile: async (data: ProfileUpdateRequest) => {
    const response = await apiClient.put<ApiResponse<FullProfileData>>('/auth/profile', data);
    return response.data;
  },

  getDevices: async () => {
    const response = await apiClient.get<DevicesResponse>('/auth/devices');
    return response.data;
  },

  revokeDevice: async (sessionId: string) => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/auth/devices/${sessionId}/revoke`
    );
    return response.data;
  },
};

// Cross-device sync endpoints
export const syncAPI = {
  getStatus: async () => {
    const response = await apiClient.get<SyncStatus>('/sync/status');
    return response.data;
  },
};


// Planner endpoints
export const plannerAPI = {
  generateProposal: async (data?: PlanProposalGenerateRequest) => {
    const response = await apiClient.post<PlanPreviewResponse>('/planner/generate-proposal', data || {});
    return response.data;
  },

  confirmPlan: async (data: PlanConfirmRequest) => {
    const response = await apiClient.post<PlanConfirmResponse>('/planner/confirm-plan', data);
    return response.data;
  },

  toggleTask: async (taskId: string) => {
    const response = await apiClient.patch(`/planner/tasks/${taskId}/toggle`);
    return response.data;
  },

  getTasks: async () => {
    const response = await apiClient.get<StudyTaskDetailOut[]>('/planner/tasks');
    return response.data;
  },

  createTask: async (data: CreateTaskRequest) => {
    const response = await apiClient.post<StudyTaskDetailOut>('/planner/tasks', data);
    return response.data;
  },

  updateTask: async (taskId: string, data: UpdateTaskRequest) => {
    const response = await apiClient.patch<StudyTaskDetailOut>(`/planner/tasks/${taskId}`, data);
    return response.data;
  },

  deleteTask: async (taskId: string) => {
    const response = await apiClient.delete(`/planner/tasks/${taskId}`);
    return response.data;
  },

  // Legacy methods for compatibility
  generatePlan: async (data: OnboardingData) => {
    const response = await apiClient.post<ApiResponse<GeneratePlanResponse>>(
      '/planner/generate-plan',
      data
    );
    return response.data;
  },

  adjustPlan: async (userId: string) => {
    const response = await apiClient.post<ApiResponse<GeneratePlanResponse>>(
      `/planner/adjust-plan/${userId}`
    );
    return response.data;
  },
};

export const onboardingAPI = {
  saveBaseline: async (data: BaselineOnboardingRequest) => {
    const response = await apiClient.post<BaselineOnboardingResponse>('/onboarding', data);
    return response.data;
  },
};

// Progress endpoints
export const progressAPI = {
  logProgress: async (data: Omit<ProgressLog, 'id' | 'completed_at'>) => {
    const response = await apiClient.post<ApiResponse<ProgressLog>>('/progress/log', data);
    return response.data;
  },

  getWeeklyReport: async (userId: string) => {
    const response = await apiClient.get<ApiResponse<any>>(`/progress/weekly-report/${userId}`);
    return response.data;
  },
};

// User data endpoints
export const userAPI = {
  getProfile: async (userId: string) => {
    const response = await apiClient.get<ApiResponse<UserProfile>>(`/users/${userId}`);
    return response.data;
  },

  getStreak: async (userId: string) => {
    const response = await apiClient.get<ApiResponse<StreakData>>(`/users/${userId}/streak`);
    return response.data;
  },

  getReadinessScore: async (userId: string) => {
    const response = await apiClient.get<ApiResponse<ReadinessScore>>(
      `/users/${userId}/readiness`
    );
    return response.data;
  },

  getRecommendations: async (userId: string) => {
    const response = await apiClient.get<ApiResponse<VideoRecommendation[]>>(
      `/users/${userId}/recommendations`
    );
    return response.data;
  },
};

export const aiAPI = {
  getProviderStatus: async () => {
    const response = await apiClient.get<AIProviderDiagnostics>('/ai/providers');
    return response.data;
  },

  sendMessage: async (data: AIChatRequest) => {
    const response = await apiClient.post<AIChatResponse>('/ai/chat', data);
    return response.data;
  },

  setResponseStyle: async (conversationId: string, responseStyle: 'friendly' | 'strict') => {
    const response = await apiClient.post('/ai/set-response-style', {
      conversation_id: conversationId,
      response_style: responseStyle,
    });
    return response.data;
  },

  // Notebooks
  getNotebooks: async () => {
    const response = await apiClient.get<NotebookOut[]>('/ai/notebooks');
    return response.data;
  },

  createNotebook: async (data: NotebookCreateRequest) => {
    const response = await apiClient.post<NotebookOut>('/ai/notebooks', data);
    return response.data;
  },

  updateNotebook: async (notebookId: string, data: Partial<NotebookCreateRequest>) => {
    const response = await apiClient.patch<NotebookOut>(`/ai/notebooks/${notebookId}`, data);
    return response.data;
  },

  deleteNotebook: async (notebookId: string) => {
    const response = await apiClient.delete(`/ai/notebooks/${notebookId}`);
    return response.data;
  },

  getNotebookMessages: async (notebookId: string) => {
    const response = await apiClient.get<AIConversationHistoryResponse>(`/ai/notebooks/${notebookId}/messages`);
    return response.data;
  },

  clearNotebookMessages: async (notebookId: string) => {
    const response = await apiClient.delete(`/ai/notebooks/${notebookId}/messages`);
    return response.data;
  },

  // Conversations (ChatGPT-style New Chat & Recent Chats)
  getConversations: async () => {
    const response = await apiClient.get<AIConversationListResponse>('/ai/conversations');
    return response.data;
  },

  createConversation: async (data?: { title?: string; notebook_id?: string; response_style?: string }) => {
    const response = await apiClient.post<ConversationOut>('/ai/conversations', data || {});
    return response.data;
  },

  getConversation: async (conversationId: string) => {
    const response = await apiClient.get<AIConversationHistoryResponse>(`/ai/conversations/${conversationId}`);
    return response.data;
  },

  updateConversation: async (
    conversationId: string,
    data: { title?: string; is_pinned?: boolean; response_style?: string }
  ) => {
    const response = await apiClient.patch<ConversationOut>(`/ai/conversations/${conversationId}`, data);
    return response.data;
  },

  deleteConversation: async (conversationId: string) => {
    const response = await apiClient.delete<{ success: boolean; message: string }>(`/ai/conversations/${conversationId}`);
    return response.data;
  },

  // Conversation-specific sources (Strict Isolation)
  getConversationSources: async (conversationId: string) => {
    const response = await apiClient.get<SourceListItem[]>(`/ai/conversations/${conversationId}/sources`);
    return response.data;
  },

  toggleConversationSource: async (conversationId: string, sourceId: string) => {
    const response = await apiClient.patch<SourceListItem>(
      `/ai/conversations/${conversationId}/sources/${sourceId}/toggle-selection`
    );
    return response.data;
  },

  removeConversationSource: async (conversationId: string, sourceId: string) => {
    const response = await apiClient.delete<{ success: boolean; message: string }>(
      `/ai/conversations/${conversationId}/sources/${sourceId}`
    );
    return response.data;
  },

  // Sources (General & Notebook)
  getSources: async (notebookId: string) => {
    const response = await apiClient.get<SourceListItem[]>(`/ai/sources/list/${notebookId}`);
    return response.data;
  },

  uploadSource: async (formData: FormData) => {
    const response = await apiClient.post<{ success: boolean; source: SourceListItem; message: string }>(
      '/ai/sources/upload',
      formData
    );
    return response.data;
  },

  importUrl: async (data: { url: string; notebook_id?: string; conversation_id?: string }) => {
    const response = await apiClient.post<{
      success: boolean;
      source: SourceListItem;
      chunks_indexed: number;
      message: string;
    }>('/ai/sources/import-url', data);
    return response.data;
  },

  saveYouTubeSource: async (data: {
    video_id: string;
    notebook_id?: string;
    conversation_id?: string;
    title: string;
    channel?: string;
    thumbnail?: string;
    url?: string;
    description?: string;
  }) => {
    const response = await apiClient.post<{
      success: boolean;
      source: SourceListItem;
      transcript_status: string;
      message: string;
    }>('/ai/youtube/save', data);
    return response.data;
  },

  pasteTranscript: async (sourceId: string, transcriptText: string) => {
    const response = await apiClient.post<{
      success: boolean;
      source: SourceListItem;
      chunks_indexed: number;
      message: string;
    }>(`/ai/sources/${sourceId}/paste-transcript`, {
      transcript_text: transcriptText,
    });
    return response.data;
  },

  toggleSourceSelection: async (sourceId: string) => {
    const response = await apiClient.patch(`/ai/sources/${sourceId}/toggle-selection`);
    return response.data;
  },

  deleteSource: async (sourceId: string) => {
    const response = await apiClient.delete(`/ai/sources/${sourceId}`);
    return response.data;
  },

  // Notes
  getNotes: async (notebookId: string) => {
    const response = await apiClient.get<NoteOut[]>(`/ai/notes/${notebookId}`);
    return response.data;
  },

  createNote: async (data: {
    notebook_id?: string;
    conversation_id?: string;
    title: string;
    content: string;
    note_type?: string;
  }) => {
    const response = await apiClient.post<NoteOut>('/ai/notes', data);
    return response.data;
  },

  deleteNote: async (noteId: string) => {
    const response = await apiClient.delete(`/ai/notes/${noteId}`);
    return response.data;
  },

  // Study Tools
  runStudyTool: async (
    tool: 'explain' | 'summarize' | 'revision-notes' | 'mcqs' | 'practice-questions' | 'weak-areas' | 'optimize-routine' | 'high-yield',
    payload: StudyToolRequest
  ) => {
    const response = await apiClient.post<StudyToolResponse>(`/ai/study-tool/${tool}`, payload);
    return response.data;
  },

  saveStudyToolNote: async (data: { title: string; content: string; notebook_id?: string }) => {
    const response = await apiClient.post('/ai/study-tool/save-note', data);
    return response.data;
  },

  // External Integrations
  searchYouTube: async (query: string) => {
    const response = await apiClient.get<YouTubeSearchResponse>('/ai/youtube/search', {
      params: { query },
    });
    return response.data;
  },

  getDriveStatus: async () => {
    const response = await apiClient.get<DriveStatusResponse>('/ai/drive/status');
    return response.data;
  },

  getDriveConnectUrl: async () => {
    const response = await apiClient.get<{ url: string }>('/ai/drive/connect-url');
    return response.data;
  },

  getDrivePickerConfig: async () => {
    const response = await apiClient.post<DrivePickerConfig>('/ai/drive/picker');
    return response.data;
  },

  getDrivePickerToken: async () => {
    const response = await apiClient.post<DrivePickerToken>('/ai/drive/picker/token');
    return response.data;
  },

  getDriveFiles: async () => {
    const response = await apiClient.get<{ files: Array<{ id: string; name: string; mimeType: string; size?: number }>; next_page_token?: string | null }>('/ai/drive/files');
    return response.data;
  },

  importDriveFile: async (data: { file_id: string; notebook_id?: string; conversation_id?: string }) => {
    const response = await apiClient.post<{ success: boolean; source: any; message: string; duplicate?: boolean }>('/ai/drive/import', data);
    return response.data;
  },

  disconnectDrive: async () => {
    const response = await apiClient.post<{ success: boolean; message: string }>('/ai/drive/disconnect');
    return response.data;
  },
};

export const dashboardAPI = {
  getSummary: async (targetDate?: string) => {
    const params = targetDate ? { target_date: targetDate } : {};
    const response = await apiClient.get<DashboardSummary>('/dashboard/summary', { params });
    return response.data;
  },
};

export default apiClient;
