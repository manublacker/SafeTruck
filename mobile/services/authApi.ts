import { supabase } from "@/lib/supabase";
import type { AuthResponse, RegisterPayload, LoginPayload } from "@/types/auth";

const API_URL = "https://safetruck-backend.icysky-af60cdde.canadacentral.azurecontainerapps.io";

async function callProfile(token: string, body: Record<string, unknown>): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as AuthResponse;
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const { data, error } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      data: { full_name: payload.full_name, company: payload.company ?? null },
    },
  });

  if (error) throw new Error(error.message);

  // Si Supabase requiere verificación de email, no hay sesión todavía
  if (!data.session) {
    throw new Error("Verificá tu email para activar tu cuenta. Revisá tu bandeja de entrada.");
  }

  return callProfile(data.session.access_token, {
    full_name: payload.full_name,
    company:   payload.company ?? null,
    trucks:    payload.trucks  ?? [],
  });
}

export async function forgotPassword(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw new Error(error.message);
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email:    payload.email,
    password: payload.password,
  });

  if (error) throw new Error(error.message);
  if (!data.session) throw new Error("Error al iniciar sesión.");

  return callProfile(data.session.access_token, {});
}
