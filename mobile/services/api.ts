import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RouteRequest, RouteResponse, HealthResponse, SearchResult } from '@/types/route';

const API_URL = 'https://safetruck-backend-production.up.railway.app';

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

// ── POST /api/reports ─────────────────────────────────────────
// Registra un reporte cooperativo de multa o sin problemas.
export async function submitReport(payload: {
  report_type: 'multa' | 'sin_problemas';
  lat: number;
  lon: number;
  trip_id?: number | null;
  notes?: string;
}): Promise<{ ok: boolean; arista_id: number }> {
  const res = await fetch(`${API_URL}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<{ ok: boolean; arista_id: number }>(res);
}

// ── POST /api/incidents ───────────────────────────────────────
// Registra un incidente en vía (accidente, tráfico, obra, etc.)
export async function submitIncident(payload: {
  incident_type: 'accidente' | 'trafico' | 'obra' | 'control_policial' | 'objeto_en_via' | 'corte';
  lat: number;
  lon: number;
  notes?: string;
}): Promise<{ ok: boolean; incident_id: number }> {
  const res = await fetch(`${API_URL}/api/incidents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<{ ok: boolean; incident_id: number }>(res);
}

// ── GET /api/incidents ────────────────────────────────────────
// Obtiene todos los incidentes activos para mostrar en el mapa.
export async function getIncidents(): Promise<{ incidents: any[] }> {
  const res = await fetch(`${API_URL}/api/incidents`, {
    headers: authHeaders(),
  });
  return handleResponse<{ incidents: any[] }>(res);
}