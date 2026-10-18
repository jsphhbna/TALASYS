import {
  collection,
  doc,
  type Firestore,
  writeBatch,
} from "firebase/firestore"
import {
  COLLECTION_NOTIFICATION_DISMISSALS,
  COLLECTION_NOTIFICATIONS,
} from "../constants.ts"

// Keep well below Firestore's practical large-batch boundary so index expansion
// and Rules evaluation remain bounded for notification-heavy accounts.
export const NOTIFICATION_WRITE_BATCH_SIZE = 200

export function chunkNotificationIds(ids: string[], size = NOTIFICATION_WRITE_BATCH_SIZE): string[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error("Notification batch size must be a positive integer.")
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
  const chunks: string[][] = []
  for (let index = 0; index < uniqueIds.length; index += size) {
    chunks.push(uniqueIds.slice(index, index + size))
  }
  return chunks
}

export function notificationDismissalDocumentId(userId: string, notificationId: string): string {
  return `${userId}_${notificationId}`
}

export async function dismissSharedNotificationsForUser(
  db: Firestore,
  userId: string,
  notificationIds: string[],
): Promise<number> {
  if (!userId) throw new Error("A signed-in user is required to dismiss notifications.")
  const uniqueIds = Array.from(new Set(notificationIds.filter(Boolean)))

  for (const ids of chunkNotificationIds(uniqueIds)) {
    const batch = writeBatch(db)
    const dismissedAt = Date.now()
    for (const notificationId of ids) {
      batch.set(doc(db, COLLECTION_NOTIFICATION_DISMISSALS, notificationDismissalDocumentId(userId, notificationId)), {
        userId,
        notificationId,
        dismissedAt,
      })
    }
    await batch.commit()
  }

  return uniqueIds.length
}

export async function deleteOwnedNotifications(
  db: Firestore,
  notificationIds: string[],
): Promise<number> {
  const uniqueIds = Array.from(new Set(notificationIds.filter(Boolean)))

  for (const ids of chunkNotificationIds(uniqueIds)) {
    const batch = writeBatch(db)
    for (const notificationId of ids) {
      batch.delete(doc(collection(db, COLLECTION_NOTIFICATIONS), notificationId))
    }
    await batch.commit()
  }

  return uniqueIds.length
}
