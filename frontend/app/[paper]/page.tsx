import { supabase } from "@/lib/supabase";
import type { Paper, Edition } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 60;

async function getPaper(slug: string): Promise<Paper | null> {
  const { data } = await supabase
    .from("papers")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

async function getEditions(paperId: number): Promise<Edition[]> {
  const { data } = await supabase
    .from("editions")
    .select("*")
    .eq("paper_id", paperId)
    .order("date", { ascending: false });
  return data ?? [];
}

export default async function PaperPage({
  params,
}: {
  params: Promise<{ paper: string }>;
}) {
  const { paper: slug } = await params;
  const paper = await getPaper(slug);
  if (!paper) notFound();

  const editions = await getEditions(paper.id);

  return (
    <div>
      <div className="mb-6">
        <Link href="/" className="text-blue-600 hover:underline text-sm">
          &larr; Dashboard
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-2">{paper.name}</h1>
      <p className="text-gray-500 mb-8">{editions.length} editions</p>

      {editions.length === 0 ? (
        <p className="text-gray-500">No editions yet.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">
                  Date
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">
                  Pages
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">
                  Ads Found
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {editions.map((edition) => (
                <tr key={edition.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${slug}/${edition.date}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {edition.date}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {edition.page_count}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {edition.ad_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
