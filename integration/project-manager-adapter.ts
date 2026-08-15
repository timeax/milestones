import {
  createGraphSnapshot,
  deserializeMilestoneJson,
  serializeEvents,
  serializeMilestoneJson,
  type Milestone,
  type MilestoneArtifactContext,
  type MilestoneEditResult,
  type MilestoneGraphSnapshot,
} from "@elqora/milestones";

export interface ProjectMilestoneBinding {
  readonly projectId: string;
  readonly versionId: string;
  readonly visibility: "private" | "internal" | "public";
  readonly graphPosition: { readonly x: number; readonly y: number };
  readonly repositoryRoute?: string;
  readonly pmPath: string;
}

export interface ProjectMilestoneRow {
  readonly binding: ProjectMilestoneBinding;
  milestoneJson: string;
  sequence: number;
}

export interface ProjectManagerHostState {
  row?: ProjectMilestoneRow;
  readonly eventRows: string[];
  readonly outbox: Array<{
    readonly projectId: string;
    readonly milestoneId: string;
    readonly expectedSequence: number;
    readonly sequence: number;
    readonly milestoneJson: string;
  }>;
}

export class ProjectManagerMilestoneAdapter {
  public constructor(
    private readonly state: ProjectManagerHostState,
    private readonly artifactContext?: MilestoneArtifactContext,
  ) {}

  public create(binding: ProjectMilestoneBinding, milestone: Milestone): void {
    if (this.state.row !== undefined) throw new Error("Milestone row already exists");
    this.state.row = { binding, milestoneJson: serializeMilestoneJson(milestone), sequence: milestone.sequence };
  }

  public load(): Milestone {
    if (this.state.row === undefined) throw new Error("Milestone row does not exist");
    return deserializeMilestoneJson(this.state.row.milestoneJson);
  }

  public commit(expectedSequence: number, result: MilestoneEditResult): boolean {
    const row = this.state.row;
    if (row === undefined || row.sequence !== expectedSequence) return false;
    const milestoneJson = serializeMilestoneJson(result.milestone);
    row.milestoneJson = milestoneJson;
    row.sequence = result.milestone.sequence;
    this.state.eventRows.push(serializeEvents(result.events));
    this.state.outbox.push({
      projectId: row.binding.projectId,
      milestoneId: result.milestone.id,
      expectedSequence,
      sequence: result.milestone.sequence,
      milestoneJson,
    });
    return true;
  }

  public reconstructGraph(): MilestoneGraphSnapshot {
    return createGraphSnapshot([this.load()]);
  }

  public resolveArtifacts(): MilestoneArtifactContext | undefined {
    return this.artifactContext === undefined ? undefined : structuredClone(this.artifactContext);
  }

  public exportPmSnapshot(): string {
    if (this.state.row === undefined) throw new Error("Milestone row does not exist");
    return JSON.stringify({ binding: this.state.row.binding, milestoneJson: this.state.row.milestoneJson });
  }

  public static rebuildFromPmSnapshot(snapshot: string): ProjectManagerHostState {
    const parsed = JSON.parse(snapshot) as { binding: ProjectMilestoneBinding; milestoneJson: string };
    const milestone = deserializeMilestoneJson(parsed.milestoneJson);
    return {
      row: { binding: parsed.binding, milestoneJson: serializeMilestoneJson(milestone), sequence: milestone.sequence },
      eventRows: [],
      outbox: [],
    };
  }
}
