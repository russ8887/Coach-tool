// js/admin.js
// Handles admin-specific features like finding fill-in suggestions, creating daily blocks, managing student status, and logging ad-hoc past sessions (ES Module).
// v14: Added console logs to debug class availability display.

// --- Import Dependencies ---
import { appState } from './state.js'; // Import from state.js
import { adminFindFillInSuggestions, addDailyStatus, getTodaysStatuses, createDailyBlock, setStudentActiveStatus, fetchStudents, submitLogAndUpdates } from './api.js';
// *** Import parseAvailability from utils ***
import { getStudentDetails, getGroupSizeText, parseAvailability } from './utils.js';
import { displayError as uiDisplayError, clearError as uiClearError, showLoading as uiShowLoading, hideLoading as uiHideLoading, showStatusMessage } from './ui.js';
import { refreshCurrentCoachSchedule } from './coachSelect.js';
import { openStudentProfileModal } from './studentProfile.js';


// --- Constants (copied from logging.js for ad-hoc form generation) ---
const LOGGABLE_SKILLS = [
    "Opening Principles", "Tactics (Pins, Forks, Skewers)", "Checkmating Patterns",
    "Endgame Fundamentals", "Strategy Basics", "Calculation Practice",
    "Game Analysis", "Puzzle Solving", "Specific Opening Prep", "Tournament Preparation"
];

// --- Module Variables ---
// Suggestion form/results
let adminCoachFilter = null;
let adminDayFilter = null;
let adminIncludePartial = null;
let adminResultsArea = null;
let adminFindFillinsForm = null;

// Block form elements
let createBlockForm = null;
let blockDateInput = null;
let blockTypeSelect = null;
let blockIdentifierInput = null;
let blockReasonInput = null;
let createBlockSubmitBtn = null;
let createBlockStatusP = null;

// Edit Mode Button
let toggleEditModeButton = null;

// Student Status Management Elements
let adminStudentFilterInput = null;
let adminStudentStatusListContainer = null;
let adminStudentStatusList = null;
let adminStudentStatusError = null;

// Ad-hoc Past Log Form Elements
let adhocPastLogForm = null;
let adhocLogDateInput = null;
let adhocLogTimeInput = null;
let adhocLogCoachSelect = null;
let adhocLogLessonTypeSelect = null;
let adhocLogStudentSearchInput = null;
let adhocLogStudentSearchResultsDiv = null;
let adhocLogSelectedStudentsListUl = null;
let adhocLogStudentErrorP = null;
let adhocLogFieldsContainerDiv = null;
let adhocLogSubmitBtn = null;
let adhocLogStatusP = null;

let adhocSelectedStudents = []; // Array to store {id, name} of students added to ad-hoc form

// --- Class View Modal Elements ---
let adminClassSelect = null;
let viewClassButton = null;
let adminClassSelectError = null;
let classViewModal = null;
let classModalCloseButton = null;
let classModalName = null;
let classModalStudentList = null;
let classModalLoadingIndicator = null;
let classModalErrorMessage = null;
// --- Class Availability Elements ---
let classModalAvailabilityDisplay = null;
let editClassAvailabilityBtn = null;
let classModalAvailabilityEdit = null;
let classModalAvailabilityTextarea = null;
let cancelClassAvailabilityBtn = null;
let saveClassAvailabilityBtn = null;
let classModalAvailabilityError = null;


// --- Helper Functions ---

/** Populates the admin coach selector dropdown. */
export function populateAdminCoachSelector(coaches) {
    console.log("Admin: Populating admin coach selector...");
    const adminCoachSelect = document.getElementById('admin-coach-filter');
    if (!adminCoachSelect) {
        console.warn("Admin Warning: Admin coach filter dropdown not found.");
        return;
    }
    if (!Array.isArray(coaches)) {
        console.error("Admin Error: Invalid coaches data for admin selector.");
        adminCoachSelect.innerHTML = '<option value="">Error</option>';
        return;
    }
    const currentValue = adminCoachSelect.value;
    adminCoachSelect.innerHTML = '<option value="">Any Coach</option>';
    coaches.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
    coaches.forEach(coach => {
        const option = document.createElement('option');
        option.value = coach.id;
        option.textContent = coach.Name;
        adminCoachSelect.appendChild(option);
    });
    // Restore previous selection if possible
    if (Array.from(adminCoachSelect.options).some(opt => opt.value === currentValue)) {
        adminCoachSelect.value = currentValue;
    } else {
        adminCoachSelect.value = ''; // Default to "Any Coach" if previous value is gone
    }
    console.log("Admin: Admin coach selector populated.");
}

/** Populates the coach selector for the Ad-hoc Past Log form. */
function populateAdhocCoachSelector(coaches) {
    if (!adhocLogCoachSelect) {
        console.warn("Admin (Adhoc): Adhoc coach select dropdown not found.");
        return;
    }
    if (!Array.isArray(coaches)) {
        console.error("Admin (Adhoc) Error: Invalid coaches data for adhoc selector.");
        adhocLogCoachSelect.innerHTML = '<option value="">Error loading coaches</option>';
        return;
    }
    adhocLogCoachSelect.innerHTML = '<option value="">Select Coach...</option>'; // Default empty option
    coaches.forEach(coach => { // Assumes coaches are already sorted if needed
        const option = document.createElement('option');
        option.value = coach.id;
        option.textContent = coach.Name;
        adhocLogCoachSelect.appendChild(option);
    });
    console.log("Admin (Adhoc): Adhoc coach selector populated.");
}

/** Renders the HTML for a single admin suggestion item, filtering inactive students. */
function _renderSuggestionItem(item, allStudentsData) {
    const li = document.createElement('li');
    li.className = 'border-b border-gray-200 dark:border-gray-600 pb-2 mb-2 last:border-b-0 last:mb-0';
    const slotInfo = document.createElement('div');
    slotInfo.className = 'text-sm mb-1';
    slotInfo.innerHTML = `
        <strong>Slot:</strong> ${item.day_of_week} ${item.time_slot} (Coach: ${item.coach_name || 'N/A'})
        <span class="text-xs text-gray-500 dark:text-gray-400"> - ID: ${item.schedule_id}, Capacity: ${item.capacity}, Current: ${item.current_occupancy}</span>
    `;
    li.appendChild(slotInfo);
    const suggestionsList = document.createElement('ul');
    suggestionsList.className = 'list-disc list-inside ml-4 space-y-1';

    let activeSuggestionsFound = false; // Flag to check if any active students are suggested

    if (!item.suggested_students || item.suggested_students.length === 0) {
        suggestionsList.innerHTML = '<li class="text-xs italic text-gray-500 dark:text-gray-400">No specific students suggested by backend rules.</li>';
    } else {
        item.suggested_students.forEach(studentSuggestion => {
            const studentId = studentSuggestion.id;
            const studentDetails = getStudentDetails(studentId, allStudentsData);

            // *** Filter out inactive students ***
            if (!studentDetails || studentDetails.is_active === false) {
                // console.log(`Admin Suggest Filter: Skipping inactive student ID ${studentId}`);
                return; // Skip this student
            }

            activeSuggestionsFound = true; // Mark that we found at least one active suggestion

            const studentName = studentDetails?.Name || `ID: ${studentId}`;
            const groupText = getGroupSizeText(studentDetails?.groupOf);
            const subGroupText = studentDetails?.sub_group ? ` [${studentDetails.sub_group}]` : '';
            const owedText = studentSuggestion.lessons_owed > 0 ? ` (${studentSuggestion.lessons_owed} owed)` : '';
            const studentLi = document.createElement('li');
            studentLi.className = 'flex justify-between items-center group';
            studentLi.innerHTML = `
                <span class="text-gray-800 dark:text-gray-200 text-xs">
                    ${studentName}
                    <span class="text-gray-500 dark:text-gray-400">${owedText} (${groupText}${subGroupText})</span>
                </span>
                <button type="button" data-student-id="${studentId}" data-schedule-id="${item.schedule_id}" data-coach-id="${item.coach_id}"
                        class="admin-apply-suggestion-btn text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-0.5 px-1.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150 ease-in-out">
                    Apply
                </button>
            `;
            suggestionsList.appendChild(studentLi);
        });

        // If the loop finished but found no *active* suggestions
        if (!activeSuggestionsFound) {
             suggestionsList.innerHTML = '<li class="text-xs italic text-gray-500 dark:text-gray-400">No suitable *active* students suggested for this slot.</li>';
        }
    }
    li.appendChild(suggestionsList);
    return li;
}

/** Displays the fill-in suggestions in the admin results area. */
function displayAdminSuggestions(suggestionData, allStudentsData) {
    if (!adminResultsArea) return;
    adminResultsArea.innerHTML = '';
    if (!suggestionData || suggestionData.length === 0) {
        adminResultsArea.innerHTML = '<p class="text-gray-500 dark:text-gray-400 italic p-2">No potential fill-in slots found matching criteria.</p>';
        return;
    }
    const list = document.createElement('ul');
    suggestionData.forEach(item => {
        list.appendChild(_renderSuggestionItem(item, allStudentsData));
    });
    adminResultsArea.appendChild(list);
}

// --- Student Status Management Functions ---

/**
 * Populates the student status list in the Admin Tools section.
 * Filters based on the input field.
 */
function populateStudentStatusList() {
    if (!adminStudentStatusList || !appState.studentsData) {
        console.warn("Admin: Cannot populate student status list - element or student data missing.");
        if (adminStudentStatusList) {
            adminStudentStatusList.innerHTML = '<li class="text-center text-red-500 dark:text-red-400 italic py-2">Error loading student data.</li>';
        }
        return;
    }

    const filterText = adminStudentFilterInput ? adminStudentFilterInput.value.trim().toLowerCase() : '';
    adminStudentStatusList.innerHTML = ''; // Clear existing list

    const filteredStudents = appState.studentsData
        .filter(student => {
            if (!student.Name) return false; // Skip students without names
            if (filterText === '') return true; // Show all if filter is empty
            return student.Name.toLowerCase().includes(filterText);
        })
        .sort((a, b) => (a.Name || '').localeCompare(b.Name || '')); // Sort alphabetically

    if (filteredStudents.length === 0) {
        adminStudentStatusList.innerHTML = '<li class="text-center text-gray-500 dark:text-gray-400 italic py-2">No students found matching filter.</li>';
        return;
    }

    filteredStudents.forEach(student => {
        const li = document.createElement('li');
        // li.className = 'flex justify-between items-center py-1.5 px-2 border-b border-purple-100 dark:border-purple-800 last:border-b-0'; // Base class from HTML
        const isActive = student.is_active === true; // Explicitly check for true

        const nameSpan = document.createElement('span');
        nameSpan.className = `text-sm ${isActive ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 line-through'}`;
        nameSpan.textContent = student.Name || `ID: ${student.id}`;

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'flex items-center space-x-2';

        // "View Details" button
        const viewDetailsButton = document.createElement('button');
        viewDetailsButton.type = 'button';
        viewDetailsButton.dataset.studentId = student.id;
        viewDetailsButton.title = `View details for ${student.Name}`;
        // Tailwind classes for a small, subtle button (e.g., an icon or text)
        viewDetailsButton.className = 'view-student-details-btn text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-gray-800 p-0.5 rounded';
        viewDetailsButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
            </svg>`; // Eye icon
        buttonContainer.appendChild(viewDetailsButton);


        // Activate/Deactivate button
        const statusButton = document.createElement('button');
        statusButton.type = 'button';
        statusButton.dataset.studentId = student.id;
        statusButton.dataset.isActive = isActive; // Store current status
        statusButton.textContent = isActive ? 'Deactivate' : 'Activate';
        // Tailwind classes for status button
        statusButton.className = `toggle-student-status-btn text-xs font-semibold py-0.5 px-2 rounded focus:outline-none focus:ring-1 focus:ring-offset-1 dark:focus:ring-offset-gray-800 transition-colors duration-150 ${isActive ? 'bg-red-500 hover:bg-red-700 text-white focus:ring-red-600' : 'bg-green-500 hover:bg-green-700 text-white focus:ring-green-600'}`;
        buttonContainer.appendChild(statusButton);

        li.appendChild(nameSpan);
        li.appendChild(buttonContainer);
        adminStudentStatusList.appendChild(li);
    });
}

// --- Ad-hoc Past Log Functions ---

/** (Internal Helper) Creates HTML for a rating radio button group for ad-hoc logs. */
function _createAdhocRatingGroup(groupLabel, groupName, studentId, isRequired) {
    let html = `<div class="mb-2"><p class="text-xs font-medium text-gray-600 dark:text-gray-300 mb-0.5">${groupLabel}:</p><div class="flex space-x-2">`;
    const requiredAttr = isRequired ? 'required' : '';
    [1, 2, 3, 4, 5].forEach(value => {
        const radioId = `adhoc_${groupName}_${studentId}_${value}`;
        html += `
            <label for="${radioId}" class="flex items-center space-x-0.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="radio" id="${radioId}" name="adhoc_${groupName}_${studentId}" value="${value}" ${requiredAttr}
                       class="form-radio h-3 w-3 text-indigo-600 border-gray-300 focus:ring-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:focus:ring-offset-gray-800">
                <span>${value}</span>
            </label>`;
    });
    html += '</div></div>';
    return html;
}

/** Renders the log input fields for a single student in the ad-hoc form. */
function _renderAdhocStudentLogFields(studentId) {
    const studentDetails = getStudentDetails(studentId, appState.studentsData);
    if (!studentDetails) return '';

    const sectionId = `adhoc-student-log-fields-${studentId}`;
    let fieldsHtml = `<div id="${sectionId}" class="adhoc-student-fields-entry border-t border-purple-300 dark:border-purple-700 pt-3 mt-3 first:mt-0 first:pt-0 first:border-t-0">
                        <h5 class="font-medium text-sm text-purple-700 dark:text-purple-300 mb-2">${studentDetails.Name}</h5>`;

    // Skills (Checkboxes) - For ad-hoc, always log individually
    fieldsHtml += `<div class="mb-2"><p class="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Skills Covered:</p><div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">`;
    LOGGABLE_SKILLS.forEach((skill, skillIndex) => {
        const checkboxId = `adhoc_skill_${studentId}_${skillIndex}`;
        fieldsHtml += `
            <label for="${checkboxId}" class="flex items-center space-x-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" id="${checkboxId}" name="adhoc_skills_${studentId}" value="${skill}"
                       class="form-checkbox h-3 w-3 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:focus:ring-offset-gray-800">
                <span>${skill}</span>
            </label>`;
    });
    fieldsHtml += `</div></div>`;

    // Ratings (Required for ad-hoc as it's a new log)
    fieldsHtml += _createAdhocRatingGroup('Proficiency', 'proficiency', studentId, true);
    fieldsHtml += _createAdhocRatingGroup('Engagement', 'engagement', studentId, true);

    // Notes
    fieldsHtml += `
        <div class="mb-1">
            <label for="adhoc_notes_${studentId}" class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-0.5">Notes:</label>
            <textarea id="adhoc_notes_${studentId}" name="adhoc_notes_${studentId}" rows="2"
                      class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-xs border border-gray-300 rounded-md p-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"></textarea>
        </div>
    </div>`;
    return fieldsHtml;
}

// --- Class View Modal Functions ---

/** Populates the admin class selector dropdown. */
function populateAdminClassSelector() {
    console.log("Admin: Populating admin class selector...");
    if (!adminClassSelect) {
        console.warn("Admin Warning: Admin class select dropdown not found.");
        return;
    }
    if (!appState.studentsData || appState.studentsData.length === 0) {
        console.warn("Admin Warning: Student data not available for class selector.");
        adminClassSelect.innerHTML = '<option value="">No student data</option>';
        adminClassSelect.disabled = true;
        if (viewClassButton) viewClassButton.disabled = true;
        return;
    }

    // Extract unique, non-null class names
    const classNames = [...new Set(appState.studentsData
        .map(student => student.class_name)
        .filter(className => className) // Filter out null/undefined/empty strings
    )].sort(); // Sort alphabetically

    const currentValue = adminClassSelect.value;
    adminClassSelect.innerHTML = '<option value="">Select Class...</option>'; // Reset

    if (classNames.length === 0) {
        adminClassSelect.innerHTML = '<option value="">No classes found</option>';
        adminClassSelect.disabled = true;
        if (viewClassButton) viewClassButton.disabled = true;
    } else {
        classNames.forEach(className => {
            const option = document.createElement('option');
            option.value = className;
            option.textContent = className;
            adminClassSelect.appendChild(option);
        });
        adminClassSelect.disabled = false;
        // Restore previous selection if possible and enable button
        if (classNames.includes(currentValue)) {
            adminClassSelect.value = currentValue;
            if (viewClassButton) viewClassButton.disabled = false;
        } else {
            adminClassSelect.value = '';
            if (viewClassButton) viewClassButton.disabled = true;
        }
    }
    console.log("Admin: Admin class selector populated.");
}

/** Renders the student list inside the class view modal with more details. */
function _renderClassStudentList(students) {
    if (!classModalStudentList) return;
    classModalStudentList.innerHTML = ''; // Clear previous list

    if (!students || students.length === 0) {
        classModalStudentList.innerHTML = '<li class="text-center text-gray-500 dark:text-gray-400 italic py-2">No students found in this class.</li>';
        return;
    }

    students.forEach(student => {
        const li = document.createElement('li');
        li.className = 'flex flex-col sm:flex-row sm:justify-between sm:items-start py-2 px-2 border-b border-gray-200 dark:border-gray-600 last:border-b-0'; // Adjusted layout

        const isActive = student.is_active === true;
        const statusClass = isActive ? 'status-active' : 'status-inactive';
        const statusText = isActive ? 'Active' : 'Inactive';
        const groupText = getGroupSizeText(student.groupOf);
        const subGroupText = student.sub_group ? ` [${student.sub_group}]` : '';

        // Format Availability (Individual - same as before)
        let availabilityHtml = '<span class="text-gray-400 dark:text-gray-500 italic">Not set</span>';
        if (student.availability_string) {
            const parsedAvail = parseAvailability(student.availability_string);
            let formattedAvail = '';
            const daysOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
            daysOrder.forEach(day => {
                const dayLower = day.toLowerCase();
                if (parsedAvail[dayLower] && parsedAvail[dayLower].size > 0) {
                    const times = Array.from(parsedAvail[dayLower]).sort().join(', ');
                    formattedAvail += `<div class="capitalize"><span class="font-medium w-16 inline-block">${day}:</span> ${times}</div>`;
                }
            });
            if (formattedAvail) {
                availabilityHtml = `<div class="space-y-0.5">${formattedAvail}</div>`;
            }
        }

        li.innerHTML = `
            <div class="flex-grow mb-2 sm:mb-0">
                <div class="flex justify-between items-center mb-1">
                    <span class="student-name font-semibold ${!isActive ? 'line-through text-gray-500 dark:text-gray-400' : ''}">${student.Name || 'Unknown Name'}</span>
                    <span class="student-status ${statusClass} ml-2">${statusText}</span>
                </div>
                <div class="text-xs text-gray-600 dark:text-gray-400">
                    <span>${groupText}${subGroupText}</span>
                    <span class="mx-1 text-gray-300 dark:text-gray-600">|</span>
                    <span>Lessons Owed: ${student.lessons_owed || 0}</span>
                </div>
            </div>
            <div class="sm:ml-4 sm:pl-4 sm:border-l border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-300 flex-shrink-0 w-full sm:w-auto">
                <p class="font-medium text-gray-500 dark:text-gray-400 mb-0.5">Availability:</p>
                ${availabilityHtml}
                </div>
        `;
        classModalStudentList.appendChild(li);
    });
}

/** Formats the class availability string for display. */
function _formatClassAvailability(availabilityString) {
    if (!availabilityString) {
        return '<p class="italic text-gray-500 dark:text-gray-400">Availability not set for this class.</p>';
    }
    const parsedAvail = parseAvailability(availabilityString);
    let formattedHtml = '';
    const daysOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    let foundAny = false;
    daysOrder.forEach(day => {
        const dayLower = day.toLowerCase();
        if (parsedAvail[dayLower] && parsedAvail[dayLower].size > 0) {
            foundAny = true;
            const times = Array.from(parsedAvail[dayLower]).sort().join(', ');
            formattedHtml += `<div><span class="availability-day">${day}:</span> <span class="availability-times">${times}</span></div>`;
        }
    });

    if (!foundAny) {
        return '<p class="italic text-gray-500 dark:text-gray-400">No specific times found in availability string.</p>';
    }
    return formattedHtml;
}


// --- Event Handlers ---

/** Handles the submission of the admin suggestion form. */
async function handleAdminFindSuggestions(event) {
    event.preventDefault();
    console.log("Admin: Finding suggestions...");
    if (!adminCoachFilter || !adminDayFilter || !adminIncludePartial || !adminResultsArea) {
        console.error("Admin Error: Missing form elements for finding suggestions.");
        uiDisplayError("Admin form elements missing.", "general");
        return;
    }
    const coachIdFilter = adminCoachFilter.value || null;
    const dayFilter = adminDayFilter.value || null;
    const includePartial = adminIncludePartial.checked;
    adminResultsArea.innerHTML = '<p class="text-gray-500 dark:text-gray-400 italic p-2">Searching for suggestions...</p>';
    try {
        if (!appState.studentsData || appState.studentsData.length === 0) {
            console.warn("Admin Warning: Student data not available in appState for rendering suggestions.");
        }
        const suggestions = await adminFindFillInSuggestions(coachIdFilter, dayFilter, includePartial);
        if (suggestions === null) {
            throw new Error("Failed to fetch admin suggestions from the backend.");
        }
        displayAdminSuggestions(suggestions, appState.studentsData || []);
    } catch (error) {
        console.error("Admin Error finding suggestions:", error);
        adminResultsArea.innerHTML = `<p class="text-red-500 dark:text-red-400 p-2">Error finding suggestions: ${error.message}</p>`;
        uiDisplayError(`Error finding admin suggestions: ${error.message}`, "general");
    }
}


/** Handles the click on an "Apply" button for an individual suggestion using event delegation. */
async function handleApplySingleSlotSuggestion(event) {
    if (!event.target || !event.target.classList.contains('admin-apply-suggestion-btn')) {
        return;
    }
    event.stopPropagation();
    const button = event.target;
    const studentId = parseInt(button.dataset.studentId);
    const scheduleId = parseInt(button.dataset.scheduleId);
    const coachId = parseInt(button.dataset.coachId);
    if (isNaN(studentId) || isNaN(scheduleId) || isNaN(coachId)) {
        console.error("Admin Apply Error: Invalid student, schedule, or coach ID in button data.");
        uiDisplayError("Error applying suggestion: Invalid data.", "general");
        return;
    }
    console.log(`Admin Apply: Applying student ${studentId} to slot ${scheduleId} (Coach: ${coachId})`);
    button.disabled = true;
    button.textContent = 'Applying...';
    uiClearError("general");
    try {
        const result = await addDailyStatus(studentId, coachId, scheduleId, 'assigned_fill_in');
        if (result && result.success) {
            console.log(`Admin Apply: Successfully applied fill-in.`);
            button.textContent = 'Applied';
            button.classList.remove('bg-emerald-500', 'hover:bg-emerald-600');
            button.classList.add('bg-gray-400', 'dark:bg-gray-500', 'cursor-not-allowed');
            // Refresh schedule only if the change affects the currently viewed coach
            if (appState.currentCoachId === coachId) {
                 console.log("Admin Apply: Refreshing current coach schedule...");
                 await refreshCurrentCoachSchedule();
            }
        } else {
            throw new Error(result?.message || "API call failed.");
        }
    } catch (error) {
        console.error("Admin Apply Error:", error);
        uiDisplayError(`Failed to apply suggestion: ${error.message}`, "general");
        button.disabled = false;
        button.textContent = 'Apply';
    }
}

/** Handles the submission of the create daily block form. */
async function handleCreateDailyBlockSubmit(event) {
    event.preventDefault();
    console.log("Admin: Handling Create Daily Block submission...");
    if (!createBlockForm || !blockDateInput || !blockTypeSelect || !blockIdentifierInput || !blockReasonInput || !createBlockSubmitBtn || !createBlockStatusP) {
        console.error("Admin Error: Daily block form elements not found.");
        uiDisplayError("Form error. Please refresh.", "general");
        return;
    }
    const blockDate = blockDateInput.value;
    const blockType = blockTypeSelect.value;
    const identifier = blockIdentifierInput.value.trim() || null;
    const reason = blockReasonInput.value.trim() || null;
    if (!blockDate || !blockType) {
        createBlockStatusP.textContent = "Error: Date and Type are required.";
        createBlockStatusP.className = 'text-xs text-red-500 dark:text-red-400';
        return;
    }
    if (['Year Level Absence', 'Class Absence', 'Coach Unavailable'].includes(blockType) && !identifier) {
        createBlockStatusP.textContent = `Error: Identifier is required for type '${blockType}'.`;
        createBlockStatusP.className = 'text-xs text-red-500 dark:text-red-400';
        return;
    }
     if (blockType === 'Coach Unavailable' && (identifier === null || isNaN(parseInt(identifier)))) {
        createBlockStatusP.textContent = `Error: Coach ID (number) required for 'Coach Unavailable'.`;
        createBlockStatusP.className = 'text-xs text-red-500 dark:text-red-400';
        return;
     }
    createBlockSubmitBtn.disabled = true;
    createBlockSubmitBtn.textContent = 'Creating...';
    createBlockStatusP.textContent = 'Processing...';
    createBlockStatusP.className = 'text-xs text-gray-500 dark:text-gray-400';
    try {
        const result = await createDailyBlock(blockDate, blockType, identifier, reason);
        if (result.success) {
            createBlockStatusP.textContent = "Block created successfully!";
            createBlockStatusP.className = 'text-xs text-green-600 dark:text-green-400';
            createBlockForm.reset();
            console.log("Admin: Daily block created.");
            if (appState.currentCoachId && (blockType !== 'Coach Unavailable' || parseInt(identifier) === appState.currentCoachId)) {
                console.log("Admin: Refreshing current coach view to update schedule/missed logs...");
                await refreshCurrentCoachSchedule();
            }
            setTimeout(() => {
                if (createBlockStatusP.textContent === "Block created successfully!") {
                     createBlockStatusP.textContent = "";
                }
            }, 4000);
        } else {
            throw new Error(result.message || "Failed to create block.");
        }
    } catch (error) {
        console.error("Admin Error creating daily block:", error);
        createBlockStatusP.textContent = `Error: ${error.message}`;
        createBlockStatusP.className = 'text-xs text-red-500 dark:text-red-400';
    } finally {
        createBlockSubmitBtn.disabled = false;
        createBlockSubmitBtn.textContent = 'Create Block';
    }
}

/** Handles clicks on the 'Enable/Disable Roster Editing' button. */
async function handleToggleEditMode() {
    if (!appState || !toggleEditModeButton || !refreshCurrentCoachSchedule) {
        console.error("Edit Mode Error: appState, button, or refresh function not available.");
        return;
    }
    appState.toggleEditMode(); // Update the state flag

    if (appState.isEditMode) {
        toggleEditModeButton.textContent = 'Disable Roster Editing';
        toggleEditModeButton.classList.remove('bg-amber-500', 'hover:bg-amber-600');
        toggleEditModeButton.classList.add('bg-red-500', 'hover:bg-red-600');
    } else {
        toggleEditModeButton.textContent = 'Enable Roster Editing';
        toggleEditModeButton.classList.remove('bg-red-500', 'hover:bg-red-600');
        toggleEditModeButton.classList.add('bg-amber-500', 'hover:bg-amber-600');
    }

    console.log("Edit Mode: Refreshing schedule display...");
    await refreshCurrentCoachSchedule();
    console.log("Edit Mode: Schedule display refreshed.");
}

/** Handles input changes in the student filter field. */
function handleStudentFilterInput() {
    populateStudentStatusList(); // Re-render the list with the filter applied
}

/** Handles clicks on the Activate/Deactivate buttons in the student list. */
async function handleToggleStudentStatus(event) {
    const button = event.target.closest('button.toggle-student-status-btn'); // Target only status buttons
    if (!button || !adminStudentStatusListContainer.contains(button) || typeof button.dataset.studentId === 'undefined') {
        return;
    }

    const studentId = parseInt(button.dataset.studentId);
    const currentIsActive = button.dataset.isActive === 'true'; // Get status from button data
    const newStatus = !currentIsActive; // Determine the new status

    if (isNaN(studentId)) {
        console.error("Admin: Invalid student ID on status toggle button.");
        return;
    }

    console.log(`Admin: Toggling status for student ${studentId} to ${newStatus ? 'Active' : 'Inactive'}`);
    button.disabled = true;
    button.textContent = '...';
    if(adminStudentStatusError) adminStudentStatusError.classList.add('hidden');

    try {
        const result = await setStudentActiveStatus(studentId, newStatus);
        if (result.success) {
            console.log(`Admin: Successfully updated status for student ${studentId}.`);
            // Update the student data in the central appState
            const studentIndex = appState.studentsData.findIndex(s => s.id === studentId);
            if (studentIndex > -1) {
                appState.studentsData[studentIndex].is_active = newStatus;
            } else {
                 console.warn(`Admin: Student ID ${studentId} not found in appState after status update.`);
            }
            // Update the button directly
            button.dataset.isActive = newStatus;
            button.textContent = newStatus ? 'Deactivate' : 'Activate';
            button.className = `toggle-student-status-btn text-xs font-semibold py-0.5 px-2 rounded focus:outline-none focus:ring-1 focus:ring-offset-1 dark:focus:ring-offset-gray-800 transition-colors duration-150 ${newStatus ? 'bg-red-500 hover:bg-red-700 text-white focus:ring-red-600' : 'bg-green-500 hover:bg-green-700 text-white focus:ring-green-600'}`;

            // Update the name styling
            const nameSpan = button.closest('li')?.querySelector('span');
            if (nameSpan) {
                nameSpan.className = `text-sm ${newStatus ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 line-through'}`;
            }
        } else {
            throw new Error(result.message || "API call failed.");
        }
    } catch (error) {
        console.error("Admin Error toggling student status:", error);
        if(adminStudentStatusError) {
            adminStudentStatusError.textContent = `Error: ${error.message}`;
            adminStudentStatusError.classList.remove('hidden');
        }
        button.textContent = currentIsActive ? 'Deactivate' : 'Activate';
        button.className = `toggle-student-status-btn text-xs font-semibold py-0.5 px-2 rounded focus:outline-none focus:ring-1 focus:ring-offset-1 dark:focus:ring-offset-gray-800 transition-colors duration-150 ${currentIsActive ? 'bg-red-500 hover:bg-red-700 text-white focus:ring-red-600' : 'bg-green-500 hover:bg-green-700 text-white focus:ring-green-600'}`;
    } finally {
        button.disabled = false;
    }
}

/** Handles clicks within the student status list container (delegated). */
function handleStudentListClick(event) {
    const viewButton = event.target.closest('button.view-student-details-btn');
    const statusButton = event.target.closest('button.toggle-student-status-btn');

    if (viewButton) {
        const studentId = parseInt(viewButton.dataset.studentId);
        if (!isNaN(studentId)) {
            console.log(`Admin: View Details clicked for student ID ${studentId}.`);
            openStudentProfileModal(studentId); // <<< Call the imported function
        }
    } else if (statusButton) {
        handleToggleStudentStatus(event); // Pass the original event
    }
}


/** Handles student search input for the ad-hoc log form. */
function handleAdhocStudentSearchInput() {
    if (!adhocLogStudentSearchInput || !adhocLogStudentSearchResultsDiv || !adhocLogStudentErrorP || !appState.studentsData) return;

    const searchTerm = adhocLogStudentSearchInput.value.trim().toLowerCase();
    adhocLogStudentSearchResultsDiv.innerHTML = '';
    adhocLogStudentErrorP.classList.add('hidden');

    if (searchTerm.length < 2) {
        adhocLogStudentSearchResultsDiv.innerHTML = '<p class="text-xs text-gray-500 dark:text-gray-400 italic">Enter at least 2 characters.</p>';
        return;
    }

    const lessonType = adhocLogLessonTypeSelect.value;
    let maxStudents = 3; // Default for Group
    if (lessonType === 'Solo') maxStudents = 1;
    else if (lessonType === 'Paired') maxStudents = 2;

    if (adhocSelectedStudents.length >= maxStudents) {
        adhocLogStudentErrorP.textContent = `Cannot add more students for '${lessonType}' type (Max: ${maxStudents}).`;
        adhocLogStudentErrorP.classList.remove('hidden');
        return;
    }

    const filteredStudents = appState.studentsData.filter(student => {
        if (student.is_active !== true) return false; // Only active students
        if (!student.Name || !student.Name.toLowerCase().includes(searchTerm)) return false;
        if (adhocSelectedStudents.some(s => s.id === student.id)) return false; // Not already selected
        return true;
    });

    if (filteredStudents.length === 0) {
        adhocLogStudentSearchResultsDiv.innerHTML = '<p class="text-xs text-gray-500 dark:text-gray-400 italic">No matching active students found.</p>';
    } else {
        const list = document.createElement('ul');
        filteredStudents.slice(0, 10).forEach(student => {
            const li = document.createElement('li');
            const details = getStudentDetails(student.id, appState.studentsData);
            li.innerHTML = `
                <span class="text-gray-800 dark:text-gray-200">${details?.Name || 'Unknown'} (${details?.class_name || 'N/A'})</span>
                <button type="button" data-student-id="${student.id}" class="add-adhoc-student-btn">Add</button>
            `;
            list.appendChild(li);
        });
        adhocLogStudentSearchResultsDiv.appendChild(list);
    }
}

/** Handles adding a student to the ad-hoc selected list and rendering their log fields. */
function handleAddAdhocStudent(event) {
    if (!event.target.classList.contains('add-adhoc-student-btn')) return;
    const studentId = parseInt(event.target.dataset.studentId);
    if (isNaN(studentId)) return;

    const studentDetails = getStudentDetails(studentId, appState.studentsData);
    if (!studentDetails || adhocSelectedStudents.some(s => s.id === studentId)) return; // Already added

    const lessonType = adhocLogLessonTypeSelect.value;
    let maxStudents = 3;
    if (lessonType === 'Solo' && adhocSelectedStudents.length >= 1) {
        adhocLogStudentErrorP.textContent = "Solo lessons can only have 1 student.";
        adhocLogStudentErrorP.classList.remove('hidden');
        return;
    }
    if (lessonType === 'Paired' && adhocSelectedStudents.length >= 2) {
        adhocLogStudentErrorP.textContent = "Paired lessons can only have up to 2 students.";
        adhocLogStudentErrorP.classList.remove('hidden');
        return;
    }
     if (lessonType === 'Group' && adhocSelectedStudents.length >= 3) { // Assuming max 3 for group
        adhocLogStudentErrorP.textContent = "Group lessons can only have up to 3 students.";
        adhocLogStudentErrorP.classList.remove('hidden');
        return;
    }
    adhocLogStudentErrorP.classList.add('hidden');


    adhocSelectedStudents.push({ id: studentId, name: studentDetails.Name });

    // Add to selected list UI
    const listItem = document.createElement('li');
    listItem.dataset.studentId = studentId;
    listItem.innerHTML = `
        ${studentDetails.Name}
        <button type="button" class="remove-adhoc-student-btn" data-student-id="${studentId}">&times;</button>
    `;
    adhocLogSelectedStudentsListUl.appendChild(listItem);

    // Render log fields for this student
    adhocLogFieldsContainerDiv.insertAdjacentHTML('beforeend', _renderAdhocStudentLogFields(studentId));

    adhocLogStudentSearchInput.value = '';
    adhocLogStudentSearchResultsDiv.innerHTML = '';
}

/** Handles removing a student from the ad-hoc selected list and their log fields. */
function handleRemoveAdhocStudent(event) {
    if (!event.target.classList.contains('remove-adhoc-student-btn')) return;
    const studentId = parseInt(event.target.dataset.studentId);
    if (isNaN(studentId)) return;

    adhocSelectedStudents = adhocSelectedStudents.filter(s => s.id !== studentId);

    // Remove from selected list UI
    event.target.closest('li').remove();

    // Remove log fields for this student
    const fieldsSection = adhocLogFieldsContainerDiv.querySelector(`#adhoc-student-log-fields-${studentId}`);
    if (fieldsSection) fieldsSection.remove();
    adhocLogStudentErrorP.classList.add('hidden'); // Clear error on removal
}

/** Handles changes to the ad-hoc lesson type select (enforces student limits). */
function handleAdhocLessonTypeChange() {
    const lessonType = adhocLogLessonTypeSelect.value;
    let maxStudents = 3;
    if (lessonType === 'Solo') maxStudents = 1;
    else if (lessonType === 'Paired') maxStudents = 2;

    if (adhocSelectedStudents.length > maxStudents) {
        adhocLogStudentErrorP.textContent = `Too many students for '${lessonType}'. Please remove ${adhocSelectedStudents.length - maxStudents} student(s).`;
        adhocLogStudentErrorP.classList.remove('hidden');
        adhocLogSubmitBtn.disabled = true;
    } else {
        adhocLogStudentErrorP.classList.add('hidden');
        adhocLogSubmitBtn.disabled = false;
    }
    // Disable search if max students reached
    adhocLogStudentSearchInput.disabled = adhocSelectedStudents.length >= maxStudents;
}


/** Handles submission of the ad-hoc past log form. */
async function handleAdhocPastLogSubmit(event) {
    event.preventDefault();
    if (!adhocPastLogForm || !adhocLogStatusP || !adhocLogSubmitBtn) return;

    adhocLogSubmitBtn.disabled = true;
    adhocLogStatusP.textContent = 'Submitting...';
    adhocLogStatusP.className = 'text-xs text-gray-500 dark:text-gray-400 ml-3';

    const formData = new FormData(adhocPastLogForm);
    const logDate = formData.get('adhoc-log-date');
    const logTime = formData.get('adhoc-log-time');
    const coachId = parseInt(formData.get('adhoc-log-coach'));
    const lessonType = formData.get('adhoc-log-lesson-type'); // e.g., "Solo", "Paired", "Group"

    if (!logDate || !logTime || isNaN(coachId) || !lessonType || adhocSelectedStudents.length === 0) {
        adhocLogStatusP.textContent = 'Error: Date, Time, Coach, Lesson Type, and at least one Student are required.';
        adhocLogStatusP.className = 'text-xs text-red-500 dark:text-red-400 ml-3';
        adhocLogSubmitBtn.disabled = false;
        return;
    }

    const logEntries = [];
    let formIsValid = true;

    for (const student of adhocSelectedStudents) {
        const studentId = student.id;
        const skillsCheckboxes = adhocPastLogForm.querySelectorAll(`input[name="adhoc_skills_${studentId}"]:checked`);
        const skillsCovered = Array.from(skillsCheckboxes).map(cb => cb.value);
        const proficiencyRadio = adhocPastLogForm.querySelector(`input[name="adhoc_proficiency_${studentId}"]:checked`);
        const engagementRadio = adhocPastLogForm.querySelector(`input[name="adhoc_engagement_${studentId}"]:checked`);
        const notesTextarea = adhocPastLogForm.querySelector(`#adhoc_notes_${studentId}`);

        if (!proficiencyRadio || !engagementRadio) {
            formIsValid = false;
            adhocLogStatusP.textContent = `Error: Proficiency and Engagement ratings required for ${student.name}.`;
            break;
        }

        logEntries.push({
            student_id: studentId,
            coach_id: coachId,
            log_date: `${logDate} ${logTime}:00`, // Combine date and time for timestamp
            lesson_schedule_id: null, // Explicitly null for ad-hoc
            lesson_type: lessonType,
            skills_covered: skillsCovered.length > 0 ? skillsCovered : null,
            proficiency: parseInt(proficiencyRadio.value),
            engagement: parseInt(engagementRadio.value),
            notes: notesTextarea ? notesTextarea.value.trim() : null,
            attendance_status: 'Present', // Ad-hoc entries are assumed present
            owed_change: 0, // Typically 0 for ad-hoc, unless specific logic needed
            is_fill_in: false // Not a fill-in for a pre-existing slot
        });
    }

    if (!formIsValid) {
        adhocLogStatusP.className = 'text-xs text-red-500 dark:text-red-400 ml-3';
        adhocLogSubmitBtn.disabled = false;
        return;
    }

    console.log("Admin (Adhoc): Submitting ad-hoc log payload:", logEntries);

    try {
        const result = await submitLogAndUpdates(logEntries);

        if (result.success) {
            adhocLogStatusP.textContent = 'Ad-hoc session logged successfully!';
            adhocLogStatusP.className = 'text-xs text-green-600 dark:text-green-400 ml-3';
            adhocPastLogForm.reset();
            adhocSelectedStudents = [];
            adhocLogSelectedStudentsListUl.innerHTML = '';
            adhocLogFieldsContainerDiv.innerHTML = '';
            setTimeout(() => { adhocLogStatusP.textContent = ''; }, 5000);
        } else {
            throw new Error(result.message || "Failed to log ad-hoc session.");
        }
    } catch (error) {
        console.error("Admin (Adhoc) Error submitting log:", error);
        adhocLogStatusP.textContent = `Error: ${error.message}`;
        adhocLogStatusP.className = 'text-xs text-red-500 dark:text-red-400 ml-3';
    } finally {
        adhocLogSubmitBtn.disabled = false;
    }
}


/** Handles changes on the admin class selector dropdown. */
function handleAdminClassSelectChange() {
    if (adminClassSelect && viewClassButton) {
        viewClassButton.disabled = !adminClassSelect.value; // Enable button only if a class is selected
    }
}

/** Opens and populates the class view modal. */
function openClassViewModal() {
    // Check for required elements
    if (!adminClassSelect || !classViewModal || !classModalName || !classModalStudentList || !classModalLoadingIndicator || !classModalErrorMessage || !classModalAvailabilityDisplay) {
        console.error("Admin Error (openClassViewModal): Required modal elements not found.");
        return;
    }

    const selectedClassName = adminClassSelect.value;
    if (!selectedClassName) {
        console.warn("Admin (openClassViewModal): No class selected.");
        if (adminClassSelectError) {
            adminClassSelectError.textContent = "Please select a class first.";
            adminClassSelectError.classList.remove('hidden');
        }
        return;
    }
    if (adminClassSelectError) adminClassSelectError.classList.add('hidden'); // Clear error

    console.log(`Admin: Opening class view modal for class: ${selectedClassName}`);

    // Clear previous content and show loading
    classModalName.textContent = `Class Roster: ${selectedClassName}`;
    classModalStudentList.innerHTML = '';
    classModalAvailabilityDisplay.innerHTML = '<p class="italic text-gray-500 dark:text-gray-400">Loading availability...</p>'; // Clear availability
    classModalErrorMessage.classList.add('hidden');
    classModalLoadingIndicator.classList.remove('hidden');

    // Make modal visible
    classViewModal.style.display = 'block';
    requestAnimationFrame(() => {
        classViewModal.classList.add('is-open');
    });
    document.body.style.overflow = 'hidden'; // Prevent background scrolling

    try {
        // Filter students (assuming appState.studentsData is up-to-date)
        const studentsInClass = appState.studentsData
            .filter(student => student.class_name === selectedClassName)
            .sort((a, b) => (a.Name || '').localeCompare(b.Name || '')); // Sort by name

        // --- Populate Class Availability ---
        let classAvailabilityString = null;
        console.log(`Admin (Class View): Found ${studentsInClass.length} students in class ${selectedClassName}.`); // Log student count

        if (studentsInClass.length > 0) {
            // Find the first student with an availability string
            const firstStudentWithAvail = studentsInClass.find(s => s.availability_string);
            console.log(`Admin (Class View): First student with availability_string:`, firstStudentWithAvail); // Log the found student object

            if (firstStudentWithAvail && firstStudentWithAvail.availability_string) { // Check if the string itself exists and is not empty
                classAvailabilityString = firstStudentWithAvail.availability_string;
                console.log(`Admin (Class View): Using availability string: "${classAvailabilityString}"`); // Log the string being used
                // Optional: Check if all students have the same availability
                const allSame = studentsInClass.every(s => s.availability_string === classAvailabilityString);
                if (!allSame) {
                    console.warn(`Admin (Class View): Students in class ${selectedClassName} have differing availability strings. Displaying the first one found.`);
                    // Optionally display a warning in the UI
                }
            } else {
                 console.log(`Admin (Class View): No student found with a non-empty availability_string.`);
            }
        } else {
             console.log(`Admin (Class View): No students found in class, cannot determine availability.`);
        }

        // Format and display the availability
        const formattedHtml = _formatClassAvailability(classAvailabilityString);
        console.log(`Admin (Class View): Formatted availability HTML:`, formattedHtml); // Log the generated HTML

        if (classModalAvailabilityDisplay) {
             classModalAvailabilityDisplay.innerHTML = formattedHtml; // <<< This line updates the display
             console.log(`Admin (Class View): Updated classModalAvailabilityDisplay innerHTML.`); // Confirm update
        } else {
             console.error(`Admin (Class View): classModalAvailabilityDisplay element is null or undefined! Cannot update availability.`);
        }
        // --- End Populate Class Availability ---

        _renderClassStudentList(studentsInClass); // Render the student list

    } catch (error) {
        console.error(`Admin Error populating class modal for ${selectedClassName}:`, error);
        classModalErrorMessage.textContent = `Error loading class details: ${error.message}`;
        classModalErrorMessage.classList.remove('hidden');
        classModalAvailabilityDisplay.innerHTML = '<p class="italic text-red-500 dark:text-red-400">Error loading availability.</p>'; // Show error in availability
    } finally {
        classModalLoadingIndicator.classList.add('hidden'); // Hide loading indicator
    }
}

/** Closes the class view modal. */
function closeClassViewModal() {
    if (!classViewModal) return;
    console.log("Admin: Closing class view modal.");
    classViewModal.classList.remove('is-open');
    // Use setTimeout to allow fade-out transition before hiding
    setTimeout(() => {
        classViewModal.style.display = 'none';
        // Clear content
        if (classModalName) classModalName.textContent = 'Class Roster';
        if (classModalStudentList) classModalStudentList.innerHTML = '';
        // --- Clear Availability Section ---
        if (classModalAvailabilityDisplay) classModalAvailabilityDisplay.innerHTML = '';
        if (classModalAvailabilityEdit) classModalAvailabilityEdit.classList.add('hidden'); // Hide edit area
        if (editClassAvailabilityBtn) editClassAvailabilityBtn.classList.add('hidden'); // Hide edit button
        if (classModalAvailabilityError) classModalAvailabilityError.classList.add('hidden'); // Hide errors
        // --- END Clear ---
        if (classModalErrorMessage) classModalErrorMessage.classList.add('hidden');
    }, 300); // Match CSS transition duration
    document.body.style.overflow = ''; // Restore background scrolling
}


// --- Initialization ---

/** Initializes event listeners for the admin controls. (Exported) */
export function initAdminControls() {
    console.log("Admin: Initializing controls...");
    // Get references to suggestion form elements
    adminFindFillinsForm = document.getElementById('admin-find-fillins-form');
    adminCoachFilter = document.getElementById('admin-coach-filter');
    adminDayFilter = document.getElementById('admin-day-filter');
    adminIncludePartial = document.getElementById('admin-include-partial');
    adminResultsArea = document.getElementById('admin-results-area');

    // Get references to block form elements
    createBlockForm = document.getElementById('create-daily-block-form');
    blockDateInput = document.getElementById('block-date');
    blockTypeSelect = document.getElementById('block-type');
    blockIdentifierInput = document.getElementById('block-identifier');
    blockReasonInput = document.getElementById('block-reason');
    createBlockSubmitBtn = document.getElementById('create-block-submit-btn');
    createBlockStatusP = document.getElementById('create-block-status');

    // Get reference to Edit Mode Button
    toggleEditModeButton = document.getElementById('toggle-edit-mode-button');

    // Get references for Student Status UI
    adminStudentFilterInput = document.getElementById('admin-student-filter');
    adminStudentStatusListContainer = document.getElementById('admin-student-status-list-container');
    adminStudentStatusList = document.getElementById('admin-student-status-list');
    adminStudentStatusError = document.getElementById('admin-student-status-error');

    // Get references for Ad-hoc Past Log Form
    adhocPastLogForm = document.getElementById('adhoc-past-log-form');
    adhocLogDateInput = document.getElementById('adhoc-log-date');
    adhocLogTimeInput = document.getElementById('adhoc-log-time');
    adhocLogCoachSelect = document.getElementById('adhoc-log-coach');
    adhocLogLessonTypeSelect = document.getElementById('adhoc-log-lesson-type');
    adhocLogStudentSearchInput = document.getElementById('adhoc-log-student-search');
    adhocLogStudentSearchResultsDiv = document.getElementById('adhoc-log-student-search-results');
    adhocLogSelectedStudentsListUl = document.getElementById('adhoc-log-selected-students-list');
    adhocLogStudentErrorP = document.getElementById('adhoc-log-student-error');
    adhocLogFieldsContainerDiv = document.getElementById('adhoc-log-fields-container');
    adhocLogSubmitBtn = document.getElementById('adhoc-log-submit-btn');
    adhocLogStatusP = document.getElementById('adhoc-log-status');

    // --- Get references for Class View elements ---
    adminClassSelect = document.getElementById('admin-class-select');
    viewClassButton = document.getElementById('view-class-button');
    adminClassSelectError = document.getElementById('admin-class-select-error');
    classViewModal = document.getElementById('class-view-modal');
    classModalCloseButton = document.getElementById('class-modal-close-button');
    classModalName = document.getElementById('class-modal-name');
    classModalStudentList = document.getElementById('class-modal-student-list');
    classModalLoadingIndicator = document.getElementById('class-modal-loading-indicator');
    classModalErrorMessage = document.getElementById('class-modal-error-message');
    // --- Get references for Class Availability elements ---
    classModalAvailabilityDisplay = document.getElementById('class-modal-availability-display');
    editClassAvailabilityBtn = document.getElementById('edit-class-availability-btn');
    classModalAvailabilityEdit = document.getElementById('class-modal-availability-edit');
    classModalAvailabilityTextarea = document.getElementById('class-modal-availability-textarea');
    cancelClassAvailabilityBtn = document.getElementById('cancel-class-availability-btn');
    saveClassAvailabilityBtn = document.getElementById('save-class-availability-btn');
    classModalAvailabilityError = document.getElementById('class-modal-availability-error');


    if (adminFindFillinsForm) {
        console.log("Admin: Found admin suggestions form, attaching submit listener.");
        adminFindFillinsForm.removeEventListener('submit', handleAdminFindSuggestions);
        adminFindFillinsForm.addEventListener('submit', handleAdminFindSuggestions);
    } else {
        console.warn("Admin Init Warning: Admin suggestions form not found.");
    }

    if (adminResultsArea) {
        console.log("Admin: Attaching delegated listener to results area for apply buttons.");
        adminResultsArea.removeEventListener('click', handleApplySingleSlotSuggestion);
        adminResultsArea.addEventListener('click', handleApplySingleSlotSuggestion);
    } else {
        console.warn("Admin Init Warning: Admin results area not found.");
    }

    if (createBlockForm) {
        console.log("Admin: Found create block form, attaching submit listener.");
        createBlockForm.removeEventListener('submit', handleCreateDailyBlockSubmit);
        createBlockForm.addEventListener('submit', handleCreateDailyBlockSubmit);
    } else {
         console.warn("Admin Init Warning: Create daily block form not found.");
    }

    if (toggleEditModeButton) {
        console.log("Admin: Found edit mode toggle button, attaching click listener.");
        toggleEditModeButton.removeEventListener('click', handleToggleEditMode);
        toggleEditModeButton.addEventListener('click', handleToggleEditMode);
    } else {
        console.warn("Admin Init Warning: Edit mode toggle button not found.");
    }

    // Initialize Student Status Management
    if (adminStudentFilterInput && adminStudentStatusListContainer && adminStudentStatusList) {
        console.log("Admin: Initializing student status management listeners.");
        if (appState.studentsData && appState.studentsData.length > 0) {
            populateStudentStatusList();
        } else {
            console.log("Admin: Student data not yet available for initial status list population.");
        }
        adminStudentFilterInput.removeEventListener('input', handleStudentFilterInput);
        adminStudentFilterInput.addEventListener('input', handleStudentFilterInput);

        // Use the new handleStudentListClick for delegated events
        adminStudentStatusListContainer.removeEventListener('click', handleStudentListClick);
        adminStudentStatusListContainer.addEventListener('click', handleStudentListClick);

    } else {
        console.warn("Admin Init Warning: Student status management UI elements not found.");
    }

    // Initialize Ad-hoc Past Log Form
    if (adhocPastLogForm) {
        console.log("Admin: Initializing Ad-hoc Past Log form listeners.");
        if (appState.coachesData && appState.coachesData.length > 0) {
            populateAdhocCoachSelector(appState.coachesData);
        } else {
            console.log("Admin (Adhoc): Coach data not yet available for adhoc coach selector.");
        }
        adhocPastLogForm.addEventListener('submit', handleAdhocPastLogSubmit);
        adhocLogStudentSearchInput.addEventListener('input', handleAdhocStudentSearchInput);
        adhocLogStudentSearchResultsDiv.addEventListener('click', handleAddAdhocStudent);
        adhocLogSelectedStudentsListUl.addEventListener('click', handleRemoveAdhocStudent);
        adhocLogLessonTypeSelect.addEventListener('change', handleAdhocLessonTypeChange);
    } else {
        console.warn("Admin Init Warning: Ad-hoc past log form not found.");
    }

    // --- Initialize Class View listeners ---
    if (adminClassSelect && viewClassButton && classModalCloseButton) {
        console.log("Admin: Initializing Class View listeners.");
        // Populate dropdown (assuming student data might be ready, or will be populated later)
        populateAdminClassSelector();
        // Listener for dropdown change
        adminClassSelect.removeEventListener('change', handleAdminClassSelectChange);
        adminClassSelect.addEventListener('change', handleAdminClassSelectChange);
        // Listener for view button
        viewClassButton.removeEventListener('click', openClassViewModal);
        viewClassButton.addEventListener('click', openClassViewModal);
        // Listener for modal close button
        classModalCloseButton.removeEventListener('click', closeClassViewModal);
        classModalCloseButton.addEventListener('click', closeClassViewModal);
        // Add listeners for Edit/Save/Cancel availability later
    } else {
        console.warn("Admin Init Warning: Class View UI elements not found.");
    }


    console.log("Admin: Controls initialized.");
    isReady = true; // Mark admin module as ready
}

// Export ready flag and necessary functions
export let isReady = false; // Initialize as false

console.log("Admin module (admin.js) loaded.");