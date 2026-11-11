/**
 * Finds and (optionally) deletes orphan files in the `card-media` Storage bucket.
 *
 * A file is an orphan when either:
 *   A. its owner (the `<userId>/` prefix) no longer exists in auth.users, or
 *   B. its owner exists, the file is older than MIN_AGE_DAYS, and nothing in the
 *      database references it: neither its full path in a card-media URL nor its
 *      bare file name (Anki cards sometimes keep the original name).
 *
 * Dry run by default: prints a summary and writes the list to a CSV.
 * Deletion only happens with --apply.
 *
 * Usage (env from .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY):
 *   set -a; source .env.local; set +a
 *   npx -y tsx scripts/cleanup-orphan-media.mts --out /tmp/orphans.csv
 *   npx -y tsx scripts/cleanup-orphan-media.mts --out /tmp/orphans.csv --apply --backup-dir /tmp/orphans-backup
 *
 * --apply requires --backup-dir: every file is downloaded there before deletion,
 * so a mistake can be undone by re-uploading the backup.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const BUCKET = "card-media";
const MIN_AGE_DAYS = 7;
const PAGE = 1000;

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const outIndex = args.indexOf("--out");
const outPath = outIndex >= 0 ? args[outIndex + 1] : "orphan-media.csv";
const backupIndex = args.indexOf("--backup-dir");
const backupDir = backupIndex >= 0 ? args[backupIndex + 1] : undefined;
if (apply && !backupDir) {
  console.error("--apply requires --backup-dir");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

interface StoredFile {
  path: string;
  size: number;
  createdAt: string;
}

async function listUserIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw error;
    for (const u of data.users) ids.add(u.id);
    if (data.users.length < PAGE) break;
  }
  return ids;
}

async function listFiles(prefix: string): Promise<StoredFile[]> {
  const files: StoredFile[] = [];
  const folders = [prefix];
  while (folders.length) {
    const folder = folders.pop()!;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit: PAGE, offset });
      if (error) throw new Error(`list ${folder}: ${error.message}`);
      for (const e of data ?? []) {
        const path = folder ? `${folder}/${e.name}` : e.name;
        if (e.id === null) folders.push(path);
        else files.push({ path, size: Number(e.metadata?.size ?? 0), createdAt: e.created_at });
      }
      if ((data ?? []).length < PAGE) break;
    }
  }
  return files;
}

async function fetchColumn(table: string, columns: string): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of data ?? []) out.push(Object.values(row).map((v) => (typeof v === "string" ? v : JSON.stringify(v ?? ""))).join(" "));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function main() {
  console.log(apply ? "MODE: APPLY (files will be deleted)" : "MODE: dry run (nothing is deleted)");

  const [userIds, files, texts] = await Promise.all([
    listUserIds(),
    listFiles(""),
    Promise.all([
      fetchColumn("cards", "front, back, extra"),
      fetchColumn("generated_cards", "front, back"),
      fetchColumn("imports", "text"),
      fetchColumn("decks", "config"),
    ]).then((parts) => parts.flat()),
  ]);

  const corpus = texts.join("\n");
  const decodedCorpus = safeDecode(corpus.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
  const referencedPaths = new Set<string>();
  for (const m of corpus.matchAll(/card-media\/([0-9a-f-]{36}\/[^"'<>\s)\\?#]+)/g)) {
    referencedPaths.add(m[1]);
    referencedPaths.add(safeDecode(m[1]));
  }

  const cutoff = Date.now() - MIN_AGE_DAYS * 86_400_000;
  const rows: Array<StoredFile & { reason: string }> = [];
  const kept = { used: 0, recent: 0, nameMentioned: 0 };

  for (const f of files) {
    const owner = f.path.split("/")[0];
    if (!userIds.has(owner)) {
      rows.push({ ...f, reason: "owner_deleted" });
      continue;
    }
    if (referencedPaths.has(f.path)) {
      kept.used++;
      continue;
    }
    if (new Date(f.createdAt).getTime() > cutoff) {
      kept.recent++;
      continue;
    }
    const base = f.path.slice(f.path.lastIndexOf("/") + 1);
    if (corpus.includes(base) || corpus.includes(encodeURI(base)) || decodedCorpus.includes(base)) {
      kept.nameMentioned++;
      continue;
    }
    rows.push({ ...f, reason: "unreferenced" });
  }

  const mb = (n: number) => (n / 1048576).toFixed(1);
  const sum = (r: typeof rows) => r.reduce((t, x) => t + x.size, 0);
  const byReason = (reason: string) => rows.filter((r) => r.reason === reason);

  console.log(`Files in ${BUCKET}: ${files.length} (${mb(files.reduce((t, f) => t + f.size, 0))} MB)`);
  console.log(`Kept: ${kept.used} referenced, ${kept.nameMentioned} name mentioned, ${kept.recent} younger than ${MIN_AGE_DAYS} days`);
  for (const reason of ["owner_deleted", "unreferenced"]) {
    const r = byReason(reason);
    console.log(`Orphans ${reason}: ${r.length} files, ${mb(sum(r))} MB`);
  }
  console.log(`Total orphans: ${rows.length} files, ${mb(sum(rows))} MB`);

  writeFileSync(
    outPath,
    "reason,path,size_bytes,created_at\n" +
      rows.map((r) => [r.reason, `"${r.path.replace(/"/g, '""')}"`, r.size, r.createdAt].join(",")).join("\n") +
      "\n"
  );
  console.log(`List written to ${outPath}`);

  if (!apply) return;

  // Back up every file first; a file that cannot be backed up is not deleted.
  const backedUp: string[] = [];
  for (const r of rows) {
    const { data, error } = await admin.storage.from(BUCKET).download(r.path);
    if (error || !data) {
      console.error(`Backup failed, keeping ${r.path}: ${error?.message ?? "no data"}`);
      continue;
    }
    const target = join(backupDir!, r.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(await data.arrayBuffer()));
    backedUp.push(r.path);
  }
  console.log(`Backed up ${backedUp.length} of ${rows.length} files to ${backupDir}`);

  let removed = 0;
  for (let i = 0; i < backedUp.length; i += 500) {
    const batch = backedUp.slice(i, i + 500);
    const { error } = await admin.storage.from(BUCKET).remove(batch);
    if (error) console.error(`Batch ${i / 500 + 1} failed: ${error.message}`);
    else removed += batch.length;
  }
  console.log(`Deleted ${removed} of ${rows.length} files.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
