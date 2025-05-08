// js/auth.js
// Handles user authentication (login, logout, session check, password reset) using Supabase Auth (ES Module).

// --- Import Dependencies ---
import { supabaseClient } from './supabaseClient.js';
import { appState } from './state.js'; // <--- Import from state.js
import { refreshDataForMode } from './main.js'; // Keep this import for now if needed elsewhere, or pass if required
import { loadInitialAppData } from './api.js';
import {
    showLoginScreen, showAppContent, showPasswordResetForm, displayError as uiDisplayError,
    clearError as uiClearError, showLoading as uiShowLoading, hideLoading as uiHideLoading,
    displayAdminIndicator, displayCurrentDateInfo, displayAdminToggleButton,
    displayRandomQuote,
    updateTestModeButton // ***** IMPORT updateTestModeButton *****
} from './ui.js';
import { calculateCurrentTermAndWeek } from './utils.js';
import { populateCoachSelector, refreshCurrentCoachSchedule } from './coachSelect.js';
import { populateAdminCoachSelector, initAdminControls } from './admin.js';
import { setupRealtimeSubscription, cleanupRealtimeSubscription } from './realtime.js';
// Import the isReady flags from modules that export them
import { isReady as uiIsReady } from './ui.js';
import { isReady as apiIsReady } from './api.js';
import { isReady as utilsIsReady } from './utils.js';
import { isReady as coachSelectIsReady } from './coachSelect.js';
import { isReady as adminIsReady } from './admin.js';
import { isReady as realtimeIsReady } from './realtime.js';
import { isReady as stateIsReady } from './state.js'; // Import state readiness flag

// --- Helper: Wait for Modules ---
/** Waits for specified modules (and Supabase client) to be ready by checking their exported 'isReady' flag. */
async function waitForModules(moduleNames, timeout = 7000) {
    console.log(`Auth: Waiting for modules: ${moduleNames.join(', ')} and supabaseClient...`);
    const startTime = Date.now();
    // Map module names to their potential global objects/flags
    const modulesToCheck = {
        supabaseClient: () => !!supabaseClient,
        appState: () => stateIsReady === true, // Check state module readiness
        uiUtils: () => uiIsReady === true,
        apiUtils: () => apiIsReady === true,
        utils: () => utilsIsReady === true,
        coachSelectUtils: () => coachSelectIsReady === true,
        adminUtils: () => adminIsReady === true,
        realtime: () => realtimeIsReady === true,
    };

    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            let allReady = true;
            let notReadyList = [];

            if (!modulesToCheck.supabaseClient()) {
                allReady = false;
                notReadyList.push('supabaseClient');
            }

            moduleNames.forEach(modName => {
                if (modulesToCheck[modName]) {
                    if (!modulesToCheck[modName]()) {
                        allReady = false;
                        notReadyList.push(modName);
                    }
                } else {
                    console.warn(`waitForModules: No check defined for module '${modName}'`);
                }
            });

            if (allReady) {
                clearInterval(checkInterval);
                console.log(`Auth: Modules ready: ${moduleNames.join(', ')} and supabaseClient.`);
                resolve(true);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                console.error(`Auth Error: Timeout waiting for modules/client. Still waiting for: ${notReadyList.join(', ')}`);
                uiDisplayError("Application components timed out. Please refresh.", "login");
                resolve(false);
            }
        }, 150);
    });
}


// --- Other Helper Functions ---

/** Checks if the user object indicates admin privileges. */
function checkIfAdmin(user) {
    // Use the consistent role check
    return user?.app_metadata?.role === 'admin';
}

/** Attaches the logout button listener. */
function attachLogoutListener() {
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.removeEventListener('click', handleLogoutClick);
        logoutButton.addEventListener('click', handleLogoutClick);
        console.log("Auth: Logout listener attached.");
    } else {
        console.warn("Auth Warning: Logout button not found.");
    }
}

/** Wrapper function to call handleLogout when the button is clicked. */
function handleLogoutClick() {
    console.log("Auth: Logout button clicked.");
    handleLogout();
}


/** Parses URL hash parameters (e.g., for password recovery links). */
function parseUrlHash() {
    const hash = window.location.hash.substring(1);
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const result = {};
    for (const [key, value] of params.entries()) {
        result[key] = value;
    }
    if (result.access_token && result.refresh_token && result.type === 'recovery') {
        return result;
    }
    return null;
}

// --- Exported Functions ---

/** Handles the login form submission. */
export async function handleLogin(event) {
    event.preventDefault();
    console.log("Auth: handleLogin started.");

    const loginForm = event.target;
    const emailInput = loginForm.elements.email;
    const passwordInput = loginForm.elements.password;
    const loginButton = loginForm.querySelector('button[type="submit"]');

    if (!emailInput || !passwordInput || !loginButton) {
        console.error("Auth Error: Login form elements not found.");
        uiDisplayError("Login form error. Please refresh.", "login");
        return;
    }

    const email = emailInput.value;
    const password = passwordInput.value;

    loginButton.disabled = true;
    loginButton.textContent = 'Signing In...';
    uiClearError("login");
    uiShowLoading('login');

    try {
        // Wait for modules needed for the *entire* login process
        const modulesReadyForLogin = await waitForModules(['uiUtils', 'appState', 'apiUtils', 'coachSelectUtils', 'adminUtils', 'utils', 'realtime']);
        if (!modulesReadyForLogin) {
            throw new Error("Application components failed to load before login attempt.");
        }
        console.log("Auth: Modules ready, attempting Supabase sign in...");

        // --- Supabase Login Call ---
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            console.error("Auth Error: Supabase login failed.", error);
            uiDisplayError(error.message || "Invalid login credentials.", "login");
            throw error; // Re-throw to be caught by the outer catch block
        }

        if (data && data.user) {
            console.log("Auth: Login successful!", data.user);
            appState.setCurrentUser(data.user); // Set user and isAdmin flag

            // --- Post-Login Setup ---
            console.log("Auth: Loading initial app data after login...");
            const initialData = await loadInitialAppData();

            if (!initialData) {
                console.error("Auth Error: Failed to load initial app data after login.");
                uiDisplayError("Login successful, but failed to load app data. Please refresh.", "general");
                // Consider logging out the user here if data load fails critically
                // await handleLogout();
                return;
            }

            appState.setInitialData(initialData);
            console.log("Auth: Initial app data loaded and set in state.");

            // Populate UI elements
            populateCoachSelector(appState.coachesData);
            if (appState.isAdmin) {
                populateAdminCoachSelector(appState.coachesData);
                initAdminControls(); // Ensure admin controls are initialized if user is admin
            }
            displayAdminIndicator(appState.isAdmin);
            displayAdminToggleButton(appState.isAdmin);

            // Term/Week Info
            const today = new Date();
            const termInfo = calculateCurrentTermAndWeek(today, appState.termDates);
            displayCurrentDateInfo(today, termInfo);

            // ***** FIX: Set initial Test Mode button style *****
            updateTestModeButton(appState.isTestMode);
            // ***** END FIX *****

            // Setup Realtime
            await setupRealtimeSubscription();

            // Attach logout listener
            attachLogoutListener();

            // Show App Content
            showAppContent();
            displayRandomQuote(document.getElementById('main-chess-quote'));

        } else {
            console.error("Auth Error: Supabase login returned no error but no user data.");
            uiDisplayError("Login failed. Unexpected response from server.", "login");
        }

    } catch (err) {
        console.error("Auth: Error during login process:", err);
        // Ensure login screen is shown on error, potentially with a message
        showLoginScreen("Login failed. Please try again.", true);
        displayRandomQuote(document.getElementById('chess-quote'));

    } finally {
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.textContent = 'Sign In';
        }
        uiHideLoading('login');
        console.log("Auth: handleLogin finished.");
    }
}

/** Handles user logout. */
export async function handleLogout() {
    console.log("Auth: >>> ENTERING handleLogout function...");
    try {
        console.log("Auth: Cleaning up Realtime subscription before logout...");
        await cleanupRealtimeSubscription();

        console.log("Auth: Signing out from Supabase...");
        const { error } = await supabaseClient.auth.signOut();

        if (error) {
            console.error("Auth Error: Supabase sign out failed.", error);
            uiDisplayError(`Logout error: ${error.message}`, "general");
        } else {
            console.log("Auth: Supabase sign out successful.");
        }

    } catch (err) {
        console.error("Auth: Unexpected error during logout process:", err);
        uiDisplayError(`Logout failed: ${err.message}`, "general");
    } finally {
        console.log("Auth: Resetting app state and UI...");
        // Use appState imported from state.js
        appState.setCurrentUser(null);
        appState.setInitialData(null);
        appState.updateCurrentCoachId(null);
        appState.isTestMode = false; // Reset test mode on logout
        appState.initialDataLoaded = false;

        // Reset UI
        showLoginScreen();
        displayRandomQuote(document.getElementById('chess-quote'));
        const coachSelect = document.getElementById('coach-select');
        const coachSchedule = document.getElementById('coach-schedule');
        if (coachSelect) coachSelect.innerHTML = '<option value="">-- Select a Coach --</option>';
        if (coachSchedule) coachSchedule.innerHTML = '';
        // updateTestModeButton(false); // Not needed as login screen is shown

        console.log("Auth: Logout process finished.");
    }
}

/** Checks the initial authentication state when the app loads. */
export async function checkInitialAuthState() {
    console.log("Auth: >>>>>>> ENTERING checkInitialAuthState function... <<<<<<<");
    uiShowLoading('initial');

    try {
        const hashParams = parseUrlHash();
        if (hashParams && hashParams.type === 'recovery') {
            console.log("Auth: Password recovery link detected.");
            showPasswordResetForm();
            // Don't hide loading here, password reset form handles its own state
            return;
        }

        console.log("Auth: No recovery link detected, proceeding with session check.");

        // Wait for essential modules
        const modulesReady = await waitForModules(['apiUtils', 'coachSelectUtils', 'adminUtils', 'utils', 'uiUtils', 'appState', 'realtime']);
        if (!modulesReady) {
            throw new Error("Required application modules did not load in time during startup.");
        }
        console.log("Auth: Dependencies check passed in checkInitialAuthState.");

        console.log("Auth: Checking for existing Supabase session...");
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

        if (sessionError) {
            console.error("Auth Error: Error getting session:", sessionError);
            uiDisplayError(`Error checking session: ${sessionError.message}`, "login");
            showLoginScreen();
            displayRandomQuote(document.getElementById('chess-quote'));
            return; // Stop execution here
        }

        if (session) {
            console.log("Auth: Active session found.", session.user);
            appState.setCurrentUser(session.user); // Set user and isAdmin flag

            console.log("Auth: Loading initial app data for active session...");
            const initialData = await loadInitialAppData();

            if (!initialData) {
                console.error("Auth Error: Failed to load initial app data for active session.");
                // Log out the user if essential data fails to load
                await handleLogout();
                uiDisplayError("Session found, but failed to load app data. Please log in again.", "login", true);
                return; // Stop execution
            }

            appState.setInitialData(initialData);
            console.log("Auth: Initial app data loaded and set in state for active session.");

            // Populate UI
            populateCoachSelector(appState.coachesData);
             if (appState.isAdmin) {
                populateAdminCoachSelector(appState.coachesData);
                initAdminControls(); // Ensure admin controls are initialized if user is admin
            }
            displayAdminIndicator(appState.isAdmin);
            displayAdminToggleButton(appState.isAdmin);

            // Term/Week Info
            const today = new Date();
            const termInfo = calculateCurrentTermAndWeek(today, appState.termDates);
            displayCurrentDateInfo(today, termInfo);

            // ***** FIX: Set initial Test Mode button style *****
            updateTestModeButton(appState.isTestMode);
            // ***** END FIX *****

            // Setup Realtime
            await setupRealtimeSubscription();

            // Attach Logout Listener
            attachLogoutListener();

            // Show App Content
            showAppContent();
            displayRandomQuote(document.getElementById('main-chess-quote'));

        } else {
            console.log("Auth: No active session found.");
            showLoginScreen();
            displayRandomQuote(document.getElementById('chess-quote'));
        }

    } catch (err) {
        console.error("Auth: Error during initial auth state check:", err);
        uiDisplayError(`Initialization error: ${err.message}. Please refresh.`, "login", true);
        showLoginScreen("Initialization failed. Please refresh.", true);
        displayRandomQuote(document.getElementById('chess-quote'));

    } finally {
        // Hide initial loading indicator only if not showing password reset
        const passwordResetSection = document.getElementById('password-reset-section');
        if (!passwordResetSection || passwordResetSection.classList.contains('hidden')) {
            uiHideLoading('initial');
        }
        console.log("Auth: <<<<<<< EXITING checkInitialAuthState function. >>>>>>>");
    }
}

/** Handles the password update form submission (after clicking recovery link). */
export async function handlePasswordReset(event) {
    event.preventDefault();
    console.log("Auth: handlePasswordReset started.");
    const form = event.target;
    const passwordInput = form.elements['new-password'];
    const updateButton = form.querySelector('button[type="submit"]');

    if (!passwordInput || !updateButton) {
        console.error("Auth Error: Password reset form elements not found.");
        uiDisplayError("Form error. Please refresh.", "password-reset");
        return;
    }

    const newPassword = passwordInput.value;
    updateButton.disabled = true;
    updateButton.textContent = 'Updating...';
    uiClearError("password-reset");

    try {
        const { data, error } = await supabaseClient.auth.updateUser({
            password: newPassword
        });

        if (error) {
            console.error("Auth Error: Supabase password update failed.", error);
            uiDisplayError(error.message || "Failed to update password.", "password-reset");
            updateButton.disabled = false;
            updateButton.textContent = 'Update Password';
        } else {
            console.log("Auth: Password updated successfully.", data);
             uiDisplayError("Password updated successfully! You can now log in.", "password-reset", false);
             // Redirect to login after a delay
             setTimeout(() => {
                 window.location.hash = ''; // Clear the hash
                 window.location.reload(); // Reload to go back to login state
             }, 3000);
        }
    } catch (err) {
        console.error("Auth: Unexpected error during password reset:", err);
        uiDisplayError(`An unexpected error occurred: ${err.message}`, "password-reset");
        updateButton.disabled = false;
        updateButton.textContent = 'Update Password';
    }
}

/** Handles the "Forgot Password" link click / form submission. */
export async function handleForgotPassword(event) {
     event.preventDefault();
     console.log("Auth: handleForgotPassword started.");
     const form = event.target.closest('form'); // Ensure we get the form
     if (!form) { console.error("Auth Error: Forgot password form not found."); return; }

     const emailInput = form.elements['reset-email'];
     const sendButton = form.querySelector('button[type="submit"]');

     if (!emailInput || !sendButton) {
         console.error("Auth Error: Forgot password form elements not found.");
         uiDisplayError("Form error. Please refresh.", "password-reset");
         return;
     }

     const email = emailInput.value;
     sendButton.disabled = true;
     sendButton.textContent = 'Sending...';
     uiClearError("password-reset");

     try {
         // Use the current location origin for redirection, removing hash/search
         const redirectUrl = window.location.origin + window.location.pathname;
         console.log("Auth: Sending password reset email with redirect to:", redirectUrl);

         const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
             redirectTo: redirectUrl // Redirect back to the main app page
         });

         if (error) {
             console.error("Auth Error: Supabase forgot password failed.", error);
             uiDisplayError(error.message || "Failed to send reset link.", "password-reset");
             sendButton.disabled = false;
             sendButton.textContent = 'Send Reset Link';
         } else {
             console.log("Auth: Password reset email sent successfully.");
             uiDisplayError("Password reset link sent! Please check your email (including spam folder).", "password-reset", false);
             sendButton.textContent = 'Sent!';
             // Optionally hide the form after sending
             // form.classList.add('hidden');
         }
     } catch (err) {
         console.error("Auth: Unexpected error during forgot password:", err);
         uiDisplayError(`An unexpected error occurred: ${err.message}`, "password-reset");
         sendButton.disabled = false;
         sendButton.textContent = 'Send Reset Link';
     }
}

/** Attaches listener to the "Forgot Password?" link */
export function attachForgotPasswordListener() {
    const forgotLink = document.getElementById('forgot-password-link');
    const resetForm = document.getElementById('password-reset-form'); // Form for entering NEW password
    const forgotForm = document.getElementById('forgot-password-form'); // Form for entering EMAIL
    const backToLoginLink = document.getElementById('back-to-login-link'); // Back link on reset page

    if (forgotLink) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("Auth: Forgot password link clicked.");
            showPasswordResetForm(); // Show the reset section
            if (resetForm) resetForm.classList.add('hidden'); // Hide the new password form
            if (forgotForm) forgotForm.classList.remove('hidden'); // Show the email entry form
        });
        console.log("Auth: Forgot password link listener attached.");
    } else { console.warn("Auth Warning: Forgot password link not found."); }

    if (forgotForm) {
         forgotForm.addEventListener('submit', handleForgotPassword);
         console.log("Auth: Forgot password form submit listener attached.");
     } else { console.warn("Auth Warning: Forgot password form not found."); }

     if (resetForm) {
         resetForm.addEventListener('submit', handlePasswordReset);
         console.log("Auth: Password reset form submit listener attached.");
     } else { console.warn("Auth Warning: Password reset form not found."); }

     if (backToLoginLink) {
         backToLoginLink.addEventListener('click', (e) => {
             e.preventDefault();
             window.location.hash = ''; // Clear hash just in case
             window.location.reload(); // Reload to go back to login state
         });
         console.log("Auth: Back to login link listener attached.");
     } else { console.warn("Auth Warning: Back to login link not found."); }
}


// --- Add a ready flag ---
export const isReady = true; // Auth module itself is ready once loaded

console.log("Auth module (auth.js) loaded.");

