import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl  = "https://bxhduayxffanioaclzrd.supabase.co";
const supabaseKey  = "sb_publishable_Vav07LwckYgdS4xHnvEqMQ_IiFTpjXb";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage:           AsyncStorage,
    autoRefreshToken:  true,
    persistSession:    true,
    detectSessionInUrl: false,
  },
});
