export const BOOK_TOTAL_PAGES = 406;

export type BookPageMeta = {
  number: number;
  slug: string;
  title: string;
  kind: "cover" | "lesson";
  status: "complete" | "queued";
  source: string;
};

export const BOOK_PAGES: BookPageMeta[] = [
  {
    number: 1,
    slug: "1",
    title: "All You Should Know About Forex",
    kind: "cover",
    status: "complete",
    source: "All you should know about Forex-1-200.pdf",
  },
];

export function getBookPage(number: number) {
  return BOOK_PAGES.find((page) => page.number === number);
}
