import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import "./app.css";
import "./workspace.css";
import "./campus.css";
import "./shared/campus-ai.css";

export const metadata: Metadata = {
  title: "数研 MathFlow · 数学教学工作台",
  description: "数学作业发布、批改审核与学情统计。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
