import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Research Workspace",
  description: "基于 RAG 的智能 URL 研究助手",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="h-full flex flex-col overflow-hidden">{children}</body>
    </html>
  );
}
