import { getSessionFromRequest } from "../../../lib/cookie.js";
import { fetchDirectoryWithContents, toApiErrorResponse } from "../../../lib/github-client.js";
import { extractFrontmatterFields } from "../../../lib/mdx-template.js";

// フロントマターが読めなかったときの保険。スラッグは n<YYYY-MM-DD>-<hex6> 形式なので
// ファイルの中身に頼らず日付だけは復元できる。
function dateFromSlug(slug) {
  const match = /^n(\d{4}-\d{2}-\d{2})-/.exec(slug);
  return match ? match[1] : null;
}

export async function onRequestGet({ request, env }) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return Response.json({ error: "not_authenticated" }, { status: 401 });

  let entries;
  try {
    entries = await fetchDirectoryWithContents(
      session.token,
      env.GITHUB_REPO_OWNER,
      env.GITHUB_REPO_NAME,
      env.GITHUB_REPO_BRANCH,
      "docs/news",
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }

  const articles = entries
    .filter((entry) => entry.name.endsWith(".mdx"))
    .map((entry) => {
      const slug = entry.name.replace(/\.mdx$/, "");
      const { frontmatter } = extractFrontmatterFields(entry.text);
      const date = typeof frontmatter.date === "string" ? frontmatter.date : null;
      return { slug, title: frontmatter.title ?? slug, date: date ?? dateFromSlug(slug) };
    })
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

  return Response.json({ articles });
}
