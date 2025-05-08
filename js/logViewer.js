// js/logViewer.js
// Handles the display and filtering of past lesson logs (ES Module).
// v6: Properly parse and display 'skills_covered' array string.

// --- Import Dependencies ---
import { appState } from './state.js'; // Import from state.js
import { fetchLogs, getLogDateRange, fetchStudents } from './api.js';
import { getStudentDetails, parseTime, formatTime } from './utils.js'; // Import time formatting utils
import { showLoading, hideLoading, displayError, clearError } from './ui.js';

// --- Module Variables ---
let logViewerContainer = null;
let logViewerControls = null;
let weekSelector = null;
let studentFilterSelect = null;
let logOutputDiv = null;
let logViewerLoadingDiv = null;
let viewPastLogsButton = null;

let currentSortBy = 'date_desc'; // Default sort
let allStudentsForFilter = []; // Store all students for the filter dropdown

// --- Helper Functions ---

/**
 * Formats a log date string (timestamp) to "DD/MM/YYYY HH:MM".
 * @param {string} logDateStr - The log date string from the database.
 * @returns {string} Formatted date and time string, or "Invalid Date" if parsing fails.
 */
function _formatLogDateTime(logDateStr) {
    if (!logDateStr) return "N/A";
    try {
        const dateObj = new Date(logDateStr);
        if (isNaN(dateObj.getTime())) {
            // console.warn(`_formatLogDateTime: Received invalid date string: ${logDateStr}`);
            return "Invalid Date";
        }

        const day = dateObj.getDate().toString().padStart(2, '0');
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
        const year = dateObj.getFullYear();
        
        const hours = dateObj.getHours().toString().padStart(2, '0'); 
        const minutes = dateObj.getMinutes().toString().padStart(2, '0');

        return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (e) {
        console.error("Error formatting log date:", logDateStr, e);
        return "Invalid Date";
    }
}

/**
 * Parses the skills_covered string (PostgreSQL array format) into a readable string or array.
 * @param {string} skillsString - The raw string e.g., "{\"Skill A\",\"Skill B\"}".
 * @returns {string} A comma-separated string of skills, or "N/A".
 */
function _parseSkillsCovered(skillsString) {
    if (!skillsString || typeof skillsString !== 'string') {
        return 'N/A';
    }
    // Check if it's in the expected array format "{...}"
    if (skillsString.startsWith('{') && skillsString.endsWith('}')) {
        try {
            // Remove curly braces
            let cleanedString = skillsString.substring(1, skillsString.length - 1);
            
            // Split by '","' - this handles skills with commas inside them if they are properly quoted.
            // If skills are simple and don't contain commas, a simple split by comma after removing quotes would also work.
            const skillsArray = cleanedString.split('","').map(skill => {
                // Remove leading/trailing quotes if present from the split parts
                if (skill.startsWith('"')) skill = skill.substring(1);
                if (skill.endsWith('"')) skill = skill.substring(0, skill.length - 1);
                return skill.trim(); // Trim whitespace
            });

            return skillsArray.join(', ') || 'N/A'; // Join with comma and space
        } catch (e) {
            console.error("Error parsing skills_covered string:", skillsString, e);
            return skillsString; // Return original string if parsing fails
        }
    }
    // If it's not in the expected array format, return as is (might be a simple string already)
    return skillsString;
}


/**
 * Renders a single log entry into an HTML string.
 * @param {object} log - The log object from the database.
 * @returns {string} HTML string for the log entry.
 */
function _renderLogEntry(log) {
    // console.log("LogViewer _renderLogEntry - log object:", JSON.stringify(log, null, 2)); 

    const studentName = log.students?.Name || `Student ID: ${log.student_id || 'Unknown'}`;
    const coachName = log.coaches?.Name || `Coach ID: ${log.coach_id || 'Unknown'}`;
    const formattedLogDate = _formatLogDateTime(log.log_date);

    let statusText = log.status || log.attendance_status || 'Logged'; 
    if (log.absence_reason) statusText += ` (${log.absence_reason})`;
    if (log.is_fill_in) statusText = `Fill-in: ${statusText}`;

    const notes = log.notes ? log.notes.replace(/</g, "&lt;").replace(/>/g, "&gt;") : 'No notes.';
    const lessonType = log.lesson_type || 'N/A';
    const lessonsOwedChange = log.lessons_owed_change !== null ? log.lessons_owed_change : 'N/A';
    const lessonsOwedAfter = log.lessons_owed_after !== null ? log.lessons_owed_after : 'N/A';
    
    const proficiencyLevel = log.proficiency !== null ? log.proficiency : 'N/A'; 
    const engagementLevel = log.engagement !== null ? log.engagement : 'N/A';   
    
    // *** Use the new parsing function for skills_covered ***
    const skillsCoveredDisplay = _parseSkillsCovered(log.skills_covered);

    return `
        <li class="log-entry p-3 mb-3 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 shadow-md">
            <div class="flex justify-between items-center mb-2 pb-2 border-b dark:border-gray-600">
                <p class="font-semibold text-lg text-indigo-700 dark:text-indigo-400">${studentName}</p>
                <p class="text-sm text-gray-600 dark:text-gray-300">${formattedLogDate}</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700 dark:text-gray-300">
                <p><strong>Coach:</strong> ${coachName}</p>
                <p><strong>Status:</strong> ${statusText}</p>
                <p><strong>Type:</strong> ${lessonType}</p>
                <p><strong>Proficiency:</strong> ${proficiencyLevel}/5</p>
                <p><strong>Engagement:</strong> ${engagementLevel}/5</p>
                <p><strong>Owed Change:</strong> ${lessonsOwedChange}</p>
                <p><strong>Owed After:</strong> ${lessonsOwedAfter}</p>
            </div>
            <div class="mt-3 text-xs text-gray-700 dark:text-gray-300">
                <p class="font-medium"><strong>Skills Covered:</strong></p>
                <p class="pl-2 italic text-gray-600 dark:text-gray-400 whitespace-pre-wrap">${skillsCoveredDisplay}</p>
            </div>
            <div class="mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
                <p class="text-xs font-medium text-gray-700 dark:text-gray-300"><strong>Notes:</strong></p>
                <p class="text-xs italic text-gray-600 dark:text-gray-400 whitespace-pre-wrap pl-2">${notes}</p>
            </div>
        </li>
    `;
}


/**
 * Populates the week selector dropdown based on the log date range for the current coach.
 */
async function _populateWeekSelector() {
    if (!weekSelector || !appState.currentCoachId) {
        weekSelector.innerHTML = '<option value="">-- Select Coach First --</option>';
        return;
    }
    weekSelector.disabled = true;
    weekSelector.innerHTML = '<option value="">Loading weeks...</option>';

    try {
        const dateRange = await getLogDateRange(appState.currentCoachId);
        if (!dateRange || dateRange.length === 0 || !dateRange[0].min_date || !dateRange[0].max_date) {
            weekSelector.innerHTML = '<option value="">No logs found</option>';
            return;
        }

        const minDate = new Date(dateRange[0].min_date + 'T00:00:00Z'); // Treat as UTC
        const maxDate = new Date(dateRange[0].max_date + 'T00:00:00Z'); // Treat as UTC

        weekSelector.innerHTML = '<option value="">-- Select Week --</option>';
        let currentWeekStart = new Date(minDate);

        // Adjust currentWeekStart to the beginning of its week (Monday)
        const dayOfWeek = currentWeekStart.getUTCDay(); // Sunday = 0, Monday = 1, ...
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Calculate difference to Monday
        currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() + diffToMonday);


        while (currentWeekStart <= maxDate) {
            const weekEnd = new Date(currentWeekStart);
            weekEnd.setUTCDate(currentWeekStart.getUTCDate() + 6); // Sunday of that week

            const option = document.createElement('option');
            const startDateStr = `${currentWeekStart.getUTCDate().toString().padStart(2, '0')}/${(currentWeekStart.getUTCMonth() + 1).toString().padStart(2, '0')}`;
            const endDateStr = `${weekEnd.getUTCDate().toString().padStart(2, '0')}/${(weekEnd.getUTCMonth() + 1).toString().padStart(2, '0')}`;
            option.value = `${currentWeekStart.toISOString().split('T')[0]}_${weekEnd.toISOString().split('T')[0]}`;
            option.textContent = `Week: ${startDateStr} - ${endDateStr} (${currentWeekStart.getFullYear()})`;
            weekSelector.appendChild(option);

            currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() + 7); // Move to next Monday
        }
    } catch (error) {
        console.error("LogViewer Error populating week selector:", error);
        weekSelector.innerHTML = '<option value="">Error loading weeks</option>';
    } finally {
        weekSelector.disabled = false;
    }
}

/** Populates the student filter dropdown. */
async function _populateStudentFilter() {
    if (!studentFilterSelect) return;
    studentFilterSelect.innerHTML = '<option value="">All Students</option>'; // Reset

    // Use appState.studentsData if available and populated
    if (appState.studentsData && appState.studentsData.length > 0) {
        allStudentsForFilter = [...appState.studentsData]; // Use a copy
        allStudentsForFilter.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
        allStudentsForFilter.forEach(student => {
            if (student.Name) { // Only add students with names
                const option = document.createElement('option');
                option.value = student.id;
                option.textContent = student.Name;
                studentFilterSelect.appendChild(option);
            }
        });
    } else {
        // Fallback to fetching if not in appState (e.g., if admin directly opens log viewer)
        console.log("LogViewer: Student data not in appState, fetching for filter...");
        try {
            const students = await fetchStudents();
            if (students) {
                allStudentsForFilter = students;
                allStudentsForFilter.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
                allStudentsForFilter.forEach(student => {
                    if (student.Name) {
                        const option = document.createElement('option');
                        option.value = student.id;
                        option.textContent = student.Name;
                        studentFilterSelect.appendChild(option);
                    }
                });
            }
        } catch (error) {
            console.error("LogViewer Error fetching students for filter:", error);
        }
    }
}


/** Fetches and displays logs based on current filter settings. */
async function _loadAndDisplayLogs() {
    if (!appState.currentCoachId || !weekSelector.value) {
        logOutputDiv.innerHTML = '<p class="text-gray-500 dark:text-gray-400 italic p-2">Please select a coach and a week.</p>';
        return;
    }

    const [startDate, endDate] = weekSelector.value.split('_');
    const studentIdFilter = studentFilterSelect.value || null;

    if (!startDate || !endDate) {
        logOutputDiv.innerHTML = '<p class="text-gray-500 dark:text-gray-400 italic p-2">Invalid week selected.</p>';
        return;
    }

    showLoading(logViewerLoadingDiv);
    logOutputDiv.innerHTML = ''; // Clear previous logs
    clearError("log-viewer-error"); // Assuming you might add an error display area

    try {
        const logs = await fetchLogs(appState.currentCoachId, startDate, endDate, studentIdFilter, currentSortBy);

        if (logs && logs.error) { // Handle API error object
            throw new Error(logs.error);
        }

        if (!logs || logs.length === 0) {
            logOutputDiv.innerHTML = '<p class="text-gray-500 dark:text-gray-400 italic p-2">No logs found for the selected criteria.</p>';
        } else {
            const list = document.createElement('ul');
            list.className = 'space-y-1'; // Adjusted spacing if needed
            logs.forEach(log => {
                list.innerHTML += _renderLogEntry(log); // Append HTML string
            });
            logOutputDiv.appendChild(list);
        }
    } catch (error) {
        console.error("LogViewer Error fetching logs:", error);
        logOutputDiv.innerHTML = `<p class="text-red-500 dark:text-red-400 p-2">Error loading logs: ${error.message}</p>`;
        // displayError(error.message, "log-viewer-error"); // Example of using a specific error display
    } finally {
        hideLoading(logViewerLoadingDiv);
    }
}

/** Handles changes in filter or sort options. */
function _handleFilterOrSortChange() {
    _loadAndDisplayLogs();
}

/** Handles click on sort buttons. */
function _handleSortButtonClick(event) {
    const button = event.target.closest('.log-sort-button');
    if (!button) return;

    currentSortBy = button.dataset.sort;

    // Update button styles (active/inactive)
    document.querySelectorAll('.log-sort-button').forEach(btn => {
        btn.classList.remove('bg-indigo-100', 'text-indigo-700', 'dark:bg-indigo-900', 'dark:text-indigo-200', 'font-semibold');
        btn.classList.add('text-gray-600', 'dark:text-gray-300', 'hover:bg-gray-100', 'dark:hover:bg-gray-700');
    });
    button.classList.add('bg-indigo-100', 'text-indigo-700', 'dark:bg-indigo-900', 'dark:text-indigo-200', 'font-semibold');
    button.classList.remove('text-gray-600', 'dark:text-gray-300', 'hover:bg-gray-100', 'dark:hover:bg-gray-700');

    _loadAndDisplayLogs();
}


/** Toggles the visibility of the log viewer. */
function _toggleLogViewer() {
    if (!logViewerContainer || !appState.currentCoachId) {
        if (!appState.currentCoachId) {
            alert("Please select a coach first to view logs.");
        }
        return;
    }
    const isHidden = logViewerContainer.classList.toggle('hidden');
    if (!isHidden) { // If now visible
        _populateWeekSelector();
        _populateStudentFilter(); // Populate students if not already done
        if(weekSelector.value) { // Load logs if a week is already selected (e.g., from previous view)
            _loadAndDisplayLogs();
        } else {
             logOutputDiv.innerHTML = '<p class="text-gray-500 dark:text-gray-400 italic p-2">Select a week to view logs.</p>';
        }
        // Set initial active sort button style
        document.querySelectorAll('.log-sort-button').forEach(btn => {
            if (btn.dataset.sort === currentSortBy) {
                btn.classList.add('bg-indigo-100', 'text-indigo-700', 'dark:bg-indigo-900', 'dark:text-indigo-200', 'font-semibold');
                btn.classList.remove('text-gray-600', 'dark:text-gray-300', 'hover:bg-gray-100', 'dark:hover:bg-gray-700');
            } else {
                btn.classList.remove('bg-indigo-100', 'text-indigo-700', 'dark:bg-indigo-900', 'dark:text-indigo-200', 'font-semibold');
                btn.classList.add('text-gray-600', 'dark:text-gray-300', 'hover:bg-gray-100', 'dark:hover:bg-gray-700');
            }
        });
    }
}


// --- Initialization ---

/**
 * Initializes the Log Viewer module.
 * Must be called after the DOM is fully loaded.
 */
export function initLogViewer() {
    console.log("LogViewer: Initializing...");
    logViewerContainer = document.getElementById('log-viewer-container');
    logViewerControls = document.getElementById('log-viewer-controls');
    weekSelector = document.getElementById('week-selector');
    studentFilterSelect = document.getElementById('log-filter-student');
    logOutputDiv = document.getElementById('log-viewer-output');
    logViewerLoadingDiv = document.getElementById('log-viewer-loading');
    viewPastLogsButton = document.getElementById('view-past-logs-button');

    if (!logViewerContainer || !logViewerControls || !weekSelector || !studentFilterSelect || !logOutputDiv || !logViewerLoadingDiv || !viewPastLogsButton) {
        console.error("LogViewer Init Error: One or more required log viewer elements not found in the DOM. Check IDs:", {
            logViewerContainer, logViewerControls, weekSelector, studentFilterSelect, logOutputDiv, logViewerLoadingDiv, viewPastLogsButton
        });
        return;
    }

    viewPastLogsButton.addEventListener('click', _toggleLogViewer);
    weekSelector.addEventListener('change', _handleFilterOrSortChange);
    studentFilterSelect.addEventListener('change', _handleFilterOrSortChange);

    // Add event listeners for sort buttons (delegated from controls div)
    logViewerControls.addEventListener('click', _handleSortButtonClick);

    console.log("Log Viewer module initialized successfully.");
}

// --- Add a ready flag (optional, if other modules depend on this) ---
export const isReady = true;
