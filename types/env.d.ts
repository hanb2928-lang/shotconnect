declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_SUPABASE_URL: string;
      EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
      // Server-side only — never access from client code; use lib/supabase.ts constants instead
      RUNWAY_API_KEY?: string;
    }
  }
}

export {};
