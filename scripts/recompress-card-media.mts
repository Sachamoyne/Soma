/**
 * Recompresses existing images in the `card-media` Storage bucket, in place.
 *
 * Images uploaded before client-side compression (PR #22) are often full-size
 * phone photos (1.5 MB on average). Each file is rewritten at the SAME path, so
 * every card keeps working without touching the database.
 *
 *   - JPEG: auto-rotated from EXIF, longest side <= 1600 px (2000 px for diagram
 *     cards), re-encoded as JPEG quality 80 (mozjpeg).
 *   - PNG with transparency: resized, re-encoded as optimised PNG.
 *   - PNG without transparency: JPEG if that at least halves the size, else optimised PNG.
 *   - A file is only replaced when the new version is at least 20 % smaller.
 *
 * Dry run by default (computes the new sizes, uploads nothing). --apply requires
 * --backup-dir: every original is saved there before being overwritten.
 *
 * sharp is not a project dependency; install it somewhere and point NODE_PATH at it:
 *   npm i --prefix /tmp/sharp-env sharp
 *   set -a; source .env.local; set +a
 *   NODE_PATH=/tmp/sharp-env/node_modules npx -y tsx scripts/recompress-card-media.mts --out plan.csv
 *   NODE_PATH=... npx -y tsx scripts/recompress-card-media.mts --out plan.csv --apply --backup-dir ./backup
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require(require.resolve("sharp", { paths: (process.env.NODE_PATH ?? "").split(":").filter(Boolean) }));

const BUCKET = "card-media";
const MIN_BYTES = 300 * 1024;
const PHOTO_MAX = 1600;
const DIAGRAM_MAX = 2000;
const QUALITY = 80;
const MIN_SAVING = 0.2;
const PAGE = 1000;

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const outPath = arg("--out") ?? "recompress-plan.csv";
const backupDir = arg("--backup-dir");
const limit = Number(arg("--limit") ?? Infinity);
const samplesDir = arg("--samples-dir");
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
  mimetype: string;
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
        else files.push({ path, size: Number(e.metadata?.size ?? 0), mimetype: String(e.metadata?.mimetype ?? "") });
      }
      if ((data ?? []).length < PAGE) break;
    }
  }
  return files;
}

/** Storage paths used as the image of a diagram card; they keep more resolution. */
async function diagramPaths(): Promise<Set<string>> {
  const paths = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from("cards").select("extra").eq("type", "diagram").range(from, from + PAGE - 1);
    if (error) throw new Error(`cards: ${error.message}`);
    for (const row of data ?? []) {
      const m = JSON.stringify(row.extra ?? "").match(/card-media\/([^"?#]+)/);
      if (m) paths.add(decodeURIComponent(m[1]));
    }
    if ((data ?? []).length < PAGE) break;
  }
  return paths;
}

interface Plan {
  path: string;
  before: number;
  after: number;
  contentType: string;
  width: number;
  height: number;
  action: "replace" | "skip";
  buffer?: Buffer;
}

async function recompress(file: StoredFile, original: Buffer, maxDimension: number): Promise<Plan> {
  const image = sharp(original, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const resized = image.resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true });

  let buffer: Buffer;
  let contentType: string;
  if (file.mimetype === "image/png" || meta.format === "png") {
    const png = await resized.clone().png({ compressionLevel: 9, palette: false }).toBuffer();
    if (meta.hasAlpha) {
      buffer = png;
      contentType = "image/png";
    } else {
      const jpg = await resized.clone().jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
      [buffer, contentType] = jpg.length <= png.length / 2 ? [jpg, "image/jpeg"] : [png, "image/png"];
    }
  } else {
    buffer = await resized.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
    contentType = "image/jpeg";
  }

  const out = await sharp(buffer).metadata();
  const worth = buffer.length <= original.length * (1 - MIN_SAVING);
  return {
    path: file.path,
    before: original.length,
    after: worth ? buffer.length : original.length,
    contentType,
    width: out.width ?? 0,
    height: out.height ?? 0,
    action: worth ? "replace" : "skip",
    buffer: worth ? buffer : undefined,
  };
}

async function main() {
  console.log(apply ? "MODE: APPLY (originals backed up, then overwritten)" : "MODE: dry run (nothing is uploaded)");
  const [files, diagrams] = await Promise.all([listFiles(""), diagramPaths()]);
  const targets = files
    .filter((f) => f.size > MIN_BYTES && (f.mimetype === "image/jpeg" || f.mimetype === "image/png"))
    .sort((a, b) => b.size - a.size)
    .slice(0, limit);
  console.log(`Files: ${files.length}, candidates over ${MIN_BYTES / 1024} KB: ${targets.length}, diagram images: ${diagrams.size}`);

  const plans: Plan[] = [];
  let replaced = 0;
  let failed = 0;

  for (const [i, file] of targets.entries()) {
    const { data, error } = await admin.storage.from(BUCKET).download(file.path);
    if (error || !data) {
      console.error(`Download failed, skipping ${file.path}: ${error?.message}`);
      failed++;
      continue;
    }
    const original = Buffer.from(await data.arrayBuffer());
    let plan: Plan;
    try {
      plan = await recompress(file, original, diagrams.has(file.path) ? DIAGRAM_MAX : PHOTO_MAX);
    } catch (e) {
      console.error(`Could not process ${file.path}: ${e instanceof Error ? e.message : e}`);
      failed++;
      continue;
    }
    plans.push(plan);

    if (samplesDir && i < 6 && plan.buffer) {
      const base = join(samplesDir, String(i).padStart(2, "0"));
      mkdirSync(samplesDir, { recursive: true });
      writeFileSync(`${base}-before.${file.mimetype === "image/png" ? "png" : "jpg"}`, original);
      writeFileSync(`${base}-after.${plan.contentType === "image/png" ? "png" : "jpg"}`, plan.buffer);
    }

    if (apply && plan.buffer) {
      const target = join(backupDir!, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, original);
      const { error: upErr } = await admin.storage.from(BUCKET).update(file.path, plan.buffer, {
        contentType: plan.contentType,
        cacheControl: "3600",
        upsert: true,
      });
      if (upErr) {
        console.error(`Upload failed, original kept for ${file.path}: ${upErr.message}`);
        failed++;
      } else replaced++;
    }
    plan.buffer = undefined;
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${targets.length}`);
  }

  const mb = (n: number) => (n / 1048576).toFixed(1);
  const replace = plans.filter((p) => p.action === "replace");
  const before = replace.reduce((t, p) => t + p.before, 0);
  const after = replace.reduce((t, p) => t + p.after, 0);
  console.log(`To replace: ${replace.length} files, ${mb(before)} MB -> ${mb(after)} MB (saves ${mb(before - after)} MB)`);
  console.log(`Kept as is (saving < ${MIN_SAVING * 100}%): ${plans.length - replace.length}; errors: ${failed}`);
  if (apply) console.log(`Replaced ${replaced} files; originals in ${backupDir}`);

  writeFileSync(
    outPath,
    "action,path,before_bytes,after_bytes,content_type,width,height\n" +
      plans.map((p) => [p.action, `"${p.path.replace(/"/g, '""')}"`, p.before, p.after, p.contentType, p.width, p.height].join(",")).join("\n") +
      "\n"
  );
  console.log(`Plan written to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
