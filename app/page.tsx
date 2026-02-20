"use client";

import { useState } from "react";

type Book = {
  title: string;
  author: string;
  link: string;
  publisher?: string;
  cover?: string; // ✅ 표지 URL
};

export default function Page() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Book[]>([]);

  async function handleSearch() {
    const keyword = q.trim();
    if (!keyword) return;

    try {
      setLoading(true);

      const res = await fetch(`/api/search?q=${encodeURIComponent(keyword)}`);
      const data = await res.json();

      const items = (data?.books ?? []) as any[];

      const mapped: Book[] = Array.isArray(items)
        ? items.map((it) => ({
            title: it.title ?? "",
            author: it.author ?? "",
            link: it.link ?? "",
            publisher: it.publisher ?? "",
            cover: it.cover ?? it.coverUrl ?? it.image ?? "", // ✅ cover 매핑
          }))
        : [];

      setResults(mapped);
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function saveToNotion(book: Book) {
    try {
      const res = await fetch("/api/notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: book.title,
          author: book.author,
          link: book.link,
          publisher: book.publisher ?? "",
          // cover도 노션에 저장하고 싶으면 route.ts/DB도 같이 맞춰야 함 (지금은 UI만)
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Notion 저장 실패:", data);
        alert("노션 저장 실패");
        return;
      }

      alert("노션에 저장됨 ✅");
    } catch (e) {
      console.error(e);
      alert("저장 중 에러 발생");
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          style={styles.searchRow}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="책 제목/저자를 입력하세요"
            style={styles.input}
          />
          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? "검색 중..." : "검색"}
          </button>
        </form>

        <div style={styles.results}>
          {results.length > 0 &&
            results.map((book, idx) => (
              <div key={`${book.link}-${idx}`} style={styles.card}>
                {/* ✅ 표지 */}
                <div style={styles.coverWrap}>
                  {book.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={book.cover}
                      alt=""
                      style={styles.coverImg}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div style={styles.coverPlaceholder} />
                  )}
                </div>

                <div style={styles.cardMid}>
                  <div style={styles.title}>{book.title || "(제목 없음)"}</div>
                  <div style={styles.meta}>
                    {book.author ? book.author : ""}
                    {book.publisher ? ` · ${book.publisher}` : ""}
                  </div>

                  {book.link ? (
                    <a
                      href={book.link}
                      target="_blank"
                      rel="noreferrer"
                      style={styles.link}
                    >
                      링크
                    </a>
                  ) : null}
                </div>

                <button
                  type="button"
                  style={styles.saveBtn}
                  onClick={() => saveToNotion(book)}
                >
                  노션에 저장
                </button>
              </div>
            ))}
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    padding: "48px 16px",
    background: "#fff",
  },
  container: {
    width: "100%",
    maxWidth: 860,
  },
  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  input: {
    width: 320,
    height: 52,
    padding: "0 18px",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    fontSize: 16,
    outline: "none",
    background: "#fff",
  },
  button: {
    height: 52,
    padding: "0 18px",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
    fontSize: 16,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  results: {
    marginTop: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  card: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: 16,
    border: "1px solid #eef0f3",
    borderRadius: 14,
    background: "#fff",
  },

  coverWrap: {
    width: 56,
    height: 80,
    borderRadius: 10,
    overflow: "hidden",
    flexShrink: 0,
    border: "1px solid #eef0f3",
    background: "#fff",
  },
  coverImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  coverPlaceholder: {
    width: "100%",
    height: "100%",
    background: "#f3f4f6",
  },

  cardMid: {
    minWidth: 0,
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    marginTop: 6,
    fontSize: 13,
    color: "#6b7280",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  link: {
    display: "inline-block",
    marginTop: 8,
    fontSize: 13,
    color: "#2563eb",
    textDecoration: "none",
  },
  saveBtn: {
    height: 40,
    padding: "0 14px",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
};