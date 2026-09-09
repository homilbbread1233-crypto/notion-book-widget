import { NextResponse } from "next/server";

type Book = {
  title: string;
  author: string;
  link: string;
  cover: string;
  publisher?: string;
  isbn13?: string;
};

function getIsbn13(isbn: string): string {
  if (!isbn) return "";

  const values = isbn.trim().split(/\s+/);

  return values.find((value) => /^\d{13}$/.test(value)) ?? "";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") || "").trim();

    if (!q) {
      return NextResponse.json(
        { ok: false, message: "q is required" },
        { status: 400 }
      );
    }

    const kakaoKey = (
      process.env.KAKAO_REST_API_KEY || ""
    ).trim();

    if (!kakaoKey) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "KAKAO_REST_API_KEY is missing in .env.local",
        },
        { status: 500 }
      );
    }

    const url = new URL(
      "https://dapi.kakao.com/v3/search/book"
    );

    url.searchParams.set("query", q);
    url.searchParams.set("sort", "accuracy");
    url.searchParams.set("size", "20");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `KakaoAK ${kakaoKey}`,
      },
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Kakao API error:", data);

      return NextResponse.json(
        {
          ok: false,
          message: "Kakao Book API error",
          error: data,
        },
        { status: res.status }
      );
    }

    const documents = Array.isArray(data?.documents)
      ? data.documents
      : [];

    const books: Book[] = documents.map((item: any) => ({
      title: String(item.title ?? "").trim(),

      author: Array.isArray(item.authors)
        ? item.authors.join(", ")
        : "",

      link: String(item.url ?? ""),

      cover: String(item.thumbnail ?? ""),

      publisher: String(item.publisher ?? "").trim(),

      isbn13: getIsbn13(String(item.isbn ?? "")),
    }));

    return NextResponse.json({
      ok: true,
      books,
    });
  } catch (error) {
    console.error("Search error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Server error",
      },
      { status: 500 }
    );
  }
}