import type {
  ActorRef,
  MilestoneReview,
  ReviewId,
  ReviewResult,
  TaskReview,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { assertReviewAssignable, assertReviewTransition } from "../services/transitions/reviews.js";
import { emit, emitTask } from "./internal/events.js";
import { authorize, authorizeTask, clone, ensureOpen, feature } from "./internal/helpers.js";
import type { Mutable } from "./internal/draft.js";
import type { EditorSession, TaskEditorSession } from "./internal/session.js";
import { resolveSources, resolveTaskSources } from "../services/sources.js";

function isTaskSession(session: EditorSession | TaskEditorSession): session is TaskEditorSession {
  return session.aggregateType === "task";
}

export class ReviewEditor {
  private readonly session: EditorSession | TaskEditorSession;

  public constructor(session: EditorSession | TaskEditorSession) { this.session = session; }

  public request(
    options: { readonly requestedBy?: ActorRef; readonly assignedReviewer?: ActorRef } = {},
  ): ReviewId {
    ensureOpen(this.session);
    feature(this.session.profile.reviews.enabled, "reviews");
    const id = this.session.ids.review();
    const isTask = isTaskSession(this.session);
    if (isTask) {
      const review: TaskReview = {
        id,
        taskId: this.session.draft.id,
        taskRevisionId: this.session.draft.currentRevisionId,
        ...(options.requestedBy === undefined ? {} : { requestedBy: options.requestedBy }),
        ...(options.assignedReviewer === undefined
          ? {}
          : { assignedReviewer: options.assignedReviewer }),
        state: "requested",
        sourceLinks: [],
        createdAt: this.session.clock.now(),
      };
      this.session.draft.reviews.push(clone(review));
      this.session.changes.push({ type: "review_changed", reviewId: id });
      emitTask(this.session, "task.review_requested", { review: clone(review) }, options.requestedBy);
    } else {
      const review: MilestoneReview = {
        id,
        milestoneId: this.session.draft.id,
        milestoneRevisionId: this.session.draft.currentRevisionId,
        ...(options.requestedBy === undefined ? {} : { requestedBy: options.requestedBy }),
        ...(options.assignedReviewer === undefined
          ? {}
          : { assignedReviewer: options.assignedReviewer }),
        state: "requested",
        sourceLinks: [],
        createdAt: this.session.clock.now(),
      };
      this.session.draft.reviews.push(clone(review));
      this.session.changes.push({ type: "review_changed", reviewId: id });
      emit(this.session as EditorSession, "review.requested", { review }, options.requestedBy);
    }
    return id;
  }

  public assign(id: ReviewId, reviewer: ActorRef, actor?: ActorRef): void {
    ensureOpen(this.session);
    const review = this.get(id);
    assertReviewAssignable(review.state);
    review.assignedReviewer = reviewer;
    this.changed(review, actor);
  }

  public start(id: ReviewId, actor?: ActorRef): void {
    ensureOpen(this.session);
    const review = this.get(id);
    assertReviewTransition(review.state, "in_progress");
    review.state = "in_progress";
    this.changed(review, actor);
  }

  public cancel(id: ReviewId, actor?: ActorRef): void {
    ensureOpen(this.session);
    const review = this.get(id);
    assertReviewTransition(review.state, "cancelled");
    review.state = "cancelled";
    this.changed(review, actor);
  }

  public complete(
    id: ReviewId,
    result: ReviewResult,
    options: {
      readonly completedBy?: ActorRef;
      readonly summary?: string;
      readonly artifactVersionIds?: readonly string[];
    } = {},
  ): void {
    ensureOpen(this.session);
    const isTask = isTaskSession(this.session);
    if (isTask) {
      authorizeTask(this.session as TaskEditorSession, "review.complete", options.completedBy, { type: "review", reviewId: id });
    } else {
      authorize(this.session as EditorSession, "review.complete", options.completedBy, { type: "review", reviewId: id });
    }
    this.session.changes.push({ type: "review_changed", reviewId: id });
    if (isTask) {
      const session = this.session as TaskEditorSession; const review = this.getTask(id, session);
      assertReviewTransition(review.state, "completed"); review.state = "completed"; review.result = result; review.completedAt = session.clock.now(); review.sourceSnapshot = resolveTaskSources(review.sourceLinks ?? [], session.artifacts);
      if (options.completedBy !== undefined) review.completedBy = options.completedBy; if (options.summary !== undefined) review.summary = options.summary; if (options.artifactVersionIds !== undefined) review.artifactVersionIds = [...options.artifactVersionIds];
      emitTask(this.session as TaskEditorSession, "task.review_completed", { reviewId: id, result }, options.completedBy);
    } else {
      const session = this.session as EditorSession; const review = this.getMilestone(id, session);
      assertReviewTransition(review.state, "completed"); review.state = "completed"; review.result = result; review.completedAt = session.clock.now(); review.sourceSnapshot = resolveSources(review.sourceLinks ?? [], session.artifacts);
      if (options.completedBy !== undefined) review.completedBy = options.completedBy; if (options.summary !== undefined) review.summary = options.summary; if (options.artifactVersionIds !== undefined) review.artifactVersionIds = [...options.artifactVersionIds];
      emit(this.session as EditorSession, "review.completed", { reviewId: id, result }, options.completedBy);
    }
  }

  private changed(review: Mutable<MilestoneReview> | Mutable<TaskReview>, actor?: ActorRef): void {
    this.session.changes.push({ type: "review_changed", reviewId: review.id });
    if (isTaskSession(this.session)) {
      emitTask(this.session as TaskEditorSession, "task.review_changed", { reviewId: review.id, state: review.state }, actor);
    } else {
      emit(this.session as EditorSession, "review.changed", { reviewId: review.id, state: review.state }, actor);
    }
  }

  private get(id: ReviewId): Mutable<MilestoneReview> | Mutable<TaskReview> {
    const value = this.session.draft.reviews.find((item) => item.id === id);
    invariant(value !== undefined, "NOT_FOUND", `Review ${id} was not found`);
    return value;
  }
  private getTask(id: ReviewId, session: TaskEditorSession): Mutable<TaskReview> { const value = session.draft.reviews.find((item) => item.id === id); invariant(value !== undefined, "NOT_FOUND", `Review ${id} was not found`); return value; }
  private getMilestone(id: ReviewId, session: EditorSession): Mutable<MilestoneReview> { const value = session.draft.reviews.find((item) => item.id === id); invariant(value !== undefined, "NOT_FOUND", `Review ${id} was not found`); return value; }
}

export type TaskReviewEditor = ReviewEditor;

export function createReviewEditor(session: EditorSession | TaskEditorSession): ReviewEditor {
  return new ReviewEditor(session);
}
