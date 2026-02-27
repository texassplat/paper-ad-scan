"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase, getImageUrl } from "@/lib/supabase";
import type { Paper, Edition, PageWithAds, Ad } from "@/lib/types";
import Link from "next/link";
import PageViewer from "@/components/PageViewer";
import AdCard from "@/components/AdCard";
import AdTable from "@/components/AdTable";

export default function EditionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.paper as string;
  const date = params.date as string;
  const targetPage = searchParams.get("page");

  const [paper, setPaper] = useState<Paper | null>(null);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [pages, setPages] = useState<PageWithAds[]>([]);
  const [selectedPage, setSelectedPage] = useState<PageWithAds | null>(null);
  const [view, setView] = useState<"pages" | "all-ads">("pages");
  const [filterText, setFilterText] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Get paper
      const { data: paperData } = await supabase
        .from("papers")
        .select("*")
        .eq("slug", slug)
        .single();
      setPaper(paperData);

      if (!paperData) return;

      // Get edition
      const { data: editionData } = await supabase
        .from("editions")
        .select("*")
        .eq("paper_id", paperData.id)
        .eq("date", date)
        .single();
      setEdition(editionData);

      if (!editionData) return;

      // Get pages with ads
      const { data: pagesData } = await supabase
        .from("pages")
        .select("*")
        .eq("edition_id", editionData.id)
        .order("page_num");

      if (!pagesData) return;

      // Get all ads for these pages
      const pageIds = pagesData.map((p) => p.id);
      const { data: adsData } = await supabase
        .from("ads")
        .select("*")
        .in("page_id", pageIds);

      // Combine pages with their ads
      const pagesWithAds: PageWithAds[] = pagesData.map((page) => ({
        ...page,
        ads: (adsData ?? []).filter((ad: Ad) => ad.page_id === page.id),
      }));

      setPages(pagesWithAds);
      if (pagesWithAds.length > 0) {
        // Jump to specific page if ?page=N in URL
        const target = targetPage
          ? pagesWithAds.find((p) => p.page_num === parseInt(targetPage))
          : null;
        setSelectedPage(target ?? pagesWithAds[0]);
      }
      setLoading(false);
    }

    load();
  }, [slug, date, targetPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!paper || !edition) {
    return <p className="text-gray-500">Edition not found.</p>;
  }

  const allAds = pages.flatMap((p) =>
    p.ads.map((ad) => ({ ...ad, page_num: p.page_num, section: p.section }))
  );

  const filteredAds = filterText
    ? allAds.filter(
        (ad) =>
          ad.advertiser.toLowerCase().includes(filterText.toLowerCase()) ||
          ad.section?.toLowerCase().includes(filterText.toLowerCase())
      )
    : allAds;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link href="/" className="text-blue-600 hover:underline">
          Dashboard
        </Link>
        <span className="text-gray-400">/</span>
        <Link href={`/${slug}`} className="text-blue-600 hover:underline">
          {paper.name}
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-600">{date}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {paper.name} — {date}
          </h1>
          <p className="text-gray-500">
            {edition.page_count} pages, {edition.ad_count} ads
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView("pages")}
            className={`px-4 py-2 rounded text-sm font-medium ${
              view === "pages"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Page View
          </button>
          <button
            onClick={() => setView("all-ads")}
            className={`px-4 py-2 rounded text-sm font-medium ${
              view === "all-ads"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All Ads
          </button>
        </div>
      </div>

      {view === "all-ads" ? (
        <div>
          <input
            type="text"
            placeholder="Filter by advertiser or section..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full max-w-md mb-4 px-3 py-2 border border-gray-300 rounded text-sm"
          />
          <AdTable ads={filteredAds} />
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Left: page thumbnails */}
          <div className="w-24 shrink-0 space-y-2 max-h-[80vh] overflow-y-auto">
            {pages.map((page) => (
              <button
                key={page.id}
                onClick={() => setSelectedPage(page)}
                className={`w-full rounded border-2 overflow-hidden ${
                  selectedPage?.id === page.id
                    ? "border-blue-500"
                    : "border-transparent hover:border-gray-300"
                }`}
              >
                {page.image_path ? (
                  <img
                    src={getImageUrl(page.image_path)}
                    alt={`Page ${page.page_num}`}
                    className="w-full"
                  />
                ) : (
                  <div className="w-full aspect-[3/4] bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                    {page.page_num}
                  </div>
                )}
                <div className="text-xs text-center py-1 bg-white">
                  P{page.page_num}
                  {page.ads.length > 0 && (
                    <span className="ml-1 text-blue-600">
                      ({page.ads.length})
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Right: selected page + ads */}
          <div className="flex-1 min-w-0">
            {selectedPage && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PageViewer
                  imageUrl={
                    selectedPage.image_path
                      ? getImageUrl(selectedPage.image_path)
                      : null
                  }
                  pageNum={selectedPage.page_num}
                  section={selectedPage.section}
                />
                <div>
                  <h3 className="font-semibold mb-3">
                    Ads on Page {selectedPage.page_num}
                    {selectedPage.section && (
                      <span className="font-normal text-gray-500 ml-2">
                        ({selectedPage.section})
                      </span>
                    )}
                  </h3>
                  {selectedPage.ads.length === 0 ? (
                    <p className="text-gray-500 text-sm">
                      No ads found on this page.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {selectedPage.ads.map((ad) => (
                        <AdCard key={ad.id} ad={ad} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
