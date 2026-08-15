import type {
  ActorRef,
  MilestoneReview,
  ReviewId,
  ReviewResult,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { assertReviewAssignable, assertReviewTransition } from "../services/transitions/reviews.js";
import { emit } from "./internal/events.js";
import { authorize, clone, ensureOpen, feature } from "./internal/helpers.js";
import type { Mutable } from "./internal/draft.js";
import type { EditorSession } from "./internal/session.js";

export class ReviewEditor {
  private readonly session: EditorSession;

  public constructor(session: never) {
    this.session = session as EditorSession;
  }

  public request(
    options: { readonly requestedBy?: ActorRef; readonly assignedReviewer?: ActorRef } = {},
  ): ReviewId {
    ensureOpen(this.session);
    feature(this.session.profile.reviews.enabled, "reviews");
    const id = this.session.ids.review();
    const review: MilestoneReview = {
      id,
      milestoneId: this.session.draft.id,
      milestoneRevisionId: this.session.draft.currentRevisionId,
      ...(options.requestedBy === undefined ? {} : { requestedBy: options.requestedBy }),
      ...(options.assignedReviewer === undefined
        ? {}
        : { assignedReviewer: options.assignedReviewer }),
      state: "requested",
      createdAt: this.session.clock.now(),
    };
    this.session.draft.reviews.push(clone(review));
    this.session.changes.push({ type: "review_changed", reviewId: id });
    emit(this.session, "review.requested", { review }, options.requestedBy);
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
    const review = this.get(id);
    assertReviewTransition(review.state, "completed");
    authorize(this.session, "review.complete", options.completedBy, { type: "review", reviewId: id });
    review.state = "completed";
    review.result = result;
    review.completedAt = this.session.clock.now();
    if (options.completedBy !== undefined) review.completedBy = options.completedBy;
    if (options.summary !== undefined) review.summary = options.summary;
    if (options.artifactVersionIds !== undefined) {
      review.artifactVersionIds = [...options.artifactVersionIds];
    }
    this.session.changes.push({ type: "review_changed", reviewId: id });
    emit(this.session, "review.completed", { reviewId: id, result }, options.completedBy);
  }

  private changed(review: Mutable<MilestoneReview>, actor?: ActorRef): void {
    this.session.changes.push({ type: "review_changed", reviewId: review.id });
    emit(this.session, "review.changed", { reviewId: review.id, state: review.state }, actor);
  }

  private get(id: ReviewId): Mutable<MilestoneReview> {
    const value = this.session.draft.reviews.find((item) => item.id === id);
    invariant(value !== undefined, "NOT_FOUND", `Review ${id} was not found`);
    return value;
  }
}

export function createReviewEditor(session: EditorSession): ReviewEditor {
  return new ReviewEditor(session as never);
}
