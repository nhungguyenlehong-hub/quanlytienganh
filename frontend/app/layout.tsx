import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "LingoPress — Read the world. Learn the language.",
  description:
    "Đọc báo BBC, tra từ trong ngữ cảnh và luyện đọc song ngữ mỗi ngày.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
