// js/studentProfile.js
// Handles the student profile modal: display, data population, and interaction.
// v12: Added logging to verify close button element and direct listener attachment.

// --- Import Dependencies ---
import { appState } from './state.js';
import { getStudentDetails, getGroupSizeText, parseAvailability } from './utils.js';
import { fetchStudentLogHistory } from './api.js';

// --- Module Variables ---
let studentProfileModal = null;
let modalContentArea = null;
let modalStudentName = null;
let modalStudentInfo = null;
let modalLessonHistory = null;
let modalCloseButton = null;
let modalLoadingIndicator = null;
let modalErrorMessage = null;

const TRANSITION_DURATION = 300; // ms, should match CSS transition duration

/**
 * Initializes the student profile module by getting DOM elements and setting up listeners.
 */
export function initStudentProfile() {
    studentProfileModal = document.getElementById('student-profile-modal');
    modalContentArea = document.getElementById('modal-content-area');
    modalStudentName = document.getElementById('modal-student-name');
    modalStudentInfo = document.getElementById('modal-student-info');
    modalLessonHistory = document.getElementById('modal-lesson-history');
    modalCloseButton = document.getElementById('modal-close-button');
    modalLoadingIndicator = document.getElementById('modal-loading-indicator');
    modalErrorMessage = document.getElementById('modal-error-message');

    if (!studentProfileModal || !modalContentArea || !modalStudentName || !modalStudentInfo || !modalLessonHistory || !modalCloseButton || !modalLoadingIndicator || !modalErrorMessage) {
        console.error("StudentProfile Error: One or more modal elements not found in the DOM.");
        isReady = false;
        return;
    }

    // --- DEBUG: Verify the button element ---
    console.log("StudentProfile DEBUG: Found modalCloseButton element:", modalCloseButton);
    if (!modalCloseButton || modalCloseButton.tagName !== 'BUTTON') {
         console.error("StudentProfile DEBUG ERROR: modalCloseButton is not a BUTTON element or not found!");
    }
    // --- END DEBUG ---

    // --- Attach listener directly ---
    if (modalCloseButton) {
        // Remove any previous listeners just in case
        // Note: If the previous listener used a different function reference, this won't remove it.
        // It's generally better to use named functions and remove them specifically if needed.
        // For debugging, we'll just add the new one.
        modalCloseButton.addEventListener('click', () => {
            console.log("DEBUG: Close button event listener fired! (Direct attachment)"); // <<< UPDATED LOG
            closeStudentProfileModal();
        });
        console.log("StudentProfile: Close button listener attached (Directly).");
    } else {
         console.error("StudentProfile: Cannot attach listener, modalCloseButton not found.");
    }
    // --- END Attach listener directly ---


    // Ensure modal is initially hidden via JS
    studentProfileModal.style.display = 'none';

    console.log("Student Profile module initialized.");
    isReady = true;
}

/**
 * (Internal) Formats a log date string (timestamp) to "DD/MM/YYYY HH:MM".
 */
function _formatModalLogDateTime(logDateStr) {
    if (!logDateStr) return "N/A";
    try {
        const dateObj = new Date(logDateStr);
        if (isNaN(dateObj.getTime())) return "Invalid Date";
        const day = dateObj.getDate().toString().padStart(2, '0');
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const year = dateObj.getFullYear();
        const hours = dateObj.getHours().toString().padStart(2, '0');
        const minutes = dateObj.getMinutes().toString().padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (e) {
        console.error("Error formatting log date for modal:", logDateStr, e);
        return "Invalid Date";
    }
}

/**
 * (Internal) Parses the skills_covered string (PostgreSQL array format) into a readable string.
 */
function _parseModalSkillsCovered(skillsString) {
    if (!skillsString || typeof skillsString !== 'string') {
        return 'N/A';
    }
    if (skillsString.startsWith('{') && skillsString.endsWith('}')) {
        try {
            let cleanedString = skillsString.substring(1, skillsString.length - 1);
            const skillsArray = cleanedString.split('","').map(skill => {
                if (skill.startsWith('"')) skill = skill.substring(1);
                if (skill.endsWith('"')) skill = skill.substring(0, skill.length - 1);
                return skill.trim();
            });
            return skillsArray.join(', ') || 'N/A';
        } catch (e) {
            console.error("Error parsing skills_covered string for modal:", skillsString, e);
            return skillsString;
        }
    }
    return skillsString;
}

/**
 * (Internal) Renders the student's lesson history into the modal.
 */
function _renderStudentHistory(logs) {
    if (!modalLessonHistory) return;

    if (!logs || logs.length === 0) {
        modalLessonHistory.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 italic p-3">No lesson history found for this student.</p>';
        return;
    }

    const list = document.createElement('ul');
    list.className = 'space-y-3';

    logs.forEach(log => {
        const listItem = document.createElement('li');
        listItem.className = 'p-3 border rounded-md bg-gray-50 dark:bg-gray-700/60 dark:border-gray-600 shadow-sm hover:shadow transition-shadow duration-150';

        const coachName = log.coaches?.Name || 'Unknown Coach';
        const formattedLogDate = _formatModalLogDateTime(log.log_date);
        const lessonDay = log.lesson_schedule?.day_of_week || (log.lesson_type ? 'Ad-hoc' : 'N/A');
        const lessonTime = log.lesson_schedule?.start_time?.substring(0,5) || (log.log_date ? log.log_date.substring(11,16) : 'N/A');

        let statusText = log.attendance_status || 'Logged';
        let statusColorClass = 'text-gray-700 dark:text-gray-300';
        let statusBgColorClass = 'bg-gray-100 dark:bg-gray-600';
        if (statusText === 'Present') {
            statusColorClass = 'text-green-800 dark:text-green-200 font-medium';
            statusBgColorClass = 'bg-green-100 dark:bg-green-900/40';
        } else if (statusText === 'Absent') {
            statusColorClass = 'text-red-800 dark:text-red-200 font-medium';
            statusBgColorClass = 'bg-red-100 dark:bg-red-900/40';
        }
        if (log.absence_reason) statusText += ` (${log.absence_reason})`;
        if (log.is_fill_in) {
            statusText = `Fill-in: ${statusText}`;
            statusColorClass = 'text-emerald-800 dark:text-emerald-200 font-medium';
            statusBgColorClass = 'bg-emerald-100 dark:bg-emerald-900/40';
        }

        const notes = log.notes ? log.notes.replace(/</g, "&lt;").replace(/>/g, "&gt;") : null;
        const skillsCoveredDisplay = _parseModalSkillsCovered(log.skills_covered);

        listItem.innerHTML = `
            <div class="flex justify-between items-start mb-2 pb-2 border-b border-gray-200 dark:border-gray-500/50">
                <div>
                    <p class="font-semibold text-gray-800 dark:text-gray-100 text-base">${formattedLogDate}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">${lessonDay} at ${lessonTime} (Coach: ${coachName})</p>
                </div>
                <span class="text-xs px-2 py-0.5 rounded-full ${statusColorClass} ${statusBgColorClass}">${statusText}</span>
            </div>
            <div class="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs mb-2.5 text-gray-600 dark:text-gray-400">
                <div><strong>Type:</strong> <span class="text-gray-800 dark:text-gray-200">${log.lesson_type || 'N/A'}</span></div>
                <div><strong>Proficiency:</strong> <span class="text-gray-800 dark:text-gray-200">${log.proficiency !== null ? log.proficiency + '/5' : 'N/A'}</span></div>
                <div><strong>Engagement:</strong> <span class="text-gray-800 dark:text-gray-200">${log.engagement !== null ? log.engagement + '/5' : 'N/A'}</span></div>
            </div>
            ${skillsCoveredDisplay !== 'N/A' ? `
            <div class="text-xs mb-2">
                <p class="font-medium text-gray-500 dark:text-gray-400">Skills:</p>
                <p class="text-gray-700 dark:text-gray-200 pl-2">${skillsCoveredDisplay}</p>
            </div>` : ''}
            ${notes ? `
            <div class="text-xs mt-2 pt-2 border-t border-gray-200 dark:border-gray-500/50">
                <p class="font-medium text-gray-500 dark:text-gray-400">Notes:</p>
                <p class="text-gray-700 dark:text-gray-200 whitespace-pre-wrap pl-2">${notes}</p>
            </div>` : ''}
        `;
        list.appendChild(listItem);
    });

    modalLessonHistory.innerHTML = ''; // Clear "Loading..."
    modalLessonHistory.appendChild(list);
}


/**
 * (Internal) Fetches and displays the student's lesson history.
 */
async function _fetchAndDisplayStudentHistory(studentId) {
    if (!modalLessonHistory || !modalLoadingIndicator || !modalErrorMessage) return;

    modalLoadingIndicator.classList.remove('hidden');
    modalLessonHistory.innerHTML = ''; // Clear previous history
    modalErrorMessage.classList.add('hidden');

    try {
        const historyLogs = await fetchStudentLogHistory(studentId);
        if (historyLogs === null) { // API function returns null on error
            throw new Error("Failed to fetch lesson history from the server.");
        }
        _renderStudentHistory(historyLogs);
    } catch (error) {
        console.error(`StudentProfile Error: Failed to fetch/render history for student ${studentId}:`, error);
        modalErrorMessage.textContent = error.message || "Could not load lesson history.";
        modalErrorMessage.classList.remove('hidden');
        modalLessonHistory.innerHTML = ''; // Clear any partial rendering
    } finally {
        modalLoadingIndicator.classList.add('hidden');
    }
}


/**
 * Opens the student profile modal and populates it with data.
 */
export async function openStudentProfileModal(studentId) {
    if (!isReady || !studentProfileModal) {
        console.error("StudentProfile Error: Module not ready or modal element not found.");
        return;
    }
    const studentDetails = getStudentDetails(studentId, appState.studentsData);
    if (!studentDetails) {
        console.error(`StudentProfile Error: Details not found for student ID ${studentId}.`);
        return;
    }

    // Clear previous content before showing
    if (modalStudentInfo) modalStudentInfo.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 p-3">Loading details...</p>';
    if (modalLessonHistory) modalLessonHistory.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 italic p-3">Loading history...</p>';
    if (modalLoadingIndicator) modalLoadingIndicator.classList.remove('hidden'); // Show loading initially
    if (modalErrorMessage) modalErrorMessage.classList.add('hidden');

    // Populate static info immediately
    _renderStudentInfo(studentDetails);

    // Make modal visible
    studentProfileModal.style.display = 'block'; // Use block or flex
    requestAnimationFrame(() => {
        studentProfileModal.classList.add('is-open'); // Add class to trigger opacity transition
    });
    document.body.style.overflow = 'hidden'; // Prevent background scrolling

    // Fetch dynamic history data
    _fetchAndDisplayStudentHistory(studentId);
}

/**
 * Closes the student profile modal.
 */
export function closeStudentProfileModal() {
    console.log("Attempting to close modal..."); // More specific log
    if (!isReady || !studentProfileModal) {
        console.log("Modal not ready or not found, cannot close.");
        return;
    }

    studentProfileModal.classList.remove('is-open'); // Remove class to trigger fade out
    studentProfileModal.style.display = 'none'; // Hide immediately
    document.body.style.overflow = ''; // Restore background scrolling

    // Clear content for next time
    if (modalStudentName) modalStudentName.textContent = 'Student Profile';
    if (modalStudentInfo) modalStudentInfo.innerHTML = '';
    if (modalLessonHistory) modalLessonHistory.innerHTML = '';
    if (modalErrorMessage) modalErrorMessage.classList.add('hidden');

    console.log("Student Profile modal closed and content cleared.");
}

/**
 * (Internal) Renders the basic student information into the modal.
 * Uses a definition list style for better alignment and refined styling.
 */
function _renderStudentInfo(studentDetails) {
    if (!modalStudentName || !modalStudentInfo) return;

    modalStudentName.textContent = `${studentDetails.Name || 'Student'} - Profile`;

    const groupText = getGroupSizeText(studentDetails.groupOf);
    const subGroupText = studentDetails.sub_group ? ` (Sub-group: ${studentDetails.sub_group})` : '';
    const statusText = studentDetails.is_active ?
        '<span class="text-xs bg-green-100 text-green-800 dark:bg-green-800/40 dark:text-green-200 px-2.5 py-0.5 rounded-full font-medium align-middle">Active</span>' :
        '<span class="text-xs bg-red-100 text-red-800 dark:bg-red-800/40 dark:text-red-200 px-2.5 py-0.5 rounded-full font-medium align-middle">Inactive</span>';

    let availabilityHtml = '<p class="text-sm text-gray-500 dark:text-gray-400 italic">Not specified</p>';
    if (studentDetails.availability_string) {
        const parsedAvail = parseAvailability(studentDetails.availability_string);
        let formattedAvail = '';
        const daysOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
        daysOrder.forEach(day => {
            if (parsedAvail[day] && parsedAvail[day].size > 0) {
                const times = Array.from(parsedAvail[day]).sort().join(', ');
                formattedAvail += `<div class="capitalize text-sm py-0.5"><span class="font-medium text-gray-600 dark:text-gray-300 w-20 inline-block">${day}:</span> ${times}</div>`;
            }
        });
        if (formattedAvail) {
            availabilityHtml = `<div class="space-y-1 text-gray-700 dark:text-gray-200 mt-1">${formattedAvail}</div>`;
        }
    }

    // Target the #modal-student-info div directly
    modalStudentInfo.innerHTML = `
        <dl class="space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2">
                <div>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Class</dt>
                    <dd class="mt-0.5 text-sm text-gray-900 dark:text-gray-100">${studentDetails.class_name || 'N/A'}</dd>
                </div>
                <div>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
                    <dd class="mt-0.5 text-sm">${statusText}</dd>
                </div>
                 <div>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Lessons Owed</dt>
                    <dd class="mt-0.5 text-sm text-gray-900 dark:text-gray-100">${studentDetails.lessons_owed || 0}</dd>
                </div>
            </div>
             <div class="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2">
                 <div>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Preferred Grouping</dt>
                    <dd class="mt-0.5 text-sm text-gray-900 dark:text-gray-100">${groupText}${subGroupText}</dd>
                </div>
             </div>
             <div class="pt-1">
                <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Availability</dt>
                <dd>${availabilityHtml}</dd>
            </div>
        </dl>
    `;
}

// --- Add a ready flag ---
export let isReady = false; // Will be set to true in initStudentProfile

console.log("Student Profile module (studentProfile.js) loaded.");
