"use client";

import { useState } from "react";

type Book = {
  title: string;
  author: string;
  link: string;
  publisher?: string;
};

export default function Page() {
  const [saving, setSaving] = useState(false);

  async function saveToNotion(book: Book) {
    try {
      setSaving(true);

      const res = await fetch("/api/notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: book.title,
          author: book.author,
          link: book.link,
          publisher: book.publisher ?? "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Notion 저장 실패:", data);
        alert("노션 저장 실패");
        return;
      }

      alert("노션에 저장됨 ✅");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      {/* ✅ 여기 아래에 기존 검색 UI/리스트를 넣어 */}
      {/* 예: <button onClick={() => saveToNotion(item)} disabled={saving}>노션에 저장</button> */}
    </main>
  );
}