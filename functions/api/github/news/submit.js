import { getSessionFromRequest } from "../../../lib/cookie.js";
import {
  GitHubApiError,
  createBlob,
  createCommit,
  createPullRequest,
  createRef,
  createTree,
  findOpenPullRequest,
  getBranchTip,
  getCommit,
  getFileContent,
  toApiErrorResponse,
  updateRef,
} from "../../../lib/github-client.js";
import { renderArticle } from "../../../lib/mdx-template.js";
import { generateSlug } from "../../../lib/slug.js";

// フォームからの画像添付が際限なく大きくならないよう、送信全体の合計サイズに緩い上限を設ける。
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export async function onRequestPost({ request, env }) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return Response.json({ error: "not_authenticated" }, { status: 401 });

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const mode = form.get("mode");
  if (mode !== "create" && mode !== "edit") {
    return Response.json({ error: "invalid_mode" }, { status: 400 });
  }

  // multipart/form-data はテキストフィールドの改行をCRLFに正規化して送ってくる。
  // そのまま書き込むとリポジトリ内の他のMDX(すべてLF)と改行コードが混ざるので、
  // ここでLFに戻す。
  const textField = (name) => String(form.get(name) ?? "").replace(/\r\n/g, "\n").trim();
  const title = textField("title");
  const date = textField("date");
  const description = textField("description");
  const body = textField("body");

  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !description || !body) {
    return Response.json({ error: "missing_fields" }, { status: 400 });
  }

  let coverPlan;
  let imagePlan;
  try {
    coverPlan = JSON.parse(String(form.get("coverPlan") ?? "null"));
    imagePlan = JSON.parse(String(form.get("imagePlan") ?? "[]"));
  } catch {
    return Response.json({ error: "invalid_image_plan" }, { status: 400 });
  }

  const coverIsValid =
    coverPlan &&
    ((coverPlan.source === "new" && form.get(coverPlan.fileKey) instanceof File) ||
      (coverPlan.source === "existing" && typeof coverPlan.path === "string" && coverPlan.path));
  if (!coverIsValid) {
    return Response.json({ error: "cover_image_required" }, { status: 400 });
  }

  let totalBytes = 0;
  for (const [, value] of form.entries()) {
    if (value instanceof File) totalBytes += value.size;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return Response.json({ error: "images_too_large" }, { status: 400 });
  }

  const owner = env.GITHUB_REPO_OWNER;
  const repo = env.GITHUB_REPO_NAME;
  const baseBranch = env.GITHUB_REPO_BRANCH;
  const token = session.token;

  let slug = String(form.get("slug") ?? "");
  if (mode === "create") {
    slug = generateSlug(date);
    let collided = true;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let existing;
      try {
        existing = await getFileContent(token, owner, repo, `docs/news/${slug}.mdx`);
      } catch (err) {
        return toApiErrorResponse(err);
      }
      if (!existing) {
        collided = false;
        break;
      }
      slug = generateSlug(date);
    }
    // 4回連続で衝突するのは天文学的な確率だが、万一の場合に既存記事をサイレントに
    // 上書きしないよう、最後まで衝突が解消しなければここで打ち切る。
    if (collided) {
      return Response.json({ error: "slug_collision" }, { status: 409 });
    }
  } else if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return Response.json({ error: "invalid_slug" }, { status: 400 });
  }

  try {
    const baseSha = await getBranchTip(token, owner, repo, baseBranch);
    if (!baseSha) throw new GitHubApiError(404, { message: `base branch ${baseBranch} not found` });
    const baseCommit = await getCommit(token, owner, repo, baseSha);

    const treeEntries = [];

    // カバー画像: 新規アップロードならblobを作りtreeに追加、既存を維持するなら
    // base_treeにすでに存在するのでtreeエントリ自体が不要。
    let coverSitePath;
    if (coverPlan.source === "new") {
      const file = form.get(coverPlan.fileKey);
      const ext = extensionOf(file.name);
      const repoPath = `public/images/news/${slug}/cover.${ext}`;
      const blobSha = await createBlob(token, owner, repo, await fileToBase64(file), "base64");
      treeEntries.push({ path: repoPath, mode: "100644", type: "blob", sha: blobSha });
      coverSitePath = toSitePath(repoPath);
    } else {
      coverSitePath = coverPlan.path;
    }

    // そのまま維持する既存画像が使っている番号を先に押さえておく。これをしないと、
    // 画像を1枚消して1枚足したときなどに新規画像が既存画像と同じ番号に採番され、
    // 維持したはずの画像を上書きした上で同じパスを2箇所から参照してしまう。
    // 表示順は下の renderedImages の順序で決まるので、ファイル名の番号が
    // 飛んでいても記事の見た目には影響しない。
    const takenNumbers = new Set(
      imagePlan
        .filter((item) => item.source === "existing" && typeof item.path === "string")
        .map((item) => imageNumberOf(item.path, slug))
        .filter((num) => num !== null),
    );
    let nextNumber = 1;
    const allocateNumber = () => {
      while (takenNumbers.has(String(nextNumber).padStart(2, "0"))) nextNumber += 1;
      const num = String(nextNumber).padStart(2, "0");
      nextNumber += 1;
      return num;
    };

    // 追加画像。既存を維持するものはtreeエントリなし(base_treeから引き継がれる)。
    const renderedImages = [];
    for (const item of imagePlan) {
      if (item.source === "new") {
        const file = form.get(item.fileKey);
        if (!(file instanceof File)) continue;
        const ext = extensionOf(file.name);
        const repoPath = `public/images/news/${slug}/${allocateNumber()}.${ext}`;
        const blobSha = await createBlob(token, owner, repo, await fileToBase64(file), "base64");
        treeEntries.push({ path: repoPath, mode: "100644", type: "blob", sha: blobSha });
        renderedImages.push({ alt: item.alt ?? "", path: toSitePath(repoPath) });
      } else if (item.source === "existing" && item.path) {
        renderedImages.push({ alt: item.alt ?? "", path: item.path });
      }
    }

    const mdxContent = renderArticle({
      title,
      date,
      description,
      imagePath: coverSitePath,
      body,
      images: renderedImages,
    });

    const mdxBlobSha = await createBlob(token, owner, repo, mdxContent, "utf-8");
    treeEntries.push({ path: `docs/news/${slug}.mdx`, mode: "100644", type: "blob", sha: mdxBlobSha });

    const treeSha = await createTree(token, owner, repo, baseCommit.tree.sha, treeEntries);
    const commitMessage = mode === "create" ? `news: add ${title}` : `news: update ${title}`;
    const commitSha = await createCommit(token, owner, repo, commitMessage, treeSha, baseSha);
    const prBody = `News Editor経由で @${session.login} により${mode === "create" ? "作成" : "更新"}されました。`;

    const result = await openOrUpdatePullRequest({
      token,
      owner,
      repo,
      baseBranch,
      mode,
      slug,
      title,
      commitSha,
      prBody,
    });

    return Response.json({ prUrl: result.url, prNumber: result.number, slug });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

async function openOrUpdatePullRequest({ token, owner, repo, baseBranch, mode, slug, title, commitSha, prBody }) {
  if (mode === "create") {
    const branchName = `news/${slug}`;
    const refRes = await createRef(token, owner, repo, branchName, commitSha);
    if (!refRes.ok) throw new GitHubApiError(refRes.status, refRes.body);
    return createPullRequest(token, owner, repo, {
      title: `News: ${title}`,
      head: branchName,
      base: baseBranch,
      body: prBody,
    });
  }

  // edit: 同じ記事を2回編集したときに同じPRを更新できるよう、決まったブランチ名を使う。
  const branchName = `edit-news-${slug}`;
  const existingTip = await getBranchTip(token, owner, repo, branchName);

  if (!existingTip) {
    const refRes = await createRef(token, owner, repo, branchName, commitSha);
    if (!refRes.ok) throw new GitHubApiError(refRes.status, refRes.body);
    return createPullRequest(token, owner, repo, {
      title: `News: ${title} (update)`,
      head: branchName,
      base: baseBranch,
      body: prBody,
    });
  }

  const openPr = await findOpenPullRequest(token, owner, repo, branchName);
  if (openPr) {
    const updateRes = await updateRef(token, owner, repo, branchName, commitSha);
    if (!updateRes.ok) throw new GitHubApiError(updateRes.status, updateRes.body);
    return { url: openPr.html_url, number: openPr.number };
  }

  // ブランチは残っているがPRがマージ/クローズ済み — その履歴を上書きせず、
  // 連番サフィックスを振った新しいブランチ・PRにする。
  let suffix = 2;
  let candidate = `${branchName}-${suffix}`;
  while (await getBranchTip(token, owner, repo, candidate)) {
    suffix += 1;
    candidate = `${branchName}-${suffix}`;
  }
  const refRes = await createRef(token, owner, repo, candidate, commitSha);
  if (!refRes.ok) throw new GitHubApiError(refRes.status, refRes.body);
  return createPullRequest(token, owner, repo, {
    title: `News: ${title} (update)`,
    head: candidate,
    base: baseBranch,
    body: prBody,
  });
}

function extensionOf(filename) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename ?? "");
  return (match ? match[1] : "jpg").toLowerCase();
}

// この記事自身の画像ディレクトリにある連番画像("/images/news/<slug>/03.jpg" など)
// なら、その番号("03")を返す。それ以外(他記事の画像や外部URL)は新規画像の
// 採番と衝突しようがないので null を返す。
function imageNumberOf(sitePath, slug) {
  const match = new RegExp(`^/images/news/${slug}/(\\d{2})\\.[a-zA-Z0-9]+$`).exec(sitePath);
  return match ? match[1] : null;
}

function toSitePath(repoPath) {
  return `/${repoPath.replace(/^public\//, "")}`;
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
