import { notFound } from "next/navigation";
import { BOOK_PAGES } from "@/features/book/book-manifest";
import { Page001Cover } from "@/features/book/page-001-cover";

export function generateStaticParams() {
  return BOOK_PAGES
    .filter((page) => page.status === "complete")
    .map((page) => ({ page: page.slug }));
}

export default async function BookSourcePage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;

  if (page === "1") {
    return <Page001Cover />;
  }

  notFound();
}
