import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RouteRequest, RouteResponse, HealthResponse, SearchResult } from '@/types/route';

const API_URL = 'https://safetruck-backend.icysky-af60cdde.canadacentral.azurecontainerapps.io';

const TOKEN_KEY = 'safetruck_token';

// In-memory cache so synchronous authHeaders() always works
let cachedToken: string | null = null;

export async function loadToken(): Promise<void> {
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return cachedToken;
}

export function setToken(token: string): void {
  cachedToken = token;
  AsyncStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  cachedToken = null;
  AsyncStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  return cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function calculateRoute(payload: RouteRequest): Promise<RouteResponse> {
  const res = await fetch(`${API_URL}/api/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<RouteResponse>(res);
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/api/health`);
  return handleResponse<HealthResponse>(res);
}

export async function searchStreets(query: string): Promise<SearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  const res = await fetch(
    `${API_URL}/api/search?q=${encodeURIComponent(query.trim())}`,
    { headers: authHeaders() }
  );
  const data = await handleResponse<{ results: SearchResult[] }>(res);
  return data.results ?? [];
}
