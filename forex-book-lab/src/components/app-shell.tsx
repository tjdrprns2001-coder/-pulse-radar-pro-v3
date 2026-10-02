import Link from "next/link";
import type { ReactNode } from "react";

const nav = [
  ["Home", "/"],
  ["Book", "/book"],
  ["Chart Lab", "/chart-lab"],
  ["Scanner", "/scanner"],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">FOREX <span>BOOK</span> LAB</div>
        <nav className="nav" aria-label="Primary navigation">
          {nav.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <strong>New Build</strong>
          <div className="status"><span className="dot" />Skeleton v0.1</div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
