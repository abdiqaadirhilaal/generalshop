import type { ApiMeta, Page } from '@/types';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status = 500, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: ApiMeta;
  message?: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'include',
      ...init,
      headers,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new ApiError(`Request failed (${response.status})`, response.status);
    return { success: true, data: undefined as T };
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.success) {
    throw new ApiError(payload?.message ?? `Request failed (${response.status})`, response.status, payload);
  }
  return payload;
}

function queryString(params?: Record<string, string | number | boolean | undefined | null>) {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : '';
}

export const api = {
  get: async <T>(path: string): Promise<T> => (await request<T>(path)).data,
  page: async <T>(path: string): Promise<Page<T>> => {
    const result = await request<T[]>(path);
    return {
      items: result.data ?? [],
      meta:
        result.meta ??
        ({
          page: 1,
          limit: (result.data ?? []).length,
          total: (result.data ?? []).length,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        } as ApiMeta),
    };
  },
  post: async <T>(path: string, body?: unknown): Promise<T> =>
    (await request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) })).data,
  put: async <T>(path: string, body?: unknown): Promise<T> =>
    (await request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) })).data,
  patch: async <T>(path: string, body?: unknown): Promise<T> =>
    (await request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) })).data,
  delete: async <T>(path: string): Promise<T> => (await request<T>(path, { method: 'DELETE' })).data,
  raw: request,
};

export async function downloadFile(path: string, fallbackName: string) {
  const response = await fetch(`/api${path}`, { credentials: 'include' });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.message ?? 'Download failed', response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const result = await api.post<{ url: string }>('/uploads/image', form);
  return result.url;
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export { queryString };
