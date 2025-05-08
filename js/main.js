// js/main.js
// Main application entry point and initial event listener setup (ES Module).
// v2: Initialize studentProfile.js

// --- Import Dependencies ---
import { appState } from './state.js'; // Import appState from state.js
import { initializeUI, displayError as uiDisplayError, updateTestModeButton } from './ui.js';
import { initLogViewer } from './logViewer.js';
import { initAdminControls, populateAdminCoachSelector } from './admin.js';
import { checkInitialAuthState, handleLogin, attachForgotPasswordListener } from './auth.js';
import { handleCoachSelectionChange, refreshCurrentCoachSchedule, populateCoachSelector } from './coachSelect.js';
import { clearTestData, loadInitialAppData } from './api.js';
import { supabaseClient } from './supabaseClient.js';
import { initStudentProfile } from './studentProfile.js'; // <<< NEW: Import student profile initializer

// --- Global State Object (Imported) ---
// appState is now imported from './state.js'

// --- Helper Function to Refresh Data Based on Mode (Exported) ---
/** Refreshes essential data based on the current appState.isTestMode */
export async function refreshDataForMode() {
    // This function remains largely the same but uses the imported appState
    console.log(`AppState Refresh: Refreshing data for ${appState.isTestMode ? 'Test' : 'Live'} mode.`);
    try {
        const initialData = await loadInitialAppData();
        if (initialData) {
            appState.setInitialData(initialData); // Use imported appState
            populateCoachSelector(appState.coachesData);
            if (appState.isAdmin) { // Check imported appState
                populateAdminCoachSelector(appState.coachesData);
            }
            if (appState.currentCoachId) { // Check imported appState
                await refreshCurrentCoachSchedule();
            } else {
                const coachScheduleDiv = document.getElementById('coach-schedule');
                if (coachScheduleDiv) coachScheduleDiv.innerHTML = '<p class="text-gray-500 dark:text-gray-400 p-4">Select a coach to view their schedule.</p>';
            }
        } else {
            throw new Error("Failed to load initial data during mode refresh.");
        }
        console.log("AppState Refresh: Data refresh complete.");
    } catch (error) {
        console.error("AppState Refresh Error:", error);
        uiDisplayError(`Failed to refresh data for ${appState.isTestMode ? 'Test' : 'Live'} mode. ${error.message}`, "general");
    }
}

// --- DOMContentLoaded Event Listener (Central Initialization Point) ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Main: DOMContentLoaded event fired.");

    // --- Initialize Modules that need DOM access ---
    console.log("Main: Initializing UI module...");
    initializeUI();

    console.log("Main: Initializing Log Viewer module...");
    initLogViewer();

    console.log("Main: Initializing Admin module...");
    initAdminControls();

    console.log("Main: Initializing Student Profile module..."); // <<< NEW
    initStudentProfile(); // <<< NEW: Call the initializer

    // --- Attach Main Event Listeners ---
    console.log("Main: Attaching main event listeners...");
    const loginForm = document.getElementById('login-form');
    const coachSelect = document.getElementById('coach-select');
    const testModeButton = document.getElementById('test-mode-button');
    const clearTestDataButton = document.getElementById('clear-test-data-button');

    if (loginForm) {
         loginForm.addEventListener('submit', (event) => {
             event.preventDefault();
             handleLogin(event);
         });
         console.log("Main: Login form listener attached.");
     } else { console.warn("Main Warning: Login form element not found."); }

     attachForgotPasswordListener(); // From auth.js

     if (coachSelect) {
         coachSelect.addEventListener('change', (event) => {
             handleCoachSelectionChange(event);
         });
         console.log("Main: Coach select listener attached.");
     } else { console.warn("Main Warning: Coach select element not found."); }

     if (testModeButton) {
         testModeButton.addEventListener('click', () => {
             console.log("Main: Test Mode button clicked.");
             // Pass refreshDataForMode as the callback to the state method
             appState.toggleTestMode(refreshDataForMode).catch(err => {
                 console.error("Main: Error during test mode toggle:", err);
                 uiDisplayError(`Error toggling test mode: ${err.message}`, 'general');
             });
         });
         console.log("Main: Test mode button listener attached.");
     } else { console.warn("Main Warning: Test Mode button element (#test-mode-button) not found."); }

     if (clearTestDataButton) {
         clearTestDataButton.addEventListener('click', () => {
             console.log("Main: Clear Test Data button clicked.");
             if (!appState.isTestMode) { // Use imported appState
                 alert("Activate Test Mode first to clear test data.");
                 return;
             }
             if (confirm("Are you sure you want to delete ALL TEST data? This cannot be undone.")) {
                 console.log("Main: User confirmed test data deletion.");
                 clearTestData().then(success => {
                     if (success) {
                         alert("Test data cleared successfully.");
                         console.log("Main: Test data cleared via API.");
                         refreshDataForMode(); // Refresh data after clearing
                     } else {
                         alert("Failed to clear test data. Check console for errors.");
                         console.error("Main: clearTestData API call returned false.");
                     }
                 }).catch(err => {
                     alert(`Error clearing test data: ${err.message}`);
                     console.error("Main: Error calling clearTestData API:", err);
                 });
             } else {
                 console.log("Main: User cancelled test data deletion.");
             }
         });
         console.log("Main: Clear test data button listener attached.");
     } else { console.warn("Main Warning: Clear Test Data button element (#clear-test-data-button) not found."); }

    console.log("Main: Main event listeners attached.");

    // --- Initial Authentication Check (Runs after DOM is ready and basic listeners attached) ---
     console.log("Main: About to check initial auth state...");
     checkInitialAuthState(); // From auth.js

}); // End DOMContentLoaded listener

console.log("Main module (main.js) loaded.");
