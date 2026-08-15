import type { ActorRef, MilestoneDefinition } from "../model/domain.js";
import { emit } from "./internal/events.js";
import { clone, ensureOpen, equalDomainValue, requiredText } from "./internal/helpers.js";
import { beginMaterialRevision } from "./internal/revision.js";
import type { EditorSession } from "./internal/session.js";

export class DefinitionEditor {
  private readonly session: EditorSession;

  public constructor(session: never) {
    this.session = session as EditorSession;
  }

  public update(
    definition: MilestoneDefinition,
    options: { readonly reason?: string; readonly actor?: ActorRef } = {},
  ): void {
    ensureOpen(this.session);
    requiredText(definition.title, "Definition title");
    if (equalDomainValue(this.session.draft.definition, definition)) return;
    beginMaterialRevision(this.session, options.reason, options.actor);
    this.session.draft.definition = clone(definition);
    this.session.changes.push({ type: "definition_changed" });
    emit(this.session, "definition.changed", { definition: clone(definition) }, options.actor);
  }
}

export function createDefinitionEditor(session: EditorSession): DefinitionEditor {
  return new DefinitionEditor(session as never);
}
