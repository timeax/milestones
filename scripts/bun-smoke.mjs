import {
  FixedMilestoneClock,
  MilestoneEditor,
  SequenceMilestoneIdGenerator,
  asMilestoneProfileId,
  deserializeMilestoneJson,
  serializeMilestoneJson,
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
console.log(`bun smoke verified (${Bun.version}, sequence ${hydrated.sequence})`);
