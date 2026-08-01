// scripts/import-news.mjs と同じスラッグ規則: n<YYYY-MM-DD>-<hex6>
// 先頭の "n" は、Blumeがルート生成時に先頭の数値プレフィックス(/^\d+[-_.]/)を
// 取り除く挙動を避けるためのもの(素の日付始まりだと /news/07-25-... のように
// 誤ってルーティングされてしまう)。

export function generateSlug(dateStr) {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `n${dateStr}-${hex}`;
}
