/*
 * Public Milestone DOM API.
 *
 * Important:
 *
 * Do NOT export ./documents/index.js from here.
 *
 * The classes inside documents/ are implementation details. Consumers should
 * program against the contracts in types.ts and construct the DOM through the
 * root document/factory/builder.
 */

/* -------------------------------------------------------------------------- */
/*                              Public contracts                              */
/* -------------------------------------------------------------------------- */

export type * from "./types.js";

/* -------------------------------------------------------------------------- */
/*                               Root document                                */
/* -------------------------------------------------------------------------- */

export {
    MilestoneDocument,
} from "./document.js";

/* -------------------------------------------------------------------------- */
/*                                Construction                                */
/* -------------------------------------------------------------------------- */

export {
    createMilestoneDocument,
    createMilestoneDocumentContext,
    MilestoneDocumentBuilder,
    type MilestoneDocumentBuildInput,
} from "./builder.js";