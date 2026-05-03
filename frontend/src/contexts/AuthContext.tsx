import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { AuthUser } from "@/types/auth";
import { supabase } from "@/lib/supabase";
import { setToken, removeToken, registerUnauthorizedHandler } from "@/services/api";
import { fetchUserProfile } from "@/services/authApi";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  authReady: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]        = useState<AuthUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const fetchingProfile = useRef(false);

  const ensureProfile = useCallback(async (accessToken: string) => {
    if (fetchingProfile.current) return;
    fetchingProfile.current = true;
    try {
      const res = await fetchUserProfile(accessToken, {});
      setUser(res.user);
    } catch (err) {
      console.error("Error al obtener el perfil:", err);
    } finally {
      fetchingProfile.current = false;
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setToken(session.access_token);
        setTokenState(session.access_token);
        ensureProfile(session.access_token).finally(() => setAuthReady(true));
      } else {
        setAuthReady(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setToken(session.access_token);
        setTokenState(session.access_token);
        if (!user) {
          ensureProfile(session.access_token);
        }
      } else {
        removeToken();
        setTokenState(null);
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setTokenState(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    removeToken();
    setTokenState(null);
    setUser(null);
  }, []);

  useEffect(() => {
    registerUnauthorizedHandler(logout);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, token, authReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
