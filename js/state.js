// js/state.js
// Defines and exports the central application state object.
// v2: Added isEditMode flag.

// --- Import Dependencies needed for state methods ---
import { updateTestModeButton, displayMissedLogWarning } from './ui.js'; // Added displayMissedLogWarning
import { cleanupRealtimeSubscription, setupRealtimeSubscription } from './realtime.js';
// refreshDataForMode callback will be passed into toggleTestMode

console.log("State: Defining appState object...");

export const appState = {
    currentUser: null,
    isAdmin: false,
    isTestMode: false, // Default to live mode
    isEditMode: false, // <<< NEW: Flag for roster editing mode
    coachesData: [],
    studentsData: [],
    termDates: [],
    scheduleData: {}, // Structure: { Monday: [slotObj, ...], Tuesday: [...], ... }
    todaysStatuses: [], // Array of { student_id, lesson_schedule_id, status, absence_reason, status_date }
    todaysLoggedSlotIds: [], // Array of schedule_ids that have been logged today
    pastMissedLogs: [], // Array to store past missed logs { schedule_id, missed_date, slot_time, student_ids }
    selectedLessonSlot: null, // { scheduleId, day, time, coachId, capacity, originalStudentIds, currentStudentIds }
    currentCoachId: null,
    initialDataLoaded: false,
    // isReady flag moved outside the object for direct export check

    // --- Methods to update state ---
    setCurrentUser(user) {
        this.currentUser = user;
        this.isAdmin = user?.app_metadata?.role === 'admin';
        console.log("AppState: User set. isAdmin check based on role:", this.isAdmin, "User metadata:", user?.app_metadata);
    },
    setInitialData(data) {
        if (!data) {
            console.warn("AppState Warning: setInitialData received null or undefined data. Resetting.");
            this.coachesData = [];
            this.studentsData = [];
            this.termDates = [];
            this.todaysStatuses = [];
            this.todaysLoggedSlotIds = [];
            this.pastMissedLogs = [];
            this.initialDataLoaded = false;
            return;
        }
        console.log("AppState: Setting initial data...");
        this.coachesData = data.coaches || [];
        this.studentsData = data.students || [];
        this.termDates = data.termDates || [];
        this.todaysStatuses = data.todaysStatuses || [];
        this.todaysLoggedSlotIds = data.todaysLoggedSlotIds || [];
        this.pastMissedLogs = [];
        this.initialDataLoaded = true;
        console.log("AppState: Initial data set. Coaches:", this.coachesData.length, "Students:", this.studentsData.length);
    },
    updateScheduleData(newScheduleData) {
        this.scheduleData = newScheduleData || {};
        console.log("AppState: Schedule data updated.");
    },
    updateTodaysStatuses(newStatuses) {
        this.todaysStatuses = newStatuses || [];
        console.log("AppState: Today's statuses updated. Count:", this.todaysStatuses.length);
    },
    updateTodaysLoggedSlotIds(newLoggedIds) {
        this.todaysLoggedSlotIds = Array.isArray(newLoggedIds) ? newLoggedIds : [];
        console.log("AppState: Today's logged slot IDs updated. Count:", this.todaysLoggedSlotIds.length);
    },
    updatePastMissedLogs(missedLogs) {
        this.pastMissedLogs = Array.isArray(missedLogs) ? missedLogs : [];
        console.log("AppState: Past missed logs updated. Count:", this.pastMissedLogs.length);
    },
    updateSelectedLessonSlot(slotDetails) {
        this.selectedLessonSlot = slotDetails;
        console.log("AppState: Selected lesson slot updated:", slotDetails ? slotDetails.scheduleId : 'null');
    },
    updateCurrentCoachId(coachId) {
        this.currentCoachId = coachId;
        this.selectedLessonSlot = null;
        this.scheduleData = {};
        this.todaysLoggedSlotIds = [];
        this.pastMissedLogs = [];
        this.isEditMode = false; // <<< Turn off edit mode when coach changes
        console.log("AppState: Current coach ID updated:", coachId);
        displayMissedLogWarning(0);
    },
    /**
     * Toggles the test mode state and triggers necessary data/subscription refreshes.
     * @param {Function} refreshDataForModeCallback - The function (from main.js) to call for refreshing data.
     */
    async toggleTestMode(refreshDataForModeCallback) {
        const newState = !this.isTestMode;
        console.log(`AppState: Toggling Test Mode from ${this.isTestMode} to ${newState}`);
        this.isTestMode = newState;
        this.isEditMode = false; // <<< Turn off edit mode when toggling test mode

        updateTestModeButton(this.isTestMode);
        await cleanupRealtimeSubscription();

        if (typeof refreshDataForModeCallback === 'function') {
            await refreshDataForModeCallback();
        } else {
            console.error("AppState Error: refreshDataForModeCallback not provided to toggleTestMode!");
        }

        await setupRealtimeSubscription();
        console.log("AppState: Test Mode toggle complete. New state:", this.isTestMode);
    },
    // <<< NEW: Method to toggle edit mode >>>
    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        console.log(`AppState: Toggled Edit Mode to ${this.isEditMode}`);
        // Note: UI refresh needs to be triggered separately after calling this
    }
};

// Export the isReady flag for dependency checks in other modules
export const isReady = true;

console.log("State: appState object defined and module ready.");
