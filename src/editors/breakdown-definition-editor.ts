import type { ActorRef, BreakdownDefinition, JsonValue } from "../model/domain.js";
import { emitBreakdown } from "./internal/events.js";
import { authorizeBreakdown, clone, ensureOpen, equalDomainValue, requiredText } from "./internal/helpers.js";
import type { BreakdownEditorSession } from "./internal/session.js";

export interface BreakdownDefinitionEditor {
  update(definition: BreakdownDefinition, options?: { readonly actor?: ActorRef }): void;
  setTitle(title: string, actor?: ActorRef): void;
  setDescription(description: string | undefined, actor?: ActorRef): void;
  setMetadata(metadata: Readonly<Record<string, JsonValue>> | undefined, actor?: ActorRef): void;
}

export function createBreakdownDefinitionEditor(session: BreakdownEditorSession): BreakdownDefinitionEditor {
  return {
    update(definition: BreakdownDefinition, options: { readonly actor?: ActorRef } = {}): void {
      ensureOpen(session);
      requiredText(definition.title, "Breakdown title");
      if (equalDomainValue(session.draft.definition, definition)) return;
      authorizeBreakdown(session, "breakdown.definition.update", options.actor);
      session.draft.definition = clone(definition);
      session.changes.push({ type: "definition_changed" });
      emitBreakdown(session, "breakdown.definition_changed", { definition: clone(definition) }, options.actor);
    },

    setTitle(title: string, actor?: ActorRef): void {
      requiredText(title, "Breakdown title");
      const updated: BreakdownDefinition = { ...session.draft.definition, title };
      this.update(updated, actor === undefined ? {} : { actor });
    },

    setDescription(description: string | undefined, actor?: ActorRef): void {
      const updated: BreakdownDefinition = {
        title: session.draft.definition.title,
        ...(description === undefined ? {} : { description }),
        ...(session.draft.definition.metadata === undefined ? {} : { metadata: session.draft.definition.metadata }),
      };
      this.update(updated, actor === undefined ? {} : { actor });
    },

    setMetadata(metadata: Readonly<Record<string, JsonValue>> | undefined, actor?: ActorRef): void {
      const updated: BreakdownDefinition = {
        title: session.draft.definition.title,
        ...(session.draft.definition.description === undefined ? {} : { description: session.draft.definition.description }),
        ...(metadata === undefined ? {} : { metadata: clone(metadata) }),
      };
      this.update(updated, actor === undefined ? {} : { actor });
    },
  };
}
