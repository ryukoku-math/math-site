// GitHub REST APIへの薄いfetchラッパー。必要なエンドポイントが7〜8個程度のため
// Octokitは導入せず、生fetchで十分(Workersランタイムに余計なバンドルを持ち込まない)。
// すべての呼び出しは編集者本人のOAuthトークンで行う — PRの作者が編集者本人になり、
// リポジトリへの書き込み権限チェックもGitHub自身に委ねられる。

const API_BASE = "https://api.github.com";

export class GitHubApiError extends Error {
  constructor(status, body) {
    super(`GitHub API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function ghFetch(token, path, options = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "math-site-news-editor",
    ...options.headers,
  };
  if (options.body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, ok: res.ok, headers: res.headers, body };
}

export async function exchangeCodeForToken({ clientId, clientSecret, code, redirectUri }) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(json.error_description || json.error || "OAuth code exchange failed");
  }
  return json.access_token;
}

export async function getAuthenticatedUser(token) {
  const { ok, body } = await ghFetch(token, "/user");
  if (!ok) return null;
  return { login: body.login, avatarUrl: body.avatar_url };
}

function decodeBase64Utf8(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export async function getFileContent(token, owner, repo, path) {
  const { status, body } = await ghFetch(token, `/repos/${owner}/${repo}/contents/${path}`);
  if (status === 404) return null;
  if (status !== 200) throw new GitHubApiError(status, body);
  return { sha: body.sha, content: decodeBase64Utf8(body.content) };
}

export async function listDirectory(token, owner, repo, path) {
  const { status, body } = await ghFetch(token, `/repos/${owner}/${repo}/contents/${path}`);
  if (status === 404) return [];
  if (status !== 200) throw new GitHubApiError(status, body);
  return Array.isArray(body) ? body : [];
}

export async function getBranchTip(token, owner, repo, branch) {
  const { status, body } = await ghFetch(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  if (status === 404) return null;
  if (status !== 200) throw new GitHubApiError(status, body);
  return body.object.sha;
}

export async function getCommit(token, owner, repo, sha) {
  const { status, body } = await ghFetch(token, `/repos/${owner}/${repo}/git/commits/${sha}`);
  if (status !== 200) throw new GitHubApiError(status, body);
  return body;
}

export async function createBlob(token, owner, repo, content, encoding) {
  const { status, body } = await ghFetch(token, `/repos/${owner}/${repo}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content, encoding }),
  });
  if (status !== 201) throw new GitHubApiError(status, body);
  return body.sha;
}

export async function createTree(token, owner, repo, baseTreeSha, entries) {
  const { status, body } = await ghFetch(token, `/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree: entries }),
  });
  if (status !== 201) throw new GitHubApiError(status, body);
  return body.sha;
}

export async function createCommit(token, owner, repo, message, treeSha, parentSha) {
  const { status, body } = await ghFetch(token, `/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] }),
  });
  if (status !== 201) throw new GitHubApiError(status, body);
  return body.sha;
}

export async function createRef(token, owner, repo, ref, sha) {
  return ghFetch(token, `/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${ref}`, sha }),
  });
}

export async function updateRef(token, owner, repo, ref, sha) {
  // 新しいコミットはその都度現在のbase branch先端から作り直すため、既存ブランチの
  // 直前のコミットと祖先関係にあるとは限らない(fast-forwardではない)。同じ編集用
  // ブランチ・PRを編集者本人が更新するだけなので、force更新で問題ない。
  return ghFetch(token, `/repos/${owner}/${repo}/git/refs/heads/${ref}`, {
    method: "PATCH",
    body: JSON.stringify({ sha, force: true }),
  });
}

export async function findOpenPullRequest(token, owner, repo, headBranch) {
  const { status, body } = await ghFetch(
    token,
    `/repos/${owner}/${repo}/pulls?state=open&head=${owner}:${headBranch}`,
  );
  if (status !== 200 || !Array.isArray(body) || body.length === 0) return null;
  return body[0];
}

export async function createPullRequest(token, owner, repo, { title, head, base, body: prBody }) {
  const { status, body } = await ghFetch(token, `/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title, head, base, body: prBody }),
  });
  if (status !== 201) throw new GitHubApiError(status, body);
  return { url: body.html_url, number: body.number };
}

// エラーをUIが表示できる構造化レスポンスに変換する。
// コラボレーターでない場合の403は「独自の許可リストを持たず、GitHub自身の判定に委ねる」
// という設計上の要点そのものなので、ここで丁寧にハンドリングする。
export function toApiErrorResponse(err) {
  if (err instanceof GitHubApiError) {
    const message = typeof err.body === "object" && err.body ? String(err.body.message ?? "") : String(err.body ?? "");
    if (/rate limit/i.test(message)) {
      return Response.json({ error: "rate_limited" }, { status: 429 });
    }
    if (err.status === 403 || err.status === 404) {
      return Response.json({ error: "not_a_collaborator" }, { status: 403 });
    }
    return Response.json({ error: "github_api_error", status: err.status, message }, { status: 502 });
  }
  return Response.json({ error: "unknown_error", message: String(err?.message ?? err) }, { status: 500 });
}
