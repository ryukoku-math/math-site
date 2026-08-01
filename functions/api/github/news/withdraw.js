import { getSessionFromRequest } from "../../../lib/cookie.js";
import {
  closePullRequest,
  deleteRef,
  getPullRequest,
  toApiErrorResponse,
} from "../../../lib/github-client.js";
import { isBranchForSlug } from "../../../lib/news-branch.js";

// News Editorで作成したPRを取り消す(クローズしてブランチも削除する)。
// 記事も画像もそのブランチにしか存在しないため、これで完全に破棄される。
export async function onRequestPost({ request, env }) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return Response.json({ error: "not_authenticated" }, { status: 401 });

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const { slug, branch } = payload ?? {};
  const prNumber = Number(payload?.prNumber);

  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return Response.json({ error: "invalid_slug" }, { status: 400 });
  }
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  // 任意のブランチを消せないよう、slugから導けるブランチ名だけを受け付ける。
  if (!isBranchForSlug(branch, slug)) {
    return Response.json({ error: "invalid_branch" }, { status: 400 });
  }

  const owner = env.GITHUB_REPO_OWNER;
  const repo = env.GITHUB_REPO_NAME;
  const token = session.token;

  try {
    const pr = await getPullRequest(token, owner, repo, prNumber);
    if (!pr) return Response.json({ error: "pr_not_found" }, { status: 404 });

    // 取り消しの対象が本当にこのブランチのPRかを確認する(番号の取り違え防止)。
    if (pr.head?.ref !== branch) {
      return Response.json({ error: "pr_branch_mismatch" }, { status: 400 });
    }
    // 既にマージ済みのものは取り消せない — ブランチだけ消すと記事はmainに残る。
    if (pr.merged_at) {
      return Response.json({ error: "pr_already_merged" }, { status: 409 });
    }

    if (pr.state === "open") {
      await closePullRequest(token, owner, repo, prNumber);
    }
    await deleteRef(token, owner, repo, branch);

    return Response.json({ withdrawn: true, prNumber, branch });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
