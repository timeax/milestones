import {
  FixedMilestoneClock,
  MilestoneEditor,
  SequenceMilestoneIdGenerator,
  asMilestoneProfileId,
  type CreateMilestoneInput,
  type Milestone,
  type MilestoneProfile,
} from "../src/index.js";

export const actor = { id: "actor-1", type: "user" } as const;

export function profile(overrides: Partial<MilestoneProfile> = {}): MilestoneProfile {
  const base: MilestoneProfile = {
    ref: { id: asMilestoneProfileId("standard"), version: 1 },
    criteria: { enabled: true },
    deliverables: { enabled: true },
    dependencies: { enabled: true, participatesInGraph: true },
    revisions: { enabled: true },
    challenges: { enabled: true },
    reviews: { enabled: true, required: false },
    approvals: { enabled: true, required: false },
    completion: { enabled: true, closeImmediatelyOnAcceptance: false },
  };
  return { ...base, ...overrides };
}

export function harness(seed = "test") {
  return {
    ids: new SequenceMilestoneIdGenerator(seed),
    clock: new FixedMilestoneClock("2026-08-15T10:00:00.000Z"),
  };
}

export function create(input: Partial<CreateMilestoneInput> = {}, seed = "test"): { milestone: Milestone; profile: MilestoneProfile; ids: SequenceMilestoneIdGenerator; clock: FixedMilestoneClock } {
  const dependencies = harness(seed);
  const selectedProfile = input.profile ?? profile();
  const result = MilestoneEditor.create({ profile: selectedProfile, definition: { title: "M1" }, ...input }, dependencies);
  return { milestone: result.milestone, profile: selectedProfile, ...dependencies };
}
