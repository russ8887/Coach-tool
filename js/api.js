// js/api.js
// Handles all API calls to the Supabase backend (ES Module).
// v8: Removed .select() from addDailyStatus upsert to avoid RLS USING error on RETURNING.

// --- Import Dependencies ---
import { supabaseClient } from './supabaseClient.js';
import { appState } from './state.js'; // Import from state.js

// --- Helper Functions ---

/** Gets today's date in YYYY-MM-DD format (UTC) */
export function getTodaysDateUTC() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

// --- Data Fetching Functions ---
export async function fetchCoaches() {
    console.log("API: Fetching coaches...");
    if (!supabaseClient) { console.error("API Error: Supabase client not available."); return null; }
    try {
        const { data, error } = await supabaseClient
            .from('coaches')
            .select('id, Name')
            .order('Name', { ascending: true });
        if (error) throw error;
        console.log("API: Fetched", data?.length || 0, "coaches.");
        return data;
    } catch (error) {
        console.error("API Error fetching coaches:", error.message);
        return null;
    }
}
export async function fetchStudents() {
    console.log("API: Fetching students...");
    if (!supabaseClient) { console.error("API Error: Supabase client not available."); return null; }
    try {
        // Fetch students including necessary fields
        const { data, error } = await supabaseClient
            .from('students')
            .select('id, Name, class_name, availability, "groupOf", sub_group, "lessons owed", is_active')
            .order('"Name"', { ascending: true });
        if (error) throw error;
        console.log("API: Fetched", data?.length || 0, "students.");
        // Map lessons owed to a consistent key
        return data?.map(student => ({
            ...student,
            lessons_owed: student['lessons owed'], // Ensure consistent naming
            // availability_string is now handled by getStudentDetails in utils.js
        })) || [];
    } catch (error) {
        console.error("API Error fetching students:", error.message);
        return null;
    }
}
export async function fetchScheduleData(coachId) {
    console.log(`API fetchScheduleData: Fetching schedule for coach ID: ${coachId}...`);
    if (!supabaseClient) { console.error("API Error: Supabase client not available."); return null; }
    if (!coachId) { console.error("API Error: Coach ID is required to fetch schedule."); return null; }
    try {
        // Fetch the base schedule slots for the coach
        const { data: scheduleLinks, error: scheduleError } = await supabaseClient
            .from('lesson_schedule')
            .select('id, day_of_week, start_time, capacity') // Select start_time
            .eq('coach_id', coachId)
            .order('day_of_week')
            .order('start_time'); // Order by start_time

        if (scheduleError) {
            console.error(`API Error fetching lesson_schedule for coach ${coachId}:`, scheduleError.message);
            throw scheduleError;
        }
        if (!scheduleLinks || scheduleLinks.length === 0) {
             console.log(`API fetchScheduleData: No schedule links found for coach ${coachId}.`);
             return {}; // Return empty object if no schedule
        }

        // Fetch associated students for all schedule slots of this coach in one go
        const scheduleIds = scheduleLinks.map(link => link.id);
        const { data: studentLinks, error: studentError } = await supabaseClient
            .from('scheduled_students')
            .select('lesson_schedule_id, student_id')
            .in('lesson_schedule_id', scheduleIds);

        if (studentError) {
             console.error(`API Error fetching scheduled_students for coach ${coachId}:`, studentError.message);
             throw studentError;
        }

        // Process and structure the data by day
        const structuredSchedule = {};
        scheduleLinks.forEach(link => {
            const day = link.day_of_week;
            if (!structuredSchedule[day]) {
                structuredSchedule[day] = [];
            }
            // Find students for this specific schedule link
            const original_student_ids = studentLinks
                ?.filter(sl => sl.lesson_schedule_id === link.id)
                .map(sl => sl.student_id) || [];

            structuredSchedule[day].push({
                schedule_id: link.id,
                day: day,
                time: link.start_time, // Store the fetched time under the 'time' key
                capacity: link.capacity,
                coach_id: coachId,
                original_student_ids: original_student_ids,
            });
        });
        console.log("API fetchScheduleData: Returning processed schedule.");
        return structuredSchedule;
    } catch (error) {
        console.error(`API Error in fetchScheduleData for coach ${coachId}:`, error.message);
        return null;
    }
}
export async function fetchTermDates() {
    console.log("API: Fetching term dates...");
    if (!supabaseClient) { console.error("API Error: Supabase client not available."); return null; }
    try {
        const { data, error } = await supabaseClient
            .from('term_dates')
            .select('term_number, start_date, end_date')
            .order('term_number', { ascending: true });
        if (error) throw error;
        console.log("API: Fetched", data?.length || 0, "term dates.");
        return data;
    } catch (error) {
        console.error("API Error fetching term dates:", error.message);
        return null;
    }
}
export async function getTodaysStatuses() {
    // Determine the correct table name based on the test mode state
    const tableName = appState.isTestMode ? 'daily_attendance_status_test' : 'daily_attendance_status';
    const today = getTodaysDateUTC();
    console.log(`API: Fetching today's statuses from ${tableName}...`);
    if (!supabaseClient) { console.error("API Error: Supabase client not available."); return null; }
    try {
        const { data, error } = await supabaseClient
            .from(tableName)
            .select('id, student_id, lesson_schedule_id, status, absence_reason, status_date')
            .eq('status_date', today);
        if (error) throw error;
        console.log("API: Fetched", data?.length || 0, `status entries for today from ${tableName}.`);
        return data;
    } catch (error) {
        console.error(`API Error fetching statuses from ${tableName}:`, error.message);
        return null;
    }
}
export async function getTodaysLoggedSlotIds(coachId = null) {
    // Determine the correct table name based on the test mode state
    const tableName = appState.isTestMode ? 'lesson_logs_test' : 'lesson_logs';
    const today = getTodaysDateUTC();
    console.log(`API: Fetching logged slots from ${tableName} for today (Coach: ${coachId ?? 'Any'})...`);
    if (!supabaseClient) { console.error("API Error: Supabase client not available."); return []; }
    try {
        let query = supabaseClient
            .from(tableName)
            .select('lesson_schedule_id')
            .gte('log_date', today) // Assumes log_date is date or timestamp
            .lt('log_date', new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]); // Next day

        if (coachId !== null && coachId !== undefined) {
            query = query.eq('coach_id', coachId);
        }

        const { data, error } = await query;

        if (error) throw error;

        const loggedIds = data ? [...new Set(data.map(log => log.lesson_schedule_id))] : [];
        console.log("API: Found", loggedIds.length, `logged slot IDs in ${tableName} for today (Coach: ${coachId ?? 'Any'}).`);
        return loggedIds;
    } catch (error) {
        console.error(`API Error fetching logged slots from ${tableName}:`, error.message);
        return [];
    }
}
export async function getTodaysLoggedStudentIds() {
    // Determine the correct table name based on the test mode state
    const tableName = appState.isTestMode ? 'lesson_logs_test' : 'lesson_logs';
    const today = getTodaysDateUTC();
    console.log(`API: Fetching logged STUDENT IDs from ${tableName} for today...`);
    if (!supabaseClient) { console.error("API Error: Supabase client not available."); return []; }
    try {
        const { data, error } = await supabaseClient
            .from(tableName)
            .select('student_id')
            .gte('log_date', today)
            .lt('log_date', new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

        if (error) throw error;
        const loggedStudentIds = data ? [...new Set(data.map(log => log.student_id))] : [];
        console.log("API: Found", loggedStudentIds.length, `logged STUDENT IDs in ${tableName} for today.`);
        return loggedStudentIds;
    } catch (error) {
        console.error(`API Error fetching logged student IDs from ${tableName}:`, error.message);
        return [];
    }
}
export async function getLogDateRange(coachId) {
    // Determine the correct table name based on the test mode state
    const tableName = appState.isTestMode ? 'lesson_logs_test' : 'lesson_logs';
    console.log(`API: Fetching log date range from ${tableName} for coach ${coachId}...`);
    if (!supabaseClient) { console.error("API Error: Supabase client not available."); return null; }
    if (!coachId) { console.warn("API Warning: Coach ID needed for log date range."); return null; }
    try {
        // Fetch min date
         const { data: minData, error: minError } = await supabaseClient
             .from(tableName)
             .select('log_date')
             .eq('coach_id', coachId)
             .order('log_date', { ascending: true })
             .limit(1)
             .maybeSingle(); // Use maybeSingle to handle cases with no logs

         if (minError) throw minError;

         // Fetch max date
         const { data: maxData, error: maxError } = await supabaseClient
             .from(tableName)
             .select('log_date')
             .eq('coach_id', coachId)
             .order('log_date', { ascending: false })
             .limit(1)
             .maybeSingle(); // Use maybeSingle

         if (maxError) throw maxError;

        // Extract YYYY-MM-DD part from the timestamp strings
        const minDateStr = minData?.log_date ? minData.log_date.split('T')[0] : null;
        const maxDateStr = maxData?.log_date ? maxData.log_date.split('T')[0] : null;

        // Return null if either min or max is missing (no logs found)
        if (!minDateStr || !maxDateStr) {
            console.log(`API: No valid log date range found in ${tableName} for coach ${coachId}.`);
            return null;
        }

        const result = [{ min_date: minDateStr, max_date: maxDateStr }];
        console.log("API: Log date range result (YYYY-MM-DD):", result);
        return result;

    } catch (error) {
        console.error(`API Error fetching log date range from ${tableName}:`, error.message);
        return null;
    }
}
export async function fetchLogs(coachId, startDate, endDate, studentId = null, sortBy = 'date_desc') {
    // Determine the correct table name based on the test mode state
    const tableName = appState.isTestMode ? 'lesson_logs_test' : 'lesson_logs';
    console.log(`API: Fetching logs from ${tableName} - Coach: ${coachId}, Start: ${startDate}, End: ${endDate}, Student: ${studentId}, Sort: ${sortBy}`);
    if (!supabaseClient) { console.error("API Error: Supabase client not available."); return null; }
    if (!coachId || !startDate || !endDate) { console.error("API Error: Missing required parameters for fetchLogs."); return null; }

    try {
        let query = supabaseClient
            .from(tableName)
            .select(`
                *,
                students ( Name ),
                coaches ( Name )
            `)
            .eq('coach_id', coachId)
            .gte('log_date', startDate) // Assumes log_date is date or timestamp >= start of day
            .lte('log_date', endDate + 'T23:59:59.999Z'); // Ensure we include logs up to the end of the endDate

        if (studentId) {
            query = query.eq('student_id', studentId);
        }

        // Determine sorting order
        let sortOptions = { ascending: false };
        let sortColumn = 'log_date'; // Primary sort column
        let secondarySortColumn = 'id'; // Secondary sort (e.g., by insertion order if dates/times are same)
        let secondarySortOptions = { ascending: false }; // Newest ID first by default

        if (sortBy === 'date_asc') {
            sortOptions.ascending = true;
            secondarySortOptions.ascending = true; // Oldest ID first
        } else if (sortBy === 'student_asc') {
            sortColumn = 'students(Name)'; // Sort by related table column (requires the join)
            sortOptions = { ascending: true, nullsFirst: false }; // Handle potential null names
            // Secondary sort by date when primary is student
            secondarySortColumn = 'log_date';
            secondarySortOptions = { ascending: true }; // e.g., oldest log first for a student
        }

        // Apply primary and secondary sorting
        query = query.order(sortColumn, sortOptions).order(secondarySortColumn, secondarySortOptions);


        const { data, error } = await query;

        if (error) throw error;
        console.log("API: Fetched", data?.length || 0, "log entries.");
        return data;
    } catch (error) {
        console.error(`API Error fetching logs from ${tableName}:`, error.message);
        return { error: error.message }; // Return error object
    }
}
export async function loadInitialAppData() {
    console.log("API: Loading initial app data...");
    try {
        const [coaches, students, termDates, todaysStatuses, todaysLoggedSlotIds] = await Promise.all([
            fetchCoaches(),
            fetchStudents(),
            fetchTermDates(),
            getTodaysStatuses(),
            getTodaysLoggedSlotIds(null) // Fetch for all coaches initially
        ]);

        // Check if essential data failed to load
        if (!coaches || !students) {
             console.error("API Error: Failed to load essential initial data (coaches or students).");
             return null; // Indicate failure
        }

        const initialData = {
            coaches: coaches || [],
            students: students || [],
            termDates: termDates || [],
            todaysStatuses: todaysStatuses || [],
            todaysLoggedSlotIds: todaysLoggedSlotIds || []
        };
        console.log("API: Initial data processed successfully (Mode:", appState.isTestMode ? 'Test' : 'Live', ").");
        return initialData;

    } catch (error) {
        console.error("API Error loading initial app data:", error);
        return null;
    }
}
export async function fetchPastMissedLogs(coachId) {
    // Determine the correct RPC name based on the current test mode state
    const targetRpc = appState.isTestMode ? 'get_missed_logs_for_coach_test' : 'get_missed_logs_for_coach';
    console.log(`API: Fetching past missed logs via RPC ${targetRpc} for Coach ${coachId}`);

    // Check for Supabase client availability
    if (!supabaseClient) {
        console.error("API Error: Supabase client not available.");
        return null; // Return null if client is missing
    }
    // Check if coachId is provided
    if (!coachId) {
        console.error("API Error: Missing required coachId parameter for fetchPastMissedLogs.");
        return null; // Return null if coachId is missing
    }

    try {
        // Call the RPC function, passing only the coach ID
        const { data, error } = await supabaseClient.rpc(targetRpc, {
            p_coach_id: coachId
        });

        // Throw an error if the RPC call itself fails
        if (error) throw error;

        // Log the number of missed log entries received
        console.log(`API: Received ${data?.length || 0} past missed log entries from RPC ${targetRpc}.`);

        // Return the data received from the RPC, or an empty array if data is null/undefined
        return data || [];

    } catch (error) {
        // Log any errors that occur during the RPC call
        console.error(`API Error calling RPC ${targetRpc}:`, error.message);
        return null; // Return null on error
    }
}
export async function fetchDailyBlocksForDate(targetDate) {
    // Determine the correct table name based on the test mode state
    const tableName = appState.isTestMode ? 'daily_blocks_test' : 'daily_blocks';
    console.log(`API: Fetching blocks from ${tableName} for date: ${targetDate}`);

    // Check if Supabase client is available
    if (!supabaseClient) {
        console.error("API Error: Supabase client not available.");
        return null;
    }
    // Check if targetDate is provided
    if (!targetDate) {
        console.error("API Error: Missing targetDate for fetchDailyBlocksForDate.");
        return null;
    }

    try {
        // Fetch blocks matching the target date
        const { data, error } = await supabaseClient
            .from(tableName)
            .select('block_date, block_type, identifier') // Select necessary columns
            .eq('block_date', targetDate);

        // If there's an error, throw it
        if (error) throw error;

        // Log the number of blocks found
        console.log(`API: Found ${data?.length || 0} blocks for ${targetDate} in ${tableName}.`);
        // Return the fetched data (or an empty array if null/undefined)
        return data || [];

    } catch (error) {
        // Log any errors that occur
        console.error(`API Error fetching blocks from ${tableName} for ${targetDate}:`, error.message);
        // Return null to indicate an error occurred
        return null;
    }
}

/**
 * Fetches all lesson log entries for a specific student.
 * @param {number} studentId - The ID of the student.
 * @returns {Promise<Array<object>|null>} An array of log objects or null on error.
 */
export async function fetchStudentLogHistory(studentId) {
    const tableName = appState.isTestMode ? 'lesson_logs_test' : 'lesson_logs';
    console.log(`API: Fetching lesson history from ${tableName} for student ID: ${studentId}...`);

    if (!supabaseClient) {
        console.error("API Error: Supabase client not available.");
        return null;
    }
    if (studentId === null || typeof studentId === 'undefined') {
        console.error("API Error: Student ID is required to fetch log history.");
        return null;
    }

    try {
        const { data, error } = await supabaseClient
            .from(tableName)
            .select(`
                *,
                coaches ( Name ),
                lesson_schedule ( day_of_week, start_time )
            `)
            .eq('student_id', studentId)
            .order('log_date', { ascending: false }); // Newest logs first

        if (error) throw error;

        console.log("API: Fetched", data?.length || 0, `log entries for student ${studentId}.`);
        return data || [];
    } catch (error) {
        console.error(`API Error fetching log history for student ${studentId} from ${tableName}:`, error.message);
        return null;
    }
}


// --- Data Modification Functions ---

export async function addDailyStatus(studentId, coachId, lessonScheduleId, status, absenceReason = null) {
    // Determine the correct table name based on the test mode state
    const tableName = appState.isTestMode ? 'daily_attendance_status_test' : 'daily_attendance_status';
    const today = getTodaysDateUTC();
    console.log(`API: Adding/Updating status in ${tableName} - Student: ${studentId}, Slot: ${lessonScheduleId}, Status: ${status}`);
    if (!supabaseClient) { console.error("API Error: Supabase client not available."); return { success: false, message: "Client not available." }; }

    try {
        // *** MODIFIED: Removed .select() ***
        const { error } = await supabaseClient
            .from(tableName)
            .upsert({
                student_id: studentId,
                coach_id: coachId,
                lesson_schedule_id: lessonScheduleId,
                status_date: today,
                status: status,
                absence_reason: absenceReason
            }, {
                onConflict: 'student_id, lesson_schedule_id, status_date' // Specify conflict columns
            });
            // .select() // REMOVED THIS LINE
            // .single(); // REMOVED THIS LINE

        if (error) throw error;
        // Since we removed .select(), data will be null, but success is indicated by no error.
        console.log(`API: Status update successful (no data returned) for student ${studentId} in slot ${lessonScheduleId}.`);
        return { success: true, data: null }; // Return null for data
    } catch (error) {
        console.error(`API Error adding/updating status in ${tableName}:`, error.message);
        return { success: false, message: error.message };
    }
}
export async function removeDailyStatus(studentId, lessonScheduleId) {
    // Determine the correct table name based on the test mode state
    const tableName = appState.isTestMode ? 'daily_attendance_status_test' : 'daily_attendance_status';
    const today = getTodaysDateUTC();
     console.log(`API: Removing status from ${tableName} - Student: ${studentId}, Slot: ${lessonScheduleId}`);
     if (!supabaseClient) { console.error("API Error: Supabase client not available."); return { success: false, message: "Client not available." }; }

    try {
        const { error } = await supabaseClient
            .from(tableName)
            .delete()
            .eq('student_id', studentId)
            .eq('lesson_schedule_id', lessonScheduleId)
            .eq('status_date', today);

        if (error) throw error;
        console.log(`API: Status removal successful for student ${studentId} in slot ${lessonScheduleId}.`);
        return { success: true };
    } catch (error) {
        console.error(`API Error removing status from ${tableName}:`, error.message);
        return { success: false, message: error.message };
    }
}
export async function submitLogAndUpdates(logPayload) {
    // Determine the correct RPC name based on the test mode state
    const targetRpc = appState.isTestMode ? 'process_lesson_log_test' : 'process_lesson_log';
    console.log(`API: Submitting logs via RPC: ${targetRpc}`);
    if (!supabaseClient) { console.error("API Error: Supabase client not available."); return { success: false, message: "Client not available." }; }
    if (!logPayload || !Array.isArray(logPayload) || logPayload.length === 0) {
        console.warn("API Submit Log: Payload is empty or invalid.");
        return { success: false, message: "No log data provided." };
    }

    try {
        // Payload should be correctly formatted before calling this function
        const processedPayload = logPayload.map(log => ({
            ...log,
        }));

        console.log("API Submit Log: Calling RPC with payload:", processedPayload);
        const { data, error } = await supabaseClient.rpc(targetRpc, { log_entries: processedPayload });

        if (error) throw error;

        console.log(`API: RPC ${targetRpc} executed. Result:`, data);
        // Check the specific return value of your RPC if it indicates success/failure
        if (data === false) { // Example check based on previous debugging
             console.warn(`API: RPC ${targetRpc} returned false, indicating a potential issue.`);
             return { success: false, message: "Log processing failed on the backend." };
        }

        return { success: true, data: data };
    } catch (error) {
        console.error(`API Error calling RPC ${targetRpc}:`, error);
        return { success: false, message: error.message };
    }
}
export async function findSingleSlotSuggestions(scheduleId, currentStudentIds, targetDay, targetDate) { // Added targetDate parameter
    // Determine the correct RPC name based on the test mode state
    const targetRpc = appState.isTestMode ? 'get_single_slot_suggestions_test' : 'get_single_slot_suggestions';
    console.log(`API: Calling RPC ${targetRpc} for slot ${scheduleId} on date ${targetDate}...`); // Log targetDate
    if (!supabaseClient) { console.error("API Error: Supabase client not available."); return null; }
    if (!targetDate) { console.error("API Error: Missing targetDate for findSingleSlotSuggestions."); return null; } // Add check for targetDate

    try {
        const { data, error } = await supabaseClient.rpc(targetRpc, {
            p_schedule_id: scheduleId,
            p_current_student_ids: currentStudentIds || [],
            p_target_day: targetDay,
            p_is_test_mode: appState.isTestMode, // Pass test mode flag
            p_target_date: targetDate // Pass the specific date
        });
        if (error) throw error;
        console.log(`API: Suggestions received from RPC for slot ${scheduleId}:`, data);
        return data;
    } catch (error) {
        console.error(`API Error calling RPC ${targetRpc}:`, error.message);
        return null;
    }
}
export async function adminFindFillInSuggestions(coachIdFilter, dayFilter, includePartial) {
    // Determine the correct RPC name based on the test mode state
    const targetRpc = appState.isTestMode ? 'admin_find_fill_in_suggestions_test' : 'admin_find_fill_in_suggestions';
    console.log(`API: Calling RPC ${targetRpc}... Filters: coach=${coachIdFilter}, day=${dayFilter}, partial=${includePartial}`);
    if (!supabaseClient) { console.error("API Error: Supabase client not available."); return null; }

    try {
        // Assuming the admin RPC also needs the test mode flag (adjust if not)
        const { data, error } = await supabaseClient.rpc(targetRpc, {
            p_coach_id_filter: coachIdFilter || null,
            p_day_filter: dayFilter || null,
            p_include_partial: includePartial,
            p_is_test_mode: appState.isTestMode // Pass test mode flag
        });
        if (error) throw error;
        console.log("API: Admin suggestions received from RPC:", data);
        return data;
    } catch (error) {
        console.error(`API Error calling RPC ${targetRpc}:`, error.message);
        return null;
    }
}
export async function clearTestData() {
    console.log("API: Calling RPC clear_test_data...");
    if (!supabaseClient) { console.error("API Error: Supabase client not available."); return false; }
    try {
        const { error } = await supabaseClient.rpc('clear_test_data');
        if (error) throw error;
        console.log("API: Test data cleared successfully via RPC.");
        return true;
    } catch (error) {
        console.error("API Error calling RPC clear_test_data:", error.message);
        return false;
    }
}
export async function createDailyBlock(blockDate, blockType, identifier, reason) {
    // Determine the correct RPC function name based on the test mode state
    const targetRpc = appState.isTestMode ? 'create_daily_block_test' : 'create_daily_block';
    console.log(`API: Calling RPC ${targetRpc} - Date: ${blockDate}, Type: ${blockType}, Identifier: ${identifier}`);

    // Check if Supabase client is available
    if (!supabaseClient) {
        console.error("API Error: Supabase client not available.");
        return { success: false, message: "Client not available." };
    }
    // Basic validation for required parameters
    if (!blockDate || !blockType) {
        console.error("API Error: Missing required parameters for createDailyBlock (date or type).");
        return { success: false, message: "Block date and type are required." };
    }
    // Validate identifier based on block type
     if (['Year Level Absence', 'Class Absence', 'Coach Unavailable'].includes(blockType) && (!identifier || identifier.trim() === '')) {
         return { success: false, message: `Identifier is required for block type: ${blockType}.` };
     }
     // Ensure identifier is a number if type is 'Coach Unavailable'
     if (blockType === 'Coach Unavailable' && isNaN(parseInt(identifier))) {
          return { success: false, message: `Identifier must be a numeric Coach ID for block type: ${blockType}.` };
     }

    try {
        // Call the appropriate RPC function
        const { error } = await supabaseClient.rpc(targetRpc, {
            p_block_date: blockDate,
            p_block_type: blockType,
            p_identifier: identifier || null, // Pass null if identifier is empty or undefined
            p_reason: reason || null        // Pass null if reason is empty or undefined
        });

        // If there's an error during the RPC call, throw it
        if (error) throw error;

        // Log success and return success status
        console.log(`API: RPC ${targetRpc} executed successfully.`);
        return { success: true };

    } catch (error) {
        // Log any errors that occur
        console.error(`API Error calling RPC ${targetRpc}:`, error);
        // Try to extract a meaningful message from the error object
        const message = error.message || 'An unknown error occurred.';
        // Return failure status with the error message
        return { success: false, message: message };
    }
}
export async function markPastLogHandled(scheduleId, missedDate) {
    // Determine the correct RPC name based on the test mode state
    const targetRpc = appState.isTestMode ? 'mark_past_log_handled_test' : 'mark_past_log_handled';
    console.log(`API: Calling RPC ${targetRpc} - ScheduleID: ${scheduleId}, MissedDate: ${missedDate}`);

    // Check if Supabase client is available
    if (!supabaseClient) {
        console.error("API Error: Supabase client not available.");
        return { success: false, message: "Client not available." };
    }
    // Basic validation
    if (scheduleId === null || scheduleId === undefined || !missedDate) {
        console.error("API Error: Missing required parameters for markPastLogHandled.");
        return { success: false, message: "Schedule ID and missed date are required." };
    }

    try {
        // Call the RPC function
        const { data, error } = await supabaseClient.rpc(targetRpc, {
            p_schedule_id: scheduleId,
            p_missed_date: missedDate
        });

        // If there's an error during the RPC call, throw it
        if (error) throw error;

        // Log success and return success status
        console.log(`API: RPC ${targetRpc} executed successfully for Schedule ${scheduleId}, Date ${missedDate}.`);
        // *** Check the actual return value from the RPC if it indicates success/failure ***
        // Example: Assuming the RPC returns void (null) on success
        return { success: true }; // Assume success if no error

    } catch (error) {
        // Log any errors that occur
        console.error(`API Error calling RPC ${targetRpc}:`, error);
        // Return failure status with the error message
        return { success: false, message: error.message };
    }
}

export async function removeStudentFromSchedule(studentId, scheduleId) {
    // Determine the correct RPC name based on the test mode state
    const targetRpc = appState.isTestMode ? 'remove_student_from_schedule_test' : 'remove_student_from_schedule';
    console.log(`API: Calling RPC ${targetRpc} - StudentID: ${studentId}, ScheduleID: ${scheduleId}`);

    if (!supabaseClient) {
        console.error("API Error: Supabase client not available.");
        return { success: false, message: "Client not available." };
    }
    if (studentId === null || studentId === undefined || scheduleId === null || scheduleId === undefined) {
        console.error("API Error: Missing required parameters for removeStudentFromSchedule.");
        return { success: false, message: "Student ID and Schedule ID are required." };
    }

    try {
        const { data, error } = await supabaseClient.rpc(targetRpc, {
            p_student_id: studentId,
            p_schedule_id: scheduleId
        });

        if (error) throw error;

        // The RPC returns true if deletion happened, false otherwise
        if (data === true) {
            console.log(`API: RPC ${targetRpc} executed successfully. Student removed.`);
            return { success: true };
        } else {
            console.warn(`API: RPC ${targetRpc} executed, but no student was removed (maybe not found?).`);
            return { success: false, message: "Student not found in schedule slot." };
        }

    } catch (error) {
        console.error(`API Error calling RPC ${targetRpc}:`, error);
        return { success: false, message: error.message };
    }
}

export async function addStudentToSchedule(studentId, scheduleId) {
    // Determine the correct RPC name based on the test mode state
    const targetRpc = appState.isTestMode ? 'add_student_to_schedule_test' : 'add_student_to_schedule';
    console.log(`API: Calling RPC ${targetRpc} - StudentID: ${studentId}, ScheduleID: ${scheduleId}`);

    if (!supabaseClient) {
        console.error("API Error: Supabase client not available.");
        return { success: false, message: "Client not available." };
    }
    if (studentId === null || studentId === undefined || scheduleId === null || scheduleId === undefined) {
        console.error("API Error: Missing required parameters for addStudentToSchedule.");
        return { success: false, message: "Student ID and Schedule ID are required." };
    }

    try {
        // Call the RPC function (assuming it exists and takes these parameters)
        const { data, error } = await supabaseClient.rpc(targetRpc, {
            p_student_id: studentId,
            p_schedule_id: scheduleId
        });

        if (error) {
            // Handle potential errors, e.g., unique constraint violation if student already exists
            console.error(`API Error calling RPC ${targetRpc}:`, error);
            // Provide a more specific message if possible (e.g., check error code/details)
            if (error.code === '23505') { // Example: PostgreSQL unique violation code
                return { success: false, message: "Student is already in this schedule slot." };
            }
            return { success: false, message: error.message };
        }

        // Check the return value from the RPC if it provides confirmation
        // For example, if the RPC returns true on success:
        if (data === true) {
             console.log(`API: RPC ${targetRpc} executed successfully. Student added.`);
             return { success: true };
        } else {
             console.warn(`API: RPC ${targetRpc} executed, but indicated no student was added (returned false).`);
             return { success: false, message: "Failed to add student (RPC returned false)." };
        }

    } catch (error) {
        // Catch unexpected errors during the call itself
        console.error(`API: Unexpected error calling RPC ${targetRpc}:`, error);
        return { success: false, message: error.message };
    }
}

/**
 * Calls the RPC function to update a student's active status.
 * @param {number} studentId - The ID of the student to update.
 * @param {boolean} isActive - The new active status (true or false).
 * @returns {Promise<{success: boolean, message?: string}>} A promise indicating success or failure.
 */
export async function setStudentActiveStatus(studentId, isActive) {
    console.log(`API: Calling RPC set_student_active_status - StudentID: ${studentId}, IsActive: ${isActive}`);

    if (!supabaseClient) {
        console.error("API Error: Supabase client not available.");
        return { success: false, message: "Client not available." };
    }
    if (studentId === null || studentId === undefined || typeof isActive !== 'boolean') {
        console.error("API Error: Missing required parameters for setStudentActiveStatus.");
        return { success: false, message: "Student ID and active status (boolean) are required." };
    }

    try {
        // Call the RPC function
        const { error } = await supabaseClient.rpc('set_student_active_status', {
            p_student_id: studentId,
            p_new_status: isActive
        });

        if (error) {
            // The function raises warnings for 'not found' but re-raises other errors.
            // We catch the re-raised errors here.
            console.error(`API Error calling RPC set_student_active_status:`, error);
            return { success: false, message: error.message };
        }

        // If no error was thrown, the update was successful (or the student wasn't found, which is handled by a WARNING in SQL)
        console.log(`API: RPC set_student_active_status executed successfully for Student ${studentId}.`);
        return { success: true };

    } catch (error) {
        // Catch unexpected errors during the call itself
        console.error(`API: Unexpected error calling RPC set_student_active_status:`, error);
        return { success: false, message: error.message };
    }
}


// --- Add a ready flag ---
export const isReady = true;

console.log("API Utilities module (api.js) loaded.");
