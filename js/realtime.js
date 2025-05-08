// js/realtime.js
// Handles Supabase Realtime subscriptions for attendance changes (ES Module).

// --- Import Dependencies ---
import { supabaseClient } from './supabaseClient.js';
import { appState } from './state.js'; // <--- Import from state.js
import { displayError as uiDisplayError } from './ui.js';
import { reRenderSlot } from './schedule.js';
import { getTodaysStatuses, getTodaysLoggedSlotIds } from './api.js';

// --- Module State ---
let realtimeChannel = null;
let currentSubscriptionTable = null; // Track 'daily_attendance_status' or 'daily_attendance_status_test'
let isCleaningUp = false; // Flag to prevent race conditions during cleanup/setup

/**
 * Handles incoming Realtime messages for the subscribed table.
 * Updates appState and uses schedule.reRenderSlot to update only the affected slot UI.
 * @param {object} payload - The Realtime message payload.
 */
async function handleRealtimeChange(payload) {
    console.log("Realtime Change Received!", payload);

    const { eventType, new: newRecord, old: oldRecord, table } = payload;
    // Use the old record for DELETE events to know which slot/student was affected
    const record = eventType === 'DELETE' ? oldRecord : newRecord;

    if (!record || !eventType) {
        console.warn("Realtime Handler: Invalid payload received.", payload);
        return;
    }

    const scheduleId = record.lesson_schedule_id;
    const studentId = record.student_id; // Keep track for logging/debugging
    const newStatus = record.status; // Status in the new record (or undefined if DELETE)

    console.log(`Realtime Handler: Event=${eventType}, Table=${table}, ScheduleID=${scheduleId}, StudentID=${studentId}, NewStatus=${newStatus}`);

    // Basic validation
    if (typeof scheduleId === 'undefined' || scheduleId === null) {
        console.warn("Realtime Handler: No schedule ID found in payload record, cannot process UI update for a specific slot.");
        // Might still want to refresh all statuses if scheduleId is missing
        // await refreshAllStatuses(); // Example: Implement a function to refetch all statuses
        return;
    }

    // Check if Suggestion Box is Open for this Slot - prevent disruptive UI refresh
    const suggestionBox = document.getElementById('absence-suggestion-box');
    const isSuggestionBoxOpenForThisSlot = suggestionBox && parseInt(suggestionBox.dataset.scheduleId) === scheduleId;

    // Use appState imported from state.js
    const currentCoachId = appState?.currentCoachId; // Get current coach ID

    // Refresh State (Statuses and Logged Slots) regardless of suggestion box,
    // as the underlying data *has* changed.
    try {
        console.log("Realtime Handler: Refreshing statuses and logged slots in background...");
        const [refreshedStatuses, refreshedLoggedIds] = await Promise.all([
            getTodaysStatuses(), // Fetches based on current appState.isTestMode
            getTodaysLoggedSlotIds(currentCoachId) // Fetches for current coach based on appState.isTestMode
        ]);

        // Update global state - Use appState imported from state.js
        if (refreshedStatuses) appState.updateTodaysStatuses(refreshedStatuses);
        else console.warn("Realtime Handler: Failed to refresh statuses.");
        if (refreshedLoggedIds) appState.updateTodaysLoggedSlotIds(refreshedLoggedIds);
        else console.warn("Realtime Handler: Failed to refresh logged slots.");
        console.log("Realtime Handler: State refreshed.");

    } catch (error) {
        console.error("Realtime Handler Error refreshing state:", error);
        // Display error but continue to UI refresh attempt if possible
        uiDisplayError("Error updating state from live changes.", "general");
    }

    // --- UI Refresh Logic ---
    // Only proceed with UI refresh if the suggestion box for this slot is NOT open
    if (isSuggestionBoxOpenForThisSlot) {
        console.log(`Realtime Handler: Suggestion box for slot ${scheduleId} is open. Skipping UI refresh for this slot to avoid disruption.`);
        return; // Stop here to prevent UI flicker while suggestion box is active
    }

    // Find the slot element in the current view
    const slotElement = document.querySelector(`.schedule-item[data-schedule-id="${scheduleId}"]`);

    if (slotElement) {
        // If the slot is visible, re-render it
        console.log(`Realtime Handler: Re-rendering specific slot ID: ${scheduleId}`);
        reRenderSlot(scheduleId); // Use imported function from schedule.js
        console.log(`Realtime Handler: Slot ${scheduleId} re-render complete.`);

        // Handle selected slot state if it was the one updated
        // Use appState imported from state.js
        const selectedSlotId = appState.selectedLessonSlot?.scheduleId;
        if (selectedSlotId === scheduleId) {
            // Use appState imported from state.js
            const isNowLogged = appState.todaysLoggedSlotIds.includes(scheduleId);

            if (isNowLogged) {
                // If the selected slot became logged due to the realtime update
                console.log(`Realtime Handler: Slot ${scheduleId} became logged, hiding form and clearing selection.`);
                const inlineFormContainer = slotElement.querySelector(`#inline-log-form-${scheduleId}`);
                if (inlineFormContainer) {
                    inlineFormContainer.classList.add('hidden');
                    inlineFormContainer.innerHTML = '';
                }
                // Use appState imported from state.js
                appState.updateSelectedLessonSlot(null); // Clear selection
                const slotActionsDiv = document.getElementById('slot-actions');
                if (slotActionsDiv) slotActionsDiv.classList.add('hidden'); // Hide actions
            } else {
                 // If the slot is still selected and not logged, re-apply highlight (reRenderSlot might remove it)
                 const updatedSlotElement = document.querySelector(`.schedule-item[data-schedule-id="${scheduleId}"]`);
                 if (updatedSlotElement && !updatedSlotElement.classList.contains('bg-gray-100')) { // Check it's not styled as logged
                     const selectionClasses = ['ring-2', 'ring-indigo-400', 'dark:ring-indigo-500', 'ring-offset-1', 'dark:ring-offset-gray-800'];
                     updatedSlotElement.classList.add(...selectionClasses);
                 }
            }
        }
    } else {
        // Slot not visible (e.g., different coach selected, or filtered day view)
        console.log(`Realtime Handler: Slot ${scheduleId} not visible. Change processed in state only.`);
    }
}


/**
 * Sets up the Realtime subscription based on the current mode (test/live).
 * Cleans up any existing subscription first. (Exported)
 */
export async function setupRealtimeSubscription() {
    // Use appState imported from state.js
    if (!supabaseClient || !appState) {
        console.error("Realtime Error: Supabase client or appState not available for setup.");
        return;
    }
    if (isCleaningUp) {
        console.warn("Realtime Setup: Cleanup already in progress, setup deferred.");
        return;
    }

    console.log("Realtime: Attempting to set up subscription...");
    // Use appState imported from state.js
    const targetTable = appState.isTestMode ? 'daily_attendance_status_test' : 'daily_attendance_status';

    // Check if already subscribed to the correct table
    if (realtimeChannel && currentSubscriptionTable === targetTable) {
        console.log(`Realtime: Already subscribed to ${targetTable}. No change needed.`);
        return;
    }

    // Clean up any existing channel before creating a new one
    await cleanupRealtimeSubscription(); // Ensure previous subscription is gone

    const channelName = `public:${targetTable}`; // Define channel name based on table
    // Use appState imported from state.js
    console.log(`Realtime: Subscribing to channel: ${channelName} (Mode: ${appState.isTestMode ? 'Test' : 'Live'})`);

    try {
        // Create and subscribe to the new channel
        realtimeChannel = supabaseClient
            .channel(channelName) // Use dynamic channel name
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: targetTable }, // Filter for the target table
                (payload) => handleRealtimeChange(payload) // Handler function
            )
            .subscribe((status, err) => { // Handle subscription status changes
                if (status === 'SUBSCRIBED') {
                    console.log(`Realtime: Successfully subscribed to ${channelName}!`);
                    currentSubscriptionTable = targetTable; // Track the current table
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                     console.error(`Realtime: Subscription Status Error for ${channelName}: ${status}`, err || '');
                     // If the channel that errored/closed is the one we think is active, reset state
                     if (realtimeChannel && realtimeChannel.topic === channelName) {
                        realtimeChannel = null;
                        currentSubscriptionTable = null;
                        console.log(`Realtime: Reset local channel state due to ${status}.`);
                     } else {
                        console.warn(`Realtime: Received ${status} for an unexpected channel (${channelName}), current is ${realtimeChannel?.topic || 'null'}. Ignoring state reset.`);
                     }
                     // Avoid showing errors if we are intentionally cleaning up
                     if (!isCleaningUp) {
                         uiDisplayError(`Live updates disconnected (${status}). Please refresh if issues persist.`, "general");
                     } else {
                         console.log(`Realtime: Suppressed UI error for ${status} during cleanup.`);
                     }
                } else if (err) {
                     // Handle other subscription errors
                     console.error(`Realtime: Subscription Error for ${channelName}:`, err);
                     if (realtimeChannel && realtimeChannel.topic === channelName) {
                        realtimeChannel = null;
                        currentSubscriptionTable = null;
                        console.log(`Realtime: Reset local channel state due to subscription error.`);
                     } else {
                         console.warn(`Realtime: Received error for an unexpected channel (${channelName}), current is ${realtimeChannel?.topic || 'null'}. Ignoring state reset.`);
                     }
                     if (!isCleaningUp) {
                         uiDisplayError(`Live update subscription error. Please refresh.`, "general");
                     } else {
                         console.log(`Realtime: Suppressed UI error for subscription error during cleanup.`);
                     }
                } else {
                    // Log other statuses like 'connecting', 'reconnecting'
                    console.log(`Realtime: Subscription status for ${channelName}: ${status}`);
                }
            });
        console.log(`Realtime: Subscription setup initiated for ${channelName}.`);
    } catch (error) {
        console.error(`Realtime Error: Failed to create or subscribe to channel ${channelName}:`, error);
        realtimeChannel = null;
        currentSubscriptionTable = null;
        uiDisplayError(`Failed to setup live updates.`, "general");
    }
}


/**
 * Cleans up the existing Realtime subscription. (Exported)
 */
export async function cleanupRealtimeSubscription() {
    if (isCleaningUp) {
        console.warn("Realtime Cleanup: Already in progress, skipping.");
        return;
    }
    if (!realtimeChannel) {
        console.log("Realtime Cleanup: No active channel to clean up.");
        return;
    }

    isCleaningUp = true; // Set flag
    const channelToRemove = realtimeChannel; // Store reference to the channel being removed
    const tableName = currentSubscriptionTable; // Store reference to its table name
    console.log(`Realtime Cleanup: Starting cleanup for channel realtime:${tableName}...`);

    try {
        // Attempt to unsubscribe
        const status = await channelToRemove.unsubscribe();
        console.log(`Realtime Cleanup: Unsubscribe status for ${tableName}: ${status}`);
    } catch (error) {
        // Log error but continue cleanup
        console.error(`Realtime Cleanup: Error during unsubscribe for ${tableName}:`, error);
    }
    finally {
        try {
            // Attempt to remove the channel from the client
            if (supabaseClient?.removeChannel) {
                 console.log(`Realtime Cleanup: Attempting client.removeChannel for ${tableName}...`);
                 await supabaseClient.removeChannel(channelToRemove);
                 console.log(`Realtime Cleanup: Channel removed from client for ${tableName}.`);
            } else {
                console.warn("Realtime Cleanup: supabaseClient.removeChannel function not found.");
            }
        } catch (removeError) {
             // Log remove error, especially stack overflows which can happen
             console.error(`Realtime Cleanup: Error removing channel for ${tableName}:`, removeError);
             if (removeError instanceof RangeError && removeError.message.includes('Maximum call stack size exceeded')) {
                 console.warn(`Realtime Cleanup: Encountered stack overflow during removeChannel for ${tableName}. Supabase client might need reinitialization on next connection attempt.`);
             }
        }
        // Only reset module state if the channel we just removed is still the active one
        if (realtimeChannel === channelToRemove) {
             realtimeChannel = null;
             currentSubscriptionTable = null;
             console.log(`Realtime Cleanup: Reset local state for ${tableName}.`);
        } else {
            // This case might happen if setupRealtimeSubscription was called again during cleanup
            console.log(`Realtime Cleanup: Channel changed during cleanup for ${tableName}. Local state not reset.`);
        }
        isCleaningUp = false; // Reset flag
        console.log("Realtime Cleanup: Finished.");
    }
}

// --- Add a ready flag ---
export let isReady = true; // Assume ready immediately, no DOM needed for setup

console.log("Realtime module (realtime.js) loaded.");
