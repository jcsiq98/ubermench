// ─── API Client ─────────────────────────────────────────────
// Centralised fetch wrapper with token management, refresh logic,
// and automatic retries with exponential backoff.

const API_BASE =
  typeof window !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api`
    : '/api';

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
  retries?: number;
  timeout?: number;
}

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('handy_access_token');
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('handy_refresh_token');
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('handy_access_token', accessToken);
  localStorage.setItem('handy_refresh_token', refreshToken);
  document.cookie = `handy_auth=1; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
}

export function clearTokens() {
  localStorage.removeItem('handy_access_token');
  localStorage.removeItem('handy_refresh_token');
  document.cookie = 'handy_auth=; path=/; max-age=0';
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return false;
    }

    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

export async function api<T = unknown>(
  endpoint: string,
  options: ApiOptions = {},
): Promise<T> {
  const {
    skipAuth,
    retries = MAX_RETRIES,
    timeout = REQUEST_TIMEOUT_MS,
    headers: customHeaders,
    ...fetchOptions
  } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((customHeaders as Record<string, string>) || {}),
  };

  if (!skipAuth) {
    const token = getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let res = await fetchWithTimeout(
        `${API_BASE}${endpoint}`,
        { ...fetchOptions, headers },
        timeout,
      );

      // Token refresh on 401
      if (res.status === 401 && !skipAuth) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const newToken = getAccessToken();
          if (newToken) {
            headers['Authorization'] = `Bearer ${newToken}`;
          }
          res = await fetchWithTimeout(
            `${API_BASE}${endpoint}`,
            { ...fetchOptions, headers },
            timeout,
          );
        }
      }

      if (res.ok) {
        return res.json();
      }

      // Retry on transient server errors
      if (RETRYABLE_STATUS_CODES.has(res.status) && attempt < retries) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }

      const errorData = await res.json().catch(() => ({}));

      if (res.status === 401 && !skipAuth) {
        clearTokens();
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
          return undefined as any;
        }
      }

      throw new ApiError(res.status, errorData.message || 'Request failed', errorData);
    } catch (error: any) {
      if (error instanceof ApiError) throw error;

      lastError = error;

      // Retry on network errors (fetch failure, timeout)
      if (attempt < retries) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
    }
  }

  throw new ApiError(
    0,
    lastError?.message || 'Network error after retries',
    { originalError: lastError?.name },
  );
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Auth API ────────────────────────────────────────────────

export const authApi = {
  requestOtp: (phone: string) =>
    api<{ message: string; expiresAt: string; code?: string }>(
      '/auth/request-otp',
      {
        method: 'POST',
        body: JSON.stringify({ phone }),
        skipAuth: true,
      },
    ),

  verifyOtp: (phone: string, code: string) =>
    api<{
      accessToken: string;
      refreshToken: string;
      isNewUser: boolean;
      user: UserProfile;
    }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
      skipAuth: true,
    }),

  getMe: () => api<UserProfile>('/auth/me'),

  logout: (refreshToken: string) =>
    api('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
};

export interface UserProfile {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  ratingAverage?: number;
  ratingCount?: number;
  createdAt?: string;
  providerProfile?: {
    bio: string | null;
    serviceTypes: string[];
    totalJobs: number;
    isVerified: boolean;
    isAvailable: boolean;
  } | null;
}

// ─── Service Categories ──────────────────────────────────────

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

export const servicesApi = {
  getCategories: () =>
    api<ServiceCategory[]>('/services/categories', { skipAuth: true }),
};

// ─── Providers ───────────────────────────────────────────────

export interface ZoneSummary {
  id: string;
  name: string;
  city: string;
  state?: string;
}

export interface ProviderSummary {
  id: string;
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  bio: string | null;
  serviceTypes: string[];
  ratingAverage: number;
  ratingCount: number;
  totalJobs: number;
  tier?: number;
  isVerified: boolean;
  isAvailable: boolean;
  locationLat: number | null;
  locationLng: number | null;
  distance?: number;
  zones?: ZoneSummary[];
}

export interface ProviderListResponse {
  data: ProviderSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface Review {
  id: string;
  score: number;
  comment: string | null;
  customerName: string;
  customerAvatar: string | null;
  createdAt: string;
}

export interface ProviderDetail extends ProviderSummary {
  serviceNames: Record<string, string>;
  memberSince: string;
  zones?: ZoneSummary[];
  reviews: Review[];
}

export interface ReviewsResponse {
  data: Review[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const providersApi = {
  list: (params?: {
    category?: string;
    zone?: string;
    city?: string;
    lat?: number;
    lng?: number;
    sort?: 'rating' | 'distance' | 'jobs';
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set('category', params.category);
    if (params?.zone) searchParams.set('zone', params.zone);
    if (params?.city) searchParams.set('city', params.city);
    if (params?.lat !== undefined) searchParams.set('lat', String(params.lat));
    if (params?.lng !== undefined) searchParams.set('lng', String(params.lng));
    if (params?.sort) searchParams.set('sort', params.sort);
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return api<ProviderListResponse>(`/providers${qs ? `?${qs}` : ''}`, { skipAuth: true });
  },

  getDetail: (id: string) =>
    api<ProviderDetail>(`/providers/${id}`, { skipAuth: true }),

  getReviews: (id: string, page = 1, limit = 10) =>
    api<ReviewsResponse>(`/providers/${id}/reviews?page=${page}&limit=${limit}`, {
      skipAuth: true,
    }),
};

// ─── Bookings ────────────────────────────────────────────────

export type BookingStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PROVIDER_ARRIVING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'RATED'
  | 'CANCELLED'
  | 'REJECTED';

export interface BookingSummary {
  id: string;
  status: BookingStatus;
  description: string;
  address: string | null;
  locationLat: number | null;
  locationLng: number | null;
  scheduledAt: string | null;
  price: number | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  category: {
    id: string;
    name: string;
    slug: string;
    icon: string;
  } | null;
  provider: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
    userId: string;
    ratingAverage?: number;
    ratingCount?: number;
    phone?: string;
  } | null;
  customer: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
    ratingAverage?: number;
    ratingCount?: number;
    phone?: string;
  } | null;
}

export interface BookingListResponse {
  data: BookingSummary[];
  total: number;
  limit: number;
  offset: number;
}

export const bookingsApi = {
  create: (data: {
    providerId: string;
    categoryId: string;
    description: string;
    address?: string;
    lat?: number;
    lng?: number;
    scheduledAt?: string;
  }) =>
    api<BookingSummary>('/bookings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  list: (params?: {
    status?: 'active' | 'completed' | 'cancelled';
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return api<BookingListResponse>(`/bookings${qs ? `?${qs}` : ''}`);
  },

  getById: (id: string) => api<BookingSummary>(`/bookings/${id}`),

  cancel: (id: string, reason?: string) =>
    api<BookingSummary>(`/bookings/${id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }),

  dismiss: (id: string) =>
    api<{ success: boolean; message: string }>(`/bookings/${id}`, {
      method: 'DELETE',
    }),
};

// ─── Messages / Chat ─────────────────────────────────────────

export type SenderType = 'CUSTOMER' | 'PROVIDER' | 'SYSTEM';
export type MessageChannel = 'APP' | 'WHATSAPP';

export interface ChatMessage {
  id: string;
  bookingId: string;
  senderId: string;
  senderType: SenderType;
  senderName: string | null;
  senderAvatar: string | null;
  content: string;
  channel: MessageChannel;
  readAt: string | null;
  createdAt: string;
}

export interface MessagesResponse {
  data: ChatMessage[];
  hasMore: boolean;
}

export const messagesApi = {
  send: (bookingId: string, content: string) =>
    api<ChatMessage>(`/bookings/${bookingId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  getHistory: (bookingId: string, params?: { limit?: number; before?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.before) searchParams.set('before', params.before);
    const qs = searchParams.toString();
    return api<MessagesResponse>(
      `/bookings/${bookingId}/messages${qs ? `?${qs}` : ''}`,
    );
  },

  getUnreadCount: () =>
    api<{ count: number }>('/messages/unread'),

  getBookingUnreadCount: (bookingId: string) =>
    api<{ count: number }>(`/bookings/${bookingId}/messages/unread`),
};

// ─── Ratings ──────────────────────────────────────────────────

export interface RatingResponse {
  id: string;
  bookingId: string;
  score: number;
  comment: string | null;
  fromUser: { id: string; name: string };
  toUser: { id: string; name: string };
  createdAt: string;
}

export interface MyRatingResponse {
  rated: boolean;
  rating: {
    id: string;
    score: number;
    comment: string | null;
    createdAt: string;
  } | null;
}

export const ratingsApi = {
  rate: (bookingId: string, data: { score: number; comment?: string }) =>
    api<RatingResponse>(`/bookings/${bookingId}/rate`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMyRating: (bookingId: string) =>
    api<MyRatingResponse>(`/bookings/${bookingId}/my-rating`),
};

// ─── Saved Addresses ─────────────────────────────────────────

export interface SavedAddress {
  id: string;
  userId: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const addressesApi = {
  list: () => api<SavedAddress[]>('/addresses'),

  create: (data: { label: string; address: string; lat: number; lng: number; isDefault?: boolean }) =>
    api<SavedAddress>('/addresses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { label?: string; address?: string; lat?: number; lng?: number; isDefault?: boolean }) =>
    api<SavedAddress>(`/addresses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    api<{ success: boolean }>(`/addresses/${id}`, { method: 'DELETE' }),
};

// ─── Provider Dashboard ──────────────────────────────────────

export interface ProviderDashboardData {
  profile: {
    id: string;
    name: string | null;
    bio: string | null;
    isVerified: boolean;
    isAvailable: boolean;
    serviceTypes: string[];
    zones: { id: string; name: string; city: string }[];
  };
  stats: {
    totalJobs: number;
    weekJobs: number;
    monthJobs: number;
    ratingAverage: number;
    ratingCount: number;
  };
  weeklyBreakdown: { weekStart: string; jobs: number }[];
  pendingJobs: BookingSummary[];
  activeJobs: BookingSummary[];
}

export interface ProviderJobsResponse {
  data: BookingSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProviderEarnings {
  thisMonth: { total: number; jobs: number };
  lastMonth: { total: number; jobs: number };
  allTimeJobs: number;
}

export interface ProviderProfileData {
  id: string;
  userId: string;
  name: string | null;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  bio: string | null;
  serviceTypes: string[];
  totalJobs: number;
  tier: number;
  isVerified: boolean;
  isAvailable: boolean;
  ratingAverage: number;
  ratingCount: number;
  memberSince: string;
  trustScore: number | null;
  zones: { id: string; name: string; city: string; state: string }[];
}

export const providerApi = {
  getDashboard: () =>
    api<ProviderDashboardData>('/provider/dashboard'),

  getJobs: (params?: { filter?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.filter) searchParams.set('filter', params.filter);
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return api<ProviderJobsResponse>(`/provider/jobs${qs ? `?${qs}` : ''}`);
  },

  acceptJob: (id: string) =>
    api<BookingSummary>(`/provider/jobs/${id}/accept`, { method: 'PATCH' }),

  rejectJob: (id: string) =>
    api<BookingSummary>(`/provider/jobs/${id}/reject`, { method: 'PATCH' }),

  updateJobStatus: (id: string, action: 'arriving' | 'start' | 'complete') =>
    api<BookingSummary>(`/provider/jobs/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    }),

  getEarnings: () =>
    api<ProviderEarnings>('/provider/earnings'),

  getProfile: () =>
    api<ProviderProfileData>('/provider/profile'),

  updateProfile: (data: { name?: string; bio?: string; isAvailable?: boolean }) =>
    api<any>('/provider/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ─── Admin ────────────────────────────────────────────────────

export interface AdminStats {
  applications: {
    pending: number;
    total: number;
    approved: number;
    rejected: number;
  };
  providers: {
    total: number;
    byTier: { tier1: number; tier2: number; tier3: number; tier4: number };
  };
  bookings: {
    total: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
    completed: number;
  };
  customers: { total: number };
}

export interface ProviderApplication {
  id: string;
  phone: string;
  name: string | null;
  bio: string | null;
  yearsExperience: number;
  categories: string[];
  serviceZones: string[];
  inePhotoFront: string | null;
  inePhotoBack: string | null;
  selfiePhoto: string | null;
  verificationStatus: string;
  verificationNotes: string | null;
  rejectionReason: string | null;
  approvedTier: number | null;
  onboardingStep: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationListResponse {
  data: ProviderApplication[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminProvider {
  id: string;
  userId: string;
  bio: string | null;
  serviceTypes: string[];
  totalJobs: number;
  tier: number;
  isVerified: boolean;
  isAvailable: boolean;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    phone: string;
    email: string | null;
    ratingAverage: number;
    ratingCount: number;
    isActive: boolean;
    createdAt: string;
  };
  trustScore: { score: number } | null;
  _count: { bookings: number };
}

export interface AdminProviderListResponse {
  data: AdminProvider[];
  total: number;
  limit: number;
  offset: number;
}

export const adminApi = {
  getStats: () =>
    api<AdminStats>('/admin/stats'),

  getApplications: (params?: { status?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return api<ApplicationListResponse>(`/admin/applications${qs ? `?${qs}` : ''}`);
  },

  getApplication: (id: string) =>
    api<ProviderApplication>(`/admin/applications/${id}`),

  approveApplication: (id: string, tier: number = 1) =>
    api<{ success: boolean; userId: string; tier: number }>(
      `/admin/applications/${id}/approve`,
      { method: 'PATCH', body: JSON.stringify({ tier }) },
    ),

  rejectApplication: (id: string, reason: string) =>
    api<{ success: boolean }>(
      `/admin/applications/${id}/reject`,
      { method: 'PATCH', body: JSON.stringify({ reason }) },
    ),

  getProviders: (params?: { tier?: number; search?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.tier !== undefined) searchParams.set('tier', String(params.tier));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return api<AdminProviderListResponse>(`/admin/providers${qs ? `?${qs}` : ''}`);
  },

  updateProviderTier: (providerId: string, tier: number) =>
    api<{ success: boolean; oldTier: number; newTier: number }>(
      `/admin/providers/${providerId}/tier`,
      { method: 'PATCH', body: JSON.stringify({ tier }) },
    ),
};

// ─── Reports ──────────────────────────────────────────────────

export interface Report {
  id: string;
  bookingId: string;
  reporterId: string;
  reportedId: string;
  category: string;
  description: string;
  evidenceUrls: string[];
  status: string;
  isSafety: boolean;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reporter?: { id: string; name: string | null };
  reported?: { id: string; name: string | null; phone?: string };
  booking?: { id: string; description: string; status?: string };
}

export interface ReportListResponse {
  data: Report[];
  total: number;
  limit: number;
  offset: number;
}

export const reportsApi = {
  create: (bookingId: string, data: {
    category: string;
    description: string;
    evidenceUrls?: string[];
    isSafety?: boolean;
  }) =>
    api<Report>(`/bookings/${bookingId}/report`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getForBooking: (bookingId: string) =>
    api<Report[]>(`/bookings/${bookingId}/reports`),

  getMyReport: (bookingId: string) =>
    api<{ reported: boolean; report: Report | null }>(
      `/bookings/${bookingId}/my-report`,
    ),
};

// ─── Safety ───────────────────────────────────────────────────

export interface ServicePhoto {
  id: string;
  bookingId: string;
  uploaderId: string;
  type: 'BEFORE' | 'AFTER' | 'EVIDENCE';
  url: string;
  caption: string | null;
  createdAt: string;
  uploader?: { id: string; name: string | null };
}

export interface EmergencyContact {
  id: string;
  userId: string;
  name: string;
  phone: string;
  relation: string | null;
  createdAt: string;
}

export interface ProviderLocationData {
  available: boolean;
  lat?: number;
  lng?: number;
  accuracy?: number | null;
  updatedAt?: string;
  message?: string;
}

export const safetyApi = {
  uploadPhoto: (bookingId: string, data: {
    type: 'BEFORE' | 'AFTER' | 'EVIDENCE';
    url: string;
    caption?: string;
  }) =>
    api<ServicePhoto>(`/bookings/${bookingId}/photos`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPhotos: (bookingId: string) =>
    api<ServicePhoto[]>(`/bookings/${bookingId}/photos`),

  updateLocation: (data: {
    lat: number;
    lng: number;
    accuracy?: number;
    bookingId?: string;
  }) =>
    api('/provider/location', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getProviderLocation: (bookingId: string) =>
    api<ProviderLocationData>(`/bookings/${bookingId}/provider-location`),

  getEmergencyContacts: () =>
    api<EmergencyContact[]>('/emergency-contacts'),

  addEmergencyContact: (data: { name: string; phone: string; relation?: string }) =>
    api<EmergencyContact>('/emergency-contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  removeEmergencyContact: (id: string) =>
    api<{ success: boolean }>(`/emergency-contacts/${id}`, { method: 'DELETE' }),

  triggerSos: (data: { bookingId: string; lat?: number; lng?: number }) =>
    api<{ alertId: string; status: string; contactsNotified: number }>('/sos', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resolveSos: (alertId: string) =>
    api(`/sos/${alertId}/resolve`, { method: 'POST' }),
};

// ─── Admin Reports ────────────────────────────────────────────

export const adminReportsApi = {
  getReports: (params?: { status?: string; category?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.category) searchParams.set('category', params.category);
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return api<ReportListResponse>(`/admin/reports${qs ? `?${qs}` : ''}`);
  },

  resolveReport: (id: string, resolution: string, action: 'resolve' | 'dismiss') =>
    api(`/admin/reports/${id}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify({ resolution, action }),
    }),

  getVerificationMetrics: () =>
    api<{
      total: number;
      autoApproved: number;
      manualReview: number;
      autoRejected: number;
      autoApprovalRate: number;
      avgFaceMatchScore: number;
    }>('/admin/verification/metrics'),

  startVerification: (applicationId: string) =>
    api(`/admin/verification/${applicationId}/start`, { method: 'POST' }),
};

// ─── Notifications ────────────────────────────────────────────

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  data: AppNotification[];
  total: number;
  unreadCount: number;
  limit: number;
  offset: number;
}

export interface NotificationPreferences {
  bookingUpdates: boolean;
  messages: boolean;
  promotions: boolean;
  weeklyReport: boolean;
  pushEnabled: boolean;
  whatsappEnabled: boolean;
}

export const notificationsApi = {
  registerDeviceToken: (token: string, platform: string = 'web') =>
    api<{ success: boolean }>('/notifications/device-token', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    }),

  removeDeviceToken: (token: string) =>
    api<{ success: boolean }>('/notifications/device-token', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    }),

  getPreferences: () =>
    api<NotificationPreferences>('/notifications/preferences'),

  updatePreferences: (data: Partial<NotificationPreferences>) =>
    api<NotificationPreferences>('/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  list: (params?: { limit?: number; offset?: number; unreadOnly?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
    if (params?.unreadOnly) searchParams.set('unreadOnly', 'true');
    const qs = searchParams.toString();
    return api<NotificationsResponse>(`/notifications${qs ? `?${qs}` : ''}`);
  },

  getUnreadCount: () =>
    api<{ count: number }>('/notifications/unread-count'),

  markAsRead: (id: string) =>
    api<{ success: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' }),

  markAllAsRead: () =>
    api<{ success: boolean }>('/notifications/read-all', { method: 'PATCH' }),
};

// ─── User Profile (Extended) ─────────────────────────────────

export interface FullUserProfile {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  ratingAverage: number;
  ratingCount: number;
  isActive: boolean;
  createdAt: string;
  providerProfile: any;
  savedAddresses: SavedAddress[];
  stats: {
    totalBookings: number;
    ratingsGiven: number;
    ratingsReceived: number;
  };
}

export interface BookingHistoryItem {
  id: string;
  status: string;
  description: string;
  address: string | null;
  price: number | null;
  createdAt: string;
  completedAt: string | null;
  category: { name: string; icon: string } | null;
  provider: { id: string; name: string | null; avatarUrl: string | null } | null;
  myRating: number | null;
}

export interface BookingHistoryResponse {
  data: BookingHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export const userProfileApi = {
  getFullProfile: () =>
    api<FullUserProfile>('/users/me/profile'),

  updateProfile: (data: { name?: string; email?: string; avatarUrl?: string }) =>
    api('/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getHistory: (params?: { limit?: number; offset?: number; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
    if (params?.status) searchParams.set('status', params.status);
    const qs = searchParams.toString();
    return api<BookingHistoryResponse>(`/users/me/history${qs ? `?${qs}` : ''}`);
  },

  deleteAccount: () =>
    api<{ success: boolean }>('/users/me/account', { method: 'DELETE' }),
};

// ─── Zones / Location ────────────────────────────────────────

export interface ServiceZone {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  lat: number | null;
  lng: number | null;
  providerCount: number;
}

export interface CityInfo {
  city: string;
  state: string;
  zoneCount: number;
}

export interface NearestZone {
  id: string;
  name: string;
  city: string;
  state: string;
  distance: number;
}

export const zonesApi = {
  list: (params?: { city?: string; state?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.city) searchParams.set('city', params.city);
    if (params?.state) searchParams.set('state', params.state);
    if (params?.search) searchParams.set('search', params.search);
    const qs = searchParams.toString();
    return api<ServiceZone[]>(`/zones${qs ? `?${qs}` : ''}`, { skipAuth: true });
  },

  getCities: () =>
    api<CityInfo[]>('/zones/cities', { skipAuth: true }),

  findNearest: (lat: number, lng: number) =>
    api<NearestZone>(`/zones/nearest?lat=${lat}&lng=${lng}`, { skipAuth: true }),
};

