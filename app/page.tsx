"use client";

import React, { useMemo, useState } from "react";

type Book = {
  title: string;
  author: string;
  link: string;
  cover: string;
  isbn13?: string;
};

export default function Home() {
  const [q, setQ] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");
  const [savingKey, setSavingKey] = useState<string>("");

  const hasSearched = useMemo(() => q.trim().length > 0, [q]);

  async function onSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const query = q.trim();
    if (!query) return;

    setLoading(true);
    setErrMsg("");
    setBooks([]);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setErrMsg(data?.message || `Search failed (${res.status})`);
        return;
      }

      setBooks(Array.isArray(data?.books) ? data.books : []);
    } catch (e: any) {
      setErrMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveToNotion(book: Book) {
    const key = book.isbn13 || book.link || `${book.title}-${book.author}`;
    setSavingKey(key);
    setErrMsg("");

    try {
      const res = await fetch("/api/notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: book.title,
          author: book.author,
          link: book.link,
          cover: book.cover,
          isbn13: book.isbn13,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErrMsg(data?.message || `Notion save failed (${res.status})`);
        return;
      }
    } catch (e: any) {
      setErrMsg(e?.message ?? String(e));
    } finally {
      setSavingKey("");
    }
  }

  return (
    <main style={{ maxWidth: 920, margin: "60px auto", padding: "0 16px" }}>
      <h1 style={{ textAlign: "center", fontSize: 34, marginBottom: 18 }}>
        
      </h1>

      <form
        onSubmit={onSearch}
        style={{ display: "flex", justifyContent: "center", gap: 10 }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="책 제목/저자를 입력하세요"
          style={{
            width: 320,
            height: 44,
            padding: "0 14px",
            borderRadius: 8,
            border: "1px solid #ccc",
            fontSize: 16,
          }}
        />
        <button
          type="submit"
          style={{
            height: 44,
            padding: "0 16px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "white",
            cursor: "pointer",
          }}
          disabled={loading}
        >
          {loading ? "검색중..." : "검색"}
        </button>
      </form>

      {errMsg ? (
        <p style={{ textAlign: "center", color: "crimson", marginTop: 12 }}>
          {errMsg}
        </p>
      ) : null}

      {!loading && hasSearched && books.length === 0 && !errMsg ? (
        <p style={{ textAlign: "center", color: "#888", marginTop: 12 }}>
          검색 결과가 없습니다.
        </p>
      ) : null}

      <section style={{ marginTop: 22, display: "grid", gap: 14 }}>
        {books.map((b, idx) => {
          const key = b.isbn13 || b.link || `${b.title}-${idx}`; // ✅ 중복 key 경고 방지
          const saving = savingKey === (b.isbn13 || b.link || `${b.title}-${b.author}`);

          return (
            <article
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 14,
              }}
            >
              {b.cover ? (
                <img
                  src={b.cover}
                  alt={b.title}
                  style={{
                    width: 72,
                    height: 96,
                    objectFit: "cover",
                    borderRadius: 8,
                    border: "1px solid #eee",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 72,
                    height: 96,
                    borderRadius: 8,
                    border: "1px solid #eee",
                  }}
                />
              )}

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{b.title}</div>
                <div style={{ color: "#666", marginTop: 4 }}>{b.author}</div>
                {b.link ? (
                  <div style={{ marginTop: 6 }}>
                    <a href={b.link} target="_blank" rel="noreferrer">
                      링크
                    </a>
                  </div>
                ) : null}
              </div>

              <button
                onClick={() => saveToNotion(b)}
                disabled={!!savingKey}
                style={{
                  height: 38,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "white",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {saving ? "저장중..." : "노션에 저장"}
              </button>
            </article>
          );
        })}
      </section>
    </main>
  );
}
