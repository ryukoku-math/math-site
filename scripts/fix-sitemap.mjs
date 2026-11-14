// blume build 後に dist/client/sitemap.xml を補正する（package.json の build から実行）。
//
// blume の sitemap は (1) sidebar.hidden のページ（docs/news・docs/awards の記事、約270件）を
// 除外し、(2) カスタムページ（pages/admin/news/*）は noindex でも静的解析できず含めてしまう。
// ニュース・受賞記事は検索・エージェントに見つけてほしい公開ページなので、
// Markdown ミラー（<route>.md）が生成されたページをすべて加え、/admin/ と /api/ を除く。
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const DIST_DIR = "dist/client";
const SITEMAP_PATH = join(DIST_DIR, "sitemap.xml");
// robots.txt で Disallow しているパス
const EXCLUDED_PREFIXES = ["/admin/", "/api/"];
// ページではない Markdown（404 の本文、トップの llms.txt 代替）
const EXCLUDED_MARKDOWN = new Set(["/404", "/index"]);

const escapeXml = (value) =>
  value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

// dist/client 以下の *.md から、ページのルート（拡張子なし）を列挙する
const markdownRoutes = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownRoutes(path);
    if (!name.endsWith(".md")) return [];
    return [`/${relative(DIST_DIR, path).replace(/\.md$/u, "")}`];
  });

const isExcluded = (route) =>
  EXCLUDED_PREFIXES.some((prefix) => `${route}/`.startsWith(prefix));

const xml = readFileSync(SITEMAP_PATH, "utf8");
const site = new URL(/<loc>([^<]+)<\/loc>/u.exec(xml)?.[1] ?? "").origin;
const existing = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(
  (match) => decodeURI(new URL(match[1]).pathname)
);
const routes = [
  ...new Set([...existing, ...markdownRoutes(DIST_DIR).filter((r) => !EXCLUDED_MARKDOWN.has(r))]),
]
  .filter((route) => !isExcluded(route))
  .sort();

const urls = routes.map((route) => `  <url><loc>${escapeXml(encodeURI(new URL(route, site).href))}</loc></url>`);
writeFileSync(
  SITEMAP_PATH,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`
);
console.log(`[fix-sitemap] ${existing.length} → ${routes.length} URLs`);
