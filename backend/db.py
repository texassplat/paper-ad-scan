"""
Supabase integration for storing ad data and page images.
"""

import io
import json
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
from PIL import Image

load_dotenv('.env.local')

BUCKET_NAME = "page-images"


def get_client() -> Client:
    """Create Supabase client from env vars."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_KEY"]
    return create_client(url, key)


def ensure_paper(supabase: Client, slug: str, name: str) -> int:
    """Insert or get paper record. Returns paper ID."""
    result = supabase.table("papers").select("id").eq("slug", slug).execute()
    if result.data:
        return result.data[0]["id"]

    result = supabase.table("papers").insert({
        "slug": slug,
        "name": name
    }).execute()
    return result.data[0]["id"]


def ensure_edition(supabase: Client, paper_id: int, date_str: str,
                   page_count: int = 0, ad_count: int = 0) -> int:
    """Insert or update edition record. Returns edition ID."""
    result = (supabase.table("editions")
              .select("id")
              .eq("paper_id", paper_id)
              .eq("date", date_str)
              .execute())
    if result.data:
        edition_id = result.data[0]["id"]
        supabase.table("editions").update({
            "page_count": page_count,
            "ad_count": ad_count
        }).eq("id", edition_id).execute()
        return edition_id

    result = supabase.table("editions").insert({
        "paper_id": paper_id,
        "date": date_str,
        "page_count": page_count,
        "ad_count": ad_count
    }).execute()
    return result.data[0]["id"]


def ensure_page(supabase: Client, edition_id: int, page_num: int,
                section: str, image_path: str = None) -> int:
    """Insert or update page record. Returns page ID."""
    result = (supabase.table("pages")
              .select("id")
              .eq("edition_id", edition_id)
              .eq("page_num", page_num)
              .execute())
    if result.data:
        page_id = result.data[0]["id"]
        updates = {"section": section}
        if image_path:
            updates["image_path"] = image_path
        supabase.table("pages").update(updates).eq("id", page_id).execute()
        return page_id

    result = supabase.table("pages").insert({
        "edition_id": edition_id,
        "page_num": page_num,
        "section": section,
        "image_path": image_path
    }).execute()
    return result.data[0]["id"]


def normalize_advertiser_name(name: str) -> str:
    """Normalize advertiser name: strip whitespace, title-case."""
    return name.strip().title()


def ensure_advertiser(supabase: Client, name: str) -> int:
    """Insert or get advertiser record by normalized name. Returns advertiser ID."""
    normalized = normalize_advertiser_name(name)
    result = supabase.table("advertisers").select("id").eq("name", normalized).execute()
    if result.data:
        return result.data[0]["id"]

    result = supabase.table("advertisers").insert({
        "name": normalized
    }).execute()
    return result.data[0]["id"]


def update_advertiser_papers(supabase: Client, advertiser_id: int,
                             paper_id: int, date_str: str):
    """Upsert advertiser_papers record. Tracks per-paper ad counts and date range."""
    result = (supabase.table("advertiser_papers")
              .select("id, ad_count, first_seen, last_seen")
              .eq("advertiser_id", advertiser_id)
              .eq("paper_id", paper_id)
              .execute())
    if result.data:
        row = result.data[0]
        updates = {"ad_count": (row["ad_count"] or 0) + 1}
        if not row["first_seen"] or date_str < row["first_seen"]:
            updates["first_seen"] = date_str
        if not row["last_seen"] or date_str > row["last_seen"]:
            updates["last_seen"] = date_str
        supabase.table("advertiser_papers").update(updates).eq("id", row["id"]).execute()
    else:
        supabase.table("advertiser_papers").insert({
            "advertiser_id": advertiser_id,
            "paper_id": paper_id,
            "ad_count": 1,
            "first_seen": date_str,
            "last_seen": date_str
        }).execute()


def refresh_advertiser_stats(supabase: Client):
    """Recalculate paper_count and total_ad_count on all advertisers from actual data."""
    advertisers = supabase.table("advertisers").select("id").execute()
    for adv in advertisers.data or []:
        adv_id = adv["id"]
        # Count distinct papers
        ap_rows = (supabase.table("advertiser_papers")
                   .select("paper_id")
                   .eq("advertiser_id", adv_id)
                   .execute())
        paper_count = len(ap_rows.data) if ap_rows.data else 0

        # Count total ads
        ad_result = (supabase.table("ads")
                     .select("id", count="exact", head=True)
                     .eq("advertiser_id", adv_id)
                     .execute())
        total_ad_count = ad_result.count or 0

        supabase.table("advertisers").update({
            "paper_count": paper_count,
            "total_ad_count": total_ad_count
        }).eq("id", adv_id).execute()


def insert_ads(supabase: Client, page_id: int, ads: list[dict],
               paper_id: int = None, date_str: str = None):
    """Insert ad records for a page. Clears existing ads for that page first.
    If paper_id and date_str provided, also links to advertiser entities."""
    # Delete existing ads for this page
    supabase.table("ads").delete().eq("page_id", page_id).execute()

    for ad in ads:
        record = {
            "page_id": page_id,
            "advertiser": ad["advertiser"],
            "description": ad.get("description", ""),
            "location": ad.get("location", ""),
            "size": ad.get("size", ""),
            "confidence": ad.get("confidence", "medium")
        }

        # Link to advertiser entity
        if ad.get("advertiser"):
            advertiser_id = ensure_advertiser(supabase, ad["advertiser"])
            record["advertiser_id"] = advertiser_id

            # Update advertiser_papers if we know the paper/date
            if paper_id and date_str:
                update_advertiser_papers(supabase, advertiser_id, paper_id, date_str)

        supabase.table("ads").insert(record).execute()


def upload_page_image(supabase: Client, local_path: Path, storage_path: str):
    """Convert PNG to JPEG and upload to Supabase Storage."""
    img = Image.open(local_path)
    if img.mode in ('RGBA', 'P'):
        img = img.convert('RGB')

    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=85)
    jpeg_bytes = buffer.getvalue()

    # Remove existing file if present (upsert)
    try:
        supabase.storage.from_(BUCKET_NAME).remove([storage_path])
    except Exception:
        pass

    supabase.storage.from_(BUCKET_NAME).upload(
        storage_path,
        jpeg_bytes,
        file_options={"content-type": "image/jpeg"}
    )


def upload_edition(paper_config: dict, date_str: str, edition_dir: Path,
                   all_ads: list[dict]):
    """Upload an entire edition (pages + ads) to Supabase."""
    supabase = get_client()
    slug = paper_config["slug"]
    name = paper_config["name"]

    print(f"\nUploading {name} {date_str} to Supabase...")

    # Ensure paper exists
    paper_id = ensure_paper(supabase, slug, name)

    # Load page map
    page_map_path = edition_dir / "page_map.json"
    page_map = []
    if page_map_path.exists():
        with open(page_map_path) as f:
            page_map = json.load(f)

    section_lookup = {p["page_num"]: p["section"] for p in page_map}

    # Count pages
    page_images = sorted(edition_dir.glob("page_*.png"))
    page_count = len(page_images)
    ad_count = len(all_ads)

    # Ensure edition
    edition_id = ensure_edition(supabase, paper_id, date_str, page_count, ad_count)

    # Upload pages and images
    for img_path in page_images:
        page_num = int(img_path.stem.replace('page_', ''))
        section = section_lookup.get(page_num, "Unknown")
        storage_path = f"{slug}/{date_str}/page_{page_num:03d}.jpg"

        print(f"  Uploading page {page_num}...")
        upload_page_image(supabase, img_path, storage_path)

        page_id = ensure_page(supabase, edition_id, page_num, section, storage_path)

        # Insert ads for this page
        page_ads = [a for a in all_ads if a.get("page") == page_num]
        if page_ads:
            insert_ads(supabase, page_id, page_ads,
                       paper_id=paper_id, date_str=date_str)
            print(f"    {len(page_ads)} ads")

    # Refresh advertiser aggregate stats
    print("  Refreshing advertiser stats...")
    refresh_advertiser_stats(supabase)
    print(f"  Done: {page_count} pages, {ad_count} ads uploaded")
