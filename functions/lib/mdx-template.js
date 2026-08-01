// docs/news/*.mdx のフロントマター/本文を、決まった形で生成・解析するための処理。
// 生成側(renderArticle)とパース側(parseBody/extractFrontmatterFields)は対になっており、
// News Editorが作った記事は必ずこの形を往復できる。手編集などでこの形から外れた記事は
// parseBody が matched: false を返すので、呼び出し側(news/get.js)は生Markdownへの
// フォールバック編集に倒す。

const TITLE_CLAMP_LINE = "<TitleClamp />";
const COLUMNS_BLOCK_RE = /\n\n<Columns cols=\{2\}>\n([\s\S]*?)\n<\/Columns>\s*$/;
const COLUMN_ITEM_RE = /<Column>\s*\n\s*!\[([^\]]*)\]\(([^)]+)\)\s*\n\s*<\/Column>/g;

function yamlString(value) {
  return `"${String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, "\\n")}"`;
}

function escapeAlt(alt) {
  return String(alt ?? "").replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

export function renderFrontmatterBlock({ title, date, description, imagePath }) {
  return [
    "---",
    `title: ${yamlString(title)}`,
    "type: blog",
    `date: ${date}`,
    "seo:",
    `  image: ${yamlString(imagePath)}`,
    `  description: ${yamlString(description)}`,
    "sidebar:",
    "  hidden: true",
    "---",
  ].join("\n");
}

export function renderBody({ body, images }) {
  const lines = [TITLE_CLAMP_LINE, "", body.trim()];
  if (images.length > 0) {
    lines.push("", "<Columns cols={2}>");
    for (const img of images) {
      lines.push("  <Column>", `    ![${escapeAlt(img.alt)}](${img.path})`, "  </Column>");
    }
    lines.push("</Columns>");
  }
  return `${lines.join("\n")}\n`;
}

export function renderArticle(fields) {
  // 閉じ "---" の直後に空行を入れない — 既存の docs/news/*.mdx と同じ形。
  // ここに空行があると extractFrontmatterFields が返す本文が改行始まりになり、
  // parseBody がこのツール自身の出力を読み戻せなくなる。
  return `${renderFrontmatterBlock(fields)}\n${renderBody(fields)}`;
}

// 本文(フロントマターを除いた部分)を解析し、プロース本文と追加画像に分解する。
// テンプレートと完全に一致しない場合は matched:false を返す(曖昧一致はしない —
// 誤って画像参照を取りこぼすより、フォールバック編集に倒すほうが安全)。
export function parseBody(raw) {
  // 改行コードを正規化した上で、前後の空行は許容する(frontmatterの直後に
  // 空行がある書き方も、手編集の結果として普通にありうる)。
  const trimmed = raw.replace(/\r\n/g, "\n").replace(/^\n+/, "").replace(/\s+$/, "");
  if (!trimmed.startsWith(`${TITLE_CLAMP_LINE}\n`)) {
    return { matched: false };
  }

  const rest = trimmed.slice(`${TITLE_CLAMP_LINE}\n`.length);
  const columnsMatch = rest.match(COLUMNS_BLOCK_RE);

  let prose = rest;
  let images = [];

  if (columnsMatch) {
    const inner = columnsMatch[1];
    const items = [...inner.matchAll(COLUMN_ITEM_RE)];
    // マッチした<Column>ブロックを取り除いた残りが空白だけであれば、この
    // ブロックには画像以外の中身が無い = テンプレートが生成した形だと判断できる。
    // 整形した文字列との単純比較にすると、ブロック間の改行・インデントの差だけで
    // 不一致になってしまう(画像2枚以上は必ずフォールバックしていた)。
    let residue = "";
    let cursor = 0;
    for (const m of items) {
      residue += inner.slice(cursor, m.index);
      cursor = m.index + m[0].length;
    }
    residue += inner.slice(cursor);
    if (items.length === 0 || residue.trim() !== "") {
      return { matched: false };
    }
    images = items.map((m) => ({ alt: m[1], path: m[2] }));
    prose = rest.slice(0, columnsMatch.index);
  } else if (/<Columns|<Column>/.test(rest)) {
    // Columnsらしき断片はあるが期待する形と一致しない
    return { matched: false };
  }

  prose = prose.replace(/^\n+/, "").replace(/\n+$/, "");
  if (/<Columns|<Column>|<TitleClamp/.test(prose)) {
    return { matched: false };
  }

  return { matched: true, body: prose, images };
}

// "---\n...\n---\n" 形式のフロントマターを、既存コーパスで使われている範囲
// (フラットな値 + 1階層のネスト)だけ読み取る簡易パーサー。
// 汎用YAMLパーサーではないため、想定外の構造は単にその値が undefined になるだけで
// 例外は投げない(呼び出し側でフォールバック表示すればよい)。
export function extractFrontmatterFields(fileContent) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(fileContent);
  if (!match) {
    return { frontmatter: {}, body: fileContent };
  }
  const [, fmText, body] = match;
  return { frontmatter: parseFlatYaml(fmText), body };
}

function parseFlatYaml(text) {
  const result = {};
  let currentParent = null;
  for (const rawLine of text.split("\n")) {
    if (!rawLine.trim()) continue;

    const topMatch = rawLine.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (topMatch) {
      const [, key, rest] = topMatch;
      if (rest.trim() === "") {
        currentParent = key;
        result[key] = {};
      } else {
        currentParent = null;
        result[key] = unquote(rest.trim());
      }
      continue;
    }

    const nestedMatch = rawLine.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
    if (nestedMatch && currentParent) {
      const [, key, rest] = nestedMatch;
      if (typeof result[currentParent] !== "object" || result[currentParent] === null) {
        result[currentParent] = {};
      }
      result[currentParent][key] = unquote(rest.trim());
    }
  }
  return result;
}

function unquote(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}
