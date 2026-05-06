import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// En desarrollo sin Supabase configurado el cliente es null.
// Lanza error solo cuando se intenta usar (no al importar).
export const supabase: SupabaseClient = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : new Proxy({} as SupabaseClient, {
      get() {
        throw new Error("Supabase no configurado. Agregá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY al .env");
      },
    });
