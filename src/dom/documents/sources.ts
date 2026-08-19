import type {
  ArtifactId,
  ArtifactLinkId,
  ArtifactMetadata,
  ArtifactVersionId,
} from "@elqora/artifacts";

import type {
  MilestoneArtifactContext,
  MilestoneSourceLink,
  MilestoneSourceRole,
  MilestoneSourceSnapshot,
  MilestoneSourceSubjectType,
} from "../../model/domain.js";

import {
  assertValidSourceLink,
  isDefinitionBearing,
  resolveSourceLink,
  sourceSubjectOwnsLink,
} from "../../services/sources.js";

import type {
  DocumentListOptions,
  MilestoneSourceDocument,
  MilestoneSourceOverviewDocument,
  MilestoneSourceSnapshotDocument,
  MilestoneSourcesDocument,
  TextDocument,
} from "../types.js";

import {
  createTextDocument,
} from "./text.js";

/* -------------------------------------------------------------------------- */
/*                     Historical Source snapshot DOM                         */
/* -------------------------------------------------------------------------- */

export class MilestoneSourceSnapshotDocumentImpl
  implements MilestoneSourceSnapshotDocument
{
  readonly #snapshot: MilestoneSourceSnapshot;
  readonly #note: TextDocument;

  constructor(
    snapshot: MilestoneSourceSnapshot,
  ) {
    this.#snapshot = snapshot;

    this.#note = createTextDocument(
      snapshot.note,
    );
  }

  getLinkId(): ArtifactLinkId {
    return this.#snapshot.linkId;
  }

  getArtifactId(): ArtifactId {
    return this.#snapshot.artifactId;
  }

  getArtifactVersionId():
    | ArtifactVersionId
    | undefined {
    return this.#snapshot.artifactVersionId;
  }

  getSubjectType() {
    return this.#snapshot.subject.type;
  }

  getSubjectId(): string {
    return this.#snapshot.subject.id;
  }

  getRole() {
    return this.#snapshot.role;
  }

  getNote(): TextDocument {
    return this.#note;
  }

  hasNote(): boolean {
    return !this.#note.isEmpty();
  }

  getMetadata(): ArtifactMetadata | undefined {
    return this.#snapshot.metadata;
  }

  isPinned(): boolean {
    return (
      this.#snapshot.artifactVersionId !==
      undefined
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                              Source overview                               */

/* -------------------------------------------------------------------------- */

/**
 * Lightweight DOM representation of a Milestone Source.
 *
 * This layer deliberately does not resolve the Artifact or Artifact Version.
 * It is therefore suitable for collection listings where callers only need
 * identity, role, subject and other cheap Source information.
 */
export class MilestoneSourceOverviewDocumentImpl
    implements MilestoneSourceOverviewDocument {
    readonly #link: MilestoneSourceLink;
    readonly #note: TextDocument;

    constructor(link: MilestoneSourceLink) {
        assertValidSourceLink(link);

        this.#link = link;
        this.#note = createTextDocument(link.note);
    }

    getId(): ArtifactLinkId {
        return this.#link.id;
    }

    getArtifactId() {
        return this.#link.artifactId;
    }

    /**
     * Version pinned directly on the Source link.
     *
     * This is not necessarily the same thing as the version obtained through
     * historical/current Source resolution.
     */
    getArtifactVersionId(): ArtifactVersionId | undefined {
        return this.#link.artifactVersionId;
    }

    getRole(): MilestoneSourceRole {
        return this.#link.role;
    }

    getSubjectType(): MilestoneSourceSubjectType {
        return this.#link.subject.type;
    }

    getSubjectId(): string {
        return this.#link.subject.id;
    }

    getNote(): TextDocument {
        return this.#note;
    }

    hasNote(): boolean {
        return !this.#note.isEmpty();
    }

    /**
     * Whether this Source explicitly pins an Artifact Version.
     */
    isPinned(): boolean {
        return this.#link.artifactVersionId !== undefined;
    }

    /**
     * Specification and decision Sources are definition-bearing according to
     * the authoritative milestone Source service.
     */
    isDefinitionBearing(): boolean {
        return isDefinitionBearing(this.#link);
    }
}

/* -------------------------------------------------------------------------- */
/*                               Source document                              */

/* -------------------------------------------------------------------------- */

/**
 * Full DOM representation of a Milestone Source.
 *
 * Unlike the overview node, this node can resolve an unpinned Source through
 * an optional MilestoneArtifactContext.
 *
 * Resolution behavior intentionally follows resolveSourceLink() rather than
 * reproducing Artifact resolution rules here.
 */
export class MilestoneSourceDocumentImpl
    extends MilestoneSourceOverviewDocumentImpl
    implements MilestoneSourceDocument {
    readonly #link: MilestoneSourceLink;
    readonly #snapshot: MilestoneSourceSnapshot | undefined;

    constructor(
        link: MilestoneSourceLink,
        artifacts?: MilestoneArtifactContext,
    ) {
        super(link);

        this.#link = link;
        this.#snapshot = tryResolveSource(link, artifacts);
    }

    getMetadata(): ArtifactMetadata | undefined {
        return this.#link.metadata;
    }

    /**
     * Returns the version selected by Source resolution.
     *
     * For pinned Sources this will normally be the pinned version.
     *
     * For unpinned Sources, an Artifact context may resolve this to the
     * Artifact's current version.
     *
     * Undefined does not necessarily mean the Source is invalid. An Artifact
     * may itself have no current version.
     */
    getResolvedArtifactVersionId(): ArtifactVersionId | undefined {
        return this.#snapshot?.artifactVersionId;
    }

    /**
     * Whether Source resolution could be performed with the information
     * available to this DOM.
     *
     * A pinned Source can be resolved without Artifact context.
     *
     * An unpinned Source requires Artifact context because the authoritative
     * Source service must determine the appropriate Artifact Version.
     */
    isResolved(): boolean {
        return this.#snapshot !== undefined;
    }
}

/* -------------------------------------------------------------------------- */
/*                            Sources collection                              */

/* -------------------------------------------------------------------------- */

/**
 * Read-only collection DOM for a selected set of Milestone Sources.
 *
 * The collection does not decide which Sources belong to a milestone,
 * criterion, revision, challenge, etc. Its caller provides the canonical
 * selected links.
 *
 * This keeps traversal responsibilities in the parent document:
 *
 *   CriterionDocument
 *      ↓ selects criterion.sourceLinks
 *   MilestoneSourcesDocumentImpl
 *
 *   ChallengeDocument
 *      ↓ selects challenge.sourceLinks
 *   MilestoneSourcesDocumentImpl
 *
 *   MilestoneDocument.getAllSources()
 *      ↓ selects all relevant links
 *   MilestoneSourcesDocumentImpl
 */
export class MilestoneSourcesDocumentImpl
    implements MilestoneSourcesDocument {
    readonly #links: readonly MilestoneSourceLink[];
    readonly #artifacts: MilestoneArtifactContext | undefined;
    readonly #byId: ReadonlyMap<ArtifactLinkId, MilestoneSourceLink>;

    constructor(
        links: readonly MilestoneSourceLink[],
        artifacts?: MilestoneArtifactContext,
    ) {
        const byId = new Map<ArtifactLinkId, MilestoneSourceLink>();

        for (const link of links) {
            assertValidSourceLink(link);

            if (byId.has(link.id)) {
                throw new Error(
                    `Duplicate Source link ${link.id} in DOM collection`,
                );
            }

            byId.set(link.id, link);
        }

        this.#links = [...links];
        this.#artifacts = artifacts;
        this.#byId = byId;
    }

    getCount(): number {
        return this.#links.length;
    }

    isEmpty(): boolean {
        return this.#links.length === 0;
    }

    has(id: ArtifactLinkId): boolean {
        return this.#byId.has(id);
    }

    /**
     * Returns lightweight Source overview nodes.
     *
     * Artifact resolution is deliberately not required for list().
     */
    list(
        options: DocumentListOptions = {},
    ): readonly MilestoneSourceOverviewDocument[] {
        return sliceCollection(this.#links, options).map(
            (link) => new MilestoneSourceOverviewDocumentImpl(link),
        );
    }

    /**
     * Returns the complete Source document if present.
     */
    get(id: ArtifactLinkId): MilestoneSourceDocument | undefined {
        const link = this.#byId.get(id);

        if (link === undefined) {
            return undefined;
        }

        return this.#createDocument(link);
    }

    /**
     * Returns a Source document or throws when the requested Source does not
     * belong to this collection.
     */
    require(id: ArtifactLinkId): MilestoneSourceDocument {
        const document = this.get(id);

        if (document === undefined) {
            throw new Error(`Source link ${id} was not found`);
        }

        return document;
    }

    getByRole(
        role: MilestoneSourceRole,
    ): readonly MilestoneSourceDocument[] {
        return this.#links
            .filter((link) => link.role === role)
            .map((link) => this.#createDocument(link));
    }

    getBySubject(
        type: MilestoneSourceSubjectType,
        id: string,
    ): readonly MilestoneSourceDocument[] {
        return this.#links
            .filter((link) =>
                sourceSubjectOwnsLink(link, {
                    type,
                    id,
                }),
            )
            .map((link) => this.#createDocument(link));
    }

    getReferences(): readonly MilestoneSourceDocument[] {
        return this.getByRole("reference");
    }

    getContext(): readonly MilestoneSourceDocument[] {
        return this.getByRole("context");
    }

    getSpecifications(): readonly MilestoneSourceDocument[] {
        return this.getByRole("specification");
    }

    getDecisions(): readonly MilestoneSourceDocument[] {
        return this.getByRole("decision");
    }

    #createDocument(
        link: MilestoneSourceLink,
    ): MilestoneSourceDocument {
        return new MilestoneSourceDocumentImpl(
            link,
            this.#artifacts,
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                                 Factories                                  */

/* -------------------------------------------------------------------------- */

/**
 * Creates a Source collection from an already-selected group of links.
 *
 * This is the most general Source DOM factory and will be used heavily by
 * parent Documents.
 */
export function createSourcesDocument(
    links: readonly MilestoneSourceLink[] | undefined,
    artifacts?: MilestoneArtifactContext,
): MilestoneSourcesDocument {
    return new MilestoneSourcesDocumentImpl(
        links ?? [],
        artifacts,
    );
}

/**
 * Creates a Source collection containing only links owned by one specific
 * milestone-domain subject.
 *
 * This is useful when the caller already has a larger Source collection and
 * wants a scoped view without duplicating subject-matching logic.
 */
export function createSourcesDocumentForSubject(
    links: readonly MilestoneSourceLink[] | undefined,
    subject: {
        readonly type: MilestoneSourceSubjectType;
        readonly id: string;
    },
    artifacts?: MilestoneArtifactContext,
): MilestoneSourcesDocument {
    const scoped = (links ?? []).filter((link) =>
        sourceSubjectOwnsLink(link, subject),
    );

    return new MilestoneSourcesDocumentImpl(
        scoped,
        artifacts,
    );
}

/* -------------------------------------------------------------------------- */
/*                              Resolution helper                             */

/* -------------------------------------------------------------------------- */

/**
 * Attempts to resolve a Source without weakening the authoritative Source
 * service's rules.
 *
 * There is exactly one deliberately non-error case:
 *
 *   unpinned Source + no Artifact context
 *
 * The Source is still a valid DOM node, but the DOM cannot determine its
 * resolved Artifact Version. In that case isResolved() returns false.
 *
 * Every other validation/resolution error is allowed to propagate from
 * resolveSourceLink().
 */
function tryResolveSource(
    link: MilestoneSourceLink,
    artifacts?: MilestoneArtifactContext,
): MilestoneSourceSnapshot | undefined {
    if (
        link.artifactVersionId === undefined &&
        artifacts === undefined
    ) {
        return undefined;
    }

    return resolveSourceLink(
        link,
        artifacts,
    );
}

/* -------------------------------------------------------------------------- */
/*                               List helpers                                 */

/* -------------------------------------------------------------------------- */

function sliceCollection<T>(
    values: readonly T[],
    options: DocumentListOptions,
): readonly T[] {
    const offset = normalizeNonNegativeInteger(
        options.offset ?? 0,
        "offset",
    );

    const limit =
        options.limit === undefined
            ? undefined
            : normalizeNonNegativeInteger(
                options.limit,
                "limit",
            );

    if (offset >= values.length) {
        return [];
    }

    if (limit === undefined) {
        return values.slice(offset);
    }

    return values.slice(
        offset,
        offset + limit,
    );
}

function normalizeNonNegativeInteger(
    value: number,
    name: string,
): number {
    if (!Number.isFinite(value)) {
        throw new RangeError(
            `${name} must be a finite number`,
        );
    }

    if (!Number.isInteger(value)) {
        throw new RangeError(
            `${name} must be an integer`,
        );
    }

    if (value < 0) {
        throw new RangeError(
            `${name} must be greater than or equal to 0`,
        );
    }

    return value;
}