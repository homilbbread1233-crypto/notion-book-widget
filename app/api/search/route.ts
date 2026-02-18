import { NextResponse } from "next/server";

type Book = {
  title: string;
  author: string;
  link: string;
  cover: string;
  isbn13?: string;
};

function pickFirstString(v: any): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : "";
  return "";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    if (!q) {
      return NextResponse.json({ ok: false, message: "q is required" }, { status: 400 });
    }

    // ✅ ALADIN_KEY / ALADIN_TTB_KEY 둘 다 허용
    const ttbKey = (process.env.ALADIN_TTB_KEY || process.env.ALADIN_KEY || "").trim();
    if (!ttbKey) {
      return NextResponse.json(
        { ok: false, message: "ALADIN_KEY (or ALADIN_TTB_KEY) is missing in .env.local" },
        { status: 500 }
      );
    }

    const url =
      `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx` +
      `?ttbkey=${encodeURIComponent(ttbKey)}` +
      `&Query=${encodeURIComponent(q)}` +
      `&QueryType=Title` +
      `&MaxResults=10` +
      `&start=1` +
      `&SearchTarget=Book` +
      `&output=js` +
      `&Version=20131101` +
      `&Cover=MidBig`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, message: `Aladin search failed (${r.status})` },
        { status: 500 }
      );
    }

    const data = await r.json();
    const items = Array.isArray(data?.item) ? data.item : [];

    const books: Book[] = items.map((it: any) => ({
      title: pickFirstString(it?.title),
      author: pickFirstString(it?.author),
      link: pickFirstString(it?.link),
      cover: pickFirstString(it?.cover),
      isbn13: pickFirstString(it?.isbn13) || undefined,
    }));

    return NextResponse.json({ ok: true, books });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
