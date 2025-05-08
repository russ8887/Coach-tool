// js/absence.js
// Handles marking students absent, undoing absence, and finding/displaying fill-in suggestions (ES Module).
// Includes checks against daily_blocks table. Passes target date to API.
// v9: Fixed ReferenceError preventing fill-in pop-up from showing.

// --- Import Dependencies ---
import { appState } from './state.js'; // Import from state.js
// Import API functions, including fetchDailyBlocksForDate and getTodaysDateUTC
import { addDailyStatus, removeDailyStatus, findSingleSlotSuggestions, getTodaysStatuses, fetchDailyBlocksForDate, getTodaysDateUTC } from './api.js';
// Import utils
import { getStudentDetails, isStudentAvailable, checkPairingRuleViolation, getGroupSizeText, parseAvailability, formatTime, parseTime } from './utils.js';
import { hideAllInlineForms, reRenderSlot } from './schedule.js';
import { refreshCurrentCoachSchedule } from './coachSelect.js';
import { displayError as uiDisplayError, clearError as uiClearError } from './ui.js';

// --- Absence Reasons ---
const ABSENCE_REASONS = [
    "Sick", "Appointment", "Holiday", "Forgot", "Cancelled",
    "Class Event (Expected)", "Class Event (Unexpected)", "Other"
];


// --- Helper Functions ---

/** Creates the dropdown for selecting an absence reason. */
function _createAbsenceReasonDropdown(studentId, scheduleId, targetElement) {
    const existingDropdown = targetElement.querySelector('.absence-reason-dropdown');
    if (existingDropdown) existingDropdown.remove();
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'absence-reason-dropdown absolute z-20 mt-1 right-0 w-48 bg-white dark:bg-gray-700 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 max-h-60 overflow-y-auto';
    const list = document.createElement('ul');
    list.className = 'py-1';
    ABSENCE_REASONS.forEach(reason => {
        const listItem = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'block w-full text-left px-3 py-1 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600';
        button.textContent = reason;
        button.dataset.reason = reason;
        button.dataset.studentId = studentId;
        button.dataset.scheduleId = scheduleId;
        button.addEventListener('click', handleReasonSelected);
        listItem.appendChild(button);
        list.appendChild(listItem);
    });
    dropdownContainer.appendChild(list);
    targetElement.appendChild(dropdownContainer);
    // Adjust positioning if needed based on available space
    const rect = targetElement.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 240) { // If not enough space below (approx height of dropdown)
        dropdownContainer.style.bottom = '100%'; // Position above
        dropdownContainer.style.top = 'auto';
    } else {
        dropdownContainer.style.top = '100%'; // Position below
        dropdownContainer.style.bottom = 'auto';
    }
    dropdownContainer.style.right = '0';

    // Add listener to close dropdown on outside click
    setTimeout(() => {
        document.addEventListener('click', closeReasonDropdownOnClickOutside, { capture: true, once: true });
    }, 0);
}

/** Closes the absence reason dropdown if a click occurs outside of it. */
function closeReasonDropdownOnClickOutside(event) {
    const dropdown = document.querySelector('.absence-reason-dropdown');
    // Check if the click target is the dropdown itself or the button that opened it
    if (dropdown && !dropdown.contains(event.target) && !event.target.closest('.remove-student-btn')) {
        dropdown.remove();
    }
}

/** Handles the selection of an absence reason from the dropdown. */
async function handleReasonSelected(event) {
    event.stopPropagation();
    const button = event.currentTarget;
    const reason = button.dataset.reason;
    const studentId = parseInt(button.dataset.studentId);
    const scheduleId = parseInt(button.dataset.scheduleId);
    const dropdown = button.closest('.absence-reason-dropdown');
    console.log(`Absence: Reason '${reason}' selected for Student ${studentId}, Slot ${scheduleId}`);

    // Close dropdown immediately
    if (dropdown) dropdown.remove();
    document.removeEventListener('click', closeReasonDropdownOnClickOutside, { capture: true });

    const slotElement = document.querySelector(`.schedule-item[data-schedule-id="${scheduleId}"]`);
    if (!slotElement) {
        console.error(`Absence Error: Could not find slot element for schedule ID ${scheduleId}`);
        uiDisplayError("Error marking student absent: Slot not found.", "general");
        return;
    }
    const coachId = parseInt(slotElement.dataset.coachId);
    if (isNaN(studentId) || isNaN(scheduleId) || isNaN(coachId)) {
         console.error("Absence Error: Invalid IDs provided.", { studentId, scheduleId, coachId });
         uiDisplayError("Error marking student absent: Invalid data.", "general");
         return;
    }

    try {
        uiClearError("general");
        const result = await addDailyStatus(studentId, coachId, scheduleId, 'marked_absent', reason);

        if (result && result.success) {
            console.log(`Absence: Successfully marked student ${studentId} absent for slot ${scheduleId}. Refreshing schedule...`);
            await refreshCurrentCoachSchedule(); // Refresh the entire schedule view

            setTimeout(() => {
                const updatedSlotElement = document.querySelector(`.schedule-item[data-schedule-id="${scheduleId}"]`);
                 if (updatedSlotElement) {
                     const capacity = parseInt(updatedSlotElement.dataset.capacity);
                     const currentStudents = JSON.parse(updatedSlotElement.dataset.currentStudents || '[]');
                     if (currentStudents.length < capacity) {
                         hideAllInlineForms();
                         findAndDisplayAbsenceReplacements(scheduleId, updatedSlotElement);
                     } else {
                          closeAbsenceSuggestionBox();
                     }
                 }
            }, 150);

        } else {
            throw new Error(result?.message || "API returned unsuccessful status.");
        }
    } catch (error) {
        console.error("Absence Error marking student absent:", error);
        uiDisplayError(`Failed to mark student absent: ${error.message}`, "general");
    }
}

/** Closes the fill-in suggestion box if a click occurs outside of it. */
function closeAbsenceSuggestionBoxOnClickOutside(event) {
    const suggestionBox = document.getElementById('absence-suggestion-box');
    if (!event.target || !suggestionBox) { return; }

    const clickedOutsideBox = !suggestionBox.contains(event.target);
    const clickedOnFindButton = event.target.closest('#find-students-button');
    const clickedOnApplyButton = event.target.closest('.apply-fill-in-btn');

    if (clickedOutsideBox && !clickedOnFindButton && !clickedOnApplyButton) {
        const clickedSlot = event.target.closest('.schedule-item');
        const boxScheduleId = suggestionBox.dataset.scheduleId;
        const clickedDifferentSlot = clickedSlot && clickedSlot.dataset.scheduleId !== boxScheduleId;
        if (!clickedSlot || clickedDifferentSlot) {
             closeAbsenceSuggestionBox();
        }
    }
}

/**
 * Checks if a student is affected by any relevant block on a specific date.
 */
function isStudentBlocked(studentDetails, blockDate, coachId, blocks) {
    if (!studentDetails || !blockDate || !Array.isArray(blocks)) {
        console.warn("isStudentBlocked: Invalid input provided.");
        return false;
    }
    for (const block of blocks) {
        if (block.block_date !== blockDate) continue;
        switch (block.block_type) {
            case 'Public Holiday': return true;
            case 'Year Level Absence':
                if (block.identifier && studentDetails.class_name && studentDetails.class_name.startsWith(block.identifier)) return true;
                break;
            case 'Class Absence':
                if (block.identifier && studentDetails.class_name && studentDetails.class_name === block.identifier) return true;
                break;
            case 'Coach Unavailable':
                if (block.identifier && parseInt(block.identifier) === coachId) return true;
                break;
        }
    }
    return false;
}


// --- Exported Functions ---

/** Handles the click event for the "Mark Absent" (cross) button on a student entry. */
export function handleMarkAbsent(event) {
    event.stopPropagation();
    const button = event.currentTarget;
    const studentId = parseInt(button.dataset.studentId);
    const scheduleId = parseInt(button.dataset.scheduleId);
    const studentEntryDiv = button.closest('.student-entry');
    if (isNaN(studentId) || isNaN(scheduleId) || !studentEntryDiv) {
        console.error("Absence Error (handleMarkAbsent): Invalid data attributes or parent element not found.");
        return;
    }
    console.log(`Absence: Mark Absent clicked for Student ${studentId}, Slot ${scheduleId}`);
    const existingDropdowns = document.querySelectorAll('.absence-reason-dropdown');
    existingDropdowns.forEach(d => d.remove());
    _createAbsenceReasonDropdown(studentId, scheduleId, studentEntryDiv);
}

/** Handles the click event for the "Undo Absence" (refresh) button. */
export async function handleUndoAbsent(event) {
    event.stopPropagation();
    const button = event.currentTarget;
    const studentId = parseInt(button.dataset.studentId);
    const scheduleId = parseInt(button.dataset.scheduleId);
    console.log(`Absence: Undo Absence clicked for Student ${studentId}, Slot ${scheduleId}`);
    if (isNaN(studentId) || isNaN(scheduleId)) {
         console.error("Absence Error (handleUndoAbsent): Invalid data attributes.");
         uiDisplayError("Error undoing absence: Invalid data.", "general");
         return;
    }
     try {
        uiClearError("general");
        const result = await removeDailyStatus(studentId, scheduleId);
        if (result && result.success) {
            console.log(`Absence: Successfully removed absence status for student ${studentId}, slot ${scheduleId}.`);
            await refreshCurrentCoachSchedule(); // Refresh view
            const suggestionBox = document.getElementById('absence-suggestion-box');
            if (suggestionBox && parseInt(suggestionBox.dataset.scheduleId) === scheduleId) {
                closeAbsenceSuggestionBox();
            }
        } else {
            throw new Error(result?.message || "API returned unsuccessful status.");
        }
    } catch (error) {
        console.error("Absence Error undoing absence mark:", error);
        uiDisplayError(`Failed to undo absence: ${error.message}`, "general");
    }
}


/**
 * Finds and displays potential fill-in students for a given slot.
 */
export async function findAndDisplayAbsenceReplacements(scheduleId, triggerElement) {
    const initialCurrentStudents = triggerElement.dataset.currentStudents;
    console.log(`Absence Suggest: START - Finding replacements for slot ${scheduleId}. Initial current students from trigger: ${initialCurrentStudents}`);

    if (!appState || !findSingleSlotSuggestions || !isStudentAvailable || !checkPairingRuleViolation || !getStudentDetails || !parseAvailability || !formatTime || !parseTime || !fetchDailyBlocksForDate || !getTodaysDateUTC) {
        console.error("Absence Suggest Error: Dependencies missing.");
        displayAbsenceReplacementsUI(scheduleId, triggerElement, [], true, "Application error.");
        return;
    }
    if (isNaN(scheduleId) || !triggerElement || !triggerElement.dataset) {
         console.error("Absence Suggest Error: Invalid scheduleId or triggerElement.");
         displayAbsenceReplacementsUI(scheduleId, triggerElement, [], true, "Invalid slot data.");
         return;
    }

    const slotDay = triggerElement.dataset.day;
    const targetTime = triggerElement.dataset.time;
    const capacity = parseInt(triggerElement.dataset.capacity);
    const currentStudentIds = JSON.parse(triggerElement.dataset.currentStudents || '[]');
    const coachId = parseInt(triggerElement.dataset.coachId);

    if (!slotDay || !targetTime || isNaN(capacity) || isNaN(coachId)) {
        console.error(`Absence Suggest Error: Missing critical data attributes on trigger element for slot ${scheduleId}.`);
        displayAbsenceReplacementsUI(scheduleId, triggerElement, [], true, "Slot data incomplete.");
        return;
    }

    const targetDate = getTodaysDateUTC();
    console.log(`Absence Suggest: Target date for status checks: ${targetDate}`);
    const currentOccupantDetails = currentStudentIds.map(id => getStudentDetails(id, appState.studentsData)).filter(Boolean);

    displayAbsenceReplacementsUI(scheduleId, triggerElement, [], true, null); // Show loading

    try {
        const blocksForDate = await fetchDailyBlocksForDate(targetDate);
        const safeBlocksForDate = blocksForDate || [];
        const backendCandidates = await findSingleSlotSuggestions(scheduleId, currentStudentIds, slotDay, targetDate);

        if (backendCandidates === null) throw new Error("API call failed to fetch suggestions.");
        console.log(`Absence Suggest: Received ${backendCandidates.length} candidates from backend for slot ${scheduleId}.`);

        const availableCandidates = [];
        const availabilityCache = {};
        let skippedInactive = 0, skippedAvailability = 0, skippedPairing = 0, skippedDetails = 0, skippedBlocked = 0;

        if (!appState.studentsData) throw new Error("Student data unavailable for filtering.");
        const targetTimeFormatted = formatTime(parseTime(targetTime));
        if (!targetTimeFormatted) throw new Error(`Invalid target time format "${targetTime}".`);

        for (const candidate of backendCandidates) {
            const studentDetails = getStudentDetails(candidate.id, appState.studentsData);
            if (!studentDetails || !studentDetails.Name) { skippedDetails++; continue; }
            if (studentDetails.is_active === false) { skippedInactive++; continue; }
            if (!isStudentAvailable(studentDetails, slotDay, targetTime, availabilityCache)) { skippedAvailability++; continue; }
            const pairingCheck = checkPairingRuleViolation(studentDetails, currentOccupantDetails, capacity);
            if (pairingCheck.violation) { skippedPairing++; continue; }
            if (isStudentBlocked(studentDetails, targetDate, coachId, safeBlocksForDate)) { skippedBlocked++; continue; }
            availableCandidates.push({
                 id: candidate.id, Name: studentDetails.Name, lessons_owed: candidate.lessons_owed,
                 groupOf: studentDetails.groupOf, subGroup: studentDetails.sub_group,
                 class_name: studentDetails.class_name // Ensure class_name is passed through
             });
        }
        console.log(`Absence Suggest: Filtering complete. Final Candidates: ${availableCandidates.length}. Skipped: ${skippedInactive} (Inactive), ${skippedAvailability} (Avail), ${skippedPairing} (Pair), ${skippedDetails} (Detail), ${skippedBlocked} (Block).`);
        displayAbsenceReplacementsUI(scheduleId, triggerElement, availableCandidates, false, null);
    } catch (error) {
        console.error("Absence Suggest Error fetching or processing suggestions:", error);
        displayAbsenceReplacementsUI(scheduleId, triggerElement, [], false, `Error finding suggestions: ${error.message}`);
    }
}


/** Renders the suggestion box UI. */
function displayAbsenceReplacementsUI(scheduleId, triggerElement, candidates = [], isLoading = false, errorMessage = null) {
    closeAbsenceSuggestionBox();
    const suggestionBox = document.createElement('div');
    suggestionBox.id = 'absence-suggestion-box';
    suggestionBox.dataset.scheduleId = scheduleId;
    suggestionBox.className = 'absolute z-30 w-64 max-h-96 overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 p-3 text-sm';

    suggestionBox.style.pointerEvents = 'none';
    suggestionBox.style.opacity = '0';
    suggestionBox.style.transition = 'opacity 0.2s ease-in-out';

    let contentHTML = `<h4 class="font-semibold text-gray-800 dark:text-gray-100 mb-2 border-b dark:border-gray-600 pb-1">Fill-in Suggestions</h4>`;
    if (isLoading) {
        contentHTML += '<p class="text-gray-500 dark:text-gray-400 italic">Finding available students...</p>';
    } else if (errorMessage) {
        contentHTML += `<p class="text-red-500 dark:text-red-400">${errorMessage}</p>`;
    } else if (candidates.length === 0) {
        contentHTML += '<p class="text-gray-500 dark:text-gray-400 italic">No suitable active fill-in students found.</p>';
    } else {
        contentHTML += '<ul class="space-y-1">';
        candidates.forEach(student => {
            const studentName = student.Name || 'Unknown';
            const studentClassName = student.class_name || 'N/A';
            const groupOf = student.groupOf;
            const lessonsOwed = student.lessons_owed || 0;
            const subGroup = student.subGroup;
            const groupText = getGroupSizeText(groupOf);

            contentHTML += `
                <li class="group py-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                    <div class="flex justify-between items-center mb-0.5">
                        <span class="font-semibold text-gray-800 dark:text-gray-100">${studentName}</span>
                        <button type="button" data-student-id="${student.id}"
                                class="apply-fill-in-btn text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-0.5 px-1.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150 ease-in-out">
                            Apply
                        </button>
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                        ${student.class_name ? `<div><span class="font-medium text-gray-600 dark:text-gray-300">Class:</span> ${studentClassName}</div>` : ''}
                        <div>
                            <span class="font-medium text-gray-600 dark:text-gray-300">Details:</span> 
                            ${lessonsOwed > 0 ? `${lessonsOwed} owed` : '0 owed'}
                            <span class="mx-1 text-gray-300 dark:text-gray-600">|</span>
                            ${groupText}${subGroup ? ` [${subGroup}]` : ''}
                        </div>
                    </div>
                </li>`;
        });
        contentHTML += '</ul>';
    }
    suggestionBox.innerHTML = contentHTML;

    const rect = triggerElement.getBoundingClientRect();
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    let top = rect.bottom + scrollTop + 5;
    let left = rect.left + scrollLeft;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const boxWidth = 256;
    const headerHeight = 40;
    // Removed the problematic itemHeight line
    const contentHeightEstimate = isLoading || errorMessage || candidates.length === 0 ? 30 : (candidates.reduce((acc, curr) => acc + (curr.class_name ? 45 : 30), 0));
    const boxHeightEstimate = Math.min(384, headerHeight + contentHeightEstimate + 24);
    if (left + boxWidth > viewportWidth + scrollLeft - 10) { left = rect.right + scrollLeft - boxWidth; if (left < scrollLeft + 10) left = scrollLeft + 10; }
    if (top + boxHeightEstimate > viewportHeight + scrollTop - 10) { top = rect.top + scrollTop - boxHeightEstimate - 5; if (top < scrollTop + 10) top = scrollTop + 10; }

    suggestionBox.style.position = 'absolute';
    suggestionBox.style.top = `${Math.max(0, top)}px`;
    suggestionBox.style.left = `${Math.max(0, left)}px`;

    document.body.appendChild(suggestionBox);

    setTimeout(() => {
        suggestionBox.style.pointerEvents = 'auto';
        suggestionBox.style.opacity = '1';
        suggestionBox.removeEventListener('click', handleApplyFillInClick);
        suggestionBox.addEventListener('click', handleApplyFillInClick);
        document.removeEventListener('click', closeAbsenceSuggestionBoxOnClickOutside, { capture: true });
        document.addEventListener('click', closeAbsenceSuggestionBoxOnClickOutside, { capture: true, once: true });
    }, 0);
}


/** Handles the click event on an "Apply" button within the suggestion box. */
async function handleApplyFillInClick(event) {
    if (!event.target.classList.contains('apply-fill-in-btn')) return;
    event.stopPropagation();
    const button = event.target;
    const studentId = parseInt(button.dataset.studentId);
    const suggestionBox = button.closest('#absence-suggestion-box');
    const scheduleId = parseInt(suggestionBox?.dataset.scheduleId);
    if (isNaN(studentId) || isNaN(scheduleId)) {
        console.error("Absence Apply Error: Invalid student or schedule ID.");
        uiDisplayError("Error applying fill-in: Invalid data.", "general");
        return;
    }
    const slotElement = document.querySelector(`.schedule-item[data-schedule-id="${scheduleId}"]`);
    if (!slotElement) {
        console.error(`Absence Apply Error: Could not find slot element ${scheduleId}.`);
        uiDisplayError("Error applying fill-in: Slot not found.", "general");
        closeAbsenceSuggestionBox();
        return;
    }
    const coachId = parseInt(slotElement.dataset.coachId);
    if (isNaN(coachId)) {
        console.error(`Absence Apply Error: Invalid coach ID found on slot element ${scheduleId}.`);
        uiDisplayError("Error applying fill-in: Invalid coach data.", "general");
        closeAbsenceSuggestionBox();
        return;
    }
    console.log(`Absence Apply: Applying student ${studentId} to slot ${scheduleId}`);
    button.disabled = true;
    button.textContent = 'Applying...';
    uiClearError("general");
    try {
        const result = await addDailyStatus(studentId, coachId, scheduleId, 'assigned_fill_in');
        if (result && result.success) {
            console.log(`Absence Apply: Successfully applied fill-in.`);
            const latestStatuses = await getTodaysStatuses();
            if (latestStatuses) { appState.updateTodaysStatuses(latestStatuses); }
            else { console.warn("Absence Apply Warning: Failed to fetch latest statuses after applying fill-in."); }

            reRenderSlot(scheduleId);

            const updatedSlotElement = document.querySelector(`.schedule-item[data-schedule-id="${scheduleId}"]`);

            if (updatedSlotElement) {
                const newCapacity = parseInt(updatedSlotElement.dataset.capacity);
                const newCurrentStudents = JSON.parse(updatedSlotElement.dataset.currentStudents || '[]');

                const isNowFull = newCurrentStudents.length >= newCapacity;

                if (isNowFull) {
                    console.log(`Absence Apply: Slot ${scheduleId} is now full. Closing suggestion box.`);
                    closeAbsenceSuggestionBox();
                } else {
                    console.log(`Absence Apply: Slot ${scheduleId} still has capacity. Refreshing suggestions.`);
                    findAndDisplayAbsenceReplacements(scheduleId, updatedSlotElement);
                }
            } else {
                 console.error(`Absence Apply Error: Could not find updated slot element ${scheduleId} after re-render.`);
                 closeAbsenceSuggestionBox();
            }
            const inlineForm = document.getElementById(`inline-log-form-${scheduleId}`);
            if (inlineForm) { inlineForm.classList.add('hidden'); inlineForm.innerHTML = ''; }
        } else {
            throw new Error(result?.message || "API call failed.");
        }
    } catch (error) {
        console.error("Absence Apply Error:", error);
        uiDisplayError(`Failed to apply fill-in: ${error.message}`, "general");
        button.disabled = false;
        button.textContent = 'Apply';
    }
}

/** Removes the absence suggestion box from the DOM. (Exported) */
export function closeAbsenceSuggestionBox() {
    const suggestionBox = document.getElementById('absence-suggestion-box');
    if (suggestionBox) {
        suggestionBox.removeEventListener('click', handleApplyFillInClick);
        document.removeEventListener('click', closeAbsenceSuggestionBoxOnClickOutside, { capture: true });
        suggestionBox.remove();
    }
}

// --- Add a ready flag ---
export const isReady = true;

console.log("Absence module (absence.js) loaded.");
