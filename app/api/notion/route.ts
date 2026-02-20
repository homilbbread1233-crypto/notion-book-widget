import { NextRequest, NextResponse } from "next/server";

const NOTION_TOKEN = process.env.NOTION_API_KEY!;
const NOTION_DB_ID = process.env.NOTION_DATABASE_ID!;
const NOTION_VERSION = process.env.NOTION_VERSION ?? "2022-06-28";

type NotionDatabase = {
  id: string;
  properties: Record<
    string,
    {
      id: string;
      name: string;
      type: string;
      // 아래는 type별로 달라서 any로 둠
      [k: string]: any;
    }
  >;
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

async function notionFetch(path: string, init?: RequestInit) {
  const url = `https://api.notion.com/v1${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (!res.ok) {
    const e: any = new Error(body?.message ?? `Notion API error (${res.status})`);
    e.status = res.status;
    e.details = body;
    throw e;
  }

  return body;
}

async function getDatabase(): Promise<NotionDatabase> {
  const db = await notionFetch(`/databases/${NOTION_DB_ID}`, { method: "GET" });
  if (!db?.properties || typeof db.properties !== "object") {
    const e: any = new Error("Database properties not found (retrieve returned unexpected shape)");
    e.status = 500;
    e.details = { dbKeys: db ? Object.keys(db) : null };
    throw e;
  }
  return db as NotionDatabase;
}

/**
 * DB의 property type에 맞춰 Notion "properties" payload를 구성.
 * - 존재하지 않는 속성은 자동으로 스킵
 * - status는 "옵션 이름"이 DB에 없으면 자동 fallback(첫 옵션) 또는 스킵
 * - select/multi_select도 옵션 없으면 자동 필터링
 */
function buildProperties(db: NotionDatabase, input: Record<string, any>) {
  const props: any = {};

  const propDefs = db.properties;

  const setProp = (propName: string, value: any) => {
    const def = propDefs[propName];
    if (!def) return; // DB에 없으면 스킵

    const type = def.type;

    // 빈 값 처리 (필요시 저장하고 싶으면 여기 로직 바꾸면 됨)
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0)
    ) {
      return;
    }

    switch (type) {
      case "title": {
        props[propName] = {
          title: [{ text: { content: String(value) } }],
        };
        return;
      }
      case "rich_text": {
        props[propName] = {
          rich_text: [{ text: { content: String(value) } }],
        };
        return;
      }
      case "url": {
        props[propName] = { url: String(value) };
        return;
      }
      case "date": {
        // value: ISO string or { start, end }
        if (typeof value === "string") {
          props[propName] = { date: { start: value } };
        } else if (value?.start) {
          props[propName] = { date: { start: value.start, end: value.end ?? null } };
        }
        return;
      }
      case "number": {
        const n = typeof value === "number" ? value : Number(value);
        if (!Number.isNaN(n)) props[propName] = { number: n };
        return;
      }
      case "checkbox": {
        props[propName] = { checkbox: Boolean(value) };
        return;
      }
      case "select": {
        // 옵션 존재하면 사용, 없어도 Notion이 생성해주는 경우가 있어도(환경 따라) 안전하게 필터링
        const wanted = String(value).trim();
        const options: Array<{ name: string }> = def.select?.options ?? [];
        const exists = options.some((o) => o.name === wanted);
        props[propName] = { select: { name: exists ? wanted : wanted } };
        return;
      }
      case "multi_select": {
        const arr = Array.isArray(value) ? value : String(value).split(",").map((s) => s.trim());
        const uniq = Array.from(new Set(arr)).filter(Boolean);
        const options: Array<{ name: string }> = def.multi_select?.options ?? [];
        const allowed = options.length
          ? uniq.filter((name) => options.some((o) => o.name === name))
          : uniq;

        if (allowed.length) props[propName] = { multi_select: allowed.map((name) => ({ name })) };
        return;
      }
      case "status": {
        const wanted = String(value).trim();
        const options: Array<{ name: string }> = def.status?.options ?? [];
        const exists = options.some((o) => o.name === wanted);

        if (exists) {
          props[propName] = { status: { name: wanted } };
          return;
        }

        // ✅ fallback: DB 첫 status 옵션(대개 "읽을래")로 세팅
        const fallback = options[0]?.name;
        if (fallback) {
          props[propName] = { status: { name: fallback } };
        }
        // fallback도 없으면 스킵
        return;
      }
      case "files": {
        // 표지 같이 이미지 URL을 files(external)로 넣고 싶을 때 사용
        // value: string(url) or array of url
        const urls = Array.isArray(value) ? value : [value];
        const files = urls
          .filter(Boolean)
          .map((u) => ({
            type: "external",
            name: "cover",
            external: { url: String(u) },
          }));
        if (files.length) props[propName] = { files };
        return;
      }

      default: {
        // 지원 안 하는 타입은 스킵
        return;
      }
    }
  };

  // ✅ 스샷 기준 속성 이름들 (DB 이름 그대로!)
  // 제목(title) 속성은 DB마다 다르니 "이름"이 title인지 자동으로 찾아서 처리
  const titlePropName =
    Object.keys(propDefs).find((k) => propDefs[k]?.type === "title") ?? "이름";

  // 필수(제목)
  setProp(titlePropName, input.title);

  // 스샷 기반 추천 매핑
  setProp("저자", input.author);
  setProp("장르", input.genre); // multi_select or select든 자동 처리
  setProp("표지", input.cover); // files면 cover URL 들어감
  setProp("링크", input.link); // url
  setProp("ISBN13", input.isbn13); // rich_text면 들어감
  setProp("출판사", input.publisher);
  setProp("유형", input.type);
  setProp("만족도", input.rating); // number or select면 자동 처리(숫자면 number, 문자열이면 select로 바꿔야 함)
  setProp("한 줄 소감", input.oneLiner);
  setProp("독서 시작", input.startDate); // ISO "YYYY-MM-DD" 권장
  setProp("독서 완료", input.endDate);   // ISO
  setProp("독서 현황", input.progress);

  // ✅ 핵심: 상태 옵션이 바뀌었으니, 기본값을 "읽을래"로
  // input.status가 없으면 "읽을래"로 넣고, DB에 없으면 fallback(첫 옵션)
  setProp("상태", input.status ?? "읽을래");

  return props;
}

/**
 * GET /api/notion
 * - 기본: 살아있나 체크
 * - ?debug=1: DB properties와 status 옵션까지 출력(너가 확인하기 편하게)
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";

    const db = await getDatabase();

    if (!debug) {
      return json({ ok: true, message: "notion route alive" });
    }

    // debug: 핵심 정보만 보기 좋게 정리
    const properties = Object.fromEntries(
      Object.entries(db.properties).map(([name, def]) => {
        const base: any = { type: def.type, id: def.id };

        if (def.type === "status") base.options = def.status?.options?.map((o: any) => o.name) ?? [];
        if (def.type === "select") base.options = def.select?.options?.map((o: any) => o.name) ?? [];
        if (def.type === "multi_select")
          base.options = def.multi_select?.options?.map((o: any) => o.name) ?? [];

        return [name, base];
      })
    );

    const titlePropName =
      Object.keys(db.properties).find((k) => db.properties[k]?.type === "title") ?? "";

    return json({
      ok: true,
      databaseId: db.id,
      titlePropName,
      properties,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        message: e?.message ?? "Unknown error",
        status: e?.status ?? 500,
        details: e?.details ?? null,
      },
      e?.status ?? 500
    );
  }
}

/**
 * POST /api/notion
 * body 예시:
 * {
 *   "title": "참을 수 없는 존재의 가벼움",
 *   "author": "밀란 쿤데라",
 *   "genre": ["소설", "철학"],
 *   "cover": "https://...jpg",
 *   "link": "https://...",
 *   "isbn13": "978...",
 *   "status": "읽을래"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getDatabase();

    const properties = buildProperties(db, body);

    const created = await notionFetch(`/pages`, {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: NOTION_DB_ID },
        properties,
      }),
    });

    return json({ ok: true, pageId: created.id, url: created.url });
  } catch (e: any) {
    return json(
      {
        ok: false,
        message: e?.message ?? "Unknown error",
        status: e?.status ?? 500,
        details: e?.details ?? null,
      },
      e?.status ?? 500
    );
  }
}