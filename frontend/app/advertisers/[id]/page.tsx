"use client";

import { supabase } from "@/lib/supabase";
import type { Advertiser, AdvertiserPaper, Paper, Ad } from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface AdWithContext extends Ad {
  page_num: number;
  section: string;
  paper_slug: string;
  paper_name: string;
  edition_date: string;
}

export default function AdvertiserDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [advertiser, setAdvertiser] = useState<Advertiser | null>(null);
  const [papers, setPapers] = useState<(AdvertiserPaper & { paper: Paper })[]>([]);
  const [ads, setAds] = useState<AdWithContext[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Get advertiser
      const { data: advData } = await supabase
        .from("advertisers")
        .select("*")
        .eq("id", id)
        .single();

      if (!advData) {
        setLoading(false);
        return;
      }
      setAdvertiser(advData as Advertiser);

      // Get papers this advertiser appears in
      const { data: apData } = await supabase
        .from("advertiser_papers")
        .select("*")
        .eq("advertiser_id", id)
        .order("ad_count", { ascending: false });

      if (apData && apData.length > 0) {
        const paperIds = apData.map((ap) => ap.paper_id);
        const { data: paperData } = await supabase
          .from("papers")
          .select("*")
          .in("id", paperIds);

        const paperMap = new Map((paperData ?? []).map((p: Paper) => [p.id, p]));
        setPapers(
          apData.map((ap) => ({
            ...ap,
            paper: paperMap.get(ap.paper_id)!,
          }))
        );
      }

      // Get all ads by this advertiser with page/edition/paper context
      const { data: adsData } = await supabase
        .from("ads")
        .select("*, pages!inner(page_num, section, edition_id)")
        .eq("advertiser_id", id)
        .order("created_at", { ascending: false });

      if (adsData && adsData.length > 0) {
        // Get edition IDs for date lookup
        const editionIds = [...new Set(adsData.map((a: any) => a.pages.edition_id))];
        const { data: editionsData } = await supabase
          .from("editions")
          .select("id, date, paper_id")
          .in("id", editionIds);

        const editionMap = new Map((editionsData ?? []).map((e: any) => [e.id, e]));

        // Get paper info
        const allPaperIds = [...new Set((editionsData ?? []).map((e: any) => e.paper_id))];
        const { data: allPapersData } = await supabase
          .from("papers")
          .select("id, slug, name")
          .in("id", allPaperIds);

        const allPaperMap = new Map((allPapersData ?? []).map((p: any) => [p.id, p]));

        setAds(
          adsData.map((a: any) => {
            const edition = editionMap.get(a.pages.edition_id);
            const paper = edition ? allPaperMap.get(edition.paper_id) : null;
            return {
              ...a,
              page_num: a.pages.page_num,
              section: a.pages.section,
              edition_date: edition?.date ?? "",
              paper_slug: paper?.slug ?? "",
              paper_name: paper?.name ?? "",
            };
          })
        );
      }

      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return <p className="text-gray-500">Loading...</p>;
  }

  if (!advertiser) {
    return <p className="text-gray-500">Advertiser not found.</p>;
  }

  return (
    <div>
      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-gray-700">Dashboard</Link>
        <span className="mx-2">/</span>
        <Link href="/advertisers" className="hover:text-gray-700">Advertisers</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{advertiser.name}</span>
      </nav>

      <h1 className="text-3xl font-bold mb-2">{advertiser.name}</h1>
      <div className="flex gap-4 text-sm text-gray-600 mb-8">
        <span>{advertiser.total_ad_count} total ads</span>
        <span>{advertiser.paper_count} {advertiser.paper_count === 1 ? "paper" : "papers"}</span>
      </div>

      {/* Papers section */}
      {papers.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Papers</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {papers.map((ap) => (
              <Link
                key={ap.id}
                href={`/${ap.paper.slug}`}
                className="block bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <h3 className="font-medium">{ap.paper.name}</h3>
                <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                  <p>{ap.ad_count} ads</p>
                  <p>
                    {ap.first_seen} — {ap.last_seen}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Ads table */}
      <h2 className="text-xl font-semibold mb-3">All Ads ({ads.length})</h2>
      {ads.length === 0 ? (
        <p className="text-gray-500">No ads found.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Paper</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Page</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Section</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Size</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ads.map((ad) => (
                <tr key={ad.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {ad.paper_slug && ad.edition_date ? (
                      <Link
                        href={`/${ad.paper_slug}/${ad.edition_date}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {ad.edition_date}
                      </Link>
                    ) : (
                      ad.edition_date
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{ad.paper_name}</td>
                  <td className="text-right px-4 py-3 text-gray-600">{ad.page_num}</td>
                  <td className="px-4 py-3 text-gray-600">{ad.section}</td>
                  <td className="px-4 py-3 text-gray-600">{ad.size}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                    {ad.description}
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
