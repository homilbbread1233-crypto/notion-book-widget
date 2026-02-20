async function saveToNotion(book: any) {
  try {
    const res = await fetch("/api/notion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: book.title,
        author: book.author,
        link: book.link,
        publisher: book.publisher, // ✅ 출판사 추가
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Notion 저장 실패:", data);
      alert("노션 저장 실패");
      return;
    }

    alert("노션에 저장됨 ✅");
  } catch (err) {
    console.error(err);
    alert("에러 발생");
  }
}