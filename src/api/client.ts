import { API_BASE_URL, API_TIMEOUT_MS } from '@env';

const DEFAULT_TIMEOUT = 15000;

const timeoutMs = Number.parseInt(API_TIMEOUT_MS ?? '', 10);

export const apiConfig = {
  baseUrl: API_BASE_URL ?? '',
  timeoutMs:
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT,
};

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), apiConfig.timeoutMs);

  try {
    const res = await fetch(`${apiConfig.baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...init.headers,
      },
    });

    const text = await res.text();
    const body = text ? (JSON.parse(text) as unknown) : undefined;

    if (!res.ok) {
      throw new ApiError(`Request failed: ${res.status}`, res.status, body);
    }

    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}
