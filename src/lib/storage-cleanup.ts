/**
 * Removes every Storage object a user owns.
 *
 * All uploads are stored under `<userId>/...` (card images, Anki media, PDFs).
 * Account deletion used to leave these files behind, which accumulated as
 * orphans in the `card-media` bucket.
 */

export const USER_STORAGE_BUCKETS = ["card-media", "pdfs"] as const;

const PAGE_SIZE = 1000;
const REMOVE_BATCH = 500;

interface ListedEntry {
  name: string;
  /** Folders have no id in Supabase Storage listings. */
  id: string | null;
}

/** Minimal slice of the Supabase Storage client this module needs. */
export interface StorageBucketApi {
  list(
    path: string,
    options: { limit: number; offset: number }
  ): Promise<{ data: ListedEntry[] | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}

export interface StorageApi {
  from(bucket: string): StorageBucketApi;
}

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listFilesRecursively(bucket: StorageBucketApi, prefix: string): Promise<string[]> {
  const files: string[] = [];
  const folders = [prefix];

  while (folders.length > 0) {
    const folder = folders.pop()!;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await bucket.list(folder, { limit: PAGE_SIZE, offset });
      if (error) throw new Error(`list ${folder}: ${error.message}`);
      const entries = data ?? [];
      for (const entry of entries) {
        const path = `${folder}/${entry.name}`;
        if (entry.id === null) folders.push(path);
        else files.push(path);
      }
      if (entries.length < PAGE_SIZE) break;
    }
  }

  return files;
}

export interface StorageCleanupResult {
  removed: number;
  errors: string[];
}

/**
 * Deletes all files under `<userId>/` in each bucket. Errors are collected,
 * not thrown, so account deletion can continue.
 */
export async function deleteUserStorage(
  storage: StorageApi,
  userId: string,
  buckets: readonly string[] = USER_STORAGE_BUCKETS
): Promise<StorageCleanupResult> {
  // Guard against ever listing a bucket root or another user's folder.
  if (!USER_ID_PATTERN.test(userId)) {
    return { removed: 0, errors: [`refusing to clean storage for invalid user id "${userId}"`] };
  }

  const result: StorageCleanupResult = { removed: 0, errors: [] };

  for (const bucketName of buckets) {
    const bucket = storage.from(bucketName);
    try {
      const files = await listFilesRecursively(bucket, userId);
      for (let i = 0; i < files.length; i += REMOVE_BATCH) {
        const batch = files.slice(i, i + REMOVE_BATCH);
        const { error } = await bucket.remove(batch);
        if (error) result.errors.push(`${bucketName}: ${error.message}`);
        else result.removed += batch.length;
      }
    } catch (error) {
      result.errors.push(`${bucketName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}
