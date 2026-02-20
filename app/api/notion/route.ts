import { NextRequest, NextResponse } from "next/server";

const NOTION_TOKEN = process.env.NOTION_API_KEY!;
const NOTION_DB_ID = process.env.NOTION_DATABASE_ID!;
const NOTION_VERSION = process.env.NOTION_VERSION ?? "2022-06-28";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: NextRequest) {
  try {
    // ✅ env 체크
    if (!NOTION_TOKEN)
      return json({ ok: false, message: "Missing NOTION_TOKEN" }, 500);

    if (!NOTION_DB_ID)
      return json({ ok: false, message: "Missing NOTION_DB_ID" }, 500);

    // ✅ 프론트에서 보낸 데이터 받기
    const { title, author, link, publisher } = await req.json();

    // ✅ Notion properties
    const properties = {
      제목: {
        title: [
          {
            text: { content: title },
          },
        ],
      },
      저자: {
        rich_text: [
          {
            text: { content: author },
          },
        ],
      },
      링크: {
        url: link,
      },
      출판사: {
        rich_text: [
          {
            text: { content: publisher ?? "" },
          },
        ],
      },
    };

    // ✅ Notion API 호출
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DB_ID },
        properties,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return json({ ok: false, details: data }, res.status);
    }

    return json({ ok: true, pageId: data.id });
  } catch (e: any) {
    return json(
      {
        ok: false,
        message: e.message ?? "Unknown error",
      },
      500
    );
  }
}