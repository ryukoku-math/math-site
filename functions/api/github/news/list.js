import { getSessionFromRequest } from "../../../lib/cookie.js";
import { listDirectory, getFileContent, toApiErrorResponse } from "../../../lib/github-client.js";
import { extractFrontmatterFields } from "../../../lib/mdx-template.js";

export async function onRequestGet({ request, env }) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return Response.json({ error: "not_authenticated" }, { status: 401 });

  const owner = env.GITHUB_REPO_OWNER;
  const repo = env.GITHUB_REPO_NAME;

  let entries;
  try {
    entries = await listDirectory(session.token, owner, repo, "docs/news");
  } catch (err) {
    return toApiErrorResponse(err);
  }

  const mdxEntries = entries.filter((entry) => entry.type === "file" && entry.name.endsWith(".mdx"));

  const articles = await Promise.all(
    mdxEntries.map(async (entry) => {
      const slug = entry.name.replace(/\.mdx$/, "");
      try {
        const file = await getFileContent(session.token, owner, repo, `docs/news/${entry.name}`);
        const { frontmatter } = extractFrontmatterFields(file.content);
        return { slug, title: frontmatter.title ?? slug, date: frontmatter.date ?? null };
      } catch {
        return { slug, title: slug, date: null };
      }
    }),
  );

  articles.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

  return Response.json({ articles });
}
