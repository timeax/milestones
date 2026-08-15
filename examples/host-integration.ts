import {
  MilestoneEditor,
  migrateAndDeserializeMilestone,
  serializeEvents,
  serializeMilestoneJson,
  type ActorRef,
  type CriterionId,
  type MilestoneArtifactContext,
  type MilestoneClock,
  type MilestoneGraphSnapshot,
  type MilestoneIdGenerator,
  type MilestoneProfile,
} from "@elqora/milestones";

export interface LoadedMilestoneOperation {
  readonly milestoneJson: string;
  readonly profile: MilestoneProfile;
  readonly graph?: MilestoneGraphSnapshot;
  readonly artifacts?: MilestoneArtifactContext;
}

export interface MilestoneHostTransaction {
  load(): Promise<LoadedMilestoneOperation>;
  compareAndSet(input: {
    readonly expectedSequence: number;
    readonly milestoneJson: string;
    readonly eventsJson: string;
    readonly outboxPayload: Readonly<Record<string, unknown>>;
  }): Promise<boolean>;
}

export async function verifyCriterion(
  host: MilestoneHostTransaction,
  dependencies: { readonly clock: MilestoneClock; readonly ids: MilestoneIdGenerator },
  criterionId: CriterionId,
  actor: ActorRef,
): Promise<void> {
  const loaded = await host.load();
  const milestone = migrateAndDeserializeMilestone(JSON.parse(loaded.milestoneJson) as unknown);
  const expectedSequence = milestone.sequence;
  const editor = new MilestoneEditor(milestone, loaded.profile, {
    ...dependencies,
    expectedSequence,
    ...(loaded.graph === undefined ? {} : { graph: loaded.graph }),
    ...(loaded.artifacts === undefined ? {} : { artifacts: loaded.artifacts }),
  });
  editor.criteria.verify(criterionId, actor);
  const result = editor.commit();
  const saved = await host.compareAndSet({
    expectedSequence,
    milestoneJson: serializeMilestoneJson(result.milestone),
    eventsJson: serializeEvents(result.events),
    outboxPayload: {
      milestoneId: result.milestone.id,
      fromSequence: expectedSequence,
      toSequence: result.milestone.sequence,
    },
  });
  if (!saved) throw new Error("Optimistic concurrency conflict");
}
