import type { ActorRef, MilestoneDefinition, TaskDefinition } from "../model/domain.js";
import { emit, emitTask } from "./internal/events.js";
import { clone, ensureOpen, equalDomainValue, requiredText } from "./internal/helpers.js";
import { beginMaterialRevision, beginMaterialTaskRevision } from "./internal/revision.js";
import type { EditorSession, TaskEditorSession } from "./internal/session.js";

function isTaskSession(session: EditorSession | TaskEditorSession): session is TaskEditorSession {
  return "scope" in session.draft;
}

export class DefinitionEditor {
  private readonly session: EditorSession | TaskEditorSession;

  public constructor(session: never) {
    this.session = session as EditorSession | TaskEditorSession;
  }

  public update(
    definition: MilestoneDefinition | TaskDefinition,
    options: { readonly reason?: string; readonly actor?: ActorRef } = {},
  ): void {
    ensureOpen(this.session);
    requiredText(definition.title, "Definition title");
    if (equalDomainValue(this.session.draft.definition, definition)) return;
    if (isTaskSession(this.session)) {
      beginMaterialTaskRevision(this.session, options.reason, options.actor);
      this.session.draft.definition = clone(definition);
      this.session.changes.push({ type: "definition_changed" });
      emitTask(this.session, "task.definition_changed", { definition: clone(definition) }, options.actor);
    } else {
      beginMaterialRevision(this.session, options.reason, options.actor);
      this.session.draft.definition = clone(definition);
      this.session.changes.push({ type: "definition_changed" });
      emit(this.session, "definition.changed", { definition: clone(definition) }, options.actor);
    }
  }
}

export type TaskDefinitionEditor = DefinitionEditor;

export function createDefinitionEditor(session: EditorSession | TaskEditorSession): DefinitionEditor {
  return new DefinitionEditor(session as never);
}
