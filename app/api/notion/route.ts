import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SaveBody = {
  title: string;
  author: string;
  link: string;
  cover?: string;
  publisher?: string;
  isbn13?: string;
};

async function lookupPublisherByIsbn13(isbn13: string): Promise<string | null> {
  const ttbKey = process.env.ALADIN_TTB_KEY;
  if (!ttbKey) return null;

  const url =
    "https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx" +
    `?ttbkey=${encodeURIComponent(ttbKey)}` +
    `&itemIdType=ISBN13` +
    `&ItemId=${encodeURIComponent(isbn13)}` +
    `&output=js` +
    `&Version=20131101`;

  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("[ItemLookUp] non-json response:", text.slice(0, 300));
    return null;
  }

  const item = Array.isArray(json?.item) ? json.item[0] : null;
  const publisher = item?.publisher ? String(item.publisher).trim() : "";
  return publisher || null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SaveBody;

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const DATABASE_ID = process.env.NOTION_DATABASE_ID;

    if (!NOTION_TOKEN) {
      return NextResponse.json({ ok: false, message: "Missing NOTION_TOKEN" }, { status: 500 });
    }
    if (!DATABASE_ID) {
      return NextResponse.json({ ok: false, message: "Missing NOTION_DATABASE_ID" }, { status: 500 });
    }

    const { title, author, link, cover, publisher, isbn13 } = body;

    if (!title || !author || !link) {
      return NextResponse.json(
        { ok: false, message: "Missing required fields (title/author/link)" },
        { status: 400 }
      );
    }

    // ✅ 출판사 보강
    let finalPublisher = publisher?.trim();
    if (!finalPublisher && isbn13) {
      finalPublisher = await lookupPublisherByIsbn13(isbn13);
    }

    // ✅ Notion properties (DB 속성명과 정확히 일치해야 함)
    const properties: any = {
      제목: { title: [{ text: { content: title } }] },
      저자: { rich_text: [{ text: { content: author } }] },
      링크: { url: link },
    };

    // ✅ ISBN13 저장 (노션 속성명이 "ISBN13"이고 텍스트일 때)
    if (isbn13) {
      properties["ISBN13"] = {
        rich_text: [{ text: { content: isbn13 } }],
      };
    }

    // 출판사
    if (finalPublisher) {
      properties["출판사"] = {
        rich_text: [{ text: { content: finalPublisher } }],
      };
    }

    // 표지
    if (cover) {
      properties["표지"] = {
        files: [{ name: "cover", external: { url: cover } }],
      };
    }

    const notionRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        // ✅ 반드시 백틱 두 개(열고/닫고)
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent: { database_id: DATABASE_ID },
        properties,
      }),
    });

    const data = await notionRes.json().catch(() => ({} as any));

    if (!notionRes.ok) {
      console.error("Notion API error:", data);
      return NextResponse.json({ ok: false, message: "Notion error", error: data }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, message: "Server error" }, { status: 500 });
  }
}