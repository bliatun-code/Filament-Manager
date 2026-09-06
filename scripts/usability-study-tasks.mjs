export const USABILITY_STUDY_TASKS = Object.freeze([
  Object.freeze({
    id: "register",
    instructions:
      "Register one new owned roll of Bambu Lab ASA, Marine Blue, with 1,000 g of filament. Set both its home location and its current location to QA Dry box.",
    startingState:
      "Use a fresh study database with the UI in English and Inventory open. The catalog entry is qa_master_bambu_asa_marine_blue. No roll for that catalog entry exists before this attempt. Record the total spool count and the matching spool count before handing control to the participant.",
    expectedOutcome:
      "Exactly one new owned, in-stock spool references qa_master_bambu_asa_marine_blue. Its initial and remaining filament weights are 1,000 g, and both its home and current locations are QA Dry box. The matching spool count changes from 0 to 1 and the total spool count increases by exactly 1. Existing spools remain unchanged.",
  }),
  Object.freeze({
    id: "find",
    instructions:
      "Find the owned eSUN PETG+HS, Deep Blue roll with 780 g remaining at QA Shelf A, and show its details. Leave the inventory unchanged.",
    startingState:
      "Use a fresh study database with the UI in English and Dashboard open. The target is spool_demo_100003, the owned eSUN PETG+HS / Deep Blue roll with 780 g remaining at QA Shelf A. Similar rolls with 610 g and 730 g are distractors. Record the target identity and the relevant inventory state before the attempt.",
    expectedOutcome:
      "The detail view for spool_demo_100003 is open and shows the 780 g roll at QA Shelf A. Neither the 610 g roll nor the 730 g roll is selected as the answer. No spool, loan, purchase, location, weight, or printer-slot assignment is changed; before and after inventory counts and values match.",
  }),
  Object.freeze({
    id: "load",
    instructions:
      "Load this owned eSUN PETG+HS, Deep Blue roll into Atlas QA, AMS slot 4. The roll has 780 g of filament remaining. Leave every other printer slot unchanged.",
    startingState:
      "Use a fresh study database with the UI in English and the detail view for spool_demo_100003 already open. Confirm the selected owned eSUN PETG+HS / Deep Blue roll has 780 g remaining. Atlas QA AMS slot 4, qa_bambu_slot_4, is empty. Record every printer-slot assignment and the target spool's weight before the attempt.",
    expectedOutcome:
      "qa_bambu_slot_4 on Atlas QA is assigned to exactly spool_demo_100003, with 780 g recorded for the loaded roll. Every other printer-slot assignment is identical to its before state. No duplicate spool is created and the total spool count is unchanged.",
  }),
  Object.freeze({
    id: "lend",
    instructions:
      "Lend this owned Generic ABS Pro, Signal Orange roll to Sample maker space. Record 450 g of filament when the roll leaves.",
    startingState:
      "Use a fresh study database with the UI in English and the detail view for spool_demo_100004 already open. The owned Generic ABS Pro / Signal Orange roll has 450 g remaining. The prepared fixture has released it from qa_bambu_slot_3, and it has no active loan. Preserve and record its earlier returned loan, the total loan count, and its active outbound loan count before the attempt. Sample maker space is a synthetic borrower.",
    expectedOutcome:
      "Exactly one new active OUTBOUND loan exists for spool_demo_100004, with borrower Sample maker space and outgoing filament weight 450 g. The target's active outbound loan count changes from 0 to 1 and the total loan count increases by exactly 1. Its earlier returned loan remains unchanged. No other spool is lent and no duplicate spool is created.",
  }),
  Object.freeze({
    id: "receive",
    instructions:
      "Receive one roll from your order of two Bambu Lab PLA Basic, Jade White rolls. The received roll has 1,000 g of filament and belongs in QA Dry box. Keep the other roll on order.",
    startingState:
      "Use a fresh study database with the UI in English and the main Inventory view open, with purchase dialogs closed. This same starting view is available in both older and newer builds. The prepared fixture sets qa_wishlist_white_pla, Bambu Lab PLA Basic / Jade White, to ON_ORDER with quantity 2. Record its quantity and status, the total spool count, and the count of matching in-stock spools before the attempt.",
    expectedOutcome:
      "Exactly one new in-stock spool matching Bambu Lab PLA Basic / Jade White exists with 1,000 g of filament at QA Dry box. Both the total spool count and the matching in-stock count increase by exactly 1. qa_wishlist_white_pla remains ON_ORDER with quantity 1. No second roll is received, and unrelated orders and spools remain unchanged.",
  }),
]);

const MODERATOR_RULES = [
  "Keep this answer key hidden from participants. Read only the assigned participant card verbatim; do not add navigation, label, shortcut, or recovery hints.",
  "Use a separate fresh database for every task and every build. Never carry a registration, slot assignment, loan, or receipt from one task into another. Confirm the fixed setup and record before counts and values before presenting the task.",
  "Complete all setup, including opening the specified starting view, before timing. Start the timer when the participant receives the task and control of the app; setup time is excluded.",
  "Stop timing at the actual observed end: verified completion, the participant stopping, or the study's time limit. Record the measured duration_ms and actual stop reason. Never replace the measured duration with an estimated duration or a planned limit.",
  "Record assistance as assisted: true whenever the moderator supplies help, a workflow answer, a hint, or a recovery step. An assisted completion remains assisted even if the participant subsequently finishes alone.",
  "Verify the outcome against before and after counts and exact record identities. Set completed: true only for the stated outcome. Wrong-record mutation, extra creations, data loss, or an unrecoverable state are critical errors.",
  "Set critical_error: false only after observing the attempt and checking that no critical error occurred. An unobserved or incomplete observation is not evidence of no error; do not prefill a successful result or infer one from an automated fixture check.",
  "Keep the raw observations, measured time, actual stop reason, assistance, and outcome for every attempt, including failures. Use pseudonymous participant IDs and synthetic data; retain raw study records privately. Database checks support observed scoring and do not substitute for participant evidence.",
];

export function renderUsabilityTaskCards() {
  const participantCards = USABILITY_STUDY_TASKS.map((task, index) =>
    `## Card ${index + 1}: ${task.id}\n\n${task.instructions}`,
  );
  const moderatorAnswers = USABILITY_STUDY_TASKS.map((task, index) =>
    `## Answer ${index + 1}: ${task.id}\n\n**Starting state**\n\n${task.startingState}\n\n**Expected outcome**\n\n${task.expectedOutcome}`,
  );
  return [
    "# Participant cards (English)",
    ...participantCards,
    "---",
    "# Moderator answer key",
    MODERATOR_RULES.map((rule, index) => `${index + 1}. ${rule}`).join("\n"),
    ...moderatorAnswers,
    "",
  ].join("\n\n");
}
