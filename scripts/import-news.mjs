// One-off migration: Notion export (News database) -> docs/news/*.mdx
// Run: node scripts/import-news.mjs
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SRC_DIR =
  "/tmp/claude-1004/-home-sano-blume-math/8498e8ec-7cc0-4128-be66-8ce8d315b67c/scratchpad/notion-export/extracted/プライベート、シェア/数理・情報科学課程/News";
const DOCS_OUT = path.join(ROOT, "docs", "news");
const IMAGES_OUT = path.join(ROOT, "public", "images", "news");

const SKIP_TITLES = new Set(["無題", "New Initiative"]);

function yamlString(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

function plainText(md) {
  return md
    .replace(/!\[[^\]]*\]\(.+?\)\n?/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

function slugifyBasename(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const files = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort();

fs.mkdirSync(DOCS_OUT, { recursive: true });
fs.mkdirSync(IMAGES_OUT, { recursive: true });

let created = 0;
let skipped = 0;
const skippedLog = [];

for (const file of files) {
  const full = path.join(SRC_DIR, file);
  const raw = fs.readFileSync(full, "utf8");
  const lines = raw.split("\n");

  const titleLine = lines.find((l) => l.startsWith("# "));
  const title = titleLine ? titleLine.slice(2).trim() : file.replace(/\s+[0-9a-f]{32}\.md$/, "");

  if (SKIP_TITLES.has(title)) {
    skipped++;
    skippedLog.push(`${file}  (placeholder/stub: "${title}")`);
    continue;
  }

  const dateLineIdx = lines.findIndex((l) => /^Date: /.test(l));
  const dateLineRaw = dateLineIdx >= 0 ? lines[dateLineIdx].replace(/^Date: /, "").trim() : null;
  const dateMatch = dateLineRaw ? dateLineRaw.match(/(\d{4})\/(\d{2})\/(\d{2})/) : null;

  if (!dateMatch) {
    skipped++;
    skippedLog.push(`${file}  (no parseable Date: line)`);
    continue;
  }
  const isoDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;

  // page id suffix from filename, e.g. "... 1838907004b8817f97ffef45d37f3ffc.md"
  const idMatch = file.match(/([0-9a-f]{32})\.md$/);
  const idSuffix = idMatch ? idMatch[1].slice(-6) : String(created).padStart(6, "0");
  // Leading "n" guards against Blume's numeric-ordering-prefix stripping
  // (`/^\d+[-_.]/` is cut from routes) — a bare date-first slug like
  // "2020-07-25-..." would otherwise route to "/news/07-25-...".
  const slug = `n${isoDate}-${idSuffix}`;

  // body = everything after the title line and (if present) the date line, skipping blank leads
  let bodyLines = lines.slice((titleLine ? lines.indexOf(titleLine) : -1) + 1);
  if (dateLineIdx >= 0) {
    bodyLines = lines.slice(dateLineIdx + 1);
  }
  let body = bodyLines.join("\n").replace(/^\n+/, "");

  // resolve image references: ![alt](Notion%20encoded/relative/path.jpg)
  const entryAssetDir = path.join(SRC_DIR, file.replace(/\.md$/, ""));
  const imageOutDir = path.join(IMAGES_OUT, slug);
  let imageIndex = 0;
  body = body.replace(/!\[([^\]]*)\]\((.+)\)/g, (m, alt, encodedPath) => {
    const decoded = decodeURIComponent(encodedPath);
    const srcImagePath = path.isAbsolute(decoded) ? decoded : path.join(SRC_DIR, decoded);
    if (!fs.existsSync(srcImagePath)) {
      return m; // leave as-is; will show in skipped log below
    }
    imageIndex++;
    const ext = path.extname(srcImagePath).toLowerCase();
    const outName = `${String(imageIndex).padStart(2, "0")}${ext}`;
    const outPath = path.join(imageOutDir, outName);
    fs.mkdirSync(imageOutDir, { recursive: true });
    // Skip if already copied — a re-run to fix frontmatter/text shouldn't
    // clobber images that have since been compressed in place.
    if (!fs.existsSync(outPath)) fs.copyFileSync(srcImagePath, outPath);
    return `![${alt}](/images/news/${slug}/${outName})`;
  });

  const description = truncate(plainText(body) || title, 120);

  // `description` at the top level is auto-rendered as a visible paragraph
  // right under the H1 by Blume's page template, duplicating the body text
  // that follows — nest it under `seo` instead (still used for meta/OG tags)
  // to drop the on-page duplicate. Note: Blume's RSS feed reads the
  // top-level field only, so feed <description> goes blank for these — moot
  // today since `sidebar.hidden: true` already excludes hidden pages from
  // the feed entirely (see the /news/rss.xml note flagged separately).
  const frontmatter = [
    "---",
    `title: ${yamlString(title)}`,
    `type: blog`,
    `date: ${isoDate}`,
    `seo:`,
    `  description: ${yamlString(description)}`,
    `sidebar:`,
    `  hidden: true`,
    "---",
    "",
  ].join("\n");

  // Some titles run long (event names, award citations); the generated
  // page's <h1> has no class hook to target from theme.css. A raw <style>
  // block in the .mdx body breaks MDX's compiler (it tries to parse CSS
  // `{ }` as JS expressions), so this is a real .astro component
  // (components/TitleClamp.astro) rendering `<style is:global>` instead —
  // safe there, not in MDX text.
  const titleStyle = "<TitleClamp />\n\n";

  const dateSubtitle =
    dateLineRaw && dateLineRaw !== isoDate.replaceAll("-", "/")
      ? `*${dateLineRaw}*\n\n`
      : "";

  fs.writeFileSync(
    path.join(DOCS_OUT, `${slug}.mdx`),
    frontmatter + titleStyle + dateSubtitle + body.trim() + "\n"
  );
  created++;
}

console.log(`created: ${created}`);
console.log(`skipped: ${skipped}`);
if (skippedLog.length) {
  console.log("--- skipped detail ---");
  skippedLog.forEach((l) => console.log(l));
}
