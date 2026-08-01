import { useEffect, useRef, useState } from "react";

type Me = { authenticated: boolean; login?: string; avatarUrl?: string };

type ArticleSummary = { slug: string; title: string; date: string | null };

type ImageItem = {
  alt: string;
  source: "existing" | "new";
  path?: string; // source: "existing"
  file?: File; // source: "new"
  previewUrl?: string; // source: "new" — object URL for the picked file
};

type Props = {
  mode: "list" | "create" | "edit";
  slug?: string;
};

type SubmittedPr = { prUrl: string; prNumber: number; slug: string; branch: string };

// Cloudflare Pages のプロジェクト名。ブランチ別プレビューは
// <ブランチ名の英数字以外を - に置換>.<プロジェクト名>.pages.dev で配信される。
const PAGES_PROJECT = "mathryukoku";

// ブランチ名からプレビューURLを組み立てる。Cloudflareはブランチ名の英数字以外を
// "-" に置き換え、小文字化して28文字までに切り詰めたものをサブドメインにする。
// このツールが作るブランチ名(news/<slug> = 23文字、edit-news-<slug> = 28文字)は
// いずれも上限内なので切り詰めは起きない。
function branchPreviewUrl(branch: string) {
  const alias = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  return `https://${alias}.${PAGES_PROJECT}.pages.dev`;
}

async function apiGet(path: string) {
  const res = await fetch(path, { credentials: "include" });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// 縮小後の長辺の上限。既存記事のカバー画像は約512px幅なので、本文中の表示にも
// 十分な余裕がある大きさ。
const MAX_IMAGE_DIMENSION = 1200;
const JPEG_QUALITY = 0.85;

// アップロードされた画像を必ずJPEGに再エンコードし、長辺を縮小する。
// iPhoneの写真は標準でHEIC形式で、Chrome/Firefoxでは表示できない —
// 実際に本番でカバー画像が cover.heic として保存され、壊れた画像になった。
// スマホ写真はそのままだと数MBあり、1記事あたりの送信上限もすぐ使い切る。
// HEICをデコードできるのはSafari等に限られるが、HEICの出所がまさにApple端末なので
// 実用上はここで吸収できる。デコードできない場合は理由の分かるエラーにする。
async function normalizeImage(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      `「${file.name}」はこのブラウザで読み込めない画像形式です。` +
        "JPEGまたはPNGに変換してからアップロードしてください" +
        "(iPhoneの写真はHEIC形式のことがあります)。",
    );
  }

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像の変換に失敗しました。別のブラウザでお試しください。");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("画像の変換に失敗しました。別のブラウザでお試しください。");

  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

export default function NewsEditor({ mode, slug }: Props) {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    apiGet("/api/github/me").then(({ status, data }) => {
      setMe(status === 200 ? data : { authenticated: false });
    });
  }, []);

  if (me === null) {
    return <p className="news-editor-status">確認中…</p>;
  }

  if (!me.authenticated) {
    return (
      <div className="news-editor-login">
        <p>ニュース記事の追加・編集には、リポジトリへの書き込み権限を持つGitHubアカウントでのログインが必要です。</p>
        <a className="news-editor-button" href="/api/github/oauth/login">
          GitHubでログイン
        </a>
      </div>
    );
  }

  return (
    <div className="news-editor">
      <div className="news-editor-account">
        {me.avatarUrl && <img src={me.avatarUrl} alt="" width={28} height={28} className="news-editor-avatar" />}
        <span>@{me.login} としてログイン中</span>
        <form method="post" action="/api/github/oauth/logout">
          <button type="submit" className="news-editor-link-button">
            ログアウト
          </button>
        </form>
      </div>

      {mode === "list" && <ArticleList />}
      {mode === "create" && <ArticleForm mode="create" login={me.login ?? ""} />}
      {mode === "edit" && slug && <ArticleForm mode="edit" slug={slug} login={me.login ?? ""} />}
    </div>
  );
}

function ArticleList() {
  const [articles, setArticles] = useState<ArticleSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/api/github/news/list").then(({ status, data }) => {
      if (status === 200) {
        setArticles(data.articles);
      } else {
        setError(describeError(data));
      }
    });
  }, []);

  return (
    <div>
      <a className="news-editor-button" href="/admin/news/new">
        新しい記事を作成
      </a>
      <h2>既存の記事</h2>
      {error && <p className="news-editor-error">{error}</p>}
      {!error && !articles && <p className="news-editor-status">読み込み中…</p>}
      {articles && (
        <ul className="news-editor-list">
          {articles.map((article) => (
            <li key={article.slug}>
              <a href={`/admin/news/${article.slug}`}>
                {article.date && <span className="news-editor-list-date">{article.date}</span>}
                {article.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// data は API のエラーレスポンス全体。GitHubの原文(message)が付いている場合は
// 末尾に添える — 権限の問題に見えて実際は別原因、というケースを切り分けられるように。
function describeError(data?: { error?: string; message?: string } | null): string {
  const detail = data?.message ? `\nGitHubからの応答: ${data.message}` : "";
  switch (data?.error) {
    case "oauth_app_not_approved":
      return (
        "この連携アプリがOrganizationで承認されていないため、書き込みができません。" +
        "Organizationのオーナーが GitHub の Settings → Third-party Access で" +
        "このOAuth Appへのアクセスを承認する必要があります。" +
        detail
      );
    case "not_a_collaborator":
      return (
        "このリポジトリへの書き込みが拒否されました。書き込み権限がない可能性があります" +
        "(管理者にコラボレーター登録を依頼してください)。" +
        detail
      );
    case "rate_limited":
      return "GitHub APIのレート制限に達しました。しばらく待ってから再試行してください。";
    case "not_authenticated":
      return "ログインが必要です。ページを再読み込みしてください。";
    case "news_dir_not_found":
    case "base_branch_not_found":
      return "リポジトリの設定(参照先のブランチ)が正しくないようです。管理者に連絡してください。";
    case "cover_image_required":
      return "カバー画像を1枚選択してください。";
    case "images_too_large":
      return "画像の合計サイズが大きすぎます。枚数を減らすか、画像を圧縮してください。";
    case "unsupported_image_format":
      return "対応していない画像形式です。JPEGまたはPNGに変換してからアップロードしてください。";
    case "pr_already_merged":
      return "このPull Requestは既にマージされているため取り消せません。記事一覧から編集してください。";
    case "pr_not_found":
    case "pr_branch_mismatch":
      return "対象のPull Requestが見つかりませんでした。GitHub上で既に閉じられている可能性があります。";
    case "invalid_branch":
      return "対象のブランチが不正です。お手数ですが、ページを再読み込みしてやり直してください。";
    case "slug_collision":
      return "記事IDの生成に失敗しました。もう一度送信してください。";
    default:
      return "エラーが発生しました。しばらく待ってから再試行してください。" + detail;
  }
}

function ArticleForm({ mode, slug, login }: { mode: "create" | "edit"; slug?: string; login: string }) {
  const [loading, setLoading] = useState(mode === "edit");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateMatch, setTemplateMatch] = useState(true);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");

  const [existingCoverPath, setExistingCoverPath] = useState<string | null>(null);
  const [newCoverFile, setNewCoverFile] = useState<File | null>(null);
  const [newCoverPreview, setNewCoverPreview] = useState<string | null>(null);

  const [images, setImages] = useState<ImageItem[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  // 作成/更新したPR。ここに値が入っている間は成功画面を表示する。
  const [submitted, setSubmitted] = useState<SubmittedPr | null>(null);
  // 「修正する」でフォームに戻ったときの上書き対象。次回送信はこのブランチを上書きする。
  const [reviseTarget, setReviseTarget] = useState<SubmittedPr | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);

  // 生成済みのプレビューURLを把握しておき、アンマウント時に取りこぼしなく解放する。
  const livePreviews = useRef<Set<string>>(new Set());
  useEffect(() => () => {
    for (const url of livePreviews.current) URL.revokeObjectURL(url);
    livePreviews.current.clear();
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !slug) return;
    apiGet(`/api/github/news/get?slug=${encodeURIComponent(slug)}`).then(({ status, data }) => {
      if (status !== 200) {
        setLoadError(describeError(data));
        setLoading(false);
        return;
      }
      setTitle(data.title ?? "");
      setDate(data.date || new Date().toISOString().slice(0, 10));
      setDescription(data.description ?? "");
      setBody(data.body ?? "");
      setExistingCoverPath(data.coverImage ?? null);
      setTemplateMatch(Boolean(data.templateMatch));
      setImages(
        (data.images ?? []).map((img: { alt: string; path: string }) => ({
          source: "existing" as const,
          alt: img.alt,
          path: img.path,
        })),
      );
      setLoading(false);
    });
  }, [mode, slug]);

  if (loading) return <p className="news-editor-status">読み込み中…</p>;
  if (loadError) return <p className="news-editor-error">{loadError}</p>;

  if (withdrawn) {
    return (
      <div className="news-editor-success">
        <p>投稿を取り消しました。Pull Requestはクローズされ、ブランチも削除されています。</p>
        <div className="news-editor-actions">
          <a className="news-editor-button" href="/admin/news/new">
            もう一度作成する
          </a>
          <a className="news-editor-secondary-button" href="/admin/news">
            記事一覧に戻る
          </a>
        </div>
      </div>
    );
  }

  if (submitted) {
    const previewUrl = branchPreviewUrl(submitted.branch);
    return (
      <div className="news-editor-success">
        <p>
          Pull Requestを{mode === "create" ? "作成" : "更新"}しました。
          <br />
          <a href={submitted.prUrl} target="_blank" rel="noreferrer">
            {submitted.prUrl}
          </a>
        </p>

        <h3>1. プレビューで確認する</h3>
        <p>
          このURLで、記事が追加された状態のサイトを確認できます。
          <br />
          <a href={previewUrl} target="_blank" rel="noreferrer">
            {previewUrl}
          </a>
        </p>
        <p className="news-editor-hint">
          ビルドに2〜3分かかります。開いた直後は「Deployment Not Found」や古い内容が表示されることが
          あるので、少し待ってから再読み込みしてください。プレビューではAI Chatと記事編集ページは
          動作しません(記事の見た目の確認には影響しません)。
        </p>

        <h3>2. 問題があれば</h3>
        <div className="news-editor-actions">
          <button
            type="button"
            className="news-editor-secondary-button"
            disabled={withdrawing}
            onClick={handleRevise}
          >
            修正する
          </button>
          <button
            type="button"
            className="news-editor-danger-button"
            disabled={withdrawing}
            onClick={handleWithdraw}
          >
            {withdrawing ? "取り消し中…" : "この投稿を取り消す"}
          </button>
        </div>
        <p className="news-editor-hint">
          「修正する」は入力内容を保ったままフォームに戻り、再送信すると<strong>同じPRを上書き</strong>
          します(新しいPRは作られません)。「取り消す」はPRをクローズしてブランチを削除します
          — 記事も画像もこのブランチにしか無いため、完全に破棄されます。
        </p>

        {submitError && <p className="news-editor-error">{submitError}</p>}

        <h3>3. 問題なければ</h3>
        <p>
          このまま管理者(mathRyukoku / sanoakr)の承認を待ってください。承認・マージされると{" "}
          <code>main</code> に入り、公開サイトには毎日午前3時(日本時間)の自動デプロイで反映されます。
        </p>
      </div>
    );
  }

  function addNewImageSlot() {
    setImages((prev) => [...prev, { source: "new", alt: "" }]);
  }

  function updateImage(index: number, patch: Partial<ImageItem>) {
    setImages((prev) => prev.map((img, i) => (i === index ? { ...img, ...patch } : img)));
  }

  // プレビュー用のオブジェクトURLは、差し替え・削除・送信完了・アンマウントの
  // いずれでも確実に解放する。放置するとBlobがメモリに残り続ける。
  // createObjectURL/revokeObjectURL は必ずsetState更新関数の「外」で呼ぶ —
  // 更新関数は純粋でなければならず、Reactが二重に呼んだ場合にURLを2つ作って
  // 片方を取りこぼす(解放漏れを直すつもりで漏らす)ことになる。
  function createPreview(file: File) {
    const url = URL.createObjectURL(file);
    livePreviews.current.add(url);
    return url;
  }

  function releasePreview(url?: string | null) {
    if (!url) return;
    URL.revokeObjectURL(url);
    livePreviews.current.delete(url);
  }

  function releaseAllPreviews() {
    for (const url of livePreviews.current) URL.revokeObjectURL(url);
    livePreviews.current.clear();
  }

  function removeImage(index: number) {
    releasePreview(images[index]?.previewUrl);
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCoverFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setImageError(null);
    if (!picked) {
      releasePreview(newCoverPreview);
      setNewCoverFile(null);
      setNewCoverPreview(null);
      return;
    }
    setConverting(true);
    try {
      const file = await normalizeImage(picked);
      releasePreview(newCoverPreview);
      setNewCoverFile(file);
      setNewCoverPreview(createPreview(file));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "画像の変換に失敗しました。");
    } finally {
      setConverting(false);
    }
  }

  async function handleImageFileChange(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setImageError(null);
    setConverting(true);
    try {
      const file = await normalizeImage(picked);
      releasePreview(images[index]?.previewUrl);
      const previewUrl = createPreview(file);
      // 既存画像のスロットで選び直した場合も、新しいファイルへの差し替えとして扱う。
      setImages((prev) =>
        prev.map((img, i) => (i === index ? { ...img, file, previewUrl, source: "new", path: undefined } : img)),
      );
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "画像の変換に失敗しました。");
    } finally {
      setConverting(false);
    }
  }

  // 「修正する」: 入力内容を保ったままフォームに戻る。次の送信は同じブランチを上書きする。
  function handleRevise() {
    setReviseTarget(submitted);
    setSubmitted(null);
    setSubmitError(null);
  }

  async function handleWithdraw() {
    if (!submitted) return;
    const ok = window.confirm(
      "この投稿を取り消します。Pull Requestをクローズし、ブランチを削除します。\n" +
        "記事と画像はこのブランチにしか存在しないため、元に戻せません。よろしいですか?",
    );
    if (!ok) return;

    setSubmitError(null);
    setWithdrawing(true);
    try {
      const res = await fetch("/api/github/news/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          slug: submitted.slug,
          branch: submitted.branch,
          prNumber: submitted.prNumber,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        releaseAllPreviews();
        setWithdrawn(true);
      } else {
        setSubmitError(describeError(data));
      }
    } catch {
      setSubmitError("通信に失敗しました。ネットワークを確認して再試行してください。");
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    const hasCover = existingCoverPath || newCoverFile;
    if (!hasCover) {
      setSubmitError("カバー画像を1枚選択してください。");
      return;
    }

    const form = new FormData();
    // 一度作成したPRを修正して送り直す場合は、新しいPRを作らず同じブランチを上書きする。
    if (reviseTarget) {
      form.set("mode", "revise");
      form.set("slug", reviseTarget.slug);
      form.set("branch", reviseTarget.branch);
    } else {
      form.set("mode", mode);
      if (mode === "edit" && slug) form.set("slug", slug);
    }
    form.set("title", title.trim());
    form.set("date", date);
    form.set("description", description.trim());
    form.set("body", body.trim());

    let coverPlan: Record<string, unknown>;
    if (newCoverFile) {
      form.set("file_cover", newCoverFile);
      coverPlan = { source: "new", fileKey: "file_cover" };
    } else {
      coverPlan = { source: "existing", path: existingCoverPath };
    }
    form.set("coverPlan", JSON.stringify(coverPlan));

    // ファイル未選択のまま追加された画像スロットは送信対象から外す
    // (黙ってドロップされるより、そもそも計画に含めない方が挙動が分かりやすい)。
    const imagePlan = images
      .filter((img) => (img.source === "new" ? Boolean(img.file) : Boolean(img.path)))
      .map((img, index) => {
        if (img.source === "new" && img.file) {
          const fileKey = `file_image_${index}`;
          form.set(fileKey, img.file);
          return { source: "new", fileKey, alt: img.alt };
        }
        return { source: "existing", path: img.path, alt: img.alt };
      });
    form.set("imagePlan", JSON.stringify(imagePlan));

    setSubmitting(true);
    try {
      const res = await fetch("/api/github/news/submit", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        // ここではプレビューURLを解放しない — 成功画面から「修正する」でフォームに
        // 戻れるようになったため、解放すると戻ったときに画像プレビューが壊れる。
        // 取り消し時とアンマウント時に解放する。
        setSubmitted({
          prUrl: data.prUrl,
          prNumber: data.prNumber,
          slug: data.slug,
          branch: data.branch,
        });
      } else {
        setSubmitError(describeError(data));
      }
    } catch {
      setSubmitError("通信に失敗しました。ネットワークを確認して再試行してください。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="news-editor-form" onSubmit={handleSubmit}>
      <h2>{mode === "create" ? "新しい記事を作成" : `記事を編集: ${slug}`}</h2>

      {reviseTarget && (
        <p className="news-editor-warning">
          作成済みのPull Request(
          <a href={reviseTarget.prUrl} target="_blank" rel="noreferrer">
            #{reviseTarget.prNumber}
          </a>
          )を修正しています。送信すると<strong>同じPRが上書きされます</strong>(新しいPRは作られません)。
        </p>
      )}

      {!templateMatch && (
        <p className="news-editor-warning">
          この記事はエディタの想定フォーマットと一致しないため(手編集された可能性があります)、本文は生のMarkdownとして編集しています。
          本文中に埋め込まれた画像はそのまま維持されますが、個別の画像アップロード欄では管理できません。
        </p>
      )}

      <label className="news-editor-field">
        タイトル
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>

      <label className="news-editor-field">
        日付
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>

      <label className="news-editor-field">
        概要(一覧・検索結果に表示されます)
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} required />
      </label>

      <label className="news-editor-field">
        本文(Markdown)
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} required />
      </label>

      <fieldset className="news-editor-field">
        <legend>
          カバー画像 <span className="news-editor-required">必須</span>
        </legend>
        <p className="news-editor-hint">
          記事の先頭に大きく表示される画像です。アップロードした画像は自動でJPEGに変換し、
          長辺{MAX_IMAGE_DIMENSION}pxに縮小して保存します。
        </p>
        {converting && <p className="news-editor-status">画像を変換中…</p>}
        {imageError && <p className="news-editor-error">{imageError}</p>}
        {newCoverPreview || existingCoverPath ? (
          <div className="news-editor-cover-preview">
            <img src={newCoverPreview ?? existingCoverPath ?? undefined} alt="" />
            <label className="news-editor-file-button">
              画像を変更
              <input type="file" accept="image/*" onChange={handleCoverFileChange} hidden />
            </label>
          </div>
        ) : (
          <label className="news-editor-dropzone">
            <span>クリックしてカバー画像を選択</span>
            <input type="file" accept="image/*" onChange={handleCoverFileChange} hidden />
          </label>
        )}
      </fieldset>

      {templateMatch && (
        <fieldset className="news-editor-field">
          <legend>追加画像(任意)</legend>
          <p className="news-editor-hint">本文の下に2列で並びます。ここでの順番がそのまま表示順になります。</p>
          <div className="news-editor-image-grid">
            {images.map((img, index) => {
              const previewSrc = img.source === "new" ? img.previewUrl : img.path;
              return (
                <div key={index} className="news-editor-image-card">
                  <div className="news-editor-image-card-header">
                    <span className="news-editor-image-number">{index + 1}枚目</span>
                    <button type="button" className="news-editor-remove-image" onClick={() => removeImage(index)}>
                      削除
                    </button>
                  </div>
                  <div className="news-editor-image-thumb-wrap">
                    {previewSrc ? (
                      <img src={previewSrc} alt="" className="news-editor-thumb" />
                    ) : (
                      <span className="news-editor-thumb-placeholder">画像未選択</span>
                    )}
                  </div>
                  <label className="news-editor-file-button news-editor-file-button-small">
                    {previewSrc ? "画像を変更" : "画像を選ぶ"}
                    <input type="file" accept="image/*" onChange={(e) => handleImageFileChange(index, e)} hidden />
                  </label>
                  <input
                    className="news-editor-alt-input"
                    placeholder="代替テキスト(画像の内容を短く)"
                    value={img.alt}
                    onChange={(e) => updateImage(index, { alt: e.target.value })}
                  />
                </div>
              );
            })}
            <button type="button" className="news-editor-add-image" onClick={addNewImageSlot}>
              + 画像を追加
            </button>
          </div>
        </fieldset>
      )}

      {submitError && <p className="news-editor-error">{submitError}</p>}

      <div className="news-editor-actions">
        <button type="submit" className="news-editor-button" disabled={submitting || converting}>
          {submitting
            ? "送信中…"
            : converting
              ? "画像を変換中…"
              : reviseTarget
                ? "このPRを上書きする"
                : "Pull Requestを作成"}
        </button>
        {reviseTarget && (
          <button
            type="button"
            className="news-editor-secondary-button"
            disabled={submitting || converting}
            onClick={() => {
              setReviseTarget(null);
              setSubmitted(reviseTarget);
            }}
          >
            修正をやめて戻る
          </button>
        )}
      </div>
      <p className="news-editor-note">
        送信すると @{login} 名義で
        {reviseTarget ? "既存のPRが上書きされます" : "ブランチ・PRが作成されます"}。
        ブランチ保護のルールにより、管理者の承認後に main へマージされます。
      </p>
    </form>
  );
}
