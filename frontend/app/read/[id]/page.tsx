import ArticleReader from "@/features/reading/article-reader";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ArticleReader id={id} />;
}
