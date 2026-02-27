"use client";

import { supabase } from "@/lib/supabase";
import type { Advertiser } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function AdvertisersPage() {
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("advertisers")
        .select("*")
        .order("total_ad_count", { ascending: false });

      setAdvertisers((data as Advertiser[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = advertisers.filter((a) =>
    a.name.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) {
    return <p className="text-gray-500">Loading advertisers...</p>;
  }

  return (
    <div>
      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-gray-700">Dashboard</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Advertisers</span>
      </nav>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">
          Advertisers
          <span className="text-lg font-normal text-gray-500 ml-2">
            ({filtered.length})
          </span>
        </h1>
        <input
          type="text"
          placeholder="Search advertisers..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500">No advertisers found.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Papers</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total Ads</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">First Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((adv) => (
                <tr key={adv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/advertisers/${adv.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {adv.name}
                    </Link>
                  </td>
                  <td className="text-right px-4 py-3 text-gray-600">
                    {adv.paper_count}
                  </td>
                  <td className="text-right px-4 py-3 text-gray-600">
                    {adv.total_ad_count}
                  </td>
                  <td className="text-right px-4 py-3 text-gray-600">
                    {new Date(adv.first_seen_at).toLocaleDateString()}
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
