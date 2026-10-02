export const BOOK_TOTAL_PAGES = 406;

export type BookPageMeta = {
  number: number;
  slug: string;
  title: string;
  kind: "cover" | "lesson" | "contents";
  status: "complete" | "queued";
  source: string;
  summary: string;
};

export const BOOK_PAGES: BookPageMeta[] = [
  {
    number: 1,
    slug: "1",
    title: "All You Should Know About Forex",
    kind: "cover",
    status: "complete",
    source: "All you should know about Forex-1-200.pdf",
    summary: "Book cover and visual identity.",
  },
  {
    number: 2,
    slug: "2",
    title: "Introduction",
    kind: "lesson",
    status: "complete",
    source: "All you should know about Forex-1-200.pdf",
    summary: "Beginner orientation, learning goals, expectations, and continuous learning mindset.",
  },
  {
    number: 3,
    slug: "3",
    title: "Contents",
    kind: "contents",
    status: "complete",
    source: "All you should know about Forex-1-200.pdf",
    summary: "Structured table of contents for Forex Market Basics, Psychology in Forex, and Major Players.",
  },
];

export function getBookPage(number: number) {
  return BOOK_PAGES.find((page) => page.number === number);
}
