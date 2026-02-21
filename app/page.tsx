"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Book = {
  title: string;
  author: string;
  link: string;
  cover?: string;
  publisher?: string;
  isbn13?: string;
};

type SearchResponse = {
  ok?: boolean;
  books?: any[]; // { ok: true, books: [...] }
  error?: string;
  message?: string;
};

export default function Page() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const canSearch = useMemo(() => query.trim().length > 0, [query]);

  const normalizeBook = (raw: any): Book => ({
    title: String(raw?.title ?? "").trim(),
    author: String(raw?.author ?? "").trim(),
    link: String(raw?.link ?? raw?.itemUrl ?? "").trim(),
    cover: raw?.cover ?? raw?.coverUrl ?? raw?.image ?? undefined,
    publisher: raw?.publisher ?? raw?.pub ?? undefined,
    isbn13: raw?.isbn13 ?? raw?.isbn ?? undefined,
  });

  const searchBooks = async () => {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setErrorMsg(null);
    setSubmittedQuery(q);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data: SearchResponse = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        setBooks([]);
        setErrorMsg(data?.error || data?.message || "검색 요청이 실패했어.");
        return;
      }

      const raw = Array.isArray((data as any)?.books) ? (data as any).books : [];
      setBooks(raw.map(normalizeBook).filter((b: Book) => b.title));
    } catch (e: any) {
      setBooks([]);
      setErrorMsg(e?.message || "네트워크 오류가 발생했어.");
    } finally {
      setLoading(false);
    }
  };

  const saveToNotion = async (book: Book) => {
    const key = book.isbn13 || book.link || `${book.title}-${book.author}`;
    setSavingKey(key);
    setErrorMsg(null);

    const payload = {
      title: book.title,
      author: book.author,
      link: book.link,
      cover: book.cover,
      publisher: book.publisher,
      isbn13: book.isbn13,
    };

    try {
      const res = await fetch("/api/notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        setErrorMsg(data?.message || "노션 저장 실패");
        return;
      }

      alert("노션 저장 완료");
    } catch (e: any) {
      setErrorMsg(e?.message || "저장 중 네트워크 오류");
    } finally {
      setSavingKey(null);
    }
  };

  // Enter로 검색
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") searchBooks();
    };

    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <main style={styles.page}>
      <div style={styles.searchWrap}>
        <div style={styles.searchRow}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="책 제목/저자를 입력하세요"
            style={styles.input}
          />
          <button
            onClick={searchBooks}
            disabled={!canSearch || loading}
            style={{
              ...styles.btn,
              ...(canSearch && !loading ? {} : styles.btnDisabled),
            }}
          >
            {loading ? "검색중" : "검색"}
          </button>
        </div>

        {errorMsg && <div style={styles.error}>{errorMsg}</div>}
      </div>

      {/* 결과 */}
      <section style={styles.results}>
        {submittedQuery && (
          <div style={styles.hint}>
            검색어: <b>{submittedQuery}</b>
          </div>
        )}

        {books.length === 0 && !loading && !errorMsg && submittedQuery && (
          <div style={styles.empty}>검색 결과가 없어.</div>
        )}

        <div style={styles.list}>
          {books.map((b, idx) => {
            const key = b.isbn13 || b.link || `${b.title}-${b.author}-${idx}`;
            const isSaving = savingKey === key;

            return (
              <div key={key} style={styles.item}>
                <div style={styles.left}>
                  <div style={styles.title} title={b.title}>
                    {b.title}
                  </div>
                  <div style={styles.meta}>
                    <span>{b.author || "저자 정보 없음"}</span>
                    <span style={styles.dot}>•</span>
                    <span>{b.publisher || "출판사 정보 없음"}</span>
                  </div>
                  <div style={styles.actions}>
                    <a href={b.link} target="_blank" rel="noreferrer" style={styles.link}>
                      링크
                    </a>
                    <button
                      onClick={() => saveToNotion(b)}
                      disabled={isSaving}
                      style={{ ...styles.save, ...(isSaving ? styles.saveDisabled : {}) }}
                    >
                      {isSaving ? "저장 중" : "노션에 저장"}
                    </button>
                  </div>
                </div>

                <div style={styles.coverBox}>
                  {b.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.cover} alt="" style={styles.cover} />
                  ) : (
                    <div style={styles.noCover}>No Image</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

const BORDER_COLOR = "rgba(0,0,0,0.18)"; // ✅ 검색창 테두리 색 기준(버튼 테두리/버튼 글자도 동일)

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    paddingTop: 80,
    paddingLeft: 16,
    paddingRight: 16,
  },

  searchWrap: {
    width: "100%",
    maxWidth: 680,
  },
  searchRow: {
    display: "flex",
    gap: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  // ✅ 요청: 검색창 가로 320으로 고정
  input: {
    width: 320,
    height: 56,
    borderRadius: 16,
    border: `1px solid ${BORDER_COLOR}`,
    background: "#fff",
    padding: "0 18px",
    fontSize: 16,
    outline: "none",
    boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
  },

  // ✅ 요청: 버튼 테두리 색 = 검색창 테두리 색, 버튼 글자 색도 동일하게
  btn: {
    height: 56,
    minWidth: 92,
    padding: "0 18px",
    borderRadius: 16,
    border: `1px solid ${BORDER_COLOR}`,
    background: "#fff",
    cursor: "pointer",
    fontSize: 16,
    color: BORDER_COLOR, // ✅ 글자색 통일
    fontWeight: 600,
    boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
    whiteSpace: "nowrap",
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },

  error: {
    marginTop: 12,
    fontSize: 13,
    color: "rgba(255,0,0,0.8)",
    textAlign: "center",
  },

  results: {
    width: "100%",
    maxWidth: 680,
    marginTop: 26,
  },
  hint: {
    fontSize: 13,
    color: "rgba(0,0,0,0.55)",
    marginBottom: 10,
  },
  empty: {
    padding: 14,
    borderRadius: 14,
    border: "1px dashed rgba(0,0,0,0.15)",
    color: "rgba(0,0,0,0.6)",
    fontSize: 14,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  item: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    padding: 14,
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#fff",
    boxShadow: "0 2px 10px rgba(0,0,0,0.02)",
  },
  left: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: "rgba(0,0,0,0.85)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    fontSize: 12,
    color: "rgba(0,0,0,0.6)",
    display: "flex",
    gap: 8,
    alignItems: "center",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  dot: {
    opacity: 0.5,
  },
  actions: {
    display: "flex",
    gap: 8,
    marginTop: 2,
  },
  link: {
    height: 34,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    color: "rgba(0,0,0,0.75)",
    fontSize: 13,
    background: "#fff",
    whiteSpace: "nowrap",
  },
  save: {
    height: 34,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(0,0,0,0.92)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  saveDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },
  coverBox: {
    width: 56,
    height: 80,
    borderRadius: 14,
    overflow: "hidden",
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(0,0,0,0.03)",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cover: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  noCover: {
    fontSize: 11,
    opacity: 0.6,
  },
};