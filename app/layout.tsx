import "./globals.css";

export const metadata = {
  title: "노션 도서 위젯",
  description: "도서 검색 후 노션 DB에 저장",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
