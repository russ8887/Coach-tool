// js/supabaseClient.js
// Initializes and exports the Supabase client instance (ES Module).

// Ensure the Supabase library is loaded from the CDN script in index.html
// We access the createClient function from the global scope (supabase defined by the CDN script)
const { createClient } = supabase;

// Supabase project details (Replace with your actual credentials)
// It's recommended to use environment variables for these in a real deployment

// Corrected Supabase URL
const supabaseUrl = 'https://zzfnfeekrukkrwespmzl.supabase.co';

// !!! CORRECTED Supabase Anon Key !!!
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6Zm5mZWVrcnVra3J3ZXNwbXpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUzOTk5NDgsImV4cCI6MjA2MDk3NTk0OH0.j-_WXSpHQ0Dsau6XQWxAlqyiHzmM-i9r5KWWbIPdA_E';

// --- Create and Export the Supabase Client ---
// Use 'export const' to make the client available for import in other modules
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// --- Log confirmation ---
if (supabaseClient) {
    console.log("Supabase client initialized (PRODUCTION) and exported. OK");
} else {
    console.error("CRITICAL ERROR: Supabase client failed to initialize!");
    alert("Error: Could not connect to the backend service. Please refresh or contact support.");
}

console.log("Supabase Client module (supabaseClient.js) loaded.");

// Add a ready flag (optional, but can be useful for dependency checks)
export const isReady = true;
