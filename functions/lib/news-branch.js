// News Editorが作るブランチ名の規則と、その検証。
// 取り消し(withdraw)や上書き(revise)ではクライアントからブランチ名を受け取るが、
// 任意のブランチを消したり上書きされたりしないよう、必ずslugから導けるものだけを許す。

export function createBranchName(slug) {
  return `news/${slug}`;
}

export function editBranchName(slug) {
  return `edit-news-${slug}`;
}

// slug は呼び出し側で /^[a-z0-9-]+$/i を通してから渡すこと(正規表現に埋め込むため)。
// 既存のPRがマージ/クローズ済みだった場合に連番サフィックスが付く形も許可する
// — これを許さないと、そのブランチを次に上書きしようとしたときに弾かれてしまう。
export function isBranchForSlug(branch, slug) {
  if (typeof branch !== "string" || !branch) return false;
  return new RegExp(`^(news/|edit-news-)${slug}(-\\d+)?$`).test(branch);
}
