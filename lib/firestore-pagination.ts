import { collection, getDocs, limit, orderBy, query, startAfter, type Firestore, type QueryConstraint } from "firebase/firestore"

export async function collectCursorPages<T>(
  fetchPage: (cursor: unknown | null, pageSize: number) => Promise<{ items: T[]; nextCursor: unknown | null }>,
  pageSize: number,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("pageSize must be a positive integer")
  const all: T[] = []
  let cursor: unknown | null = null
  do {
    const page = await fetchPage(cursor, pageSize)
    all.push(...page.items)
    cursor = page.nextCursor
  } while (cursor !== null)
  return all
}

export async function fetchOrderedCollectionPages<T>(
  db: Firestore,
  collectionName: string,
  orderField: string,
  pageSize: number,
  constraints: QueryConstraint[] = [],
): Promise<T[]> {
  return collectCursorPages<T>(async cursor => {
    const pageQuery = query(
      collection(db, collectionName),
      ...constraints,
      orderBy(orderField, "desc"),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(pageSize),
    )
    const snapshot = await getDocs(pageQuery)
    return {
      items: snapshot.docs.map(document => ({ id: document.id, ...document.data() }) as T),
      nextCursor: snapshot.docs.length === pageSize ? snapshot.docs[snapshot.docs.length - 1] : null,
    }
  }, pageSize)
}
