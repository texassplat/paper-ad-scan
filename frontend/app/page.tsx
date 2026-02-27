"use client";

import { supabase } from "@/lib/supabase";
import type { Paper, Edition, Ad } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";

interface AdWithContext {
  id: number;
  advertiser: string;
  advertiser_id: number | null;
  description: string;
  size: string;
  confidence: string;
  page_num: number;
  section: string;
  paper_slug: string;
  paper_name: string;
  edition_date: string;
}

export default function Dashboard() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [editions, setEditions] = useState<(Edition & { paper_slug: string })[]>([]);
  const [ads, setAds] = useState<AdWithContext[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedPapers, setSelectedPapers] = useState<Set<number>>(new Set());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Load all papers and editions on mount
  useEffect(() => {
    async function load() {
      const { data: papersData } = await supabase
        .from("papers")
        .select("*")
        .order("name");

      const allPapers = (papersData as Paper[]) ?? [];
      setPapers(allPapers);
      setSelectedPapers(new Set(allPapers.map((p) => p.id)));

      const { data: editionsData } = await supabase
        .from("editions")
        .select("*")
        .order("date", { ascending: false });

      const paperMap = new Map(allPapers.map((p) => [p.id, p]));
      setEditions(
        (editionsData ?? []).map((e: Edition) => ({
          ...e,
          paper_slug: paperMap.get(e.paper_id)?.slug ?? "",
        }))
      );

      // Figure out date range from available editions
      if (editionsData && editionsData.length > 0) {
        const dates = editionsData.map((e: Edition) => e.date).sort();
        setStartDate(dates[0]);
        setEndDate(dates[dates.length - 1]);
      }

      setLoading(false);
    }
    load();
  }, []);

  // Filtered editions based on paper + date selection
  const filteredEditions = useMemo(() => {
    return editions.filter((e) => {
      if (!selectedPapers.has(e.paper_id)) return false;
      if (startDate && e.date < startDate) return false;
      if (endDate && e.date > endDate) return false;
      return true;
    });
  }, [editions, selectedPapers, startDate, endDate]);

  // Load ads when filters change
  useEffect(() => {
    if (filteredEditions.length === 0) {
      setAds([]);
      return;
    }

    async function loadAds() {
      const editionIds = filteredEditions.map((e) => e.id);

      // Get pages for filtered editions
      const { data: pagesData } = await supabase
        .from("pages")
        .select("id, edition_id, page_num, section")
        .in("edition_id", editionIds);

      if (!pagesData || pagesData.length === 0) {
        setAds([]);
        return;
      }

      const pageIds = pagesData.map((p) => p.id);

      // Get ads in batches if needed (supabase has limits on .in())
      let allAdsData: any[] = [];
      const batchSize = 200;
      for (let i = 0; i < pageIds.length; i += batchSize) {
        const batch = pageIds.slice(i, i + batchSize);
        const { data } = await supabase
          .from("ads")
          .select("id, advertiser, advertiser_id, description, size, confidence, page_id")
          .in("page_id", batch);
        if (data) allAdsData.push(...data);
      }

      // Build lookups
      const pageMap = new Map(pagesData.map((p) => [p.id, p]));
      const editionMap = new Map(filteredEditions.map((e) => [e.id, e]));
      const paperMap = new Map(papers.map((p) => [p.id, p]));

      const adsWithContext: AdWithContext[] = allAdsData.map((ad) => {
        const page = pageMap.get(ad.page_id);
        const edition = page ? editionMap.get(page.edition_id) : null;
        const paper = edition ? paperMap.get(edition.paper_id) : null;
        return {
          id: ad.id,
          advertiser: ad.advertiser,
          advertiser_id: ad.advertiser_id,
          description: ad.description,
          size: ad.size,
          confidence: ad.confidence,
          page_num: page?.page_num ?? 0,
          section: page?.section ?? "",
          paper_slug: paper?.slug ?? "",
          paper_name: paper?.name ?? "",
          edition_date: edition?.date ?? "",
        };
      });

      setAds(adsWithContext);
    }

    loadAds();
  }, [filteredEditions, papers]);

  // Aggregate stats
  const totalAds = ads.length;
  const uniqueAdvertisers = useMemo(() => {
    const names = new Set(ads.map((a) => a.advertiser));
    return names.size;
  }, [ads]);

  // Top advertisers from filtered results
  const topAdvertisers = useMemo(() => {
    const counts = new Map<string, { name: string; id: number | null; count: number; papers: Set<string> }>();
    for (const ad of ads) {
      const key = ad.advertiser_id?.toString() ?? ad.advertiser;
      const entry = counts.get(key) ?? { name: ad.advertiser, id: ad.advertiser_id, count: 0, papers: new Set() };
      entry.count++;
      entry.papers.add(ad.paper_name);
      counts.set(key, entry);
    }
    return [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [ads]);

  function togglePaper(id: number) {
    setSelectedPapers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllPapers() {
    setSelectedPapers(new Set(papers.map((p) => p.id)));
  }

  function selectNoPapers() {
    setSelectedPapers(new Set());
  }

  if (loading) {
    return <p className="text-gray-500">Loading...</p>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-8">
        <div className="flex flex-wrap gap-6">
          {/* Date range */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date Range</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          {/* Paper selection */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-xs font-medium text-gray-500">Papers</label>
              <button onClick={selectAllPapers} className="text-xs text-blue-600 hover:text-blue-800">All</button>
              <button onClick={selectNoPapers} className="text-xs text-blue-600 hover:text-blue-800">None</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {papers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePaper(p.id)}
                  className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                    selectedPapers.has(p.id)
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary stats */}
        <div className="flex gap-6 mt-4 pt-3 border-t border-gray-100 text-sm text-gray-600">
          <span><strong className="text-gray-900">{filteredEditions.length}</strong> editions</span>
          <span><strong className="text-gray-900">{totalAds}</strong> ads</span>
          <span><strong className="text-gray-900">{uniqueAdvertisers}</strong> unique advertisers</span>
        </div>
      </div>

      {/* Paper cards */}
      {papers.length === 0 ? (
        <p className="text-gray-500">
          No papers found. Run the backend scraper to populate data.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {papers
            .filter((p) => selectedPapers.has(p.id))
            .map((paper) => {
              const paperEditions = filteredEditions.filter((e) => e.paper_id === paper.id);
              const paperAds = ads.filter((a) => a.paper_name === paper.name);
              const latestEdition = paperEditions[0] ?? null;
              return (
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
                      <p>No editions in range</p>
                    )}
                    <p className="font-medium text-gray-900">
                      {paperAds.length} ads in range ({paperEditions.length} editions)
                    </p>
                  </div>
                </Link>
              );
            })}
        </div>
      )}

      {/* Top Advertisers */}
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
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Ads in Range</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topAdvertisers.map((adv, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {adv.id ? (
                        <Link href={`/advertisers/${adv.id}`} className="text-blue-600 hover:text-blue-800">
                          {adv.name}
                        </Link>
                      ) : (
                        adv.name
                      )}
                    </td>
                    <td className="text-right px-4 py-3 text-gray-600">{adv.papers.size}</td>
                    <td className="text-right px-4 py-3 text-gray-600">{adv.count}</td>
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
