import { BOOK_PAGES, BOOK_TOTAL_PAGES } from "@/features/book/book-manifest";
import { BookIndexClient } from "@/features/study/book-index-client";

export default function BookPage() {
  return (
    <BookIndexClient
      pages={BOOK_PAGES.map(({ number, slug, title, kind, summary }) => ({ number, slug, title, kind, summary }))}
      totalPages={BOOK_TOTAL_PAGES}
    />
  );
}
