import { supabase } from "@/lib/supabase";
import type { Paper, Edition, Advertiser } from "@/lib/types";
import Link from "next/link";

export const revalidate = 60;

async function getPapersWithLatestEdition() {
  const { data: papers } = await supabase
    .from("papers")
    .select("*")
    .order("name");

  if (!papers) return [];

  const results = [];
  for (const paper of papers as Paper[]) {
    const { data: editions } = await supabase
      .from("editions")
      .select("*")
      .eq("paper_id", paper.id)
      .order("date", { ascending: false })
      .limit(1);

    const { count } = await supabase
      .from("ads")
      .select("*", { count: "exact", head: true })
      .in(
        "page_id",
        (
          await supabase
            .from("pages")
            .select("id")
            .in(
              "edition_id",
              (
                await supabase
                  .from("editions")
                  .select("id")
                  .eq("paper_id", paper.id)
              ).data?.map((e) => e.id) ?? []
            )
        ).data?.map((p) => p.id) ?? []
      );

    results.push({
      paper,
      latestEdition: (editions as Edition[])?.[0] ?? null,
      totalAds: count ?? 0,
    });
  }

  return results;
}

async function getTopAdvertisers() {
  const { data } = await supabase
    .from("advertisers")
    .select("*")
    .order("total_ad_count", { ascending: false })
    .limit(10);

  return (data as Advertiser[]) ?? [];
}

export default async function Dashboard() {
  const papers = await getPapersWithLatestEdition();
  const topAdvertisers = await getTopAdvertisers();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      {papers.length === 0 ? (
        <p className="text-gray-500">
          No papers found. Run the backend scraper to populate data.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {papers.map(({ paper, latestEdition, totalAds }) => (
            <Link
              key={paper.id}
              href={`/${paper.slug}`}
              className="block bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <h2 className="text-xl font-semibold mb-2">{paper.name}</h2>
              <div className="space-y-1 text-sm text-gray-600">
                {latestEdition ? (
                  <>
                    <p>Latest: {latestEdition.date}</p>
                    <p>
                      {latestEdition.page_count} pages,{" "}
                      {latestEdition.ad_count} ads
                    </p>
                  </>
                ) : (
                  <p>No editions yet</p>
                )}
                <p className="font-medium text-gray-900">
                  {totalAds} total ads tracked
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {topAdvertisers.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Top Advertisers</h2>
            <Link href="/advertisers" className="text-sm text-blue-600 hover:text-blue-800">
              View all →
            </Link>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Advertiser</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Papers</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total Ads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topAdvertisers.map((adv) => (
                  <tr key={adv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/advertisers/${adv.id}`} className="text-blue-600 hover:text-blue-800">
                        {adv.name}
                      </Link>
                    </td>
                    <td className="text-right px-4 py-3 text-gray-600">{adv.paper_count}</td>
                    <td className="text-right px-4 py-3 text-gray-600">{adv.total_ad_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
