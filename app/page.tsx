"use client";

import { useState } from "react";

type Book = {
  title: string;
  author: string;
  link: string;
  publisher?: string;
};

export default function Page() {
  const [q, setQ] = useState("");

  async function saveToNotion(book: Book) {
    const res = await fetch("/api/notion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(book),
    });
    const data = await res.json();
    if (!res.ok) console.error(data);
    else alert("저장됨 ✅");
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>도서 검색/추가</h1>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="책 제목/저자를 입력하세요"
          style={{ padding: 10, width: 320, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <button
          onClick={() =>
            saveToNotion({
              title: q || "테스트 제목",
              author: "테스트 저자",
              link: "https://example.com",
              publisher: "테스트 출판사",
            })
          }
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc" }}
        >
          테스트 저장
        </button>
      </div>
    </main>
  );
}