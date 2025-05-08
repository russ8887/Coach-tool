// js/coachSelect.js
// Handles the coach selection dropdown and fetching/displaying schedules (ES Module).

// --- Import Dependencies ---
import { appState } from './state.js'; // <--- Import from state.js
import { refreshDataForMode } from './main.js'; // Import refreshDataForMode if needed, though it's usually called from main/auth
// *** ADDED fetchPastMissedLogs to imports ***
import { fetchScheduleData, getTodaysLoggedSlotIds, getTodaysStatuses, fetchPastMissedLogs } from './api.js';
import { displayCoachSchedule } from './schedule.js';
// *** ADDED displayPastMissedLogsUI to imports ***
import { hideAppSubsections, showLoading, hideLoading, displayError, displayPastMissedLogsUI } from './ui.js';

// --- Module Functions ---

/**
 * Populates the coach selector dropdown.
 * @param {Array<object>} coaches - Array of coach objects { id, Name }.
 * @param {string} [targetElementId='coach-select'] - The ID of the select element.
 */
export function populateCoachSelector(coaches, targetElementId = 'coach-select') {
    console.log("CoachSelect: >>> ENTERING populateCoachSelector function...");
    console.log("CoachSelect: Received 'coaches' parameter:", coaches, `(Type: ${typeof coaches} Is Array: ${Array.isArray(coaches)} Length: ${coaches?.length})`);

    const coachSelectElement = document.getElementById(targetElementId);

    if (!coachSelectElement) {
        console.error(`CoachSelect Error: Target element #${targetElementId} not found.`);
        return;
    }
    if (!Array.isArray(coaches)) {
         console.error(`CoachSelect Error: Invalid 'coaches' data provided (not an array). Received:`, coaches);
         coachSelectElement.innerHTML = '<option value="">Error loading coaches</option>';
         return;
    }

    console.log(`CoachSelect: Targeting element ID: ${targetElementId}, Tag: ${coachSelectElement.tagName}`);
    console.log("CoachSelect: Populating coach selector...");

    coachSelectElement.innerHTML = '<option value="">-- Select a Coach --</option>';
    coaches.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));

    coaches.forEach(coach => {
        if (coach && typeof coach.id !== 'undefined' && coach.Name) {
            const option = document.createElement('option');
            option.value = coach.id;
            option.textContent = coach.Name;
            coachSelectElement.appendChild(option);
        } else {
            console.warn("CoachSelect Warning: Skipping invalid coach data object:", coach);
        }
    });

    coachSelectElement.value = '';
    console.log("CoachSelect: Finished adding options. coachSelectElement.options.length:", coachSelectElement.options.length);
    console.log("CoachSelect: coachSelectElement.innerHTML (sample):", coachSelectElement.innerHTML.substring(0, 150));
    console.log("CoachSelect: Coach selector populated.");

    const container = document.getElementById('coach-selector-container');
    if(container) {
        container.classList.remove('hidden');
    } else {
        console.warn("CoachSelect Warning: Coach selector container not found.");
    }
}


/**
 * Handles the change event when a coach is selected from the dropdown.
 * Fetches and displays the schedule for the selected coach.
 */
export async function handleCoachSelectionChange(event) {
    console.log("CoachSelect: >>> ENTERING handleCoachSelectionChange function...");
    const selectedCoachId = event.target.value ? parseInt(event.target.value, 10) : null;
    console.log("CoachSelect: handleCoachSelectionChange triggered. Selected Coach ID:", selectedCoachId);

    // Use appState imported from state.js
    // *** Added fetchPastMissedLogs and displayPastMissedLogsUI to dependency check ***
    if (!appState || !fetchScheduleData || !displayCoachSchedule || !hideAppSubsections || !showLoading || !hideLoading || !displayError || !fetchPastMissedLogs || !displayPastMissedLogsUI) {
        console.error("CoachSelect Error: Core dependencies (appState, apiUtils, uiUtils, scheduleUtils) not available.");
        displayError("Application error: Cannot load schedule.", "general");
        return;
    }

    // Use appState imported from state.js
    appState.updateCurrentCoachId(selectedCoachId); // This also clears pastMissedLogs in state

    if (!selectedCoachId) {
        console.log("CoachSelect: No coach selected. Clearing schedule display.");
        const coachScheduleDiv = document.getElementById('coach-schedule');
        const scheduleDisplayDiv = document.getElementById('schedule-display');
        if (coachScheduleDiv) coachScheduleDiv.innerHTML = '<p class="text-gray-500 dark:text-gray-400 p-4">Select a coach to view their schedule.</p>';
        if (scheduleDisplayDiv) scheduleDisplayDiv.classList.add('hidden');
        // Ensure missed log warning is also cleared (already handled in updateCurrentCoachId)
        displayPastMissedLogsUI([]); // Clear the past missed logs UI
        return;
    }

    console.log("CoachSelect: Processing selection for Coach ID:", selectedCoachId);
    showLoading('main');
    hideAppSubsections();

    try {
        console.log("CoachSelect: Fetching schedule, logged IDs, and past missed logs...");

        // *** Fetch schedule, logged slots, AND past missed logs concurrently ***
        const [scheduleData, todaysLoggedIds, pastMissedLogsData] = await Promise.all([
            fetchScheduleData(selectedCoachId),
            getTodaysLoggedSlotIds(selectedCoachId), // Respects test mode internally
            fetchPastMissedLogs(selectedCoachId) // Fetch past missed logs
        ]);

        console.log("CoachSelect: API calls finished.", { scheduleData, todaysLoggedIds, pastMissedLogsData });

        // *** Check all fetched data ***
        if (scheduleData === null || todaysLoggedIds === null || pastMissedLogsData === null) {
             throw new Error("Failed to fetch schedule or log data.");
        }

        // Update state with fetched data - Use appState imported from state.js
        appState.updateScheduleData(scheduleData);
        appState.updateTodaysLoggedSlotIds(todaysLoggedIds);
        appState.updatePastMissedLogs(pastMissedLogsData); // *** Store past missed logs ***
        console.log("CoachSelect: Today's logged slot IDs updated in appState:", appState.todaysLoggedSlotIds);
        console.log("CoachSelect: Past missed logs updated in appState:", appState.pastMissedLogs);


        // --- Display Schedule ---
        // Use appState imported from state.js
        if (!appState.studentsData || appState.studentsData.length === 0) {
             console.warn("CoachSelect Warning: Student data is empty or missing in appState. Schedule display might be incomplete.");
        }
        if (!appState.todaysStatuses) { // Also check statuses needed by displayCoachSchedule
             console.warn("CoachSelect Warning: Today's statuses are missing in appState. Schedule display might be incomplete.");
        }

        console.log("CoachSelect: Calling displayCoachSchedule with fetched data...");
        // Pass necessary data from appState
        // displayCoachSchedule now calculates today's missed logs and displays warning
        displayCoachSchedule(
            selectedCoachId,
            appState.scheduleData,
            appState.studentsData,
            appState.todaysStatuses || [], // Pass statuses
            appState.todaysLoggedSlotIds // Pass logged IDs
        );
        console.log("CoachSelect: Returned from displayCoachSchedule.");

        // *** Display the past missed logs UI ***
        displayPastMissedLogsUI(appState.pastMissedLogs);

        const scheduleDisplayDiv = document.getElementById('schedule-display');
        if (scheduleDisplayDiv) scheduleDisplayDiv.classList.remove('hidden');
        console.log("CoachSelect: Made scheduleDisplay visible.");


    } catch (error) {
        console.error("CoachSelect Error handling coach selection:", error);
        displayError(`Failed to load schedule for selected coach: ${error.message}`, "general");
        const coachScheduleDiv = document.getElementById('coach-schedule');
        if (coachScheduleDiv) coachScheduleDiv.innerHTML = '<p class="text-red-500 dark:text-red-400 p-4">Error loading schedule.</p>';
        displayPastMissedLogsUI([]); // Clear past missed logs UI on error
    } finally {
        hideLoading('main');
        console.log("CoachSelect: <<< EXITING handleCoachSelectionChange function.");
    }
}

/**
 * Refreshes the schedule display for the currently selected coach.
 * Used after actions like adding/removing students or logging lessons.
 */
export async function refreshCurrentCoachSchedule() {
    // Use appState imported from state.js
    console.log("CoachSelect: Refreshing current coach schedule...");
    if (!appState.currentCoachId) {
        console.log("CoachSelect Refresh: No coach currently selected, skipping refresh.");
        return;
    }
    // *** Added fetchPastMissedLogs and displayPastMissedLogsUI to dependency check ***
    if (!appState || !fetchScheduleData || !displayCoachSchedule || !hideAppSubsections || !showLoading || !hideLoading || !displayError || !getTodaysLoggedSlotIds || !getTodaysStatuses || !fetchPastMissedLogs || !displayPastMissedLogsUI) {
         console.error("CoachSelect Refresh Error: Core dependencies missing.");
         displayError("Application error: Cannot refresh schedule.", "general");
         return;
    }

    const coachId = appState.currentCoachId;
    showLoading('main');
    try {
        // Re-fetch schedule structure, statuses, logged slots, and past missed logs
        const [scheduleData, todaysStatuses, todaysLoggedIds, pastMissedLogsData] = await Promise.all([
            fetchScheduleData(coachId),
            getTodaysStatuses(), // Fetch latest statuses
            getTodaysLoggedSlotIds(coachId), // Fetch latest logged IDs for this coach
            fetchPastMissedLogs(coachId) // *** Re-fetch past missed logs ***
        ]);

        if (scheduleData === null || todaysStatuses === null || todaysLoggedIds === null || pastMissedLogsData === null) {
            throw new Error("Failed to fetch necessary data for schedule refresh.");
        }

        // Update state - Use appState imported from state.js
        appState.updateScheduleData(scheduleData);
        appState.updateTodaysStatuses(todaysStatuses);
        appState.updateTodaysLoggedSlotIds(todaysLoggedIds);
        appState.updatePastMissedLogs(pastMissedLogsData); // *** Update past missed logs state ***

        // Re-display - Use appState imported from state.js
        // displayCoachSchedule now calculates today's missed logs and displays warning
        displayCoachSchedule(
            coachId,
            appState.scheduleData,
            appState.studentsData, // Assume student data is static enough
            appState.todaysStatuses, // Use updated statuses
            appState.todaysLoggedSlotIds // Use updated logged IDs
        );

        // *** Refresh the past missed logs UI ***
        displayPastMissedLogsUI(appState.pastMissedLogs);

        // Re-apply selection highlight if a slot was selected - Use appState imported from state.js
        const selectedSlotId = appState.selectedLessonSlot?.scheduleId;
        if (selectedSlotId) {
             const slotElement = document.querySelector(`.schedule-item[data-schedule-id="${selectedSlotId}"]`);
             const isLogged = appState.todaysLoggedSlotIds.includes(selectedSlotId);
             if (slotElement && !isLogged) {
                 const selectionClasses = ['ring-2', 'ring-indigo-400', 'dark:ring-indigo-500', 'ring-offset-1', 'dark:ring-offset-gray-800'];
                 slotElement.classList.add(...selectionClasses);
             } else if (isLogged) {
                 // If the selected slot became logged during the refresh, clear selection
                 appState.updateSelectedLessonSlot(null);
                 const slotActionsDiv = document.getElementById('slot-actions');
                 if (slotActionsDiv) slotActionsDiv.classList.add('hidden');
             }
        }


    } catch (error) {
        console.error("CoachSelect Error refreshing schedule:", error);
        displayError(`Failed to refresh schedule: ${error.message}`, "general");
        displayPastMissedLogsUI([]); // Clear past missed logs UI on error
    } finally {
        hideLoading('main');
    }
}


// --- Add a ready flag ---
export const isReady = true;

console.log("Coach Select module (coachSelect.js) loaded.");
