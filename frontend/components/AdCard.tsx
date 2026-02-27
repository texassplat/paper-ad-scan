import type { Ad } from "@/lib/types";

const confidenceColors: Record<string, string> = {
  high: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-red-100 text-red-800",
};

const sizeColors: Record<string, string> = {
  "full page": "bg-purple-100 text-purple-800",
  "half page": "bg-blue-100 text-blue-800",
  "quarter page": "bg-cyan-100 text-cyan-800",
};

function Badge({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${className ?? "bg-gray-100 text-gray-700"}`}
    >
      {text}
    </span>
  );
}

export default function AdCard({ ad }: { ad: Ad }) {
  const confColor = confidenceColors[ad.confidence] ?? "bg-gray-100 text-gray-700";
  const sizeColor = sizeColors[ad.size?.toLowerCase()] ?? "bg-gray-100 text-gray-700";

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-sm">{ad.advertiser}</h4>
        <div className="flex gap-1 shrink-0">
          {ad.size && <Badge text={ad.size} className={sizeColor} />}
          {ad.confidence && <Badge text={ad.confidence} className={confColor} />}
        </div>
      </div>
      {ad.description && (
        <p className="text-xs text-gray-600 mb-1">{ad.description}</p>
      )}
      {ad.location && (
        <p className="text-xs text-gray-400">Location: {ad.location}</p>
      )}
    </div>
  );
}
