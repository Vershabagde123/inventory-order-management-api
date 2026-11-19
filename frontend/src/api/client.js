// Centralized API client: base URL, bearer token handling and error normalisation.
// The backend responds with { success: true, data, ... } or
// { success: false, error: { code, message, details? } }.

const TOKEN_KEY = 'iom.token';
const USER_KEY = 'iom.user';

export const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:5000').replace(
  /\/+$/,
  '',
);

// ---- token storage -------------------------------------------------------
function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let memoryToken = null;

export const session = {
  getToken() {
    return safeStorage()?.getItem(TOKEN_KEY) ?? memoryToken;
  },
  getUser() {
    const raw = safeStorage()?.getItem(USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  save(token, user) {
    memoryToken = token;
    const s = safeStorage();
    s?.setItem(TOKEN_KEY, token);
    s?.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    memoryToken = null;
    const s = safeStorage();
    s?.removeItem(TOKEN_KEY);
    s?.removeItem(USER_KEY);
  },
};

// Called when an authenticated request gets 401 (expired/invalid token).
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

// ---- errors ---------------------------------------------------------------
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details ?? [];
  }
}

const STATUS_LABELS = {
  0: 'Network error',
  400: 'Validation error',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  500: 'Server error',
  503: 'Service unavailable',
};

/** Human-readable summary for any error thrown by `request`. */
export function describeError(err) {
  if (!(err instanceof ApiError))
    return { title: 'Error', message: String(err?.message ?? err), lines: [] };
  const label = STATUS_LABELS[err.status] ?? `HTTP ${err.status}`;
  // Backend detail messages are already descriptive (e.g. insufficient stock
  // includes requested/available), so they are shown as-is.
  const lines = err.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message));
  return {
    title: err.status ? `${label} (${err.status}${err.code ? ` ${err.code}` : ''})` : label,
    message: err.message,
    lines,
  };
}

// ---- request --------------------------------------------------------------
/**
 * @param {string} path e.g. "/products"
 * @param {{ method?: string, body?: unknown, query?: Record<string, unknown>, auth?: boolean }} options
 */
export async function request(
  path,
  { method = 'GET', body, query, auth = true, retried = false } = {},
) {
  const url = new URL(API_BASE_URL + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? session.getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      `Cannot reach the API at ${API_BASE_URL}. Is the backend running?`,
    );
  }

  // A cold backend (e.g. a free-tier host waking up) can briefly answer 503 while it
  // opens database connections. Read-only GETs are safe to retry once.
  if (response.status === 503 && method === 'GET' && !retried) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return request(path, { method, body, query, auth, retried: true });
  }

  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // non-JSON body
  }

  if (!response.ok) {
    const e = payload?.error ?? {};
    const error = new ApiError(
      response.status,
      e.code,
      e.message || response.statusText || 'Request failed',
      e.details,
    );
    if (response.status === 401 && token) onUnauthorized(error);
    throw error;
  }
  return payload;
}
