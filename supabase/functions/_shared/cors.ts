    // supabase/functions/_shared/cors.ts
    // Standard CORS headers for Supabase Edge Functions

    export const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // Allow requests from any origin (adjust in production if needed)
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
    