import { describe, expect, it } from "vitest";
import { deleteUserStorage, type StorageApi } from "./storage-cleanup";

const USER = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";

/** In-memory Storage that mimics Supabase listing (one level, folders without id). */
function fakeStorage(initial: Record<string, string[]>) {
  const buckets = new Map(Object.entries(initial).map(([b, files]) => [b, new Set(files)]));
  const removeCalls: string[][] = [];

  const api: StorageApi = {
    from(bucket) {
      const files = buckets.get(bucket) ?? new Set<string>();
      return {
        async list(path, { limit, offset }) {
          const children = new Map<string, string | null>();
          for (const file of files) {
            if (!file.startsWith(`${path}/`)) continue;
            const rest = file.slice(path.length + 1);
            const [head, ...tail] = rest.split("/");
            children.set(head, tail.length > 0 ? null : `id-${file}`);
          }
          const entries = [...children].sort().map(([name, id]) => ({ name, id }));
          return { data: entries.slice(offset, offset + limit), error: null };
        },
        async remove(paths) {
          removeCalls.push(paths);
          for (const p of paths) files.delete(p);
          return { error: null };
        },
      };
    },
  };

  return { api, buckets, removeCalls };
}

describe("deleteUserStorage", () => {
  it("removes every file in the user's folders and nothing else", async () => {
    const { api, buckets } = fakeStorage({
      "card-media": [
        `${USER}/card-images/a.jpg`,
        `${USER}/anki-media/b.png`,
        `${USER}/anki-media/c.png`,
        `${OTHER}/card-images/keep.jpg`,
      ],
      pdfs: [`${USER}/123-cours.pdf`, `${OTHER}/keep.pdf`],
    });

    const result = await deleteUserStorage(api, USER);

    expect(result).toEqual({ removed: 4, errors: [] });
    expect([...buckets.get("card-media")!]).toEqual([`${OTHER}/card-images/keep.jpg`]);
    expect([...buckets.get("pdfs")!]).toEqual([`${OTHER}/keep.pdf`]);
  });

  it("pages through large folders and removes in batches", async () => {
    const many = Array.from({ length: 2300 }, (_, i) => `${USER}/anki-media/${String(i).padStart(5, "0")}.jpg`);
    const { api, buckets, removeCalls } = fakeStorage({ "card-media": many, pdfs: [] });

    const result = await deleteUserStorage(api, USER);

    expect(result.removed).toBe(2300);
    expect(buckets.get("card-media")!.size).toBe(0);
    expect(removeCalls.every((batch) => batch.length <= 500)).toBe(true);
  });

  it("refuses ids that are not UUIDs, so a bucket root is never listed", async () => {
    const { api, buckets } = fakeStorage({ "card-media": [`${OTHER}/x.jpg`] });

    for (const bad of ["", "..", "*", `${USER}/..`]) {
      const result = await deleteUserStorage(api, bad);
      expect(result.removed).toBe(0);
      expect(result.errors).toHaveLength(1);
    }
    expect(buckets.get("card-media")!.size).toBe(1);
  });

  it("collects errors instead of throwing", async () => {
    const api: StorageApi = {
      from: () => ({
        list: async () => ({ data: null, error: { message: "boom" } }),
        remove: async () => ({ error: null }),
      }),
    };

    const result = await deleteUserStorage(api, USER, ["card-media"]);

    expect(result).toEqual({ removed: 0, errors: ["card-media: list 11111111-2222-3333-4444-555555555555: boom"] });
  });
});
