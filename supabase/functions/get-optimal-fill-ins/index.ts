// supabase/functions/get-optimal-fill-ins/index.ts
// v2: Added check against daily_blocks table

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

console.log("Function 'get-optimal-fill-ins' v2 starting up...");

// --- CORS Headers ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Types ---
interface StudentDetails {
    id: number | string;
    name: string;
    groupOf: number;
    subGroup: string | null;
    lessons_owed: number;
    availability_string?: string;
    class_name?: string; // Added for block checking
}

interface Candidate extends StudentDetails {}

interface SlotInfo {
    schedule_id: number;
    day_of_week: string;
    start_time: string;
    capacity: number;
    coach_id: number;
    coach_name: string;
    original_student_ids: number[];
    current_occupants: number;
    slot_date: string; // Expecting date from the get_slots_needing_fillins RPC now
}

interface DailyBlock {
    block_date: string; // YYYY-MM-DD
    block_type: string;
    identifier: string | null;
    // reason?: string; // Not needed for filtering logic
}

interface RecommendedGroupMember {
    student_id: number | string;
    name: string;
    lessons_owed: number;
    groupOf: number;
    subGroup: string | null;
}

interface ResultSlot extends SlotInfo {
    recommended_group: RecommendedGroupMember[];
}

// --- Helper Functions (Keep existing: checkPairingRuleViolation, getStudentDetails, isStudentAvailable) ---

function checkPairingRuleViolation(candidateDetails: StudentDetails, currentOccupantsDetails: StudentDetails[], capacity: number): { violation: boolean; reason: string } {
    if (!candidateDetails || typeof candidateDetails.groupOf !== 'number') return { violation: true, reason: "Invalid candidate data." };
    if (!Array.isArray(currentOccupantsDetails)) return { violation: true, reason: "Invalid current occupants data." };
    if (typeof capacity !== 'number' || capacity < 1) return { violation: true, reason: "Invalid slot capacity." };
    const potentialOccupantsDetails = [...currentOccupantsDetails, candidateDetails];
    const potentialOccupantCount = potentialOccupantsDetails.length;
    if (potentialOccupantCount > capacity) return { violation: true, reason: `Slot capacity (${capacity}) would be exceeded` };
    let potentialSoloCount = 0, potentialPairedCount = 0;
    potentialOccupantsDetails.forEach(details => {
        const groupSize = (details && typeof details.groupOf === 'number') ? details.groupOf : 1;
        if (groupSize === 1) potentialSoloCount++; else if (groupSize === 2) potentialPairedCount++;
    });
    if (potentialSoloCount > 0 && potentialOccupantCount > 1) return { violation: true, reason: 'Solo lessons cannot have other students' };
    if (potentialSoloCount === 0 && potentialPairedCount > 0 && potentialOccupantCount > 2) return { violation: true, reason: 'Paired lessons cannot exceed 2 students' };
    return { violation: false, reason: '' };
}

function getStudentDetails(studentId: number | string, allStudentsData: any[]): StudentDetails | null {
    if (!allStudentsData || !Array.isArray(allStudentsData)) return null;
    const student = allStudentsData.find(s => s.id == studentId);
    if (!student) return null;
    return {
        id: student.id,
        name: student.Name || student.name || 'Unknown Student',
        groupOf: typeof student.groupOf === 'number' ? student.groupOf : 1,
        subGroup: student.sub_group || null,
        lessons_owed: typeof student['lessons owed'] === 'number' ? student['lessons owed'] : 0, // Access quoted name
        availability_string: student.availability_string,
        class_name: student.class_name // Include class_name
    };
}

function isStudentAvailable(availabilityString: string | undefined | null, targetDay: string, targetTime: string): boolean {
    if (!availabilityString || typeof availabilityString !== 'string' || !targetDay || !targetTime || targetTime.length < 5) return false;
    const targetTimeHHMM = targetTime.substring(0, 5);
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(targetTimeHHMM)) return false;
    try {
        const availability: { [key: string]: string[] } = {};
        let currentDay: string | null = null;
        const entries = availabilityString.split(';');
        const validDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        entries.forEach(entry => {
            entry = entry.trim(); if (!entry) return;
            const foundDay = validDays.find(day => entry.startsWith(day + ':'));
            if (foundDay) {
                currentDay = foundDay;
                const timePart = entry.substring(foundDay.length + 1).trim().substring(0, 5);
                if (timeRegex.test(timePart)) {
                    if (!availability[currentDay]) availability[currentDay] = [];
                    if (!availability[currentDay].includes(timePart)) availability[currentDay].push(timePart);
                }
            } else if (currentDay) {
                 const timePart = entry.substring(0, 5);
                 if (timeRegex.test(timePart)) {
                    if (!availability[currentDay]) availability[currentDay] = [];
                    if (!availability[currentDay].includes(timePart)) availability[currentDay].push(timePart);
                 }
            }
        });
        return availability[targetDay] && availability[targetDay].includes(targetTimeHHMM);
    } catch (e) {
        console.error(`Error parsing availability string "${availabilityString}":`, e);
        return false;
    }
}

/**
 * Checks if a student is affected by any relevant block on a specific date.
 * @param studentDetails The details of the student to check.
 * @param blockDate The date (YYYY-MM-DD) to check for blocks.
 * @param coachId The ID of the coach for the slot (for 'Coach Unavailable' blocks).
 * @param blocks An array of DailyBlock objects for relevant dates.
 * @returns boolean True if the student is blocked, false otherwise.
 */
function isStudentBlocked(studentDetails: StudentDetails, blockDate: string, coachId: number, blocks: DailyBlock[]): boolean {
    if (!studentDetails || !blockDate || !Array.isArray(blocks)) return false;

    for (const block of blocks) {
        // Check if block applies to the specific date
        if (block.block_date !== blockDate) continue;

        // Check block type
        switch (block.block_type) {
            case 'Public Holiday':
                // Affects everyone
                return true;
            case 'Year Level Absence':
                // Check if identifier exists and matches start of student's class_name
                if (block.identifier && studentDetails.class_name && studentDetails.class_name.startsWith(block.identifier)) {
                    return true;
                }
                break;
            case 'Class Absence':
                // Check if identifier exists and exactly matches student's class_name
                if (block.identifier && studentDetails.class_name && studentDetails.class_name === block.identifier) {
                    return true;
                }
                break;
            case 'Coach Unavailable':
                // Check if identifier exists and matches the coach ID for the slot
                if (block.identifier && parseInt(block.identifier) === coachId) {
                    return true;
                }
                break;
            case 'Other':
                // 'Other' blocks don't automatically block students in this logic
                break;
        }
    }
    // No relevant block found
    return false;
}


// --- Main Server Logic ---
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // --- 1. Initialize Supabase Client ---
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !supabaseServiceKey) throw new Error("Missing Supabase environment variables.");
        const supabaseClient: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
             auth: { autoRefreshToken: false, persistSession: false }
        });

        // --- 2. Parse Request Body ---
        let coachIdFilter: number | null = null;
        let dayFilter: string | null = null;
        let includePartial = false; // Default for admin suggestions
        try {
            if (req.body) {
                const body = await req.json();
                coachIdFilter = body.coachIdFilter ? parseInt(body.coachIdFilter) : null;
                dayFilter = body.dayFilter || null;
                includePartial = body.includePartial === true; // Explicitly check for true
            }
        } catch (e) {
            console.warn("Could not parse request body, using defaults. Error:", e.message);
        }
        console.log("Received request parameters:", { coachIdFilter, dayFilter, includePartial });

        // --- 3. Fetch All Student Data ---
        // Added class_name for block checking
        const { data: allStudentsData, error: studentsError } = await supabaseClient
            .from('students')
            .select('id, Name, groupOf, sub_group, "lessons owed", availability_string, class_name');

        if (studentsError || !allStudentsData) throw new Error(`Failed to fetch student data: ${studentsError?.message}`);
        console.log(`Fetched ${allStudentsData.length} student records.`);

        // --- 4. Fetch Slots Needing Fill-ins ---
        // *** IMPORTANT: Ensure get_slots_needing_fillins RPC returns the DATE for each slot ***
        // *** Let's assume it now returns 'slot_date' (YYYY-MM-DD) ***
        console.log(`Calling RPC get_slots_needing_fillins_v2 with:`, { target_coach_id_param: coachIdFilter, target_day_param: dayFilter, p_include_partial: includePartial });
        // *** Using a hypothetical _v2 version that returns the date ***
        const { data: slotsNeedingFillins, error: slotsError } = await supabaseClient
            .rpc('get_slots_needing_fillins_v2', { // Assuming a v2 RPC exists
                target_coach_id_param: coachIdFilter,
                target_day_param: dayFilter,
                p_include_partial: includePartial
            });

        if (slotsError) throw new Error(`Failed to fetch slots: ${slotsError.message}`);
        if (!slotsNeedingFillins || slotsNeedingFillins.length === 0) {
            console.log("No slots found needing fill-ins.");
            return new Response(JSON.stringify([]), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }
        console.log(`Found ${slotsNeedingFillins.length} slots needing fill-ins.`);

        // --- 4b. Fetch Relevant Daily Blocks ---
        // Determine the date range needed based on the slots returned
        const datesToCheck = [...new Set(slotsNeedingFillins.map((slot: SlotInfo) => slot.slot_date))];
        let allBlocks: DailyBlock[] = [];
        if (datesToCheck.length > 0) {
            const { data: blockData, error: blockError } = await supabaseClient
                .from('daily_blocks') // Use the live table
                .select('block_date, block_type, identifier')
                .in('block_date', datesToCheck);

            if (blockError) throw new Error(`Failed to fetch daily blocks: ${blockError.message}`);
            allBlocks = blockData || [];
            console.log(`Fetched ${allBlocks.length} relevant daily blocks for dates: ${datesToCheck.join(', ')}`);
        }

        // --- 5. Prepare Potential Candidates ---
        const potentialCandidates = allStudentsData.filter(student =>
            (student["lessons owed"] ?? 0) > 0
        );
        console.log(`Prepared ${potentialCandidates.length} potential candidates (owed > 0).`);

        // --- 6. Core Logic: Find Optimal Group for Each Slot ---
        const results: ResultSlot[] = [];
        for (const slot of slotsNeedingFillins as SlotInfo[]) {
            const neededCount = slot.capacity - slot.current_occupants;
            if (neededCount <= 0) continue;

            const existingStudentsDetails: StudentDetails[] = (slot.original_student_ids || [])
                .map((id: number | string) => getStudentDetails(id, allStudentsData))
                .filter((details): details is StudentDetails => details !== null);

            let targetSubGroup: string | null = null;
            if (existingStudentsDetails.length > 0 && existingStudentsDetails[0].subGroup) {
                targetSubGroup = existingStudentsDetails[0].subGroup;
            }

            // Filter potential candidates for *this specific slot*
            const candidatesForSlot: Candidate[] = potentialCandidates
                .map(cand => getStudentDetails(cand.id, allStudentsData))
                .filter((candDetails): candDetails is Candidate => {
                    if (!candDetails) return false;
                    if (slot.original_student_ids?.includes(candDetails.id)) return false;
                    if (!isStudentAvailable(candDetails.availability_string, slot.day_of_week, slot.start_time)) return false;
                    if (targetSubGroup !== null && candDetails.subGroup !== targetSubGroup) return false;

                    // ***** NEW: Check against daily blocks *****
                    if (isStudentBlocked(candDetails, slot.slot_date, slot.coach_id, allBlocks)) {
                        // console.log(`Excluding candidate ${candDetails.name} for slot ${slot.schedule_id} due to block on ${slot.slot_date}`);
                        return false;
                    }
                    // ***** END NEW CHECK *****

                    return true;
                });

            candidatesForSlot.sort((a, b) => (b.lessons_owed ?? -Infinity) - (a.lessons_owed ?? -Infinity));

            // Greedy Algorithm
            let recommended_group: RecommendedGroupMember[] = [];
            let currentTestOccupants = [...existingStudentsDetails];
            let currentCompulsorySubGroup = targetSubGroup;

            for (const candidate of candidatesForSlot) {
                 if (recommended_group.length >= neededCount) break;
                 if (currentCompulsorySubGroup !== null && candidate.subGroup !== currentCompulsorySubGroup) continue;

                 const violationCheck = checkPairingRuleViolation(candidate, currentTestOccupants, slot.capacity);
                 if (!violationCheck.violation) {
                     recommended_group.push({
                         student_id: candidate.id, name: candidate.name, lessons_owed: candidate.lessons_owed,
                         groupOf: candidate.groupOf, subGroup: candidate.subGroup
                     });
                     currentTestOccupants.push(candidate);
                     if (recommended_group.length === 1 && currentCompulsorySubGroup === null && candidate.subGroup !== null) {
                         currentCompulsorySubGroup = candidate.subGroup;
                     }
                 }
            }

            results.push({
                ...slot,
                start_time: slot.start_time.substring(0, 5),
                recommended_group: recommended_group,
            });
        }

        console.log(`Finished processing. Returning ${results.length} slots with recommendations.`);

        // --- 7. Return Response ---
        return new Response(JSON.stringify(results), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error("Error in Edge Function:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: errorMessage }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
