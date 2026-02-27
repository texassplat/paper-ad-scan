import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paper Ad Scan",
  description: "Multi-newspaper advertisement tracker",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-6">
            <a href="/" className="text-xl font-bold text-gray-900">
              Paper Ad Scan
            </a>
            <nav className="flex gap-4 text-sm">
              <a href="/" className="text-gray-600 hover:text-gray-900">Dashboard</a>
              <a href="/advertisers" className="text-gray-600 hover:text-gray-900">Advertisers</a>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
