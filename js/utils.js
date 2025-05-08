// js/utils.js
// Shared utility functions for the Chess Coach Schedule Tool (ES Module).
// v4: Fixed ReferenceError in getStudentDetails fallback logic.

/**
 * Retrieves student details from the provided studentsData array.
 * @param {number|string} studentId - The ID of the student to find.
 * @param {Array} studentsData - The array of student objects (usually from appState).
 * @returns {object|null} The student object or null if not found.
 */
export function getStudentDetails(studentId, studentsData) {
    if (!studentsData || studentsData.length === 0) {
        // Return a default object if no student data is available
        // console.warn("getStudentDetails: studentsData is empty or null.");
        return { name: 'Unknown Student', id: studentId };
    }
    if (studentId === null || typeof studentId === 'undefined') { // Allow 0 but not null/undefined
        // console.warn("getStudentDetails: Received null or undefined studentId.");
        return null;
    }

    let idToFind;
    try {
        idToFind = parseInt(studentId);
        if (isNaN(idToFind)) {
             // Handle cases where studentId might be a non-numeric string unexpectedly
             console.warn(`getStudentDetails: Invalid non-numeric studentId "${studentId}" received.`);
             return { name: 'Unknown Student', id: studentId };
        }
    } catch (parseError) {
         console.error(`getStudentDetails: Error parsing studentId "${studentId}".`, parseError);
         return { name: 'Unknown Student', id: studentId }; // Return default on parsing error
    }

    const foundStudent = studentsData.find(s => s.id === idToFind);

    // Ensure the returned object has a Name property, even if null, for consistency
    if (foundStudent) {
        if (typeof foundStudent.Name === 'undefined') {
            // Attempt to use lowercase 'name' if 'Name' is missing
            if (typeof foundStudent.name !== 'undefined') {
                 foundStudent.Name = foundStudent.name;
            } else {
                 foundStudent.Name = null; // Or 'Name Missing'
            }
        }
        // Ensure groupOf exists and is a number, default to 1 (Solo) if missing/invalid
        if (typeof foundStudent.groupOf !== 'number' || isNaN(foundStudent.groupOf)) {
            // console.warn(`getStudentDetails: Missing or invalid groupOf for student ${foundStudent.id}. Defaulting to 1.`);
            foundStudent.groupOf = 1;
        }
        // Ensure sub_group exists, default to null if missing
        if (typeof foundStudent.sub_group === 'undefined') {
            foundStudent.sub_group = null;
        }
         // Ensure class_name exists, default to null if missing
         if (typeof foundStudent.class_name === 'undefined') {
             foundStudent.class_name = null;
         }
          // Ensure availability_string exists, default to null if missing
          if (typeof foundStudent.availability_string === 'undefined') {
               // *** FIX: Use foundStudent here, not studentDetails ***
               foundStudent.availability_string = foundStudent.availability || null; // Use lowercase 'availability' as fallback
          }


    }

     // If still not found or name is null, return the default unknown object
     if (!foundStudent || foundStudent.Name === null) {
         // console.warn(`getStudentDetails: Student not found or name missing for ID ${studentId}.`);
         return { name: 'Unknown Student', id: studentId, groupOf: 1, sub_group: null, class_name: null, availability_string: null }; // Include defaults
     }

    return foundStudent;
}


/**
 * (Internal Helper) Parses a time string (HH:MM, H:MM am/pm, HHMM, HH:MM:SS) into a Date object.
 * Seconds are ignored.
 * @param {string} timeString - The time string to parse.
 * @returns {Date|null} A Date object with the parsed time (UTC), or null if invalid.
 */
export function parseTime(timeString) {
    if (!timeString || typeof timeString !== 'string') return null;
    timeString = timeString.trim().toLowerCase();
    let hours = NaN;
    let minutes = NaN;

    // Try HH:MM:SS or H:MM:SS with optional am/pm (ignore seconds)
    const secondsMatch = timeString.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)?$/);
    if (secondsMatch) {
        hours = parseInt(secondsMatch[1], 10);
        minutes = parseInt(secondsMatch[2], 10);
        const period = secondsMatch[4];
        if (period === 'pm' && hours >= 1 && hours <= 11) hours += 12;
        else if (period === 'am' && hours === 12) hours = 0; // Midnight case
    } else {
        // Try HH:MM or H:MM with optional am/pm
        const colonMatch = timeString.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
        if (colonMatch) {
            hours = parseInt(colonMatch[1], 10);
            minutes = parseInt(colonMatch[2], 10);
            const period = colonMatch[3];
            if (period === 'pm' && hours >= 1 && hours <= 11) hours += 12;
            else if (period === 'am' && hours === 12) hours = 0; // Midnight case
        } else {
            // Try HHMM (4 digits)
            const noColonMatch = timeString.match(/^(\d{2})(\d{2})$/);
            if (noColonMatch) {
                hours = parseInt(noColonMatch[1], 10);
                minutes = parseInt(noColonMatch[2], 10);
            } else {
                // console.warn(`parseTime: Invalid time format "${timeString}"`);
                return null; // Invalid format
            }
        }
    }

    // Validate parsed hours and minutes
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        // console.warn(`parseTime: Invalid hours/minutes after parsing "${timeString}" -> H:${hours} M:${minutes}`);
        return null;
    }

    const date = new Date(0); // Use a fixed date (like Epoch)
    date.setUTCHours(hours, minutes, 0, 0); // Set time in UTC, ignore seconds
    return date;
}


/**
 * (Internal Helper) Formats a Date object into HH:MM string (24-hour format).
 */
export function formatTime(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        // console.warn("formatTime: Received invalid Date object", date);
        return null;
    }
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}


/**
 * Parses a student's availability string into a structured object.
 * Handles formats like "Day: Time1;Time2", "Day: TimeRange", "Day: Time1; Day2: Time2".
 * Expects times in HH:MM, H:MM am/pm, HHMM, or HH:MM:SS format. Skips invalid time parts.
 * Assumes days are separated by newlines or semicolons followed by a day name.
 * @param {string|null} availabilityString - The raw availability string.
 * @returns {object} An object where keys are days (lowercase) and values are Sets of available times (HH:MM).
 */
export function parseAvailability(availabilityString) {
    const availability = {};
    if (!availabilityString || typeof availabilityString !== 'string') {
        return availability;
    }

    // Split entries more robustly: handle newline or semicolon followed by optional whitespace and a day name
    const entries = availabilityString.split(/\n|;(?=\s*[A-Za-z])/).map(e => e.trim()).filter(e => e);

    entries.forEach(entry => {
        // Split day from the rest of the time string
        const parts = entry.split(/:(.+)/); // Split only on the first colon
        if (parts.length < 2) return; // Skip if no colon found

        const day = parts[0].trim().toLowerCase();
        const validDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
        if (!validDays.includes(day)) return; // Skip invalid day names

        const timePart = parts[1]?.trim(); // Get the part after the first colon
        if (!timePart) return; // Skip if no time part

        if (!availability[day]) availability[day] = new Set();

        // Split multiple times/ranges within the timePart (separated by semicolon)
        const times = timePart.split(';').map(t => t.trim()).filter(t => t);

        times.forEach(time => {
            if (time.includes('-')) { // Handle ranges like "10:00-11:30"
                const [startStr, endStr] = time.split('-');
                try {
                    const startTime = parseTime(startStr);
                    const endTime = parseTime(endStr);
                    // Ensure start and end times are valid and start is before end
                    if (startTime && endTime && startTime < endTime) {
                        let currentTime = new Date(startTime);
                        // Add times in 30-minute increments within the range
                        while (currentTime <= endTime) {
                            const formatted = formatTime(currentTime);
                            if (formatted) {
                                availability[day].add(formatted);
                            }
                            currentTime.setUTCMinutes(currentTime.getUTCMinutes() + 30);
                        }
                    } else {
                        // console.warn(`parseAvailability: Invalid range "${time}" for day "${day}"`);
                    }
                } catch (e) {
                    console.error(`parseAvailability: Error parsing range "${time}"`, e);
                }
            } else { // Handle single times
                try {
                    const parsedTime = parseTime(time);
                    if (parsedTime) {
                        const formatted = formatTime(parsedTime);
                        if (formatted) {
                            availability[day].add(formatted);
                        }
                    } else {
                         // console.warn(`parseAvailability: Invalid single time "${time}" for day "${day}"`);
                    }
                } catch (e) {
                    console.error(`parseAvailability: Error parsing single time "${time}"`, e);
                }
            }
        });
    });
    return availability;
}


/**
 * Checks if a student is available at a specific day and time based on their parsed availability.
 * @param {object} studentDetails - The student details object.
 * @param {string} targetDay - The target day name (e.g., 'Monday').
 * @param {string} targetTime - The target time string (e.g., '13:20:00' or '13:20').
 * @param {object} [parsedAvailabilityCache={}] - Cache for parsed availability.
 * @returns {boolean} True if available, false otherwise.
 */
export function isStudentAvailable(studentDetails, targetDay, targetTime, parsedAvailabilityCache = {}) {
    if (!studentDetails || !targetDay || !targetTime) return false;

    const studentId = studentDetails.id;
    // Use availability_string first, fallback to availability if needed
    const availabilityString = studentDetails.availability_string || studentDetails.availability;

    // console.log(`DEBUG isStudentAvailable: Checking Student ID: ${studentId}, Day: ${targetDay}, Raw Target Time: ${targetTime}`);

    let parsedAvailability = parsedAvailabilityCache[studentId];
    if (typeof parsedAvailability === 'undefined') {
        // console.log(`DEBUG isStudentAvailable: Cache MISS for ${studentId}. Parsing string: "${availabilityString}"`);
        parsedAvailability = parseAvailability(availabilityString);
        parsedAvailabilityCache[studentId] = parsedAvailability;
        // console.log(`DEBUG isStudentAvailable: Parsed availability for ${studentId}:`, JSON.stringify(Object.fromEntries(Object.entries(parsedAvailability).map(([k, v]) => [k, [...v]]))) ); // Log parsed set content
    } else {
        // console.log(`DEBUG isStudentAvailable: Cache HIT for ${studentId}`);
    }

    const targetDayLower = targetDay.toLowerCase();
    // Standardize the target time to HH:MM format
    const targetTimeFormatted = formatTime(parseTime(targetTime));

    // console.log(`DEBUG isStudentAvailable: Standardized Target Time: ${targetTimeFormatted}`);

    if (!targetTimeFormatted) {
        console.warn(`isStudentAvailable: Could not format targetTime "${targetTime}" for student ${studentId}`);
        return false;
    }

    const availableTimesForDay = parsedAvailability[targetDayLower];
    const isAvailable = availableTimesForDay?.has(targetTimeFormatted) || false;

    // console.log(`DEBUG isStudentAvailable: Checking Day='${targetDayLower}', TargetTimeFormatted='${targetTimeFormatted}'. Available=${isAvailable}. Day's Set=`, availableTimesForDay ? [...availableTimesForDay] : 'N/A');

    return isAvailable;
}


/**
 * Checks if adding a new student violates pairing rules (Solo=1, Paired=2, Group=3+).
 * Also checks sub-group compatibility.
 * @param {object} newStudentDetails - Details of the student being added.
 * @param {Array<object>} [currentOccupantDetails=[]] - Array of details for students already in the slot.
 * @param {number} slotCapacity - The maximum capacity of the slot.
 * @returns {object} { violation: boolean, reason: string | null }
 */
export function checkPairingRuleViolation(newStudentDetails, currentOccupantDetails = [], slotCapacity) {
    // Basic validation
    if (!newStudentDetails || typeof newStudentDetails.groupOf !== 'number') {
        console.warn("checkPairingRuleViolation: Invalid newStudentDetails or missing groupOf.", newStudentDetails);
        return { violation: true, reason: "Invalid new student data." };
    }
    if (!Array.isArray(currentOccupantDetails)) {
         console.warn("checkPairingRuleViolation: Invalid currentOccupantDetails (not an array).", currentOccupantDetails);
         return { violation: true, reason: "Invalid current occupants data." };
    }
     if (typeof slotCapacity !== 'number' || slotCapacity < 1) {
         console.warn("checkPairingRuleViolation: Invalid slotCapacity.", slotCapacity);
         return { violation: true, reason: "Invalid slot capacity." };
     }

    const newStudentGroup = newStudentDetails.groupOf;
    const currentOccupants = currentOccupantDetails.length;
    const newTotalOccupants = currentOccupants + 1;

    // 1. Check Capacity
    if (newTotalOccupants > slotCapacity) {
        return { violation: true, reason: `Adding student exceeds slot capacity (${slotCapacity}).` };
    }

    // 2. Check Group Type Compatibility
    const existingGroupTypes = new Set(currentOccupantDetails.map(occ => occ?.groupOf).filter(g => typeof g === 'number'));

    if (newStudentGroup === 1) { // Trying to add a Solo student
        if (currentOccupants > 0) {
            return { violation: true, reason: "Cannot add a Solo student to an occupied slot." };
        }
    } else if (newStudentGroup === 2) { // Trying to add a Paired student
        if (existingGroupTypes.has(1)) {
            return { violation: true, reason: "Cannot add Paired student to a Solo slot." };
        }
        if (existingGroupTypes.size > 0 && !existingGroupTypes.has(2)) { // If existing students are not Paired (must be Group)
             return { violation: true, reason: "Cannot mix Paired students with Group students." };
        }
        if (newTotalOccupants > 2 && currentOccupants > 0) { // Check if adding exceeds pair limit (only if not empty)
             return { violation: true, reason: "Cannot exceed 2 students in a Paired slot." };
         }

    } else { // Trying to add a Group student (groupOf >= 3)
        if (existingGroupTypes.has(1)) {
            return { violation: true, reason: "Cannot add Group student to a Solo slot." };
        }
        if (existingGroupTypes.has(2)) {
            return { violation: true, reason: "Cannot add Group student to a Paired slot." };
        }
    }

    // 3. Check Sub-Group Compatibility
    const newSubGroup = newStudentDetails.sub_group || null; // Treat undefined/empty as null
    const existingSubGroups = new Set(currentOccupantDetails.map(occ => occ?.sub_group || null).filter(sg => sg !== null)); // Get unique non-null existing sub-groups

    if (existingSubGroups.size > 0) { // If there's already a sub-group established
        const establishedSubGroup = [...existingSubGroups][0]; // Get the first (should be only one) established sub-group
        // *** FIX: Allow adding a student WITHOUT a sub-group to an established sub-group ***
        if (newSubGroup !== null && newSubGroup !== establishedSubGroup) {
             return { violation: true, reason: `Cannot mix sub-groups ('${newSubGroup}' vs existing '${establishedSubGroup}').` };
        }
        // It's now okay if newSubGroup is null here.
    } else { // If no sub-group is established yet
        // It's okay to add a student with or without a sub-group to an empty or non-sub-grouped slot.
        // The first student with a sub-group will establish it.
    }


    // Passed all checks
    return { violation: false, reason: null };
}

/**
 * Converts groupOf number to text.
 */
export function getGroupSizeText(groupOf) { // Use groupOf (capital O)
    if (groupOf === 1) return 'Solo';
    if (groupOf === 2) return 'Paired';
    if (groupOf >= 3) return 'Group';
    return 'N/A';
}

/**
 * Calculates the current term number and week number based on today's date and term dates.
 */
export function calculateCurrentTermAndWeek(today, termDatesData) {
    if (!termDatesData || termDatesData.length === 0) {
        return { term: null, week: null, error: "Term dates data is missing or empty." };
    }
    // Ensure 'today' is treated as UTC start of day for comparison
    const todayDateOnly = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    for (const term of termDatesData) {
        try {
            // Ensure term dates are parsed as UTC
            const startDate = new Date(term.start_date + 'T00:00:00Z');
            const endDate = new Date(term.end_date + 'T00:00:00Z');

            // Check for invalid dates
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                console.warn(`calculateCurrentTermAndWeek: Invalid date format for term ${term.term_number}. Start: ${term.start_date}, End: ${term.end_date}`);
                continue; // Skip this term
            }

            // Define term start and end precisely in UTC
            const termStart = startDate; // Already UTC start of day
            // Term end should be the end of the specified day in UTC
            const termEnd = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate(), 23, 59, 59, 999));

            // Check if today falls within the term range (inclusive)
            if (todayDateOnly >= termStart && todayDateOnly <= termEnd) {
                const diffTime = todayDateOnly.getTime() - termStart.getTime();
                // Calculate difference in days, rounding carefully
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                const weekNumber = Math.floor(diffDays / 7) + 1;
                return { term: term.term_number, week: weekNumber, error: null };
            }
        } catch (e) {
             console.error(`calculateCurrentTermAndWeek: Error processing term ${term.term_number}:`, e);
             // Continue to the next term even if one fails
        }
    }
    // If no matching term found
    return { term: null, week: null, error: null };
}

// --- Add a ready flag ---
export const isReady = true;

console.log("Shared Utilities (utils.js) loaded.");
