import type { openLocalRepositories } from '../storage/repositories'
import type { ConceptState, LessonProgress, ReviewEvent, UserSettings } from '../storage/types'

export type GuestSnapshot = {
  version: 1
  guestId: string
  settings: UserSettings[]
  lessonProgress: LessonProgress[]
  conceptStates: ConceptState[]
  reviewEvents: ReviewEvent[]
}

export interface GuestClaimSink {
  /** Must treat repeated calls with the same key as the same claim. */
  claim(input: { userId: string; idempotencyKey: string; snapshot: GuestSnapshot }): Promise<void>
}

export async function exportGuestSnapshot(guestId: string, repositories: Awaited<ReturnType<typeof openLocalRepositories>>): Promise<GuestSnapshot> {
  const [settings, lessonProgress, conceptStates, reviewEvents] = await Promise.all([
    repositories.settings.list(), repositories.lessonProgress.list(), repositories.conceptStates.list(), repositories.reviews.list(),
  ])
  return { version: 1, guestId, settings, lessonProgress, conceptStates, reviewEvents }
}

/** Claims are repeatable; local repositories are deliberately never deleted here. */
export async function claimGuestSnapshot(userId: string, snapshot: GuestSnapshot, sink: GuestClaimSink): Promise<void> {
  await sink.claim({ userId, idempotencyKey: `guest-claim:v1:${snapshot.guestId}:${userId}`, snapshot })
}
