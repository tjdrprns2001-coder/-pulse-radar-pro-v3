import { notFound } from "next/navigation";
import { BOOK_PAGES } from "@/features/book/book-manifest";
import { Page001Cover } from "@/features/book/page-001-cover";
import { Page002Introduction } from "@/features/book/page-002-introduction";
import { Page003Contents } from "@/features/book/page-003-contents";
import { Page004Contents } from "@/features/book/page-004-contents";

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

  if (page === "1") return <Page001Cover />;
  if (page === "2") return <Page002Introduction />;
  if (page === "3") return <Page003Contents />;
  if (page === "4") return <Page004Contents />;

  notFound();
}
