// One-off migration: Notion export (優秀プレゼンテーション賞 database) -> docs/awards/<year>/*.mdx
// Slide order is recovered from scripts/award-slide-order.py's output (original zip namelist order),
// NOT from post-extraction directory listing (which is scrambled by the filesystem).
// Run: python3 scripts/award-slide-order.py > /tmp/.../award-slide-order.json && node scripts/import-awards.mjs
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEPT_ROOT =
  "/tmp/claude-1004/-home-sano-blume-math/8498e8ec-7cc0-4128-be66-8ce8d315b67c/scratchpad/notion-export/extracted/プライベート、シェア/数理・情報科学課程";
const AWARD_ROOT = path.join(DEPT_ROOT, "優秀プレゼンテーション賞");
const INDEX_MD = path.join(
  DEPT_ROOT,
  "優秀プレゼンテーション賞 1838907004b881848c31d780f0d98fdc.md"
);
const SLIDE_ORDER_JSON =
  "/tmp/claude-1004/-home-sano-blume-math/8498e8ec-7cc0-4128-be66-8ce8d315b67c/scratchpad/award-slide-order.json";

const DOCS_OUT = path.join(ROOT, "docs", "awards");
const IMAGES_OUT = path.join(ROOT, "public", "images", "awards");

const CATEGORY_EN = { 学部: "undergrad", 大学院: "graduate" };

function yamlString(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

const slideOrder = JSON.parse(fs.readFileSync(SLIDE_ORDER_JSON, "utf8"));

// --- parse the year/category index ---
const indexRaw = fs.readFileSync(INDEX_MD, "utf8");
const indexLines = indexRaw.split("\n");

let year = null;
let category = null;
const items = []; // { year, category, href }

for (const line of indexLines) {
  const yearMatch = line.match(/^## (\d{4})年度/);
  if (yearMatch) {
    year = yearMatch[1];
    continue;
  }
  const catMatch = line.match(/^### (学部|大学院)/);
  if (catMatch) {
    category = catMatch[1];
    continue;
  }
  // greedy capture to the LAST ')' on the line: titles/paths can contain literal parens
  const linkMatch = line.match(/\[[^\]]*\]\((.+\.md)\)/);
  if (linkMatch && year && category) {
    items.push({ year, category, href: linkMatch[1] });
  }
}

console.log(`index entries found: ${items.length}`);

fs.mkdirSync(DOCS_OUT, { recursive: true });
fs.mkdirSync(IMAGES_OUT, { recursive: true });

let created = 0;
let skipped = 0;
const skippedLog = [];
let totalImages = 0;

for (const { year, category, href } of items) {
  const decoded = decodeURIComponent(href); // "優秀プレゼンテーション賞/<file>.md"
  const abstractPath = path.join(DEPT_ROOT, decoded);

  if (!fs.existsSync(abstractPath)) {
    skipped++;
    skippedLog.push(`${year} ${category}: missing abstract file -> ${decoded}`);
    continue;
  }

  const raw = fs.readFileSync(abstractPath, "utf8");
  const lines = raw.split("\n");
  const titleLineIdx = lines.findIndex((l) => l.startsWith("# "));
  if (titleLineIdx === -1) {
    skipped++;
    skippedLog.push(`${year} ${category}: no H1 title -> ${decoded}`);
    continue;
  }

  const rawTitleLine = lines[titleLineIdx].slice(2).trim().replace(/\*\*/g, "");
  const lastBracketIdx = rawTitleLine.lastIndexOf("」");
  const paperTitle =
    lastBracketIdx >= 0 ? rawTitleLine.slice(0, lastBracketIdx + 1).trim() : rawTitleLine;
  const student =
    lastBracketIdx >= 0 ? rawTitleLine.slice(lastBracketIdx + 1).trim() : "";

  let bodyLines = lines.slice(titleLineIdx + 1);
  // drop trailing blank lines, then a trailing bare-link line (Notion's self db-reference)
  while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === "") bodyLines.pop();
  if (bodyLines.length && /^\[[^\]]*\]\(.+\)$/.test(bodyLines[bodyLines.length - 1].trim())) {
    bodyLines.pop();
  }
  while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === "") bodyLines.pop();
  const abstract = bodyLines.join("\n").replace(/^\n+/, "").trim();

  // filename: "<title+student> <32-hex>.md" -> entry folder name = filename minus " <hex>.md"
  const baseName = path.basename(decoded, ".md");
  const idMatch = baseName.match(/ ([0-9a-f]{32})$/);
  const entryFolderName = idMatch ? baseName.slice(0, -(idMatch[0].length)) : baseName;
  const hash6 = idMatch ? idMatch[1].slice(-6) : String(created).padStart(6, "0");

  const categoryEn = CATEGORY_EN[category] ?? "other";
  const slug = `${categoryEn}-${hash6}`;

  // A handful of abstracts embed an inline image (e.g. a QR code linking to a
  // live demo) alongside the slide deck — resolve those the same way News
  // does, rather than leaving Notion-relative paths for Vite to choke on.
  let abstractWithImages = abstract;
  let inlineImageIndex = 0;
  abstractWithImages = abstractWithImages.replace(/!\[([^\]]*)\]\((.+)\)/g, (m, alt, encodedPath) => {
    const decodedImg = decodeURIComponent(encodedPath);
    const srcImg = path.isAbsolute(decodedImg) ? decodedImg : path.join(AWARD_ROOT, decodedImg);
    if (!fs.existsSync(srcImg)) return m;
    inlineImageIndex++;
    const ext = path.extname(srcImg).toLowerCase();
    const outDir = path.join(IMAGES_OUT, year, slug);
    fs.mkdirSync(outDir, { recursive: true });
    const outName = `inline-${inlineImageIndex}${ext}`;
    const outPath = path.join(outDir, outName);
    // Skip if already copied — a re-run to fix frontmatter/text shouldn't
    // clobber images that have since been compressed in place.
    if (!fs.existsSync(outPath)) fs.copyFileSync(srcImg, outPath);
    return `![${alt}](/images/awards/${year}/${slug}/${outName})`;
  });

  const slideRelPaths = slideOrder[entryFolderName] ?? [];
  const imageUrls = [];
  if (slideRelPaths.length) {
    const outDir = path.join(IMAGES_OUT, year, slug);
    fs.mkdirSync(outDir, { recursive: true });
    slideRelPaths.forEach((relPath, i) => {
      const srcImg = path.join(AWARD_ROOT, relPath);
      if (!fs.existsSync(srcImg)) return;
      const ext = path.extname(srcImg).toLowerCase();
      const outName = `${String(i + 1).padStart(2, "0")}${ext}`;
      const outPath = path.join(outDir, outName);
      // Skip if already copied — a re-run to fix frontmatter/text shouldn't
      // clobber images that have since been compressed in place.
      if (!fs.existsSync(outPath)) fs.copyFileSync(srcImg, outPath);
      imageUrls.push(`/images/awards/${year}/${slug}/${outName}`);
    });
  } else {
    skippedLog.push(`${year} ${category} ${paperTitle}${student}: no slide images found (page created anyway)`);
  }
  totalImages += imageUrls.length;

  const description = truncate(
    abstractWithImages.replace(/!\[[^\]]*\]\(.+?\)/g, "").replace(/\s+/g, " "),
    120
  );

  // year/category live in the path (docs/awards/<year>/<category>-<hash>.mdx);
  // Blume's frontmatter schema is strict (no arbitrary custom keys), so the
  // student name rides in `authors` — a passthrough field meant for exactly
  // this (post author/presenter metadata) — instead of a made-up field.
  // `description` at the top level is auto-rendered as a visible paragraph
  // right under the H1 by Blume's page template — since the body already
  // opens with this same (untruncated) text, that doubled it up on the page.
  // Nesting it under `seo` keeps it for meta/OG purposes without the
  // duplicate on-page paragraph.
  const frontmatter = [
    "---",
    `title: ${yamlString(paperTitle)}`,
    `authors: ${yamlString(student)}`,
    `seo:`,
    `  description: ${yamlString(description)}`,
    `sidebar:`,
    `  hidden: true`,
    "---",
    "",
  ].join("\n");

  const gallery = imageUrls.length
    ? `\n\n<SlideGallery images={${JSON.stringify(imageUrls)}} />\n`
    : "";

  // Paper titles can be very long; the generated page's <h1> has no class
  // hook to target from theme.css. A raw <style> block in the .mdx body
  // breaks MDX's compiler (it tries to parse CSS `{ }` as JS expressions),
  // so this is a real .astro component (components/TitleClamp.astro) that
  // renders `<style is:global>` instead — safe there, not in MDX text.
  const titleStyle = "<TitleClamp />\n\n";

  const outDir = path.join(DOCS_OUT, year);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${slug}.mdx`),
    frontmatter + titleStyle + abstractWithImages + gallery + "\n"
  );
  created++;
}

console.log(`created: ${created}`);
console.log(`skipped: ${skipped}`);
console.log(`total slide images copied: ${totalImages}`);
if (skippedLog.length) {
  console.log("--- notes ---");
  skippedLog.forEach((l) => console.log(l));
}
