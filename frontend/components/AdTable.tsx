"use client";

import { useState } from "react";
import type { Ad } from "@/lib/types";

interface AdWithPage extends Ad {
  page_num: number;
  section: string;
}

type SortKey = "page_num" | "advertiser" | "size" | "confidence";

export default function AdTable({ ads }: { ads: AdWithPage[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("page_num");
  const [sortAsc, setSortAsc] = useState(true);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const sorted = [...ads].sort((a, b) => {
    const aVal = a[sortKey] ?? "";
    const bVal = b[sortKey] ?? "";
    const cmp =
      typeof aVal === "number" && typeof bVal === "number"
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal));
    return sortAsc ? cmp : -cmp;
  });

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " \u25B2" : " \u25BC") : "";

  if (ads.length === 0) {
    return <p className="text-gray-500 text-sm">No ads found.</p>;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th
              className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer select-none"
              onClick={() => handleSort("page_num")}
            >
              Page{arrow("page_num")}
            </th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">
              Section
            </th>
            <th
              className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer select-none"
              onClick={() => handleSort("advertiser")}
            >
              Advertiser{arrow("advertiser")}
            </th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">
              Description
            </th>
            <th
              className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer select-none"
              onClick={() => handleSort("size")}
            >
              Size{arrow("size")}
            </th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">
              Location
            </th>
            <th
              className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer select-none"
              onClick={() => handleSort("confidence")}
            >
              Confidence{arrow("confidence")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((ad) => (
            <tr key={ad.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">{ad.page_num}</td>
              <td className="px-4 py-3 text-gray-600">{ad.section}</td>
              <td className="px-4 py-3 font-medium">{ad.advertiser}</td>
              <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                {ad.description}
              </td>
              <td className="px-4 py-3">{ad.size}</td>
              <td className="px-4 py-3 text-gray-600">{ad.location}</td>
              <td className="px-4 py-3">{ad.confidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
