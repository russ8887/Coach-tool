// js/logging.js
// Handles the population and submission of the inline lesson logging form (ES Module).
// v7: Ensure 'owed_change' is 0 when logging an absence.

// --- Import Dependencies ---
import { appState } from './state.js'; // <--- Import from state.js
import { getStudentDetails, checkPairingRuleViolation, getGroupSizeText } from './utils.js';
import { submitLogAndUpdates, markPastLogHandled } from './api.js';
import { displayError as uiDisplayError, clearError as uiClearError, displayPastMissedLogsUI, displayMissedLogWarning } from './ui.js';
import { hideAllInlineForms, handleSlotSelection } from './schedule.js';
import { closeAbsenceSuggestionBox } from './absence.js';


// --- Predefined Skills List ---
const LOGGABLE_SKILLS = [
    "Opening Principles", "Tactics (Pins, Forks, Skewers)", "Checkmating Patterns",
    "Endgame Fundamentals", "Strategy Basics", "Calculation Practice",
    "Game Analysis", "Puzzle Solving", "Specific Opening Prep", "Tournament Preparation"
];

// --- Absence Reasons (Copied from absence.js for local use) ---
const ABSENCE_REASONS = [
    "Sick",
    "Appointment",
    "Holiday",
    "Forgot",
    "Cancelled",
    "Class Event (Expected)",
    "Class Event (Unexpected)",
    "Other"
];

// --- Helper Functions ---

/**
 * (Internal Helper) Determines which students are considered 'present' for logging based on current statuses or past log data.
 * Includes temporarily added fill-ins for past logs.
 * @param {object} slotDetails - Details of the slot being logged (from appState or constructed for past logs).
 * @param {Array} todaysStatuses - The array of today's status objects from appState.
 * @returns {Array<number>} An array of student IDs considered present.
 */
function _getPresentStudentIds(slotDetails, todaysStatuses) {
    if (!slotDetails) return [];

    if (slotDetails.isPastLog) {
        const currentIds = Array.isArray(slotDetails.currentStudentIds) ? slotDetails.currentStudentIds : [];
        const listItem = document.querySelector(`li[data-schedule-id="${slotDetails.scheduleId}"][data-missed-date="${slotDetails.pastLogDate}"]`);
        const tempFillIns = JSON.parse(listItem?.dataset.tempFillIns || '[]');
        const combinedPresentIds = [...new Set([...currentIds, ...tempFillIns])];
        return combinedPresentIds;
    }

    const scheduleId = slotDetails.scheduleId;
    const originalStudentIds = slotDetails.originalStudentIds || [];
    const safeTodaysStatuses = Array.isArray(todaysStatuses) ? todaysStatuses : [];
    const slotStatuses = safeTodaysStatuses.filter(s => s.lesson_schedule_id === scheduleId);
    const absentStudentIds = new Set(
        slotStatuses.filter(s => s.status === 'marked_absent').map(s => s.student_id)
    );
    const fillInStudentIds = slotStatuses
        .filter(s => s.status === 'assigned_fill_in')
        .map(s => s.student_id);
    const presentOriginalIds = originalStudentIds.filter(id => !absentStudentIds.has(id));
    const presentIds = [...new Set([...presentOriginalIds, ...fillInStudentIds])];
    return presentIds;
}


/**
 * (Internal Helper) Creates HTML for a rating radio button group.
 */
function createRatingGroup(groupLabel, groupName, isRequired) {
    let html = `<div class="mb-2"><p class="text-xs font-medium text-gray-600 dark:text-gray-300 mb-0.5">${groupLabel}:</p><div class="flex space-x-2">`;
    const requiredAttr = isRequired ? 'required' : '';
    [1, 2, 3, 4, 5].forEach(value => {
        const radioId = `${groupName}_${value}`;
        html += `
            <label for="${radioId}" class="flex items-center space-x-0.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="radio" id="${radioId}" name="${groupName}" value="${value}" ${requiredAttr}
                       class="form-radio h-3 w-3 text-indigo-600 border-gray-300 focus:ring-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:focus:ring-offset-gray-800">
                <span>${value}</span>
            </label>`;
    });
    html += '</div></div>';
    return html;
}


/**
 * (Internal Helper) Creates the HTML structure for a single student's log form section.
 */
function _createStudentLogFormSection(studentId, index, isGroup, scheduleId, isPastLog, isFillIn = false) {
    if (!appState?.studentsData) return null;
    const studentDetails = getStudentDetails(studentId, appState.studentsData);

    if (!studentDetails || !studentDetails.Name || studentDetails.Name === 'Unknown Student') {
        console.warn(`Logging: Could not get details or Name for student ID ${studentId} when creating log form.`);
        return null;
    }

    const section = document.createElement('div');
    section.className = 'student-log-entry border-t border-gray-200 dark:border-gray-600 pt-3 mt-3 first:mt-0 first:pt-0 first:border-t-0 relative';
    section.dataset.studentId = studentId;
    if (isFillIn) {
        section.dataset.isFillIn = "true";
    }

    const fillInBadge = isFillIn ? '<span class="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 px-1.5 py-0.5 rounded-full ml-1.5 font-medium align-middle">Fill-in</span>' : '';
    let htmlContent = `<h4 class="student-name font-semibold mb-2 text-sm text-gray-800 dark:text-gray-100 flex items-center">
                         ${studentDetails.Name} (${studentDetails.class_name || 'N/A'})
                         ${fillInBadge}
                       </h4>`;
    section.innerHTML = htmlContent;

    const studentFormContent = document.createElement('div');
    studentFormContent.className = 'student-form-content';

    const individualSkillsDiv = document.createElement('div');
    individualSkillsDiv.className = `individual-skills-section mb-2 ${isGroup ? 'hidden' : ''}`;
    individualSkillsDiv.innerHTML = `<p class="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Skills (Individual):</p>`;
    const skillsGrid = document.createElement('div');
    skillsGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1';
    const skillsGroupName = `skills_${studentId}`;
    LOGGABLE_SKILLS.forEach((skill, skillIndex) => {
        const checkboxId = `skill-individual-${studentId}-${skillIndex}`;
        const label = document.createElement('label'); label.htmlFor = checkboxId;
        label.className = 'flex items-center space-x-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer';
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
        checkbox.id = checkboxId; checkbox.name = skillsGroupName; checkbox.value = skill;
        checkbox.className = 'form-checkbox h-3 w-3 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:focus:ring-offset-gray-800';
        const span = document.createElement('span'); span.textContent = skill;
        label.appendChild(checkbox); label.appendChild(span);
        skillsGrid.appendChild(label);
    });
    individualSkillsDiv.appendChild(skillsGrid);
    studentFormContent.appendChild(individualSkillsDiv);

    const ratingsRequired = !isPastLog;
    studentFormContent.innerHTML += createRatingGroup('Proficiency', `proficiency_${studentId}`, ratingsRequired);
    studentFormContent.innerHTML += createRatingGroup('Engagement', `engagement_${studentId}`, ratingsRequired);
    studentFormContent.innerHTML += `
        <div class="mb-1">
            <label for="notes_${studentId}" class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-0.5">Notes:</label>
            <textarea id="notes_${studentId}" name="notes_${studentId}" rows="1"
                      class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-xs border border-gray-300 rounded-md p-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"></textarea>
        </div>`;

    if (isPastLog && isFillIn) {
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = 'Remove Fill-in';
        removeButton.className = 'remove-past-fillin-btn text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 mt-1 focus:outline-none';
        removeButton.dataset.studentId = studentId;
        removeButton.addEventListener('click', handleRemovePastFillin);
        studentFormContent.appendChild(removeButton);
    }
    section.appendChild(studentFormContent);

    if (isPastLog) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'past-log-action-buttons absolute top-1 right-1 flex flex-col items-end space-y-1';
        const markAbsentButton = document.createElement('button');
        markAbsentButton.type = 'button';
        markAbsentButton.innerHTML = '&times;';
        markAbsentButton.title = `Mark ${studentDetails.Name} as absent for this past session`;
        markAbsentButton.className = 'mark-past-absent-btn text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-bold text-lg p-0 leading-none focus:outline-none';
        markAbsentButton.dataset.studentId = studentId;
        markAbsentButton.addEventListener('click', handleMarkPastAbsent);
        const undoAbsenceButton = document.createElement('button');
        undoAbsenceButton.type = 'button';
        undoAbsenceButton.innerHTML = '🔄';
        undoAbsenceButton.title = `Undo absence mark for ${studentDetails.Name}`;
        undoAbsenceButton.className = 'undo-past-absent-btn hidden text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-bold text-lg p-0 leading-none focus:outline-none';
        undoAbsenceButton.dataset.studentId = studentId;
        undoAbsenceButton.addEventListener('click', handleUndoPastAbsent);
        buttonContainer.appendChild(markAbsentButton);
        buttonContainer.appendChild(undoAbsenceButton);
        section.appendChild(buttonContainer);
    }
    return section;
}

/**
 * Handles clicks on the skills mode toggle link.
 */
function handleToggleSkillsMode(event) {
    event.preventDefault();
    event.stopPropagation();
    const toggleLink = event.currentTarget;
    const scheduleId = toggleLink.dataset.scheduleId;
    const inlineForm = toggleLink.closest('form');
    if (!inlineForm || !scheduleId) {
        console.error("ToggleSkills Error: Could not find parent form or scheduleId.");
        return;
    }
    const sharedSkillsDiv = inlineForm.querySelector(`#shared-skills-${scheduleId}`);
    const individualSkillsSections = inlineForm.querySelectorAll('.individual-skills-section');
    const currentMode = inlineForm.dataset.skillsMode || 'group';
    if (currentMode === 'group') {
        if (sharedSkillsDiv) sharedSkillsDiv.classList.add('hidden');
        individualSkillsSections.forEach(sec => sec.classList.remove('hidden'));
        toggleLink.textContent = '[Log Skills as Group]';
        inlineForm.dataset.skillsMode = 'individual';
    } else {
        if (sharedSkillsDiv) sharedSkillsDiv.classList.remove('hidden');
        individualSkillsSections.forEach(sec => sec.classList.add('hidden'));
        toggleLink.textContent = '[Log Individually]';
        inlineForm.dataset.skillsMode = 'group';
    }
}

/**
 * (Internal Helper) Gathers form data for all present students.
 */
function _gatherInlineFormData(inlineFormElement, presentStudentIds, scheduleId) {
    const payload = [];
    let isValid = true;
    const statusElement = inlineFormElement.querySelector('p[id^="inline-log-status-"]');
    const currentMode = inlineFormElement.dataset.skillsMode || 'group';
    const isPastLog = !!inlineFormElement.dataset.pastLogDate;

    let sharedSkillsPayloadValue = null;
    if (currentMode === 'group') {
        const sharedSkillsCheckboxes = inlineFormElement.querySelectorAll(`input[name="skills_shared_${scheduleId}"]:checked`);
        const sharedSkillsCovered = Array.from(sharedSkillsCheckboxes).map(cb => cb.value);
        sharedSkillsPayloadValue = sharedSkillsCovered.length > 0 ? sharedSkillsCovered : null;
    }

    presentStudentIds.forEach(studentId => {
        let skillsForThisStudent = sharedSkillsPayloadValue;
        if (currentMode === 'individual') {
            const individualSkillsCheckboxes = inlineFormElement.querySelectorAll(`input[name="skills_${studentId}"]:checked`);
            const individualSkillsCovered = Array.from(individualSkillsCheckboxes).map(cb => cb.value);
            skillsForThisStudent = individualSkillsCovered.length > 0 ? individualSkillsCovered : null;
        }
        const proficiencyRadio = inlineFormElement.querySelector(`input[name="proficiency_${studentId}"]:checked`);
        const engagementRadio = inlineFormElement.querySelector(`input[name="engagement_${studentId}"]:checked`);

        if (!isPastLog) {
            if (!proficiencyRadio || !engagementRadio) {
                isValid = false;
                const studentName = getStudentDetails(studentId, appState.studentsData)?.Name || `ID ${studentId}`;
                const missing = [];
                if (!proficiencyRadio) missing.push("Proficiency");
                if (!engagementRadio) missing.push("Engagement");
                if (statusElement) {
                    statusElement.textContent = `Error: Please select ${missing.join(' and ')} rating for ${studentName}.`;
                    statusElement.classList.remove('hidden');
                    statusElement.classList.add('text-red-500', 'dark:text-red-400');
                } else {
                    uiDisplayError(`Please select ${missing.join(' and ')} rating for ${studentName}.`, "general");
                }
            }
        }
        const proficiency = proficiencyRadio ? parseInt(proficiencyRadio.value) : null;
        const engagement = engagementRadio ? parseInt(engagementRadio.value) : null;
        const notesTextarea = inlineFormElement.querySelector(`#notes_${studentId}`);
        const notes = notesTextarea ? notesTextarea.value.trim() : null;

        payload.push({
            student_id: studentId,
            attendance_status: 'Present', // This function is for present students
            skills_covered: skillsForThisStudent,
            proficiency: proficiency,
            engagement: engagement,
            notes: notes || null,
            owed_change: -1, // <<< DECREMENT lessons owed for present students when log is submitted
            absence_reason: null
        });
    });

    if (isValid && statusElement) {
        statusElement.textContent = '';
        statusElement.classList.add('hidden');
    }
    return { isValid, payload };
}

/**
 * (Internal Helper) Creates log entries for absent students.
 * Ensures owed_change is 0 for absences.
 */
function _createAbsentStudentLogEntries(scheduleId, isPastLog, originalStudentIds = [], presentStudentIds = [], todaysStatuses = [], formElement = null) {
    const payload = [];
    if (isPastLog) {
        if (!formElement) {
            console.error("Logging (_createAbsentStudentLogEntries - PAST): Form element is required but missing.");
            return { payload: [] };
        }
        const absentSections = formElement.querySelectorAll('.student-log-entry[data-is-absent="true"]');
        absentSections.forEach(section => {
            const studentId = parseInt(section.dataset.studentId);
            if (!isNaN(studentId)) {
                const reason = section.dataset.absenceReason || 'Absent (Marked in Past Log Form)';
                payload.push({
                    student_id: studentId,
                    attendance_status: 'Absent',
                    skills_covered: null, proficiency: null, engagement: null, notes: null,
                    owed_change: 0, // MODIFIED: Absences do not change lessons owed
                    absence_reason: reason
                });
            }
        });
    } else {
        const presentSet = new Set(presentStudentIds);
        const processedIds = new Set();
        const safeTodaysStatuses = Array.isArray(todaysStatuses) ? todaysStatuses : [];
        const slotStatuses = safeTodaysStatuses.filter(s => s.lesson_schedule_id === scheduleId);

        const absentStatuses = slotStatuses.filter(s => s.status === 'marked_absent');
        absentStatuses.forEach(status => {
            const studentId = status.student_id;
            if (processedIds.has(studentId)) return;
            payload.push({
                student_id: studentId,
                attendance_status: 'Absent',
                skills_covered: null, proficiency: null, engagement: null, notes: null,
                owed_change: 0, // MODIFIED: Absences do not change lessons owed
                absence_reason: status.absence_reason || null
            });
            processedIds.add(studentId);
        });

        originalStudentIds.forEach(studentId => {
            if (!presentSet.has(studentId) && !processedIds.has(studentId)) {
                 payload.push({
                     student_id: studentId,
                     attendance_status: 'Absent',
                     skills_covered: null, proficiency: null, engagement: null, notes: null,
                     owed_change: 0, // MODIFIED: Absences do not change lessons owed
                     absence_reason: 'Unknown / Not Marked'
                 });
                 processedIds.add(studentId);
            }
        });
    }
    console.log(`Logging (_createAbsentStudentLogEntries for ${scheduleId}, Past=${isPastLog}): Absent Payload=`, payload);
    return { payload };
}

/**
 * (Internal Helper) Updates UI and state after successful inline log submission.
 */
function _handleSuccessfulInlineLogSubmission(scheduleId, inlineFormContainer, pastLogDate = null) {
    console.log(`Logging: Inline log submitted successfully for slot ${scheduleId}` + (pastLogDate ? ` on date ${pastLogDate}` : ' (Current Date)'));
    if (inlineFormContainer) {
        inlineFormContainer.classList.add('hidden');
        inlineFormContainer.innerHTML = '';
    }
    if (!pastLogDate && appState?.selectedLessonSlot?.scheduleId === scheduleId) {
        appState.updateSelectedLessonSlot(null);
        const slotActionsDiv = document.getElementById('slot-actions');
        if (slotActionsDiv) slotActionsDiv.classList.add('hidden');
        closeAbsenceSuggestionBox();
    }

    if (pastLogDate) {
        const updatedPastMissed = appState.pastMissedLogs.filter(log =>
            !(log.schedule_id === scheduleId && log.missed_date === pastLogDate)
        );
        appState.updatePastMissedLogs(updatedPastMissed);
        displayPastMissedLogsUI(appState.pastMissedLogs);
        const todaysMissedElements = document.querySelectorAll('.schedule-item[data-is-missed="true"]');
        displayMissedLogWarning(todaysMissedElements.length);
        const slotElement = document.querySelector(`.schedule-item[data-schedule-id="${scheduleId}"]`);
         if (slotElement) {
             slotElement.classList.remove('ring-2', 'ring-indigo-400', 'dark:ring-indigo-500', 'ring-offset-1', 'dark:ring-offset-gray-800');
         }
    } else {
        if (appState?.updateTodaysLoggedSlotIds && !appState.todaysLoggedSlotIds.includes(scheduleId)) {
             const updatedLoggedIds = [...appState.todaysLoggedSlotIds, scheduleId];
             appState.updateTodaysLoggedSlotIds(updatedLoggedIds);
        }
        const slotElement = document.querySelector(`.schedule-item[data-schedule-id="${scheduleId}"]`);
        if (slotElement) {
            slotElement.classList.add('bg-gray-100', 'dark:bg-gray-700/80', 'opacity-60', 'dark:opacity-50', 'cursor-not-allowed');
            slotElement.classList.remove(
                'hover:bg-blue-50', 'dark:hover:bg-gray-700/50', 'cursor-pointer', 'hover:shadow-md',
                'bg-blue-100', 'dark:bg-blue-900/80', 'border-blue-400', 'dark:border-blue-600',
                'bg-white', 'dark:bg-gray-800',
                'bg-yellow-50', 'dark:bg-yellow-900/30', 'border-l-yellow-400', 'dark:border-l-yellow-500', 'missed-log-highlight'
            );
            slotElement.classList.remove('ring-2', 'ring-indigo-400', 'dark:ring-indigo-500', 'ring-offset-1', 'dark:ring-offset-gray-800');
            if (slotElement.classList.contains('border-l-red-500') || slotElement.classList.contains('border-l-yellow-400')) {
                 slotElement.classList.remove('border-l-4', 'border-l-red-500', 'dark:border-l-red-600', 'border-l-yellow-400', 'dark:border-l-yellow-500');
                 slotElement.classList.add('border-gray-200', 'dark:border-gray-600');
            }
            slotElement.querySelectorAll('button').forEach(btn => btn.disabled = true);
            slotElement.removeEventListener('click', handleSlotSelection);
            delete slotElement.dataset.isMissed;
        }
        const todaysMissedElements = document.querySelectorAll('.schedule-item[data-is-missed="true"]');
        displayMissedLogWarning(todaysMissedElements.length);
    }
}

/**
 * (Internal Helper) Handles failed inline log submission attempts.
 */
function _handleFailedInlineLogSubmission(message, inlineFormElement, isBackendFalseReturn = false) {
    const defaultMessage = "Failed to submit log.";
    let displayMessage = message || defaultMessage;
    if (!message && isBackendFalseReturn) {
        displayMessage = "Submission processed, but backend indicated an issue. Check data.";
    }
    console.error("Logging: Inline log submission failed.", displayMessage);
    const submitButton = inlineFormElement.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = false;
    const statusElement = inlineFormElement.querySelector('p[id^="inline-log-status-"]');
    if (statusElement) {
        statusElement.textContent = `Error: ${displayMessage}`;
        statusElement.classList.remove('hidden');
        statusElement.classList.add('text-red-500', 'dark:text-red-400');
    } else {
        uiDisplayError(displayMessage, "general");
    }
}

/**
 * Handles the submission of the INLINE lesson log form.
 */
async function handleLogSubmit(event) {
    event.preventDefault();
    const inlineForm = event.target;
    const scheduleId = parseInt(inlineForm.dataset.scheduleId);
    const pastLogDate = inlineForm.dataset.pastLogDate || null;
    const inlineFormContainer = inlineForm.closest('.inline-log-form-container, .past-log-form-container');
    const isPast = !!pastLogDate;

    if (!appState || !submitLogAndUpdates || isNaN(scheduleId) || !inlineFormContainer || !markPastLogHandled) {
        _handleFailedInlineLogSubmission("Application error.", inlineForm);
        return;
    }
    if (!isPast && appState.selectedLessonSlot?.scheduleId !== scheduleId) {
        _handleFailedInlineLogSubmission("Slot selection mismatch.", inlineForm);
        return;
    }

    let coachId = null;
    let presentStudentIds = [];
    let originalStudentIds = [];

    if (isPast) {
        const pastLogEntry = appState.pastMissedLogs.find(log => log.schedule_id === scheduleId && log.missed_date === pastLogDate);
        if (pastLogEntry) {
            coachId = appState.currentCoachId;
            originalStudentIds = pastLogEntry.original_student_ids || [];
            const studentSections = inlineForm.querySelectorAll('.student-log-entry');
            presentStudentIds = Array.from(studentSections)
                .filter(section => section.dataset.isAbsent !== 'true')
                .map(section => parseInt(section.dataset.studentId));
        } else {
             _handleFailedInlineLogSubmission("Missing past log data.", inlineForm);
             return;
        }
    } else if (appState.selectedLessonSlot) {
        coachId = appState.selectedLessonSlot.coachId;
        originalStudentIds = appState.selectedLessonSlot.originalStudentIds || [];
        presentStudentIds = _getPresentStudentIds(appState.selectedLessonSlot, appState.todaysStatuses || []);
    } else {
         _handleFailedInlineLogSubmission("No slot selected.", inlineForm);
         return;
    }

    if (!coachId) {
        _handleFailedInlineLogSubmission("Cannot determine coach.", inlineForm);
        return;
    }

    const todaysStatuses = appState.todaysStatuses || [];
    const submitButton = inlineForm.querySelector('button[type="submit"]');
    const statusElement = inlineForm.querySelector('p[id^="inline-log-status-"]');
    if (submitButton) submitButton.disabled = true;
    if (statusElement) statusElement.classList.add('hidden');

    const presentStudentData = _gatherInlineFormData(inlineForm, presentStudentIds, scheduleId);
    if (!presentStudentData.isValid) {
        if (submitButton) submitButton.disabled = false;
        return;
    }
    const presentPayload = presentStudentData.payload;
    const absentStudentData = _createAbsentStudentLogEntries(scheduleId, isPast, originalStudentIds, presentStudentIds, todaysStatuses, isPast ? inlineForm : null);
    const absentPayload = absentStudentData.payload;
    const finalPayload = [...presentPayload, ...absentPayload].map(entry => ({
        ...entry,
        coach_id: coachId,
        lesson_schedule_id: scheduleId,
        log_date: pastLogDate
    }));

    if (finalPayload.length === 0) {
        if (isPast) {
            try {
                const markResult = await markPastLogHandled(scheduleId, pastLogDate);
                if (markResult.success) {
                    _handleSuccessfulInlineLogSubmission(scheduleId, inlineFormContainer, pastLogDate);
                } else {
                    throw new Error(markResult.message || "Failed to mark log as handled.");
                }
            } catch (error) {
                 _handleFailedInlineLogSubmission(`Error marking log handled: ${error.message}`, inlineForm);
            } finally {
                if (submitButton) submitButton.disabled = false;
            }
            return;
        } else {
            _handleFailedInlineLogSubmission("No student data found to log.", inlineForm);
            if (submitButton) submitButton.disabled = false;
            return;
        }
    }

    try {
        const result = await submitLogAndUpdates(finalPayload);
        if (result && result.success) {
            _handleSuccessfulInlineLogSubmission(scheduleId, inlineFormContainer, pastLogDate);
        } else {
            const isBackendFalse = result && result.success === false;
            _handleFailedInlineLogSubmission(result?.message, inlineForm, isBackendFalse);
        }
    } catch (error) {
        _handleFailedInlineLogSubmission(`An unexpected error occurred: ${error.message}`, inlineForm);
    }
}

/**
 * Populates the inline logging form.
 */
export function populateInlineLogForm(containerElement, selectedSlotDetails) {
    if (!containerElement || !selectedSlotDetails || typeof selectedSlotDetails.scheduleId === 'undefined') {
        console.error("Logging Error (populateInlineLogForm): Invalid container or slot details.");
        uiDisplayError("Cannot show log form. Application error.", "general");
        return;
    }
    if (!appState) {
        console.error("Logging Error (populateInlineLogForm): Core dependencies (appState) missing.");
        containerElement.innerHTML = '<p class="text-red-500 text-xs p-1">Error loading log form.</p>';
        return;
    }
    containerElement.innerHTML = '<p class="text-gray-500 italic text-xs p-1">Loading student details...</p>';
    uiClearError('general');

    const todaysStatuses = appState.todaysStatuses || [];
    const presentStudentIds = _getPresentStudentIds(selectedSlotDetails, todaysStatuses);
    const scheduleId = selectedSlotDetails.scheduleId;
    const isGroup = presentStudentIds.length > 1;
    const isPastLog = selectedSlotDetails.isPastLog || false;
    const pastLogDate = selectedSlotDetails.pastLogDate || null;
    const originalStudentIds = selectedSlotDetails.originalStudentIds || [];
    const shouldPopulateForm = isPastLog || presentStudentIds.length > 0 || (!isPastLog && originalStudentIds.length > 0);

    if (shouldPopulateForm) {
        containerElement.innerHTML = '';
        const inlineForm = document.createElement('form');
        inlineForm.id = `lesson-log-inline-form-${scheduleId}` + (pastLogDate ? `-${pastLogDate}` : '');
        inlineForm.dataset.scheduleId = scheduleId;
        if (isPastLog && pastLogDate) {
            inlineForm.dataset.pastLogDate = pastLogDate;
            const pastDateIndicator = document.createElement('p');
            pastDateIndicator.className = 'text-xs text-orange-600 dark:text-orange-400 font-semibold mb-2 italic';
            pastDateIndicator.textContent = `Logging for past date: ${pastLogDate}`;
            inlineForm.appendChild(pastDateIndicator);
        }
        inlineForm.dataset.skillsMode = isGroup ? 'group' : 'individual';

        if (presentStudentIds.length === 0) {
            const noStudentsMsg = document.createElement('p');
            noStudentsMsg.className = 'text-sm text-gray-600 dark:text-gray-400 italic mb-3';
            if (isPastLog) {
                if (originalStudentIds.length > 0) {
                    noStudentsMsg.textContent = 'All originally scheduled students were marked absent for this session.';
                } else {
                    noStudentsMsg.textContent = 'This slot was originally empty.';
                }
            } else {
                 noStudentsMsg.textContent = 'All students are marked absent. Submit to log absences.';
            }
            inlineForm.appendChild(noStudentsMsg);
        }

        const sharedSkillsDiv = document.createElement('div');
        sharedSkillsDiv.id = `shared-skills-${scheduleId}`;
        sharedSkillsDiv.className = `mb-3 pb-3 border-b border-gray-300 dark:border-gray-600 ${(isGroup && presentStudentIds.length > 0) ? '' : 'hidden'}`;
        const sharedSkillsLabel = document.createElement('p');
        sharedSkillsLabel.className = 'text-sm font-medium text-gray-700 dark:text-gray-200 mb-1 flex justify-between items-center';
        sharedSkillsLabel.textContent = 'Group Skills Covered:';
        if (isGroup && presentStudentIds.length > 0) {
            const toggleLink = document.createElement('a');
            toggleLink.href = '#';
            toggleLink.textContent = '[Log Individually]';
            toggleLink.className = 'text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium toggle-skills-mode-btn';
            toggleLink.dataset.scheduleId = scheduleId;
            toggleLink.addEventListener('click', handleToggleSkillsMode);
            sharedSkillsLabel.appendChild(toggleLink);
        }
        sharedSkillsDiv.appendChild(sharedSkillsLabel);
        const sharedSkillsGrid = document.createElement('div');
        sharedSkillsGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1';
        const skillsGroupName = `skills_shared_${scheduleId}`;
        LOGGABLE_SKILLS.forEach((skill, skillIndex) => {
            const checkboxId = `skill-shared-${scheduleId}-${skillIndex}`;
            const label = document.createElement('label'); label.htmlFor = checkboxId;
            label.className = 'flex items-center space-x-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer';
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
            checkbox.id = checkboxId; checkbox.name = skillsGroupName; checkbox.value = skill;
            checkbox.className = 'form-checkbox h-3 w-3 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:focus:ring-offset-gray-800';
            const span = document.createElement('span'); span.textContent = skill;
            label.appendChild(checkbox); label.appendChild(span);
            sharedSkillsGrid.appendChild(label);
        });
        sharedSkillsDiv.appendChild(sharedSkillsGrid);
        inlineForm.appendChild(sharedSkillsDiv);

        const studentSectionsContainer = document.createElement('div');
        studentSectionsContainer.id = `student-sections-container-${scheduleId}-${pastLogDate || 'current'}`;
        inlineForm.appendChild(studentSectionsContainer);

        if (presentStudentIds.length > 0) {
            presentStudentIds.forEach((studentId, index) => {
                const studentFormSection = _createStudentLogFormSection(studentId, index, isGroup, scheduleId, isPastLog);
                if (studentFormSection) {
                    studentSectionsContainer.appendChild(studentFormSection);
                }
            });
        }

        const fillInSearchDiv = document.createElement('div');
        fillInSearchDiv.id = `past-fillin-search-${scheduleId}-${pastLogDate}`;
        fillInSearchDiv.className = 'hidden mt-3 pt-3 border-t border-gray-200 dark:border-gray-600';
        fillInSearchDiv.innerHTML = `
            <label for="past-fillin-search-input-${scheduleId}-${pastLogDate}" class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Search Student to Add:</label>
            <input type="text" id="past-fillin-search-input-${scheduleId}-${pastLogDate}" placeholder="Type name..." class="block w-full text-sm border-gray-300 dark:border-gray-500 dark:bg-gray-600 dark:text-gray-100 rounded-md shadow-sm p-1.5 mb-2 focus:ring-indigo-500 focus:border-indigo-500">
            <div id="past-fillin-search-results-${scheduleId}-${pastLogDate}" class="text-sm max-h-40 overflow-y-auto"></div>
            <p id="past-fillin-search-error-${scheduleId}-${pastLogDate}" class="text-red-500 dark:text-red-400 text-xs mt-1 hidden"></p>
        `;
        inlineForm.appendChild(fillInSearchDiv);

        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'mt-4 flex flex-wrap justify-between items-center gap-2';
        const submitButton = document.createElement('button');
        submitButton.type = 'submit';
        submitButton.id = `inline-log-submit-${scheduleId}`;
        submitButton.className = 'bg-indigo-500 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold py-1 px-3 rounded text-sm focus:outline-none focus:shadow-outline order-1';
        submitButton.textContent = 'Submit Log';
        if (isPastLog) {
            const addFillInButton = document.createElement('button');
            addFillInButton.type = 'button';
            addFillInButton.textContent = '+ Add Fill-in';
            addFillInButton.className = 'add-past-fillin-btn text-xs bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-2 rounded focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 dark:focus:ring-offset-gray-800 order-2';
            addFillInButton.dataset.scheduleId = scheduleId;
            addFillInButton.dataset.pastLogDate = pastLogDate;
            addFillInButton.addEventListener('click', handleShowPastFillInSearch);
            controlsDiv.appendChild(addFillInButton);
        }
        const statusP = document.createElement('p');
        statusP.id = `inline-log-status-${scheduleId}`+ (pastLogDate ? `-${pastLogDate}` : '');
        statusP.className = 'text-xs text-red-500 dark:text-red-400 hidden ml-2 order-3 flex-grow text-right';
        controlsDiv.appendChild(submitButton);
        controlsDiv.appendChild(statusP);
        inlineForm.appendChild(controlsDiv);
        inlineForm.removeEventListener('submit', handleLogSubmit);
        inlineForm.addEventListener('submit', handleLogSubmit);
        containerElement.appendChild(inlineForm);
    } else {
        containerElement.innerHTML = '<p class="text-gray-500 dark:text-gray-400 italic text-xs p-1">No students to log.</p>';
    }
}

// --- Functions for Past Log Fill-in ---
function handleShowPastFillInSearch(event) {
    const button = event.currentTarget;
    const scheduleId = button.dataset.scheduleId;
    const pastLogDate = button.dataset.pastLogDate;
    const form = button.closest('form');
    if (!form || !scheduleId || !pastLogDate) return;
    const searchDiv = form.querySelector(`#past-fillin-search-${scheduleId}-${pastLogDate}`);
    const searchInput = form.querySelector(`#past-fillin-search-input-${scheduleId}-${pastLogDate}`);
    const resultsDiv = form.querySelector(`#past-fillin-search-results-${scheduleId}-${pastLogDate}`);
    const errorP = form.querySelector(`#past-fillin-search-error-${scheduleId}-${pastLogDate}`);
    if (!searchDiv || !searchInput || !resultsDiv || !errorP) return;
    const isHidden = searchDiv.classList.toggle('hidden');
    if (!isHidden) {
        searchInput.value = '';
        resultsDiv.innerHTML = '';
        errorP.textContent = '';
        errorP.classList.add('hidden');
        searchInput.focus();
        searchInput.removeEventListener('input', handlePastFillInSearchInput);
        searchInput.addEventListener('input', handlePastFillInSearchInput);
        resultsDiv.removeEventListener('click', handleAddPastFillInConfirm);
        resultsDiv.addEventListener('click', handleAddPastFillInConfirm);
    } else {
        searchInput.removeEventListener('input', handlePastFillInSearchInput);
        resultsDiv.removeEventListener('click', handleAddPastFillInConfirm);
    }
}

function handlePastFillInSearchInput(event) {
    const searchInput = event.target;
    const form = searchInput.closest('form');
    const scheduleId = form.dataset.scheduleId;
    const pastLogDate = form.dataset.pastLogDate;
    const searchTerm = searchInput.value.trim().toLowerCase();
    const resultsDiv = form.querySelector(`#past-fillin-search-results-${scheduleId}-${pastLogDate}`);
    const errorP = form.querySelector(`#past-fillin-search-error-${scheduleId}-${pastLogDate}`);
    const studentSectionsContainer = form.querySelector(`#student-sections-container-${scheduleId}-${pastLogDate}`);
    if (!resultsDiv || !errorP || !appState.studentsData || !studentSectionsContainer) return;
    errorP.textContent = '';
    errorP.classList.add('hidden');
    resultsDiv.innerHTML = '';
    if (searchTerm.length < 2) {
        resultsDiv.innerHTML = '<p class="text-xs text-gray-500 dark:text-gray-400 italic">Enter at least 2 characters.</p>';
        return;
    }
    const currentStudentElements = studentSectionsContainer.querySelectorAll('.student-log-entry');
    const currentStudentIdsInForm = new Set(Array.from(currentStudentElements).map(el => parseInt(el.dataset.studentId)));
    const filteredStudents = appState.studentsData.filter(student => {
        if (student.is_active !== true) return false;
        if (!student.Name || !student.Name.toLowerCase().includes(searchTerm)) return false;
        if (currentStudentIdsInForm.has(student.id)) return false;
        return true;
    });
    if (filteredStudents.length === 0) {
        resultsDiv.innerHTML = '<p class="text-xs text-gray-500 dark:text-gray-400 italic">No matching active students found.</p>';
    } else {
        const list = document.createElement('ul');
        list.className = 'space-y-1';
        filteredStudents.slice(0, 10).forEach(student => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center py-1 border-b border-gray-200 dark:border-gray-600 last:border-b-0';
            const details = getStudentDetails(student.id, appState.studentsData);
            const groupText = getGroupSizeText(details?.groupOf);
            const subGroupText = details?.sub_group ? ` [${details.sub_group}]` : '';
            const classText = details?.class_name ? ` (${details.class_name})` : '';
            const nameSpan = document.createElement('span');
            nameSpan.className = "text-gray-800 dark:text-gray-200 text-xs";
            nameSpan.textContent = `${details?.Name || 'Unknown'}${classText} - ${groupText}${subGroupText}`;
            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.className = 'confirm-add-past-fillin-btn text-xs bg-blue-500 hover:bg-blue-700 text-white font-semibold py-0.5 px-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ml-2 flex-shrink-0 dark:bg-blue-600 dark:hover:bg-blue-500';
            addButton.dataset.studentId = student.id;
            addButton.textContent = 'Add';
            li.appendChild(nameSpan);
            li.appendChild(addButton);
            list.appendChild(li);
        });
        resultsDiv.appendChild(list);
    }
}

function handleAddPastFillInConfirm(event) {
    if (!event.target.classList.contains('confirm-add-past-fillin-btn')) return;
    const addButton = event.target;
    const studentId = parseInt(addButton.dataset.studentId);
    const form = addButton.closest('form');
    const scheduleId = form.dataset.scheduleId;
    const pastLogDate = form.dataset.pastLogDate;
    if (isNaN(studentId) || !form || !scheduleId || !pastLogDate) return;
    const studentSectionsContainer = form.querySelector(`#student-sections-container-${scheduleId}-${pastLogDate}`);
    if (!studentSectionsContainer) return;
    if (studentSectionsContainer.querySelector(`.student-log-entry[data-student-id="${studentId}"]`)) return;
    const isGroup = form.dataset.skillsMode === 'group';
    const currentStudentCount = studentSectionsContainer.children.length;
    const newSection = _createStudentLogFormSection(studentId, currentStudentCount, isGroup, scheduleId, true, true);
    if (newSection) {
        studentSectionsContainer.appendChild(newSection);
        const listItem = form.closest('li[data-schedule-id]');
        if (listItem) {
            const tempFillIns = JSON.parse(listItem.dataset.tempFillIns || '[]');
            if (!tempFillIns.includes(studentId)) {
                tempFillIns.push(studentId);
                listItem.dataset.tempFillIns = JSON.stringify(tempFillIns);
            }
        }
        const searchDiv = form.querySelector(`#past-fillin-search-${scheduleId}-${pastLogDate}`);
        if (searchDiv) searchDiv.classList.add('hidden');
    } else {
        uiDisplayError("Failed to add student form section.", "general");
    }
}

function handleRemovePastFillin(event) {
    const removeButton = event.currentTarget;
    const studentId = parseInt(removeButton.dataset.studentId);
    const studentSection = removeButton.closest('.student-log-entry');
    const form = removeButton.closest('form');
    const listItem = form?.closest('li[data-schedule-id]');
    if (isNaN(studentId) || !studentSection || !listItem) return;
    studentSection.remove();
    const tempFillIns = JSON.parse(listItem.dataset.tempFillIns || '[]');
    const updatedFillIns = tempFillIns.filter(id => id !== studentId);
    listItem.dataset.tempFillIns = JSON.stringify(updatedFillIns);
}

// --- Functions for Marking Absent within Past Log Form ---
function handleMarkPastAbsent(event) {
    event.stopPropagation();
    const button = event.currentTarget;
    const studentSection = button.closest('.student-log-entry');
    if (!studentSection) return;
    const studentId = studentSection.dataset.studentId;
    closePastReasonDropdowns();
    const buttonContainer = studentSection.querySelector('.past-log-action-buttons');
    if (buttonContainer) {
        _createPastAbsenceReasonDropdown(studentId, studentSection, buttonContainer);
    }
}

function handleUndoPastAbsent(event) {
    event.stopPropagation();
    const button = event.currentTarget;
    const studentSection = button.closest('.student-log-entry');
    if (!studentSection) return;
    studentSection.classList.remove('opacity-50');
    delete studentSection.dataset.isAbsent;
    delete studentSection.dataset.absenceReason;
    const nameElement = studentSection.querySelector('.student-name');
    if (nameElement) nameElement.classList.remove('line-through', 'text-gray-500', 'dark:text-gray-400');
    const contentDiv = studentSection.querySelector('.student-form-content');
    if (contentDiv) contentDiv.classList.remove('hidden');
    button.classList.add('hidden');
    const markAbsentButton = studentSection.querySelector('.mark-past-absent-btn');
    if (markAbsentButton) markAbsentButton.classList.remove('hidden');
}

function _createPastAbsenceReasonDropdown(studentId, studentSection, targetElement) {
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'past-absence-reason-dropdown absolute z-20 mt-1 right-0 w-48 bg-white dark:bg-gray-700 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 max-h-40 overflow-y-auto';
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
        button.addEventListener('click', handlePastReasonSelected);
        listItem.appendChild(button);
        list.appendChild(listItem);
    });
    dropdownContainer.appendChild(list);
    targetElement.appendChild(dropdownContainer);
    setTimeout(() => {
        document.addEventListener('click', closePastReasonDropdownOnClickOutside, { capture: true, once: true });
    }, 0);
}

function closePastReasonDropdowns() {
    document.querySelectorAll('.past-absence-reason-dropdown').forEach(d => d.remove());
    document.removeEventListener('click', closePastReasonDropdownOnClickOutside, { capture: true });
}

function closePastReasonDropdownOnClickOutside(event) {
    const dropdown = document.querySelector('.past-absence-reason-dropdown');
    if (dropdown && !dropdown.contains(event.target) && !event.target.closest('.mark-past-absent-btn')) {
        closePastReasonDropdowns();
    }
}

function handlePastReasonSelected(event) {
    event.stopPropagation();
    const button = event.currentTarget;
    const reason = button.dataset.reason;
    const studentId = parseInt(button.dataset.studentId);
    const dropdown = button.closest('.past-absence-reason-dropdown');
    const studentSection = dropdown?.closest('.student-log-entry');
    if (isNaN(studentId) || !studentSection) {
        closePastReasonDropdowns();
        return;
    }
    studentSection.classList.add('opacity-50');
    studentSection.dataset.isAbsent = 'true';
    studentSection.dataset.absenceReason = reason;
    const nameElement = studentSection.querySelector('.student-name');
    if (nameElement) nameElement.classList.add('line-through', 'text-gray-500', 'dark:text-gray-400');
    const contentDiv = studentSection.querySelector('.student-form-content');
    if (contentDiv) contentDiv.classList.add('hidden');
    const markAbsentButton = studentSection.querySelector('.mark-past-absent-btn');
    if (markAbsentButton) markAbsentButton.classList.add('hidden');
    const undoButton = studentSection.querySelector('.undo-past-absent-btn');
    if (undoButton) undoButton.classList.remove('hidden');
    closePastReasonDropdowns();
}

// --- Add a ready flag ---
export const isReady = true;

console.log("Logging module (logging.js) loaded.");
