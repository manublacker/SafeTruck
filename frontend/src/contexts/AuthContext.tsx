import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { AuthUser, Driver } from "@/types/auth";
import { supabase } from "@/lib/supabase";
import {
  setToken,
  removeToken,
  registerUnauthorizedHandler,
  fetchDrivers,
} from "@/services/api";
import { fetchUserProfile } from "@/services/authApi";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  authReady: boolean;
  drivers: Driver[];
  refreshDrivers: () => Promise<void>;
  login: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]        = useState<AuthUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [drivers, setDrivers]  = useState<Driver[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const fetchingProfile = useRef(false);

  const refreshDrivers = useCallback(async () => {
    try {
      const list = await fetchDrivers();
      setDrivers(list);
    } catch (err) {
      console.error("Error al refrescar conductores:", err);
    }
  }, []);

  const ensureProfile = useCallback(async (accessToken: string) => {
    if (fetchingProfile.current) return;
    fetchingProfile.current = true;
    try {
      const res = await fetchUserProfile(accessToken, {});
      // El backend todavía no devuelve drivers en /profile —
      // los traemos aparte para que el contexto los exponga.
      let driversList: Driver[] = [];
      try {
        driversList = await fetchDrivers();
      } catch (err) {
        console.error("Error al obtener conductores:", err);
      }
      setUser({ ...res.user, drivers: driversList });
      setDrivers(driversList);
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
        setDrivers([]);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setTokenState(newToken);
    setUser(newUser);
    setDrivers(newUser.drivers ?? []);
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    removeToken();
    setTokenState(null);
    setUser(null);
    setDrivers([]);
  }, []);

  useEffect(() => {
    registerUnauthorizedHandler(logout);
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{ user, token, authReady, drivers, refreshDrivers, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
