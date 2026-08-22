import {
  FixedMilestoneClock,
  FixedTaskClock,
  FixedBreakdownClock,
  MilestoneEditor,
  TaskEditor,
  BreakdownEditor,
  SequenceMilestoneIdGenerator,
  SequenceTaskIdGenerator,
  SequenceBreakdownIdGenerator,
  asMilestoneId,
  asMilestoneProfileId,
  asTaskProfileId,
  deserializeMilestoneJson,
  deserializeTaskJson,
  deserializeBreakdownJson,
  serializeMilestoneJson,
  serializeTaskJson,
  serializeBreakdownJson,
} from "../dist/index.js";

const profile = {
  ref: { id: asMilestoneProfileId("bun"), version: 1 },
  criteria: { enabled: true },
  deliverables: { enabled: true },
  dependencies: { enabled: true, participatesInGraph: true },
  revisions: { enabled: true },
  challenges: { enabled: true },
  reviews: { enabled: true, required: false },
  approvals: { enabled: true, required: false },
  completion: { enabled: true, closeImmediatelyOnAcceptance: false },
};
const ids = new SequenceMilestoneIdGenerator("bun");
const clock = new FixedMilestoneClock("2026-08-15T00:00:00.000Z");
const created = MilestoneEditor.create({
  profile,
  definition: { title: "Bun compatibility" },
  criteria: [{ title: "Runs on Bun", required: true, state: "submitted" }],
}, { ids, clock });
const editor = new MilestoneEditor(created.milestone, profile, { ids, clock });
editor.criteria.verify(created.milestone.criteria[0].id, { id: "bun" });
if (!editor.evaluateAcceptance().accepted) throw new Error("Bun acceptance evaluation failed");
editor.accept({ id: "bun" });
const result = editor.commit();
const hydrated = deserializeMilestoneJson(serializeMilestoneJson(result.milestone));
if (hydrated.currentAcceptanceId === undefined || hydrated.sequence !== result.milestone.sequence) {
  throw new Error("Bun milestone round-trip failed");
}

const taskProfile = {
  ref: { id: asTaskProfileId("bun-task"), version: 1 },
  criteria: { enabled: false }, deliverables: { enabled: false },
  dependencies: { enabled: false, participatesInGraph: false }, revisions: { enabled: true },
  challenges: { enabled: false }, reviews: { enabled: false, required: false },
  approvals: { enabled: false, required: false },
  completion: { enabled: true, requiresAcceptance: false, closeImmediatelyOnAcceptance: false },
};
const taskEditor = TaskEditor.create({
  profile: taskProfile,
  scope: { type: "project", projectId: "bun-project" },
  definition: { title: "Bun Task compatibility" },
}, { ids: new SequenceTaskIdGenerator("bun-task"), clock: new FixedTaskClock("2026-08-20T00:00:00.000Z") });
taskEditor.complete();
const task = deserializeTaskJson(serializeTaskJson(taskEditor.commit().task));
if (task.currentCompletionId === undefined) throw new Error("Bun Task round-trip failed");

const breakdownEditor = BreakdownEditor.create({
  parentMilestoneId: asMilestoneId("bun-parent"),
  definition: { title: "Bun Breakdown compatibility" },
}, { ids: new SequenceBreakdownIdGenerator("bun-breakdown"), clock: new FixedBreakdownClock("2026-08-20T00:00:00.000Z") });
const breakdown = deserializeBreakdownJson(serializeBreakdownJson(breakdownEditor.commit().breakdown));
if (breakdown.parentMilestoneId !== "bun-parent") throw new Error("Bun Breakdown round-trip failed");

console.log(`bun smoke verified (${Bun.version}, milestone sequence ${hydrated.sequence}, Task and Breakdown 1.0)`);
