// One-off migration: 京都駅前セミナーの履歴 (104 entries) -> a Markdown table
// used inline in docs/research/seminars.mdx. Run: node scripts/import-seminars.mjs
import fs from "node:fs";

const SRC =
  "/tmp/claude-1004/-home-sano-blume-math/8498e8ec-7cc0-4128-be66-8ce8d315b67c/scratchpad/notion-export/extracted/プライベート、シェア/数理・情報科学課程/研究・教育/京都駅前セミナー＆大阪駅前セミナー/京都駅前セミナーの履歴 3428907004b880578120d8ae9eb1c23c.md";

const text = fs.readFileSync(SRC, "utf8");
const blocks = text.split(/\n(?=\*\*◎)/);

const entries = [];
for (const b of blocks) {
  const session = b.match(/\*\*◎(.+?)\*\*/)?.[1]?.trim();
  const date = b.match(/日時[:：]\s*(.+)/)?.[1]?.trim();
  const speaker = b
    .match(/講演者[:：]\s*([\s\S]+?)(?=\n\s*題目[:：]|\n\s*\n|$)/)?.[1]
    ?.replace(/\n/g, " ")
    ?.trim();
  const topic = b.match(/題目[:：]\s*([\s\S]+?)(?=\n\s*\n|$)/)?.[1]?.replace(/\n/g, " ")?.trim();
  if (date && speaker) {
    const num = session?.match(/第(\d+)回/)?.[1] ?? "";
    entries.push({ num, date, speaker, topic: topic ?? "" });
  }
}

function esc(s) {
  return s.replace(/\|/g, "\\|");
}

const rows = entries
  .map((e) => `| ${e.num} | ${esc(e.date)} | ${esc(e.speaker)} | ${esc(e.topic)} |`)
  .join("\n");

const table =
  "| 回 | 日時 | 講演者 | 題目 |\n| --- | --- | --- | --- |\n" + rows;

fs.writeFileSync(
  new URL("../.seminar-table.tmp.md", import.meta.url),
  table + "\n"
);
console.log(`entries: ${entries.length}`);
