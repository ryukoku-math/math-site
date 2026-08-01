import { getSessionFromRequest } from "../../../lib/cookie.js";
import { getFileContent, toApiErrorResponse } from "../../../lib/github-client.js";
import { extractFrontmatterFields, parseBody } from "../../../lib/mdx-template.js";

export async function onRequestGet({ request, env }) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return Response.json({ error: "not_authenticated" }, { status: 401 });

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return Response.json({ error: "invalid_slug" }, { status: 400 });
  }

  const owner = env.GITHUB_REPO_OWNER;
  const repo = env.GITHUB_REPO_NAME;

  let file;
  try {
    file = await getFileContent(session.token, owner, repo, `docs/news/${slug}.mdx`);
  } catch (err) {
    return toApiErrorResponse(err);
  }
  if (!file) return Response.json({ error: "not_found" }, { status: 404 });

  const { frontmatter, body: rawBody } = extractFrontmatterFields(file.content);
  const parsed = parseBody(rawBody);

  const base = {
    slug,
    title: frontmatter.title ?? "",
    date: typeof frontmatter.date === "string" ? frontmatter.date : "",
    description: frontmatter.seo?.description ?? "",
    coverImage: frontmatter.seo?.image ?? null,
  };

  if (parsed.matched) {
    return Response.json({ ...base, body: parsed.body, images: parsed.images, templateMatch: true });
  }

  // このエディタが生成したテンプレートと一致しない(手編集など)場合は、
  // 本文全体を生Markdownとして返す — 画像は個別に管理せず本文の一部として扱う。
  // ただし先頭の <TitleClamp /> は取り除いておく。保存時に renderBody が必ず
  // 先頭へ付け直すため、残したままだと2行に増えてしまう。
  let fallbackBody = rawBody.replace(/\r\n/g, "\n").replace(/^\n+/, "").trimEnd();
  if (fallbackBody.startsWith("<TitleClamp />\n")) {
    fallbackBody = fallbackBody.slice("<TitleClamp />\n".length).replace(/^\n+/, "");
  }
  return Response.json({ ...base, body: fallbackBody, images: [], templateMatch: false });
}
