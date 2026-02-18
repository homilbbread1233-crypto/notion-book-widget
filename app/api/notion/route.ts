import { NextResponse } from "next/server";

type NotionError = any;

const NOTION_VERSION = "2022-06-28";
const NOTION_API_BASE = "https://api.notion.com/v1";

function mustEnv(name: string): string {
  const v = (process.env[name] || "").trim();
  return v;
}

async function notionFetch(path: string, init: RequestInit = {}) {
  const apiKey = mustEnv("NOTION_API_KEY");
  if (!apiKey) {
    throw Object.assign(new Error("NOTION_API_KEY is missing in .env.local"), { status: 500 });
  }

  const url = `${NOTION_API_BASE}${path}`; // ✅ 절대 URL
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!r.ok) {
    const msg = json?.message || `Notion API error (${r.status})`;
    const e: any = new Error(msg);
    e.status = r.status;
    e.details = json;
    throw e;
  }

  return json;
}

type DbMeta = {
  databaseId: string;
  titlePropName: string;
  properties: Record<string, any>;
  dataSourceId?: string;
};

// 간단 캐시 (dev에서도 DB 메타 매번 가져오면 느리고 불안정해짐)
let cachedMeta: { at: number; meta: DbMeta } | null = null;

async function getDbMeta(force = false): Promise<DbMeta> {
  const databaseId = mustEnv("NOTION_DB_ID") || mustEnv("NOTION_DATABASE_ID");
  if (!databaseId) {
    throw Object.assign(new Error("NOTION_DB_ID (or NOTION_DATABASE_ID) is missing in .env.local"), {
      status: 500,
    });
  }

  if (!force && cachedMeta && Date.now() - cachedMeta.at < 30_000) {
    return cachedMeta.meta;
  }

  const db = await notionFetch(`/databases/${databaseId}`);

  const props = db?.properties;
  if (!props || typeof props !== "object") {
    // 디버깅을 돕기 위해 top-level keys도 같이 내보낼 수 있게 에러 객체에 담음
    const e: any = new Error("Database properties not found (retrieve returned unexpected shape)");
    e.status = 500;
    e.debug = {
      databaseId,
      topKeys: db ? Object.keys(db) : [],
      object: db?.object,
      hasProperties: !!db?.properties,
    };
    throw e;
  }

  // ✅ title 타입 자동 탐색 (노션 UI에선 "이름"으로 보이는 그 컬럼)
  const titlePropName =
    Object.keys(props).find((k) => props?.[k]?.type === "title") || "";

  if (!titlePropName) {
    const e: any = new Error("No title property found in database (type=title)");
    e.status = 500;
    e.debug = { databaseId, propertyKeys: Object.keys(props) };
    throw e;
  }

  const meta: DbMeta = {
    databaseId,
    titlePropName,
    properties: props,
    dataSourceId: db?.data_source?.id,
  };

  cachedMeta = { at: Date.now(), meta };
  return meta;
}

function hasProp(meta: DbMeta, name: string) {
  return !!meta.properties?.[name];
}

function makeRichText(content: string) {
  return { rich_text: [{ type: "text", text: { content } }] };
}

function makeTitle(content: string) {
  return { title: [{ type: "text", text: { content } }] };
}

function makeUrl(url: string) {
  return { url };
}

function makeFilesExternal(url: string, name = "cover") {
  return {
    files: [
      {
        type: "external",
        name,
        external: { url },
      },
    ],
  };
}

function makeSelectByName(optionName: string) {
  return { select: { name: optionName } };
}

function makeStatusByName(optionName: string) {
  return { status: { name: optionName } };
}

function makeMultiSelect(names: string[]) {
  return { multi_select: names.filter(Boolean).map((n) => ({ name: n })) };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const debug = searchParams.get("debug") === "1";

    const meta = await getDbMeta(debug); // debug일 때 강제 갱신해도 됨(원하면 debug에서 force로 바꿔도 됨)

    if (!debug) {
      return NextResponse.json({ ok: true, message: "notion route alive" });
    }

    // debug=1이면 properties 목록을 보기 좋게 반환
    return NextResponse.json({
      ok: true,
      databaseId: meta.databaseId,
      titlePropName: meta.titlePropName,
      propertyKeys: Object.keys(meta.properties),
      // 너무 길면 보기가 힘들어서 주요 정보만 축약해서 줌
      propertiesSummary: Object.fromEntries(
        Object.entries(meta.properties).map(([k, v]: any) => [k, { type: v?.type, id: v?.id }])
      ),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        message: err?.message ?? String(err),
        status: err?.status ?? 500,
        debug: err?.debug ?? null,
        details: err?.details ?? null,
      },
      { status: err?.status ?? 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const meta = await getDbMeta(false);

    const body = await req.json().catch(() => ({}));
    const title = (body?.title || "").trim();
    const author = (body?.author || "").trim();
    const link = (body?.link || "").trim();
    const cover = (body?.cover || "").trim();
    const isbn13 = (body?.isbn13 || "").trim();
    const genres = Array.isArray(body?.genres) ? body.genres : [];

    if (!title) {
      return NextResponse.json({ ok: false, message: "title is required" }, { status: 400 });
    }

    const properties: Record<string, any> = {};

    // ✅ 무조건 title 프로퍼티는 meta.titlePropName에 넣는다 (노션 UI의 "이름" 컬럼)
    properties[meta.titlePropName] = makeTitle(title);

    // 아래는 DB에 그 이름의 프로퍼티가 “있을 때만” 넣음
    if (author) {
      if (hasProp(meta, "저자")) properties["저자"] = makeRichText(author);
      else if (hasProp(meta, "작가")) properties["작가"] = makeRichText(author);
      else if (hasProp(meta, "author")) properties["author"] = makeRichText(author);
    }

    if (link) {
      if (hasProp(meta, "링크")) properties["링크"] = makeUrl(link);
      else if (hasProp(meta, "link")) properties["link"] = makeUrl(link);
    }

    if (isbn13) {
      if (hasProp(meta, "ISBN13")) properties["ISBN13"] = makeRichText(isbn13);
      else if (hasProp(meta, "isbn13")) properties["isbn13"] = makeRichText(isbn13);
    }

    if (cover) {
      if (hasProp(meta, "표지")) properties["표지"] = makeFilesExternal(cover, "cover");
      else if (hasProp(meta, "cover")) properties["cover"] = makeFilesExternal(cover, "cover");
    }

    if (genres.length) {
      if (hasProp(meta, "장르")) properties["장르"] = makeMultiSelect(genres);
    }

    // 상태 기본값: DB에 "상태"가 있고 status 타입이면 "읽고 싶어"로 넣어봄(없으면 그냥 스킵)
    if (hasProp(meta, "상태")) {
      const t = meta.properties["상태"]?.type;
      if (t === "status") properties["상태"] = makeStatusByName("읽고 싶어");
      if (t === "select") properties["상태"] = makeSelectByName("읽고 싶어");
    }

    const page = await notionFetch(`/pages`, {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: meta.databaseId },
        properties,
      }),
    });

    return NextResponse.json({ ok: true, pageId: page?.id, titlePropName: meta.titlePropName });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        message: err?.message ?? String(err),
        status: err?.status ?? 500,
        details: err?.details ?? null,
        debug: err?.debug ?? null,
      },
      { status: err?.status ?? 500 }
    );
  }
}
