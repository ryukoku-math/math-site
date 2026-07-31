import { useEffect, useState } from "react";

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

async function apiGet(path: string) {
  const res = await fetch(path, { credentials: "include" });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
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
        setError(describeError(data?.error));
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

function describeError(code?: string): string {
  switch (code) {
    case "not_a_collaborator":
      return "このリポジトリへの書き込み権限がありません。管理者(mathRyukoku または sanoakr)にコラボレーター登録を依頼してください。";
    case "rate_limited":
      return "GitHub APIのレート制限に達しました。しばらく待ってから再試行してください。";
    case "not_authenticated":
      return "ログインが必要です。ページを再読み込みしてください。";
    default:
      return "エラーが発生しました。しばらく待ってから再試行してください。";
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
  const [prUrl, setPrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !slug) return;
    apiGet(`/api/github/news/get?slug=${encodeURIComponent(slug)}`).then(({ status, data }) => {
      if (status !== 200) {
        setLoadError(describeError(data?.error));
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

  if (prUrl) {
    return (
      <div className="news-editor-success">
        <p>Pull Requestを作成しました。</p>
        <a href={prUrl} target="_blank" rel="noreferrer">
          {prUrl}
        </a>
        <p>
          Cloudflare Pagesのプレビューが用意され、管理者(mathRyukoku / sanoakr)の承認後に <code>main</code> へ反映されます。
          本番サイトへの反映は毎日午前3時(日本時間)の自動デプロイ時です。
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

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function handleCoverFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setNewCoverFile(file);
    setNewCoverPreview(file ? URL.createObjectURL(file) : null);
  }

  function handleImageFileChange(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // 既存画像のスロットで選び直した場合も、新しいファイルへの差し替えとして扱う。
    updateImage(index, { file, previewUrl: URL.createObjectURL(file), source: "new", path: undefined });
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
    form.set("mode", mode);
    if (mode === "edit" && slug) form.set("slug", slug);
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
        setPrUrl(data.prUrl);
      } else {
        setSubmitError(describeError(data?.error));
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
        <p className="news-editor-hint">記事の先頭に大きく表示される画像です。</p>
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

      <button type="submit" className="news-editor-button" disabled={submitting}>
        {submitting ? "送信中…" : "Pull Requestを作成"}
      </button>
      <p className="news-editor-note">
        送信すると @{login} 名義でブランチ・PRが作成されます。ブランチ保護のルールにより、管理者の承認後に main へマージされます。
      </p>
    </form>
  );
}
