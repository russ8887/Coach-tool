// js/ui.js
// Handles UI manipulation, showing/hiding elements, messages, quotes, and theme toggling (ES Module).
// v13: Updated theme toggle to use emoji.

// --- Import Dependencies ---
import { appState } from './state.js'; // Import appState
import { getStudentDetails } from './utils.js'; // Import getStudentDetails for rendering names
// Import logging functions needed to open the form for past logs
import { populateInlineLogForm } from './logging.js';

// --- Define module-level variables for elements (assigned in initializeUI) ---
let loginSection, appSection, passwordResetSection, loginErrorMessage, passwordResetMessage,
    coachSelectorContainer, scheduleDisplay, slotActions, fillInSection, logViewerContainer,
    logViewerSection, selectedSlotInfo, confirmFillInButton, coachScheduleDiv, fillInResultsDiv,
    logViewerOutput, logViewerLoading, weekSelector, adminBadge, adminActionsSection,
    loginQuoteElement, mainQuoteSection, mainQuoteElement, generalErrorMessageDiv,
    generalErrorTextSpan, logViewerControls, logFilterStudentSelect, logSortDateDescButton,
    logSortDateAscButton, logSortStudentButton, dateTermInfoDiv, forgotPasswordLink,
    updatePasswordButton, testModeButton, clearTestDataButton, logoutButton,
    adminToggleButton, themeToggleButton, themeEmojiContainer, // Changed from themeToggleDarkIcon/LightIcon
    // *** NEW: Elements for missed log warning and display ***
    missedLogWarningDiv, missedLogWarningText, pastMissedLogsSection, pastMissedLogsOutput;


// --- Chess Quotes ---
const chessQuotes = [
    "The pawns are the soul of chess.",
    "When you see a good move, look for a better one.",
    "Chess is the gymnasium of the mind.",
    "Every chess master was once a beginner.",
    "A bad plan is better than no plan at all.",
    "Tactics flow from a superior position.",
    "The blunders are all there on the board, waiting to be made.",
    "Play the opening like a book, the middlegame like a magician, and the endgame like a machine.",
    "Chess, like love, like music, has the power to make men happy.",
    "Give me a difficult positional game, I will play it. Give me a bad position, I will defend it. But give me a winning position, I will find a way to lose it."
];

// --- Exported UI State Functions ---

/** Displays a random chess quote in the target element. */
export function displayRandomQuote(targetElement) {
    if (targetElement) {
        const randomIndex = Math.floor(Math.random() * chessQuotes.length);
        targetElement.textContent = chessQuotes[randomIndex];
        targetElement.classList.add('visible'); // Trigger fade-in
    } else {
        console.warn("UI Warn: Target element for quote not found.");
    }
}

/** Shows the login screen, optionally displaying a message. */
export function showLoginScreen(message = null, isError = false) {
    console.log("UI: Attempting to show Login Screen.");
    if (loginSection && appSection && passwordResetSection) {
        loginSection.classList.remove('hidden');
        appSection.classList.add('hidden');
        passwordResetSection.classList.add('hidden');
        console.log("UI: Login screen displayed.");
        // Display message if provided
        if (message && loginErrorMessage) {
            loginErrorMessage.textContent = message;
            loginErrorMessage.classList.toggle('text-red-500', isError);
            loginErrorMessage.classList.toggle('dark:text-red-400', isError);
            loginErrorMessage.classList.toggle('text-green-600', !isError); // Example success color
            loginErrorMessage.classList.toggle('dark:text-green-400', !isError);
        } else if (loginErrorMessage) {
            loginErrorMessage.textContent = ''; // Clear previous messages
        }
        // Display quote on login screen
        displayRandomQuote(loginQuoteElement);
    } else {
        console.error("UI Error (showLoginScreen): Login, App, or Password Reset section element not found.");
        // Handle critical error - maybe alert user?
        alert("Critical UI Error: Cannot display login screen. Please refresh.");
    }
}

/** Shows the main application content area. */
export function showAppContent() {
    console.log("UI: Attempting to show App Content..."); // Log entry
    if (loginSection && appSection && passwordResetSection) {
        loginSection.classList.add('hidden');
        passwordResetSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        console.log("UI: Switched to App Content view."); // Log success
        // Display quote in main app area
        displayRandomQuote(mainQuoteElement);
    } else {
        // Log which specific element(s) are missing
        let missing = [];
        if (!loginSection) missing.push("loginSection (#login-section)");
        if (!appSection) missing.push("appSection (#app-section)");
        if (!passwordResetSection) missing.push("passwordResetSection (#password-reset-section)");
        console.error(`UI Error (showAppContent): Required section elements not found. Missing: ${missing.join(', ')}`);
        alert("Critical UI Error: Cannot display application content. Please refresh.");
    }
}


/** Shows the password reset form area. */
export function showPasswordResetForm() {
    console.log("UI: Attempting to show Password Reset Form.");
    if (loginSection && appSection && passwordResetSection) {
        loginSection.classList.add('hidden');
        appSection.classList.add('hidden');
        passwordResetSection.classList.remove('hidden');
        console.log("UI: Password Reset Form displayed.");
        // Clear potential login errors when showing reset form
        clearError("login");
    } else {
        console.error("UI Error (showPasswordResetForm): Login, App, or Password Reset section element not found.");
        alert("Critical UI Error: Cannot display password reset form. Please refresh.");
    }
}

/** Hides secondary sections within the main app view (e.g., log viewer, fill-in). */
export function hideAppSubsections() {
    // Use optional chaining ?. in case elements don't exist yet or are removed
    logViewerContainer?.classList.add('hidden');
    // fillInSection?.classList.add('hidden'); // fillInSection might not be used anymore
    slotActions?.classList.add('hidden');
    pastMissedLogsSection?.classList.add('hidden'); // Hide past missed logs section
    console.log("UI: App subsections hidden.");
}

/** Shows a loading indicator. */
export function showLoading(type = 'general') { // Default to general if not specified
    // console.log(`UI: Showing loading indicator (type: ${type})`); // Can be noisy
    if (type === 'logViewer' && logViewerLoading) {
        logViewerLoading.classList.remove('hidden');
    } else if (type === 'login' && loginSection) {
        // Example: Dim the login form or show a spinner near the button
        const loginButton = loginSection.querySelector('#login-button');
        if (loginButton) {
            loginButton.innerHTML = `
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing In...`;
        }
    } else if (type === 'main' && scheduleDisplay) {
         // Example: Show a simple loading text over the schedule area
         const loadingOverlay = document.createElement('div');
         loadingOverlay.id = 'main-loading-overlay';
         loadingOverlay.className = 'absolute inset-0 bg-gray-100 dark:bg-gray-800 bg-opacity-75 dark:bg-opacity-75 flex items-center justify-center z-10';
         loadingOverlay.innerHTML = '<p class="text-lg font-semibold text-gray-700 dark:text-gray-300">Loading Schedule...</p>';
         scheduleDisplay.style.position = 'relative'; // Ensure parent is positioned
         scheduleDisplay.appendChild(loadingOverlay);
    } else {
        // General loading - maybe a global spinner or overlay? (Not implemented here)
        console.log("UI: General loading state requested (implement if needed).");
    }
}

/** Hides a loading indicator. */
export function hideLoading(type = 'general') {
    // console.log(`UI: Hiding loading indicator (type: ${type})`); // Can be noisy
     if (type === 'logViewer' && logViewerLoading) {
        logViewerLoading.classList.add('hidden');
    } else if (type === 'login' && loginSection) {
        // Restore login button text
        const loginButton = loginSection.querySelector('#login-button');
        if (loginButton) {
            loginButton.innerHTML = 'Sign In'; // Restore original text
        }
    } else if (type === 'main') {
         const loadingOverlay = document.getElementById('main-loading-overlay');
         if (loadingOverlay) {
             loadingOverlay.remove();
         }
         if (scheduleDisplay) {
             scheduleDisplay.style.position = ''; // Reset position
         }
    } else {
        // Hide general loading indicator if implemented
        // console.log("UI: General loading state hide requested.");
    }
}

/** Displays an error message in a designated area. */
export function displayError(message, location = 'general') {
    console.error(`UI Error Display (${location}): ${message}`);
    if (location === 'login' && loginErrorMessage) {
        loginErrorMessage.textContent = message || 'An error occurred.';
        loginErrorMessage.classList.remove('text-green-600', 'dark:text-green-400'); // Ensure error colors
        loginErrorMessage.classList.add('text-red-500', 'dark:text-red-400');
    } else if (location === 'password-reset' && passwordResetMessage) {
         passwordResetMessage.textContent = message || 'An error occurred.';
         passwordResetMessage.classList.remove('text-green-600', 'dark:text-green-400');
         passwordResetMessage.classList.add('text-red-500', 'dark:text-red-400');
    } else if (location === 'general' && generalErrorMessageDiv && generalErrorTextSpan) {
        generalErrorTextSpan.textContent = message || 'An unexpected error occurred. Please try again.';
        generalErrorMessageDiv.classList.remove('hidden');
        // Auto-hide after some time?
        // setTimeout(() => clearError('general'), 5000);
    } else {
        // Fallback if specific location not found
        console.warn(`UI Warn: Error location "${location}" not found. Displaying alert.`);
        alert(`Error: ${message}`);
    }
}

/** Clears error messages from a designated area. */
export function clearError(location = 'general') {
    if (location === 'login' && loginErrorMessage) {
        loginErrorMessage.textContent = '';
    } else if (location === 'password-reset' && passwordResetMessage) {
         passwordResetMessage.textContent = '';
    } else if (location === 'general' && generalErrorMessageDiv) {
        generalErrorMessageDiv.classList.add('hidden');
        if (generalErrorTextSpan) generalErrorTextSpan.textContent = '';
    } else {
        // console.log(`UI: No specific error area found for location "${location}" to clear.`);
    }
}

/** Displays a status message (can be success or other info). */
export function showStatusMessage(message, location = 'general', isSuccess = true) {
     console.log(`UI Status (${location}): ${message}`);
     // Use displayError function but toggle the error class based on isSuccess
     if (location === 'password-reset' && passwordResetMessage) {
         passwordResetMessage.textContent = message;
         passwordResetMessage.classList.toggle('text-red-500', !isSuccess);
         passwordResetMessage.classList.toggle('dark:text-red-400', !isSuccess);
         passwordResetMessage.classList.toggle('text-green-600', isSuccess);
         passwordResetMessage.classList.toggle('dark:text-green-400', isSuccess);
     } else if (location === 'general' && generalErrorMessageDiv && generalErrorTextSpan) {
         generalErrorTextSpan.textContent = message;
         generalErrorMessageDiv.classList.remove('hidden');
         generalErrorMessageDiv.classList.toggle('bg-red-100', !isSuccess);
         generalErrorMessageDiv.classList.toggle('dark:bg-red-900/50', !isSuccess);
         generalErrorMessageDiv.classList.toggle('border-red-400', !isSuccess);
         generalErrorMessageDiv.classList.toggle('dark:border-red-600', !isSuccess);
         generalErrorMessageDiv.classList.toggle('text-red-700', !isSuccess);
         generalErrorMessageDiv.classList.toggle('dark:text-red-300', !isSuccess);
         generalErrorMessageDiv.classList.toggle('bg-green-100', isSuccess); // Example success style
         generalErrorMessageDiv.classList.toggle('dark:bg-green-900/50', isSuccess);
         generalErrorMessageDiv.classList.toggle('border-green-400', isSuccess);
         generalErrorMessageDiv.classList.toggle('dark:border-green-600', isSuccess);
         generalErrorMessageDiv.classList.toggle('text-green-700', isSuccess);
         generalErrorMessageDiv.classList.toggle('dark:text-green-300', isSuccess);
         // Auto-hide?
         // setTimeout(() => clearError('general'), 3000);
     } else {
         alert(message); // Fallback
     }
}

/** Displays a message on the password reset screen. */
export function displayPasswordResetMessage(message, isError = false) {
    if (passwordResetMessage) {
        passwordResetMessage.textContent = message;
        passwordResetMessage.classList.toggle('text-red-500', isError);
        passwordResetMessage.classList.toggle('dark:text-red-400', isError);
        passwordResetMessage.classList.toggle('text-green-600', !isError);
        passwordResetMessage.classList.toggle('dark:text-green-400', !isError);
    } else {
        console.warn("UI Warn: Password reset message element not found.");
    }
}

/** Clears the message on the password reset screen. */
export function clearPasswordResetMessage() {
    if (passwordResetMessage) {
        passwordResetMessage.textContent = '';
    }
}

/** Shows or hides the admin badge. */
export function displayAdminIndicator(isAdmin) {
    if (adminBadge) {
        adminBadge.classList.toggle('hidden', !isAdmin);
        console.log(`UI: Admin badge visibility set to ${!isAdmin ? 'hidden' : 'visible'}`);
    } else {
        console.warn("UI Warn: Admin badge element not found.");
    }
}

/** Displays the current date and term/week info. */
export function displayCurrentDateInfo(date, termInfo) {
    if (dateTermInfoDiv) {
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        let text = date.toLocaleDateString(undefined, dateOptions);
        if (termInfo && termInfo.term && termInfo.week) {
            text += ` | Term ${termInfo.term}, Week ${termInfo.week}`;
        } else if (termInfo && termInfo.error) {
             text += ` | Term info unavailable`;
             console.warn("UI Warn: Term info error:", termInfo.error);
        } else {
             text += ` | Outside of term dates`;
        }
        dateTermInfoDiv.textContent = text;
    } else {
        console.warn("UI Warn: Date/term info div not found.");
    }
}

/** Updates the appearance and text of the Test Mode button. */
export function updateTestModeButton(isTestModeActive) {
    const button = document.getElementById('test-mode-button');
    if (!button) {
        console.warn("UI Warn: Test mode button not found.");
        return;
    }

    const emojiSpan = button.querySelector('.emoji');
    const textSpan = button.querySelector('.text');

    if (isTestModeActive) {
        if (emojiSpan) emojiSpan.textContent = '🧪'; // Flask emoji
        if (textSpan) textSpan.textContent = 'Test Mode ACTIVE';
        button.classList.remove('bg-gray-200', 'hover:bg-gray-300', 'dark:bg-gray-700', 'dark:hover:bg-gray-600', 'text-gray-700', 'dark:text-gray-300', 'focus:ring-gray-500');
        button.classList.add('bg-red-500', 'hover:bg-red-600', 'text-white', 'focus:ring-red-500');
        button.title = "Test Mode is ON. Click to switch to Live Mode.";
    } else {
        if (emojiSpan) emojiSpan.textContent = '✅'; // Check mark emoji
        if (textSpan) textSpan.textContent = 'Live Mode';
        button.classList.remove('bg-red-500', 'hover:bg-red-600', 'text-white', 'focus:ring-red-500');
        button.classList.add('bg-gray-200', 'hover:bg-gray-300', 'dark:bg-gray-700', 'dark:hover:bg-gray-600', 'text-gray-700', 'dark:text-gray-300', 'focus:ring-gray-500');
        button.title = "Live Mode is ON. Click to switch to Test Mode.";
    }

    // Update clear test data button state
    if (clearTestDataButton) {
        clearTestDataButton.disabled = !isTestModeActive;
        clearTestDataButton.title = isTestModeActive ? "Delete all test data" : "Activate Test Mode to enable";
    }
    console.log(`UI: Test mode button updated. Active: ${isTestModeActive}`);
}


// --- Dark Mode Functions (Internal) ---

/** Initializes the theme toggle button listener and sets initial state. */
function initializeThemeToggle() {
    // *** Updated to use themeEmojiContainer ***
    if (!themeToggleButton || !themeEmojiContainer) {
        console.error("UI Error: Theme toggle button or emoji container not found.");
        return;
    }
    // Set initial emoji based on current theme
    applyThemePreference();
    // Add listener
    themeToggleButton.removeEventListener('click', handleThemeToggle); // Prevent duplicates
    themeToggleButton.addEventListener('click', handleThemeToggle);
    console.log("UI: Theme toggle initialized.");
}

/** Applies theme based on localStorage or OS preference and updates button emoji. */
function applyThemePreference() {
    // Check preference
    const theme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (!theme && prefersDark);

    // Apply class to HTML element
    document.documentElement.classList.toggle('dark', isDark);

    // *** Update button emoji ***
    if (themeEmojiContainer) {
        themeEmojiContainer.textContent = isDark ? '☀️' : '🌙'; // Sun for dark mode, Moon for light mode
    }
    console.log(`UI: Theme applied: ${isDark ? 'dark' : 'light'}`);
}

/** Handles clicks on the theme toggle button. */
function handleThemeToggle(event) {
    event.preventDefault();
    const isDark = document.documentElement.classList.contains('dark');
    // Toggle theme
    if (isDark) {
        localStorage.setItem('theme', 'light');
    } else {
        localStorage.setItem('theme', 'dark');
    }
    // Re-apply preference and update emoji
    applyThemePreference();
}

// --- Admin Toggle Function (Internal) ---

/** Handles clicks on the admin toggle button. */
function handleAdminToggle() {
    if (!adminActionsSection) {
        console.warn("UI Warn: Admin actions section not found for toggle.");
        return;
    }
    const content = adminActionsSection.querySelector('#admin-tools-content');
    const button = adminActionsSection.querySelector('#admin-toggle-button');
    if (!content || !button) {
        console.warn("UI Warn: Admin tools content or toggle button not found inside section.");
        return;
    }

    const isHidden = content.classList.toggle('hidden');
    const emojiSpan = button.querySelector('span:first-child'); // Get the emoji span
    const textSpan = button.querySelector('span:last-child'); // Get the text span

    if (textSpan) {
        textSpan.textContent = isHidden ? 'Show Tools' : 'Hide Tools';
    }
    // Optionally change emoji too, e.g., open/closed toolbox
    // if (emojiSpan) { emojiSpan.textContent = isHidden ? '🧰' : '🛠️'; }

    console.log(`UI: Admin tools toggled. Hidden: ${isHidden}`);
}


/** Shows or hides the admin toggle button itself based on user admin status. */
export function displayAdminToggleButton(isAdmin) {
    if (adminToggleButton) {
        adminToggleButton.classList.toggle('hidden', !isAdmin);
        // Also hide the entire section if user is not admin
        if (adminActionsSection) {
            adminActionsSection.classList.toggle('hidden', !isAdmin);
            // Ensure content is hidden and button text reset if section is hidden
            if (!isAdmin) {
                 const content = adminActionsSection.querySelector('#admin-tools-content');
                 const textSpan = adminToggleButton.querySelector('span:last-child');
                 if (content) content.classList.add('hidden');
                 if (textSpan) textSpan.textContent = 'Show Tools'; // Reset button text
            }
        }
        console.log(`UI: Admin toggle button visibility set. IsAdmin: ${isAdmin}`);
    } else {
        // If button doesn't exist, ensure section is hidden if not admin
        if (!isAdmin && adminActionsSection) {
            adminActionsSection.classList.add('hidden');
        }
        console.log(`UI: Admin toggle button not found. Section visibility set based on isAdmin: ${isAdmin}`);
    }
}

// --- Missed Log Warning and Display Functions ---

/**
 * Displays or hides a warning message about missed logs.
 * @param {number} todaysMissedCount - The number of logs missed today (calculated in schedule.js).
 */
export function displayMissedLogWarning(todaysMissedCount) {
    if (!missedLogWarningDiv || !missedLogWarningText) {
        console.warn("UI Warn: Missed log warning elements not found.");
        return;
    }

    // Get past missed count from state
    const pastMissedCount = appState?.pastMissedLogs?.length || 0;
    const totalMissedCount = todaysMissedCount + pastMissedCount;

    // *** Add explicit logging for counts ***
    console.log(`UI DEBUG (displayMissedLogWarning): Today's=${todaysMissedCount}, Past=${pastMissedCount}, Total=${totalMissedCount}`);

    if (totalMissedCount > 0) {
        let message = `Warning: You have ${totalMissedCount} missed log entr${totalMissedCount === 1 ? 'y' : 'ies'}. `;
        if (todaysMissedCount > 0 && pastMissedCount > 0) {
            message += `(${todaysMissedCount} from today, ${pastMissedCount} from previous days)`;
        } else if (todaysMissedCount > 0) {
            message += `(from today)`;
        } else { // Only past missed logs
            message += `(from previous days)`;
        }
        // Add prompt to check the sections
        if (pastMissedCount > 0) {
            message += ' Please check the "Past Missed Logs" section below.';
        }
        if (todaysMissedCount > 0) {
             message += ' Today\'s missed slots are highlighted yellow below.';
        }

        missedLogWarningText.textContent = message;
        missedLogWarningDiv.classList.remove('hidden'); // Ensure it's visible
        // Apply attention-grabbing styles (e.g., yellow background, bold text)
        missedLogWarningDiv.classList.remove('bg-green-100', 'dark:bg-green-900/50', 'border-green-400', 'dark:border-green-600', 'text-green-700', 'dark:text-green-300');
        missedLogWarningDiv.classList.add('bg-yellow-100', 'dark:bg-yellow-800/50', 'border-yellow-400', 'dark:border-yellow-600', 'text-yellow-800', 'dark:text-yellow-200', 'font-semibold');
        console.log("UI: Displayed missed log warning."); // Log display
    } else {
        // Hide the warning if no missed logs
        missedLogWarningDiv.classList.add('hidden');
        console.log("UI: Hid missed log warning (count is zero)."); // Log hiding
    }
}

/**
 * Renders the list of past missed logs.
 * @param {Array} missedLogs - Array of missed log objects from appState.pastMissedLogs.
 * Expected object structure: { schedule_id, missed_date, slot_time, original_student_ids, absent_student_info }
 */
export function displayPastMissedLogsUI(missedLogs) {
    if (!pastMissedLogsSection || !pastMissedLogsOutput) {
        console.warn("UI Warn: Past missed logs section or output element not found.");
        return;
    }

    if (!Array.isArray(missedLogs) || missedLogs.length === 0) {
        pastMissedLogsOutput.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 italic">No past missed logs found.</p>';
        pastMissedLogsSection.classList.add('hidden'); // Hide the section if no past logs
        return;
    }

    pastMissedLogsSection.classList.remove('hidden'); // Show the section
    pastMissedLogsOutput.innerHTML = ''; // Clear previous content

    const list = document.createElement('ul');
    list.className = 'space-y-3';

    missedLogs.forEach(log => {
        const listItem = document.createElement('li');
        // *** Add data attributes to the list item itself ***
        listItem.dataset.scheduleId = log.schedule_id;
        listItem.dataset.missedDate = log.missed_date;
        listItem.className = 'p-3 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700/50 shadow-sm';

        const dateObj = new Date(log.missed_date + 'T00:00:00Z'); // Assume UTC date from DB
        const dateString = dateObj.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
        const timeString = log.slot_time.substring(0, 5); // HH:MM

        const headerDiv = document.createElement('div');
        headerDiv.className = 'flex justify-between items-center mb-2';
        // Store original students and absent info (as JSON) in button data attributes
        const originalIdsString = JSON.stringify(log.original_student_ids || []);
        const absentInfoString = JSON.stringify(log.absent_student_info || []);
        headerDiv.innerHTML = `
            <span class="font-semibold text-gray-800 dark:text-gray-100">${dateString} at ${timeString}</span>
            <button type="button" class="log-past-slot-btn text-xs bg-blue-500 hover:bg-blue-700 text-white font-semibold py-1 px-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-gray-800"
                    data-schedule-id="${log.schedule_id}"
                    data-missed-date="${log.missed_date}"
                    data-slot-time="${log.slot_time}"
                    data-original-students='${originalIdsString}'
                    data-absent-info='${absentInfoString}'>
                Log Now
            </button>
        `;

        const studentList = document.createElement('ul');
        studentList.className = 'list-disc list-inside ml-4 text-xs space-y-0.5';
        // *** Create a map from the absent_student_info for easy lookup ***
        const absentInfoMap = new Map();
        (log.absent_student_info || []).forEach(info => {
            if (info && typeof info.id !== 'undefined') {
                absentInfoMap.set(info.id, info.reason || 'Marked Absent'); // Use reason or default text
            }
        });

        if (!log.original_student_ids || log.original_student_ids.length === 0) {
             const noStudentLi = document.createElement('li');
             noStudentLi.className = 'text-gray-500 dark:text-gray-400 italic';
             noStudentLi.textContent = 'No students were originally scheduled.';
             studentList.appendChild(noStudentLi);
        } else {
            log.original_student_ids.forEach(studentId => {
                const studentDetails = getStudentDetails(studentId, appState.studentsData);
                const studentName = studentDetails?.Name || `ID: ${studentId}`;
                const studentLi = document.createElement('li');
                studentLi.className = 'text-gray-600 dark:text-gray-300';

                // *** Check the map for absence info ***
                if (absentInfoMap.has(studentId)) {
                    const reason = absentInfoMap.get(studentId);
                    const reasonText = reason ? ` - ${reason}` : '';
                    // Apply styles for absent students and show reason
                    studentLi.innerHTML = `<span class="line-through text-gray-400 dark:text-gray-500">${studentName}</span> <span class="text-red-500 dark:text-red-400 text-[10px]">(Absent${reasonText})</span>`;
                } else {
                    studentLi.textContent = studentName; // Display normally if not absent
                }
                studentList.appendChild(studentLi);
            });
        }


        listItem.appendChild(headerDiv);
        listItem.appendChild(studentList);
        // *** Add placeholder div for the form ***
        const formPlaceholder = document.createElement('div');
        formPlaceholder.className = 'past-log-form-container mt-3'; // Add margin-top
        listItem.appendChild(formPlaceholder);

        list.appendChild(listItem);
    });

    pastMissedLogsOutput.appendChild(list);

    // Add event listener for the "Log Now" buttons using delegation
    pastMissedLogsOutput.removeEventListener('click', handleLogPastSlotClick); // Prevent duplicates
    pastMissedLogsOutput.addEventListener('click', handleLogPastSlotClick);
}

/**
 * Handles clicks on the "Log Now" button for past missed logs.
 * Opens the log form directly within the list item.
 */
function handleLogPastSlotClick(event) {
    if (!event.target.classList.contains('log-past-slot-btn')) return;

    const button = event.target;
    const listItem = button.closest('li'); // Find the parent list item
    const scheduleId = parseInt(button.dataset.scheduleId);
    const missedDate = button.dataset.missedDate;
    const slotTime = button.dataset.slotTime;
    const originalStudentIds = JSON.parse(button.dataset.originalStudents || '[]');
    const absentStudentInfo = JSON.parse(button.dataset.absentInfo || '[]');
    const absentStudentIds = absentStudentInfo.map(info => info.id);

    if (isNaN(scheduleId) || !missedDate || !slotTime || !listItem) {
        console.error("UI Error: Invalid data on 'Log Now' button or couldn't find list item.");
        displayError("Error preparing log form: Invalid data.", "general");
        return;
    }

    console.log(`UI: 'Log Now' clicked for past slot ${scheduleId} on ${missedDate} at ${slotTime}`);

    // --- Close any other open past log forms ---
    document.querySelectorAll('.past-log-form-container').forEach(container => {
        // Don't remove the container we are about to populate
        if (!listItem.contains(container)) {
            container.innerHTML = ''; // Clear content of other forms
        }
    });

    // --- Find the placeholder within this list item ---
    const formContainer = listItem.querySelector('.past-log-form-container');
    if (!formContainer) {
        console.error("UI Error: Could not find .past-log-form-container within the list item.");
        return;
    }

    // --- Prepare data and populate form ---
    const presentStudentIds = originalStudentIds.filter(id => !absentStudentIds.includes(id));

    // Need coachId and capacity - try getting from appState based on scheduleId
    let coachId = null;
    let capacity = 3; // Default capacity
    let day = null; // Day isn't strictly needed for past log form, but good to have
    // Find slot in current schedule data to get coach/capacity/day
    for (const scheduleDay in appState.scheduleData) {
        const slotData = appState.scheduleData[scheduleDay].find(s => s.schedule_id === scheduleId);
        if (slotData) {
            coachId = slotData.coach_id;
            capacity = slotData.capacity;
            day = slotData.day;
            break;
        }
    }

    if (!coachId) {
         console.warn(`UI Warn: Could not find coachId/capacity for scheduleId ${scheduleId} in current appState.scheduleData. Using defaults.`);
         // Attempt to get coachId from the currently selected coach as a fallback
         coachId = appState.currentCoachId;
         if (!coachId) {
             displayError("Error preparing log form: Cannot determine coach.", "general");
             return;
         }
    }

    const selectedSlotDetails = {
        scheduleId,
        day: day, // May be null, but okay for form population
        time: slotTime,
        coachId,
        capacity,
        originalStudentIds: originalStudentIds,
        currentStudentIds: presentStudentIds, // Only present students for form fields
        isPastLog: true,
        pastLogDate: missedDate,
        absentStudentInfo: absentStudentInfo // Pass full info if needed later
    };

    console.log(`UI: Populating inline form for PAST log: Slot ${scheduleId}, Date ${missedDate}`);
    populateInlineLogForm(formContainer, selectedSlotDetails); // Pass the container div

    // Add data attribute to the form itself for the logging submit handler
    const form = formContainer.querySelector('form');
    if (form) {
        form.dataset.pastLogDate = missedDate;
    } else {
         console.error("UI Error: Could not find form element after populating.");
    }
}


/**
 * Initializes UI elements and listeners. Called by main.js
 * (Exported)
 */
export function initializeUI() {
    console.log("UI: Initializing UI listeners.");

    // Assign elements now that DOM is ready
    loginSection = document.getElementById('login-section');
    appSection = document.getElementById('app-section');
    passwordResetSection = document.getElementById('password-reset-section');
    loginErrorMessage = document.getElementById('login-error-message');
    passwordResetMessage = document.getElementById('password-reset-message');
    coachSelectorContainer = document.getElementById('coach-selector-container');
    scheduleDisplay = document.getElementById('schedule-display');
    slotActions = document.getElementById('slot-actions');
    // fillInSection = document.getElementById('fill-in-section'); // Removed as fillIn.js was removed
    logViewerContainer = document.getElementById('log-viewer-container');
    logViewerSection = document.getElementById('log-viewer-section');
    // selectedSlotInfo = document.getElementById('selected-slot-info'); // Seems unused, remove?
    // confirmFillInButton = document.getElementById('confirm-fill-in-button'); // Seems unused, remove?
    coachScheduleDiv = document.getElementById('coach-schedule');
    // fillInResultsDiv = document.getElementById('fill-in-results'); // Seems unused, remove?
    logViewerOutput = document.getElementById('log-viewer-output');
    logViewerLoading = document.getElementById('log-viewer-loading');
    weekSelector = document.getElementById('week-selector');
    adminBadge = document.getElementById('admin-badge');
    adminActionsSection = document.getElementById('admin-actions-section');
    loginQuoteElement = document.getElementById('chess-quote');
    // mainQuoteSection = document.getElementById('main-quote-section'); // Container div, might not need variable
    mainQuoteElement = document.getElementById('main-chess-quote');
    generalErrorMessageDiv = document.getElementById('general-error-message');
    generalErrorTextSpan = document.getElementById('general-error-text');
    logViewerControls = document.getElementById('log-viewer-controls');
    logFilterStudentSelect = document.getElementById('log-filter-student');
    logSortDateDescButton = document.getElementById('log-sort-date-desc');
    logSortDateAscButton = document.getElementById('log-sort-date-asc');
    logSortStudentButton = document.getElementById('log-sort-student');
    dateTermInfoDiv = document.getElementById('date-term-info');
    forgotPasswordLink = document.getElementById('forgot-password-link');
    updatePasswordButton = document.getElementById('update-password-button');
    testModeButton = document.getElementById('test-mode-button');
    clearTestDataButton = document.getElementById('clear-test-data-button');
    logoutButton = document.getElementById('logout-button');
    adminToggleButton = document.getElementById('admin-toggle-button');
    themeToggleButton = document.getElementById('theme-toggle');
    // *** Updated to use emoji container ***
    themeEmojiContainer = document.getElementById('theme-emoji-container');
    // *** NEW: Assign missed log elements ***
    missedLogWarningDiv = document.getElementById('missed-log-warning');
    missedLogWarningText = document.getElementById('missed-log-warning-text');
    pastMissedLogsSection = document.getElementById('past-missed-logs-section');
    pastMissedLogsOutput = document.getElementById('past-missed-logs-output');


    // Check if essential elements were found
     if (!loginSection || !appSection || !themeToggleButton || !missedLogWarningDiv || !pastMissedLogsSection) { // Added checks for new elements
         console.error("UI Init Error: Critical elements (login/app section, theme button, or missed log sections) not found!");
         isReady = false; // Mark as not ready
         return; // Stop initialization
     }


    initializeThemeToggle(); // Initialize theme toggle first

    // Initialize Admin toggle button listener
    if (adminToggleButton) {
        adminToggleButton.removeEventListener('click', handleAdminToggle);
        adminToggleButton.addEventListener('click', handleAdminToggle);
        console.log("UI: Admin toggle listener attached.");
    } else {
        console.log("UI: Admin toggle button not found during init (might be hidden).");
    }
    isReady = true; // Mark as ready
    console.log("UI Module Initialized and Ready.");
}

// --- Initialization ---
// REMOVED DOMContentLoaded wrapper

// --- Add a ready flag ---
export let isReady = false; // Initialize as false, set true in initializeUI

console.log("UI Utilities module loaded.");

