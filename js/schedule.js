// js/schedule.js
// Handles rendering the coach's schedule, slot selection, and related UI interactions (ES Module).
// v20: Improved deselection logic in handleSlotSelection to allow interaction with open inline forms.

// --- Import Dependencies ---
import { appState } from './state.js'; // Import from state.js
import { getStudentDetails, getGroupSizeText, checkPairingRuleViolation, isStudentAvailable } from './utils.js';
import { handleMarkAbsent, handleUndoAbsent, closeAbsenceSuggestionBox, findAndDisplayAbsenceReplacements } from './absence.js';
import { populateInlineLogForm } from './logging.js';
import { addDailyStatus, getTodaysLoggedSlotIds, removeStudentFromSchedule, addStudentToSchedule } from './api.js';
import { refreshCurrentCoachSchedule } from './coachSelect.js';
import { displayError as uiDisplayError, clearError as uiClearError } from './ui.js';


// --- Coach Color Themes (Keep existing) ---
const coachColorThemes = {
    1: { bg: 'bg-red-50 dark:bg-red-900/30', border: 'border-red-500 dark:border-red-600', text: 'text-red-800 dark:text-red-200', headerBg: 'bg-red-200 dark:bg-red-800/60' },
    2: { bg: 'bg-green-50 dark:bg-green-900/30', border: 'border-green-400 dark:border-green-600', text: 'text-green-800 dark:text-green-200', headerBg: 'bg-green-100 dark:bg-green-800/50' },
    3: { bg: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-orange-400 dark:border-orange-600', text: 'text-orange-800 dark:text-orange-200', headerBg: 'bg-orange-100 dark:bg-orange-800/50' },
    4: { bg: 'bg-blue-50 dark:bg-blue-900/30', border: 'border-blue-400 dark:border-blue-600', text: 'text-blue-800 dark:text-blue-200', headerBg: 'bg-blue-100 dark:bg-blue-800/50' },
    5: { bg: 'bg-yellow-50 dark:bg-yellow-900/30', border: 'border-yellow-400 dark:border-yellow-600', text: 'text-yellow-800 dark:text-yellow-200', headerBg: 'bg-yellow-100 dark:bg-yellow-800/50' },
    6: { bg: 'bg-purple-50 dark:bg-purple-900/30', border: 'border-purple-400 dark:border-purple-600', text: 'text-purple-800 dark:text-purple-200', headerBg: 'bg-purple-100 dark:bg-purple-800/50' },
    7: { bg: 'bg-teal-50 dark:bg-teal-900/30', border: 'border-teal-400 dark:border-teal-600', text: 'text-teal-800 dark:text-teal-200', headerBg: 'bg-teal-100 dark:bg-teal-800/50' },
    8: { bg: 'bg-cyan-50 dark:bg-cyan-900/30', border: 'border-cyan-400 dark:border-cyan-600', text: 'text-cyan-800 dark:text-cyan-200', headerBg: 'bg-cyan-100 dark:bg-cyan-800/50' },
    9: { bg: 'bg-lime-50 dark:bg-lime-900/30', border: 'border-lime-500 dark:border-lime-600', text: 'text-lime-800 dark:text-lime-200', headerBg: 'bg-lime-200 dark:bg-lime-800/60' },
    10: { bg: 'bg-pink-50 dark:bg-pink-900/30', border: 'border-pink-400 dark:border-pink-600', text: 'text-pink-800 dark:text-pink-200', headerBg: 'bg-pink-100 dark:bg-pink-800/50' },
    11: { bg: 'bg-sky-50 dark:bg-sky-900/30', border: 'border-sky-400 dark:border-sky-600', text: 'text-sky-800 dark:text-sky-200', headerBg: 'bg-sky-100 dark:bg-sky-800/50' },
    12: { bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-400 dark:border-amber-600', text: 'text-amber-800 dark:text-amber-200', headerBg: 'bg-amber-100 dark:bg-amber-800/50' },
    13: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-400 dark:border-emerald-600', text: 'text-emerald-800 dark:text-emerald-200', headerBg: 'bg-emerald-100 dark:bg-emerald-800/50' },
    14: { bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/30', border: 'border-fuchsia-400 dark:border-fuchsia-600', text: 'text-fuchsia-800 dark:text-fuchsia-200', headerBg: 'bg-fuchsia-100 dark:bg-fuchsia-800/50' },
    15: { bg: 'bg-rose-50 dark:bg-rose-900/30', border: 'border-rose-400 dark:border-rose-600', text: 'text-rose-800 dark:text-rose-200', headerBg: 'bg-rose-100 dark:bg-rose-800/50' },
    16: { bg: 'bg-indigo-50 dark:bg-indigo-900/30', border: 'border-indigo-400 dark:border-indigo-600', text: 'text-indigo-800 dark:text-indigo-200', headerBg: 'bg-indigo-100 dark:bg-indigo-800/50' },
    17: { bg: 'bg-slate-50 dark:bg-slate-800/50', border: 'border-slate-400 dark:border-slate-500', text: 'text-slate-800 dark:text-slate-200', headerBg: 'bg-slate-200 dark:bg-slate-700/60' },
    18: { bg: 'bg-zinc-50 dark:bg-zinc-800/50', border: 'border-zinc-400 dark:border-zinc-500', text: 'text-zinc-800 dark:text-zinc-200', headerBg: 'bg-zinc-200 dark:bg-zinc-700/60' },
    19: { bg: 'bg-stone-50 dark:bg-stone-800/50', border: 'border-stone-400 dark:border-stone-500', text: 'text-stone-800 dark:text-stone-200', headerBg: 'bg-stone-200 dark:bg-stone-700/60' },
    20: { bg: 'bg-gray-50 dark:bg-gray-700/40', border: 'border-gray-400 dark:border-gray-500', text: 'text-gray-800 dark:text-gray-200', headerBg: 'bg-gray-200 dark:bg-gray-700/60' },
};
const defaultTheme = { bg: 'bg-gray-50 dark:bg-gray-700/30', border: 'border-gray-400 dark:border-gray-500', text: 'text-gray-800 dark:text-gray-200', headerBg: 'bg-gray-100 dark:bg-gray-700/50' };

// --- Helper Function: Get Day of Year ---
function getDayOfYear(date = new Date()) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}

// --- State for Daily View ---
let currentScheduleView = 'Week'; // Default to week view

// --- Helper: Create Day Column Element ---
function createDayColumnElement(day, theme) {
    const dayCol = document.createElement('div');
    dayCol.id = `day-col-${day}`;
    dayCol.className = `day-column border-t-4 ${theme.border} rounded-lg shadow-inner`;
    dayCol.dataset.day = day;

    const header = document.createElement('h3');
    header.textContent = day;
    header.className = `font-bold text-center p-2 rounded-t-md ${theme.headerBg} ${theme.text}`;
    dayCol.appendChild(header);

    const slotsContainer = document.createElement('div');
    slotsContainer.className = 'p-2 space-y-2'; // Add padding and spacing for slots
    dayCol.appendChild(slotsContainer);

    return dayCol;
}

/**
 * Creates the main DOM element for a single lesson slot.
 * Includes Edit Mode controls.
 */
function createSlotElement(slot, todaysStatuses, todaysLoggedIds) {
     if (!slot || typeof slot.schedule_id === 'undefined' || !slot.day || !slot.time) {
         console.error("Schedule createSlotElement Error: Invalid slot data provided.", slot);
         return null;
     }
    const scheduleId = slot.schedule_id;
    const isEditMode = appState.isEditMode;
    const isLogged = !isEditMode && todaysLoggedIds.includes(scheduleId);
    const originalStudentIds = slot.original_student_ids || [];

    // Determine current students based on mode and status
    let currentStudentIds = originalStudentIds; // Default to original roster
    let absentStudentIds = new Set();
    let fillInStudentIds = [];

    if (!isEditMode) { // If NOT in edit mode, calculate current students based on daily statuses
        const slotStatuses = todaysStatuses.filter(s => s.lesson_schedule_id === scheduleId);
        absentStudentIds = new Set(slotStatuses.filter(s => s.status === 'marked_absent').map(s => s.student_id));
        fillInStudentIds = slotStatuses.filter(s => s.status === 'assigned_fill_in').map(s => s.student_id);
        const presentOriginalIds = originalStudentIds.filter(id => !absentStudentIds.has(id));
        currentStudentIds = [...new Set([...presentOriginalIds, ...fillInStudentIds])];
    }

    // Determine effective capacity based on original students' group size
    let effectiveCapacity = 1;
    const dbCapacity = parseInt(slot.capacity, 10);
    const validDbCapacity = !isNaN(dbCapacity) && dbCapacity > 0 ? dbCapacity : 3; // Default to 3 if invalid
    if (originalStudentIds.length > 0 && appState?.studentsData) {
        const originalStudentDetails = originalStudentIds.map(id => getStudentDetails(id, appState.studentsData));
        const hasSolo = originalStudentDetails.some(d => d && d.groupOf === 1);
        const hasPaired = originalStudentDetails.some(d => d && d.groupOf === 2);

        if (hasSolo) effectiveCapacity = 1;
        else if (hasPaired) effectiveCapacity = 2;
        else effectiveCapacity = validDbCapacity;
    } else {
        effectiveCapacity = validDbCapacity; // Use DB capacity if slot is empty or no student data
    }

    // Ensure capacity is at least the number of students currently shown (prevents negative capacity display)
    const currentOccupants = currentStudentIds.length; // Use the accurately determined currentStudentIds
    effectiveCapacity = Math.max(effectiveCapacity, currentOccupants);

    // Check if there's capacity to add more students
    const hasCapacityToAdd = currentStudentIds.length < effectiveCapacity;

    // --- Create Slot Element ---
    const slotElement = document.createElement('div');
    slotElement.dataset.scheduleId = scheduleId;
    slotElement.dataset.day = slot.day;
    slotElement.dataset.time = slot.time;
    slotElement.dataset.coachId = slot.coach_id;
    slotElement.dataset.capacity = effectiveCapacity;
    slotElement.dataset.capacityFromDb = slot.capacity; // Store original DB capacity
    slotElement.dataset.originalStudents = JSON.stringify(originalStudentIds);
    slotElement.dataset.currentStudents = JSON.stringify(currentStudentIds); // Store current students based on status

    // --- Apply Base Styling ---
    let slotClasses = `schedule-item border dark:border-gray-600 rounded-lg p-3 shadow transition duration-200 ease-in-out mb-3 relative`;

    // --- Apply Mode-Specific Styling ---
    if (isEditMode) {
        slotClasses += ' bg-amber-50 dark:bg-amber-900/30 border-amber-400 dark:border-amber-600';
        slotElement.title = `Editing Roster - Click student to remove, or 'Add Student'. Capacity: ${effectiveCapacity}`;
    } else if (isLogged) {
        slotClasses += ' bg-gray-100 dark:bg-gray-700/80 opacity-60 dark:opacity-50 cursor-not-allowed';
        slotElement.title = `Slot logged.`;
    } else {
        // Default interactive style
        slotClasses += ' bg-white dark:bg-gray-800 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500 cursor-pointer';
        // Highlight if needs fill-in (not logged, has capacity) or has original students but none present
        const originallyHadStudents = originalStudentIds.length > 0;
        const allOriginalsAbsent = originallyHadStudents && currentStudentIds.length === 0 && fillInStudentIds.length === 0;

        if (hasCapacityToAdd || allOriginalsAbsent) {
            slotClasses += ' border-l-4 border-l-yellow-400 dark:border-l-yellow-500'; // Highlight border (changed from red to yellow for missed/needs attention)
            if (allOriginalsAbsent) {
                slotElement.title = `All students absent. Click to log.`;
            } else {
                slotElement.title = `Click to ${currentOccupants > 0 ? 'log details & find fill-ins' : 'find fill-ins/add student'}. ${effectiveCapacity - currentOccupants} space(s) available.`;
            }
            slotElement.dataset.isMissed = "true"; // Mark for missed log warning calculation
        } else {
            slotClasses += ' border-gray-200 dark:border-gray-600'; // Standard border
            slotElement.title = currentOccupants > 0 ? `Click to log lesson details. Slot full.` : `Empty slot. Click to find fill-ins/add student.`;
        }
    }
    slotElement.className = slotClasses;

    // --- Add Time ---
    const timeElement = document.createElement('p');
    timeElement.className = 'font-bold text-gray-800 dark:text-gray-100 mb-2 text-sm';
    timeElement.textContent = slot.time; // Use the formatted time string
    slotElement.appendChild(timeElement);

    // --- Add Student List ---
    const studentsList = document.createElement('div');
    studentsList.className = 'space-y-1.5';
    const studentsToDisplay = isEditMode ? originalStudentIds : currentStudentIds;
    studentsToDisplay.forEach(studentId => {
        const studentDetails = getStudentDetails(studentId, appState.studentsData); // Get details to check is_active
        if (isEditMode || studentDetails?.is_active === true) {
            const isFillIn = !isEditMode && fillInStudentIds.includes(studentId);
            const studentEntry = createStudentEntryElement(studentId, slot, isFillIn, absentStudentIds, isLogged, isEditMode);
            if (studentEntry) studentsList.appendChild(studentEntry);
        } else if (!isEditMode && studentDetails?.is_active === false) {
             // console.log(`Skipping inactive student ${studentDetails.Name} (ID: ${studentId}) in slot ${scheduleId} (Normal View)`);
        }
    });
    // Add absent students (only in non-edit mode, and only if they are active)
    if (!isEditMode) {
        originalStudentIds.forEach(studentId => {
            const studentDetails = getStudentDetails(studentId, appState.studentsData);
            if (absentStudentIds.has(studentId) && !currentStudentIds.includes(studentId) && studentDetails?.is_active === true) {
                const studentEntry = createStudentEntryElement(studentId, slot, false, absentStudentIds, isLogged, false);
                if (studentEntry) studentsList.appendChild(studentEntry);
            }
        });
    }
    slotElement.appendChild(studentsList);

    // --- Add Inline Form Container (hidden initially) ---
    const inlineFormContainer = document.createElement('div');
    inlineFormContainer.className = 'inline-log-form-container hidden mt-2';
    inlineFormContainer.id = `inline-log-form-${scheduleId}`;
    slotElement.appendChild(inlineFormContainer);

    // --- Add Roster Edit Controls (if in edit mode) ---
    if (isEditMode) {
        const addStudentButton = document.createElement('button');
        addStudentButton.type = 'button';
        addStudentButton.textContent = '+ Add Student';
        addStudentButton.className = 'add-student-to-slot-btn text-xs bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-2 rounded mt-2 w-full disabled:opacity-50 disabled:cursor-not-allowed';
        addStudentButton.disabled = !hasCapacityToAdd; // Disable if slot is full based on original capacity
        addStudentButton.dataset.scheduleId = scheduleId;
        addStudentButton.addEventListener('click', handleShowAddStudentUI); // Attach listener
        slotElement.appendChild(addStudentButton);
    }

    // --- Attach Slot Selection Listener (if not logged and not edit mode) ---
    if (!isEditMode && !isLogged) {
        slotElement.removeEventListener('click', handleSlotSelection); // Prevent duplicates
        slotElement.addEventListener('click', handleSlotSelection);
    } else {
        slotElement.removeEventListener('click', handleSlotSelection); // Ensure no listener if logged or editing
    }

    return slotElement;
}


/**
 * Creates the div element representing a single student within a slot.
 * Includes buttons for marking absent/undoing absence, or removing from roster.
 * Applies styling for inactive students.
 */
function createStudentEntryElement(studentId, slot, isFillIn, absentStudentIds, isLogged, isEditMode) {
    if (!appState?.studentsData) return null; // Need student data
    const studentDetails = getStudentDetails(studentId, appState.studentsData);
    if (!studentDetails || !studentDetails.Name) {
        console.warn(`Schedule Warning: Could not get details for student ID ${studentId}`);
        return null;
    }

    const studentIsActive = studentDetails.is_active === true; // Check active status

    const studentEntryDiv = document.createElement('div');
    studentEntryDiv.className = 'student-entry flex justify-between items-center group relative'; // Added relative for dropdown positioning
    studentEntryDiv.dataset.studentId = studentId;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'text-xs';

    // Add class name and group type
    const classNameText = studentDetails.class_name ? `(${studentDetails.class_name}` : '('; // Start parenthesis
    const groupText = getGroupSizeText(studentDetails.groupOf); // Solo, Paired, Group
    const detailsSeparator = studentDetails.class_name && groupText !== 'N/A' ? ' - ' : ''; // Add separator only if both exist
    const closingParenthesis = studentDetails.class_name || groupText !== 'N/A' ? ')' : ''; // Close parenthesis if either exists
    const studentInfoText = `${classNameText}${detailsSeparator}${groupText !== 'N/A' ? groupText : ''}${closingParenthesis}`; // Combine class and group

    nameSpan.textContent = `${studentDetails.Name} ${studentInfoText}`; // Append combined info

    // Apply base text color (will be overridden by inactive/absent styling if needed)
    nameSpan.classList.add('text-gray-700', 'dark:text-gray-200');

    // Status Badges and Styling
    const statusBadges = []; // Array to hold badge elements/text

    if (isFillIn) {
        statusBadges.push(`<span class="text-[10px] px-1.5 py-0.5 rounded-full ml-1.5 font-medium align-middle text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50">Fill-in</span>`);
    }
    if (absentStudentIds.has(studentId)) {
        statusBadges.push(`<span class="text-[10px] px-1.5 py-0.5 rounded-full ml-1.5 font-medium align-middle text-red-600 dark:text-red-400">Absent</span>`);
        nameSpan.classList.add('line-through', '!text-gray-400', '!dark:text-gray-500'); // Force absent styling over active/inactive
        nameSpan.classList.remove('text-gray-700', 'dark:text-gray-200');
    }
    // Apply inactive styling *if not already styled as absent*
    if (!studentIsActive && !absentStudentIds.has(studentId)) {
        statusBadges.push(`<span class="text-[10px] px-1.5 py-0.5 rounded-full ml-1.5 font-medium align-middle text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700">(Inactive)</span>`);
        nameSpan.classList.add('!text-gray-400', '!dark:text-gray-500', 'italic'); // Force inactive styling
        nameSpan.classList.remove('text-gray-700', 'dark:text-gray-200');
    }

    // Append badges if any exist
    if (statusBadges.length > 0) {
        nameSpan.innerHTML += ' ' + statusBadges.join(' '); // Use innerHTML to parse spans
    }

    studentEntryDiv.appendChild(nameSpan);

    // --- Action Buttons ---
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'flex items-center space-x-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 ease-in-out';

    if (isEditMode) {
        // Show Remove (Trash) Button (always show in edit mode, even if inactive)
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'remove-student-from-slot-btn text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-red-500';
        removeButton.title = `Remove ${studentDetails.Name} from roster`;
        removeButton.dataset.studentId = studentId;
        removeButton.dataset.scheduleId = slot.schedule_id;
        removeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>`;
        removeButton.addEventListener('click', handleRemoveStudentFromSlot);
        buttonContainer.appendChild(removeButton);
    } else if (!isLogged && studentIsActive) { // Only show absent/undo if not logged AND student is active
        // Show Mark Absent / Undo Buttons
        if (absentStudentIds.has(studentId)) {
            // Show Undo Button
            const undoButton = document.createElement('button');
            undoButton.type = 'button';
            undoButton.className = 'undo-absent-btn text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500';
            undoButton.title = `Undo absence for ${studentDetails.Name}`;
            undoButton.dataset.studentId = studentId;
            undoButton.dataset.scheduleId = slot.schedule_id;
            undoButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v4a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" /></svg>`; // Refresh icon
            undoButton.addEventListener('click', handleUndoAbsent);
            buttonContainer.appendChild(undoButton);
        } else {
            // Show Mark Absent Button
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'remove-student-btn text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-red-500';
            removeButton.title = `Mark ${studentDetails.Name} absent`;
            removeButton.dataset.studentId = studentId;
            removeButton.dataset.scheduleId = slot.schedule_id;
            removeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>`; // Cross icon
            removeButton.addEventListener('click', handleMarkAbsent);
            buttonContainer.appendChild(removeButton);
        }
    }
    // --- End Action Buttons ---

    if (buttonContainer.children.length > 0) {
        studentEntryDiv.appendChild(buttonContainer);
    }

    return studentEntryDiv;
}


// --- Helper: Apply Day View Filter ---
function _applyDayViewFilter(activeView) {
    const scheduleContainer = document.getElementById('coach-schedule');
    if (!scheduleContainer) return;

    scheduleContainer.querySelectorAll('.day-column').forEach(col => {
        if (activeView === 'Week') {
            col.classList.remove('hidden');
        } else {
            col.classList.toggle('hidden', col.dataset.day !== activeView);
        }
    });

    // Adjust grid columns based on view
    if (activeView === 'Week') {
        scheduleContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4';
    } else {
        scheduleContainer.className = 'grid grid-cols-1 gap-4'; // Single column for day view
    }
}

// --- Helper: Handle Day Toggle Button Click ---
function handleDayViewToggleClick(event) {
    const button = event.target.closest('.day-toggle-button');
    if (!button) return;

    const newView = button.dataset.view;
    if (newView === currentScheduleView) return; // No change

    currentScheduleView = newView;

    // Update button styles
    document.querySelectorAll('.day-toggle-button').forEach(btn => {
        const isActive = btn.dataset.view === currentScheduleView;
        btn.classList.toggle('bg-indigo-100', isActive);
        btn.classList.toggle('text-indigo-700', isActive);
        btn.classList.toggle('dark:bg-indigo-900', isActive);
        btn.classList.toggle('dark:text-indigo-200', isActive);
        btn.classList.toggle('text-gray-500', !isActive);
        btn.classList.toggle('hover:bg-gray-200', !isActive);
        btn.classList.toggle('dark:text-gray-400', !isActive);
        btn.classList.toggle('dark:hover:bg-gray-700', !isActive);
        btn.classList.toggle('active', isActive); // Keep active class for potential CSS targeting
    });

    _applyDayViewFilter(currentScheduleView);
}

// --- Main Schedule Display Function ---
export function displayCoachSchedule(coachId, scheduleDataParam, studentsData, todaysStatusesParam, todaysLoggedIdsParam) {
    const coachScheduleDiv = document.getElementById('coach-schedule');
    if (!coachScheduleDiv) {
        console.error("Schedule Error: coach-schedule div not found.");
        return;
    }

    coachScheduleDiv.innerHTML = ''; // Clear previous schedule
    // Apply edit mode class to the container if needed
    coachScheduleDiv.classList.toggle('edit-mode', appState.isEditMode);


    const scheduleData = scheduleDataParam || {};
    const todaysStatuses = todaysStatusesParam || [];
    const todaysLoggedIds = todaysLoggedIdsParam || [];

    // Use appState imported from state.js
    const theme = coachColorThemes[coachId] || defaultTheme;
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    let totalMissedToday = 0;

    daysOfWeek.forEach(day => {
        const dayCol = createDayColumnElement(day, theme);
        const slotsContainer = dayCol.querySelector('.p-2'); // Get the inner container
        const slotsForDay = scheduleData[day] || [];

        if (slotsForDay.length === 0) {
            slotsContainer.innerHTML = '<p class="text-xs text-gray-400 dark:text-gray-500 italic text-center py-2">No lessons</p>';
        } else {
            slotsForDay.forEach(slot => {
                const slotElement = createSlotElement(slot, todaysStatuses, todaysLoggedIds);
                if (slotElement) {
                    slotsContainer.appendChild(slotElement);
                    // Check if this slot should be counted as missed for today's warning
                    if (slotElement.dataset.isMissed === "true") {
                        totalMissedToday++;
                    }
                }
            });
        }
        coachScheduleDiv.appendChild(dayCol);
    });

    // Display missed log warning (function now imported from ui.js)
    // displayMissedLogWarning(totalMissedToday); // This is now handled in coachSelect.js after schedule render

    setupDayViewToggleListeners(); // Re-attach listeners for day toggles
    _applyDayViewFilter(currentScheduleView); // Apply current view filter
}


// --- Handle Slot Selection Function ---
export function handleSlotSelection(event) {
    event.stopPropagation(); // Crucial to prevent immediate re-triggering or unwanted bubbling
    const slotElement = event.currentTarget; // The .schedule-item div
    const scheduleId = parseInt(slotElement.dataset.scheduleId);

    // If the slot is ALREADY selected (has ring-2 highlight)
    if (slotElement.classList.contains('ring-2')) {
        const formContainer = slotElement.querySelector(`#inline-log-form-${scheduleId}`);
        const slotActionsDiv = document.getElementById('slot-actions');

        // Determine if the click was on an interactive element that should NOT cause deselection
        const isClickInsideForm = formContainer && formContainer.contains(event.target);
        const isClickOnSlotActionButton = slotActionsDiv && slotActionsDiv.contains(event.target) && event.target.closest('button');
        const isClickOnStudentActionButton = event.target.closest('.student-entry button'); // e.g., mark absent, undo, remove from roster
        const isClickOnFillInSuggestionButton = event.target.closest('#absence-suggestion-box button'); // Click within suggestion box

        if (isClickInsideForm || isClickOnSlotActionButton || isClickOnStudentActionButton || isClickOnFillInSuggestionButton) {
            // Click was inside the form, or on a specific action button related to this slot.
            // Let that element's own event handler manage the interaction. Do not deselect the slot.
            // console.log(`Schedule Debug: Click on interactive element within selected slot ${scheduleId}. No deselection.`);
            return;
        }

        // Otherwise (e.g., clicked on the slot padding, or an unhandled area), deselect it.
        // console.log(`Schedule Debug: Deselecting slot ${scheduleId} due to click on non-interactive area of selected slot.`);
        hideAllInlineForms(); // This will clear the form and remove highlights from all slots
        appState.updateSelectedLessonSlot(null); // Clear the selected slot in global state
        if (slotActionsDiv) slotActionsDiv.classList.add('hidden'); // Hide general slot actions
        closeAbsenceSuggestionBox(); // Close any open suggestion box
        return; // Exit after deselecting
    }

    // If the slot was NOT already selected, proceed to select it:
    // console.log(`Schedule Debug: Selecting slot ${scheduleId}.`);
    hideAllInlineForms(scheduleId); // Hide other forms, remove other highlights
    closeAbsenceSuggestionBox(); // Close suggestion box if open for another slot

    // Add selection highlight to the newly clicked slot
    const selectionClasses = ['ring-2', 'ring-indigo-400', 'dark:ring-indigo-500', 'ring-offset-1', 'dark:ring-offset-gray-800'];
    slotElement.classList.add(...selectionClasses);

    // Prepare details for the selected slot
    const slotDetails = {
        scheduleId: scheduleId,
        day: slotElement.dataset.day,
        time: slotElement.dataset.time,
        coachId: parseInt(slotElement.dataset.coachId),
        capacity: parseInt(slotElement.dataset.capacity),
        originalStudentIds: JSON.parse(slotElement.dataset.originalStudents || '[]'),
        currentStudentIds: JSON.parse(slotElement.dataset.currentStudents || '[]'),
        isPastLog: false // This is for current day logs
    };

    appState.updateSelectedLessonSlot(slotDetails); // Update global state

    // Populate and show the inline log form for this slot
    const inlineFormContainer = slotElement.querySelector(`#inline-log-form-${scheduleId}`);
    if (inlineFormContainer) {
        populateInlineLogForm(inlineFormContainer, slotDetails); // From logging.js
        inlineFormContainer.classList.remove('hidden');
    } else {
        console.error(`Schedule Error: Could not find inline form container for slot ${scheduleId}`);
    }

    // Show/hide action buttons based on capacity
    const slotActionsDiv = document.getElementById('slot-actions');
    const findStudentsButton = document.getElementById('find-students-button');
    const manualAddButton = document.getElementById('manual-add-student-button');

    if (slotActionsDiv && findStudentsButton && manualAddButton) {
        const hasCapacity = slotDetails.currentStudentIds.length < slotDetails.capacity;
        const originallyHadStudents = slotDetails.originalStudentIds.length > 0;
        const allOriginalsAbsent = originallyHadStudents && slotDetails.currentStudentIds.length === 0 &&
                                   !appState.todaysStatuses.some(s => s.lesson_schedule_id === scheduleId && s.status === 'assigned_fill_in');


        // Show action buttons if there's capacity OR if all original students are absent (to allow finding fill-ins)
        const showActionButtons = hasCapacity || allOriginalsAbsent;

        findStudentsButton.classList.toggle('hidden', !showActionButtons);
        manualAddButton.classList.toggle('hidden', !showActionButtons);
        slotActionsDiv.classList.toggle('hidden', !showActionButtons);

        manualAddButton.onclick = () => handleShowManualAddUI(); // Attach fresh listener

        if (showActionButtons) {
            // console.log(`Schedule Debug: Slot ${scheduleId} has capacity or all absent. Triggering fill-in suggestions.`);
            findAndDisplayAbsenceReplacements(scheduleId, slotElement); // Trigger suggestions popup
            hideManualAddUI(); // Ensure manual add UI is hidden initially
        } else {
            // console.log(`Schedule Debug: Slot ${scheduleId} is full and not all absent. Not showing suggestions.`);
            closeAbsenceSuggestionBox();
            hideManualAddUI();
        }
    } else {
        console.warn("Schedule Warning: Slot actions UI elements not found.");
        if (slotActionsDiv) slotActionsDiv.classList.add('hidden');
    }
}


/** Hides all inline forms except the one specified. Also removes general selection highlight if no exclusion. */
export function hideAllInlineForms(excludeScheduleId = null) {
    document.querySelectorAll('.inline-log-form-container').forEach(formContainer => {
        if (formContainer.id !== `inline-log-form-${excludeScheduleId}`) {
            formContainer.classList.add('hidden');
            formContainer.innerHTML = ''; // Clear content
        }
    });
    // Remove selection highlight from all items except the excluded one
    document.querySelectorAll('.schedule-item').forEach(item => {
        if (parseInt(item.dataset.scheduleId) !== excludeScheduleId) {
            item.classList.remove('ring-2', 'ring-indigo-400', 'dark:ring-indigo-500', 'ring-offset-1', 'dark:ring-offset-gray-800');
        }
    });
}

// --- Event Listener Setup Functions (Internal) ---
/** Sets up event listeners for the day view toggle buttons. */
function setupDayViewToggleListeners() {
    const buttonContainer = document.getElementById('day-view-toggle-buttons');
    if (buttonContainer) {
        // Remove previous listener to avoid duplicates if called multiple times
        buttonContainer.removeEventListener('click', handleDayViewToggleClick);
        buttonContainer.addEventListener('click', handleDayViewToggleClick);
    } else {
        console.warn("Schedule Warning: Day view toggle button container not found.");
    }
}

// --- Manual Student Add Functions ---
function setupManualAddListeners() {
    // Note: onclick for manualAddButton is now set dynamically in handleSlotSelection
    const manualSearchInput = document.getElementById('manual-student-search');
    const manualResultsDiv = document.getElementById('manual-add-results');
    if (manualSearchInput) {
        manualSearchInput.addEventListener('input', handleManualSearchInput);
    }
    if (manualResultsDiv) {
        manualResultsDiv.addEventListener('click', handleAddManualStudentClick);
    }
}
function handleShowManualAddUI() {
    const manualAddContainer = document.getElementById('manual-add-container');
    const manualSearchInput = document.getElementById('manual-student-search');
    if (manualAddContainer) {
        manualAddContainer.classList.remove('hidden');
        if (manualSearchInput) manualSearchInput.focus();
    }
     // Hide the "Find Suggestions" button when showing manual add
     const findStudentsButton = document.getElementById('find-students-button');
     if (findStudentsButton) findStudentsButton.classList.add('hidden');
     closeAbsenceSuggestionBox(); // Close suggestion popup if open
}
export function hideManualAddUI() {
    const manualAddContainer = document.getElementById('manual-add-container');
    const manualSearchInput = document.getElementById('manual-student-search');
    const manualResultsDiv = document.getElementById('manual-add-results');
    const manualErrorP = document.getElementById('manual-add-error');
    if (manualAddContainer) manualAddContainer.classList.add('hidden');
    if (manualSearchInput) manualSearchInput.value = '';
    if (manualResultsDiv) manualResultsDiv.innerHTML = '';
    if (manualErrorP) { manualErrorP.textContent = ''; manualErrorP.classList.add('hidden'); }
     // Re-show the "Find Suggestions" button if the slot still has capacity
     const selectedSlot = appState.selectedLessonSlot;
     const findStudentsButton = document.getElementById('find-students-button');
     if (selectedSlot && findStudentsButton) {
         const hasCapacity = selectedSlot.currentStudentIds.length < selectedSlot.capacity;
         findStudentsButton.classList.toggle('hidden', !hasCapacity);
     }
}
function handleManualSearchInput(event) {
    const searchTerm = event.target.value.trim().toLowerCase();
    const resultsDiv = document.getElementById('manual-add-results');
    const errorP = document.getElementById('manual-add-error');
    if (!resultsDiv || !errorP || !appState.studentsData) return;

    errorP.textContent = ''; errorP.classList.add('hidden');
    resultsDiv.innerHTML = '';
    if (searchTerm.length < 2) {
        resultsDiv.innerHTML = '<p class="text-xs text-gray-500 dark:text-gray-400 italic">Enter at least 2 characters.</p>';
        return;
    }
    const selectedSlot = appState.selectedLessonSlot;
    if (!selectedSlot) return;
    const currentStudentIds = selectedSlot.currentStudentIds || [];
    const capacity = selectedSlot.capacity;
    const currentOccupantDetails = currentStudentIds.map(id => getStudentDetails(id, appState.studentsData)).filter(Boolean);

    const filteredStudents = appState.studentsData.filter(student => {
        // *** Exclude inactive students from manual add search ***
        if (student.is_active === false) return false;

        if (!student.Name || !student.Name.toLowerCase().includes(searchTerm)) return false;
        if (currentStudentIds.includes(student.id)) return false;
        const studentDetails = getStudentDetails(student.id, appState.studentsData);
        if (!studentDetails) return false;
        // Check availability using utils.js function
        if (!isStudentAvailable(studentDetails, selectedSlot.day, selectedSlot.time)) return false;
        const pairingCheck = checkPairingRuleViolation(studentDetails, currentOccupantDetails, capacity);
        if (pairingCheck.violation) return false;
        return true;
    });

    if (filteredStudents.length === 0) {
        resultsDiv.innerHTML = '<p class="text-xs text-gray-500 dark:text-gray-400 italic">No matching available students found.</p>';
    } else {
        const list = document.createElement('ul');
        list.className = 'space-y-1';
        filteredStudents.slice(0, 10).forEach(student => {
            const li = document.createElement('li');
            const details = getStudentDetails(student.id, appState.studentsData);
            const groupText = getGroupSizeText(details?.groupOf);
            const subGroupText = details?.sub_group ? ` [${details.sub_group}]` : '';
            // Add button directly in innerHTML for simplicity here
            li.innerHTML = `
                <span class="text-gray-800 dark:text-gray-200">${details?.Name || 'Unknown'} (${groupText}${subGroupText})</span>
                <button type="button" data-student-id="${student.id}" class="add-manual-student-confirm text-xs bg-blue-500 hover:bg-blue-700 text-white font-semibold py-0.5 px-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ml-2 flex-shrink-0 dark:bg-blue-600 dark:hover:bg-blue-500">Add</button>`;
            list.appendChild(li);
        });
        resultsDiv.appendChild(list);
    }
}
async function handleAddManualStudentClick(event) {
    if (!event.target.classList.contains('add-manual-student-confirm')) return;
    const button = event.target;
    const studentId = parseInt(button.dataset.studentId);
    const selectedSlot = appState.selectedLessonSlot;
    const errorP = document.getElementById('manual-add-error');
    if (isNaN(studentId) || !selectedSlot || !errorP) {
        if(errorP) { errorP.textContent = "Error: Invalid data or no slot selected."; errorP.classList.remove('hidden'); }
        return;
    }
    console.log(`Manual Add: Adding student ${studentId} to slot ${selectedSlot.scheduleId}`);
    button.disabled = true; button.textContent = 'Adding...';
    errorP.classList.add('hidden');
    try {
        const result = await addDailyStatus(studentId, selectedSlot.coachId, selectedSlot.scheduleId, 'assigned_fill_in');
        if (result && result.success) {
            console.log(`Manual Add: Successfully added student ${studentId}.`);
            hideManualAddUI();
            await refreshCurrentCoachSchedule(); // Refresh schedule view
        } else {
            throw new Error(result?.message || "API call failed.");
        }
    } catch (error) {
        console.error("Manual Add Error:", error);
        errorP.textContent = `Failed to add: ${error.message}`;
        errorP.classList.remove('hidden');
        button.disabled = false; button.textContent = 'Add';
    }
}


// --- Roster Editing Handlers ---
/** Handles click on the 'Remove Student' button in edit mode. */
async function handleRemoveStudentFromSlot(event) {
    event.stopPropagation(); // Prevent triggering slot selection
    const button = event.currentTarget;
    const studentId = parseInt(button.dataset.studentId);
    const scheduleId = parseInt(button.dataset.scheduleId);

    if (isNaN(studentId) || isNaN(scheduleId)) {
        console.error("Remove Roster Error: Invalid IDs.");
        uiDisplayError("Cannot remove student: Invalid data.", "general");
        return;
    }

    const studentDetails = getStudentDetails(studentId, appState.studentsData);
    const studentName = studentDetails?.Name || `Student ID ${studentId}`;

    if (!confirm(`Are you sure you want to permanently remove ${studentName} from this schedule slot?`)) {
        console.log("Remove Roster: User cancelled removal.");
        return;
    }

    console.log(`EDIT MODE: Removing student ${studentId} from slot ${scheduleId}.`);
    button.disabled = true;
    // Optionally add a spinner or change icon
    button.innerHTML = `<svg class="animate-spin h-3 w-3 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

    try {
        const result = await removeStudentFromSchedule(studentId, scheduleId);
        if (result.success) {
            console.log("Remove Roster: Student removed successfully.");
            await refreshCurrentCoachSchedule(); // Refresh the view
        } else {
            throw new Error(result.message || "Failed to remove student via API.");
        }
    } catch (error) {
        console.error("Remove Roster Error:", error);
        uiDisplayError(`Error removing student: ${error.message}`, "general");
        // Restore button state on error
        button.disabled = false;
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>`;
    }
}

/** Shows the UI to add a student to a slot in edit mode. */
function handleShowAddStudentUI(event) {
    event.stopPropagation(); // Prevent triggering slot selection
    const button = event.currentTarget;
    const scheduleId = parseInt(button.dataset.scheduleId);
    console.log(`EDIT MODE: Add student to slot ${scheduleId} clicked.`);

    // Find the target slot element
    const slotElement = button.closest('.schedule-item');
    if (!slotElement) {
        console.error("Add Student UI Error: Could not find parent slot element.");
        return;
    }

    // Get the main container for the add UI
    const rosterAddContainer = document.getElementById('roster-add-container');
    const searchInput = document.getElementById('roster-student-search');
    const resultsDiv = document.getElementById('roster-add-results');
    const errorP = document.getElementById('roster-add-error');
    const titleH4 = document.getElementById('roster-add-title');
    const cancelButton = document.getElementById('roster-add-cancel-button');

    if (!rosterAddContainer || !searchInput || !resultsDiv || !errorP || !titleH4 || !cancelButton) {
        console.error("Add Student UI Error: Roster add UI elements not found in HTML.");
        uiDisplayError("Roster editing UI is missing components.", "general");
        return;
    }

    // Store target schedule ID on the container
    rosterAddContainer.dataset.targetScheduleId = scheduleId;
    // Update title
    const time = slotElement.dataset.time;
    const day = slotElement.dataset.day;
    titleH4.textContent = `Add Student to ${day} ${time}`;

    // Clear previous state
    searchInput.value = '';
    resultsDiv.innerHTML = '';
    errorP.textContent = '';
    errorP.classList.add('hidden');

    // Show the container
    rosterAddContainer.classList.remove('hidden');
    searchInput.focus();

    // Remove previous listeners to avoid duplicates
    searchInput.removeEventListener('input', handleRosterAddSearchInput);
    resultsDiv.removeEventListener('click', handleAddStudentToRosterConfirm); // Changed listener
    cancelButton.removeEventListener('click', handleRosterAddCancel);

    // Add new listeners
    searchInput.addEventListener('input', handleRosterAddSearchInput);
    resultsDiv.addEventListener('click', handleAddStudentToRosterConfirm); // Changed listener
    cancelButton.addEventListener('click', handleRosterAddCancel);
}

/** Handles input in the roster add search field. */
function handleRosterAddSearchInput(event) {
    const searchInput = event.target;
    const rosterAddContainer = searchInput.closest('#roster-add-container');
    const resultsDiv = rosterAddContainer.querySelector('#roster-add-results');
    const errorP = rosterAddContainer.querySelector('#roster-add-error');
    const targetScheduleId = parseInt(rosterAddContainer.dataset.targetScheduleId);

    if (!resultsDiv || !errorP || !appState.studentsData || isNaN(targetScheduleId)) return;

    const searchTerm = searchInput.value.trim().toLowerCase();
    errorP.textContent = '';
    errorP.classList.add('hidden');
    resultsDiv.innerHTML = '';

    if (searchTerm.length < 2) {
        resultsDiv.innerHTML = '<p class="text-xs text-gray-500 dark:text-gray-400 italic">Enter at least 2 characters.</p>';
        return;
    }

    // Find the target slot data to get original students and capacity
    const slotElement = document.querySelector(`.schedule-item[data-schedule-id="${targetScheduleId}"]`);
    if (!slotElement) {
        errorP.textContent = "Error: Target slot not found.";
        errorP.classList.remove('hidden');
        return;
    }
    const originalStudentIds = JSON.parse(slotElement.dataset.originalStudents || '[]');
    const capacity = parseInt(slotElement.dataset.capacity);
    const originalStudentDetails = originalStudentIds.map(id => getStudentDetails(id, appState.studentsData)).filter(Boolean);

    // console.log(`Roster Add Filter DEBUG: scheduleId=${targetScheduleId}, searchTerm='${searchTerm}', capacity=${capacity}, originalIds=${JSON.stringify(originalStudentIds)}`);

    // Filter all students
    const filteredStudents = appState.studentsData.filter(student => {
        const studentId = student.id;
        const studentName = student.Name;

        // *** Exclude inactive students from roster add search ***
        if (student.is_active === false) {
            // console.log(`Roster Add Filter DEBUG: Skipping ${studentId} (${studentName}) - Inactive.`);
            return false;
        }

        // Check name match
        if (!studentName || !studentName.toLowerCase().includes(searchTerm)) {
            return false;
        }
        // Check not already in the slot
        if (originalStudentIds.includes(studentId)) {
             return false;
        }
        // Check capacity
        if (originalStudentIds.length >= capacity) {
            return false; // Cannot add if already full
        }
        // Check pairing rules against original students
        const studentDetails = getStudentDetails(studentId, appState.studentsData);
        if (!studentDetails) {
             return false;
        }
        const pairingCheck = checkPairingRuleViolation(studentDetails, originalStudentDetails, capacity);
        if (pairingCheck.violation) {
             return false;
        }
        return true; // Passed all checks
    });

    // console.log(`Roster Add Filter DEBUG: Final filtered list count: ${filteredStudents.length}`);


    if (filteredStudents.length === 0) {
        resultsDiv.innerHTML = '<p class="text-xs text-gray-500 dark:text-gray-400 italic">No matching active students found or slot rules prevent adding.</p>';
    } else {
        const list = document.createElement('ul');
        list.className = 'space-y-1';
        filteredStudents.slice(0, 15).forEach(student => { // Show more results
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center py-1 border-b border-gray-200 dark:border-gray-600 last:border-b-0';

            const details = getStudentDetails(student.id, appState.studentsData);
            const groupText = getGroupSizeText(details?.groupOf);
            const subGroupText = details?.sub_group ? ` [${details.sub_group}]` : '';

            const nameSpan = document.createElement('span');
            nameSpan.className = "text-gray-800 dark:text-gray-200 text-xs";
            nameSpan.textContent = `${details?.Name || 'Unknown'} (${details?.class_name || 'N/A'} - ${groupText}${subGroupText})`;

            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.className = 'roster-add-confirm-btn text-xs bg-blue-500 hover:bg-blue-700 text-white font-semibold py-0.5 px-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ml-2 flex-shrink-0 dark:bg-blue-600 dark:hover:bg-blue-500';
            addButton.dataset.studentId = student.id;
            addButton.textContent = 'Add';

            li.appendChild(nameSpan);
            li.appendChild(addButton);
            list.appendChild(li);
        });
        resultsDiv.appendChild(list);
    }
}

/** Handles confirming the addition of a student to the roster slot. */
async function handleAddStudentToRosterConfirm(event) {
    // Check if the clicked element is the confirm button
    if (!event.target.classList.contains('roster-add-confirm-btn')) return;

    const button = event.target;
    const studentId = parseInt(button.dataset.studentId);
    const rosterAddContainer = button.closest('#roster-add-container');
    const scheduleId = parseInt(rosterAddContainer?.dataset.targetScheduleId);
    const errorP = rosterAddContainer.querySelector('#roster-add-error');

    // Validate IDs and presence of error element
    if (isNaN(studentId) || isNaN(scheduleId) || !errorP) {
        console.error("Add Roster Error: Invalid IDs or missing elements.");
        if(errorP) { errorP.textContent = "Error: Invalid data."; errorP.classList.remove('hidden'); }
        return;
    }

    console.log(`EDIT MODE: Confirm add student ${studentId} to slot ${scheduleId}.`);
    button.disabled = true; // Disable button during API call
    button.textContent = 'Adding...';
    errorP.classList.add('hidden'); // Hide previous errors

    try {
        // Call the API function to add the student
        const result = await addStudentToSchedule(studentId, scheduleId);

        if (result.success) {
            // If successful:
            console.log("Add Roster: Student added successfully.");
            handleRosterAddCancel(); // Hide the add UI
            await refreshCurrentCoachSchedule(); // Refresh the schedule display
        } else {
            // If API call fails (e.g., student already exists, other error):
            throw new Error(result.message || "Failed to add student.");
        }
    } catch (error) {
        // Handle errors during the API call or if result indicates failure
        console.error("Add Roster Error:", error);
        errorP.textContent = `Error: ${error.message}`; // Display error message
        errorP.classList.remove('hidden');
        button.disabled = false; // Re-enable the button
        button.textContent = 'Add';
    }
}

/** Hides the roster add UI. */
function handleRosterAddCancel() {
    const rosterAddContainer = document.getElementById('roster-add-container');
    if (rosterAddContainer) {
        rosterAddContainer.classList.add('hidden');
        // Clean up listeners if needed, though they are added dynamically now
        const searchInput = rosterAddContainer.querySelector('#roster-student-search');
        const resultsDiv = rosterAddContainer.querySelector('#roster-add-results');
        const cancelButton = rosterAddContainer.querySelector('#roster-add-cancel-button');
        if(searchInput) searchInput.removeEventListener('input', handleRosterAddSearchInput);
        if(resultsDiv) resultsDiv.removeEventListener('click', handleAddStudentToRosterConfirm);
        if(cancelButton) cancelButton.removeEventListener('click', handleRosterAddCancel);
    }
}


// --- Re-render Slot Function ---
/** Re-renders the content of a specific slot element based on the latest appState. */
export function reRenderSlot(scheduleId) {
    const slotElement = document.querySelector(`.schedule-item[data-schedule-id="${scheduleId}"]`);
    if (!slotElement) {
        console.warn(`Schedule reRenderSlot Warn: Slot element ${scheduleId} not found.`);
        return;
    }

    // Find the corresponding slot data in the current schedule state
    let slotData = null;
    for (const day in appState.scheduleData) {
        const found = appState.scheduleData[day].find(s => s.schedule_id === scheduleId);
        if (found) {
            slotData = found;
            break;
        }
    }

    if (!slotData) {
        console.warn(`Schedule reRenderSlot Warn: Slot data for ${scheduleId} not found in appState.`);
        // Optionally remove the element if data is gone? Or just leave it?
        // slotElement.remove();
        return;
    }

    // Create a new slot element based on the latest data
    const newSlotElement = createSlotElement(
        slotData,
        appState.todaysStatuses || [],
        appState.todaysLoggedSlotIds || []
    );

    if (newSlotElement) {
        // Replace the old element with the new one
        slotElement.replaceWith(newSlotElement);
        console.log(`Schedule: Slot ${scheduleId} re-rendered.`);

        // Re-apply selection highlight if it was selected
        if (appState.selectedLessonSlot?.scheduleId === scheduleId) {
             const selectionClasses = ['ring-2', 'ring-indigo-400', 'dark:ring-indigo-500', 'ring-offset-1', 'dark:ring-offset-gray-800'];
             newSlotElement.classList.add(...selectionClasses);
        }
    } else {
        console.error(`Schedule reRenderSlot Error: Failed to create new slot element for ${scheduleId}.`);
    }
}


// --- Add a ready flag ---
export const isReady = true;

console.log("Schedule module (schedule.js) loaded.");
