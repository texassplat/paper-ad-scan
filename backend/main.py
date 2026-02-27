#!/usr/bin/env python3
"""
Paper Ad Scan - Multi-Newspaper Ad Tracker CLI

Scrapes e-paper editions and uses Claude Vision to find advertisements.

Usage:
    python main.py --paper ajc --date 2026-01-26
    python main.py --paper ajc --start-date 2026-01-01 --end-date 2026-01-31
    python main.py --paper ajc --date 2026-01-26 --upload
    python main.py --paper ajc --analyze output/ajc/2026-01-26
    python main.py --paper ajc --list-dates
"""

import argparse
import csv
import json
from datetime import datetime, timedelta
from pathlib import Path

from scraper import PageSuiteScraper
from analyzer import analyze_page, AdInfo
from matcher import load_clients
from notify import send_error_email


def load_paper_configs() -> list[dict]:
    """Load paper configurations from papers.json."""
    config_path = Path(__file__).parent / "papers.json"
    with open(config_path) as f:
        return json.load(f)


def get_paper_config(slug: str) -> dict:
    """Get config for a specific paper by slug."""
    configs = load_paper_configs()
    for config in configs:
        if config["slug"] == slug:
            return config
    available = [c["slug"] for c in configs]
    raise ValueError(f"Unknown paper '{slug}'. Available: {', '.join(available)}")


def parse_date(date_str: str) -> datetime:
    """Parse date string in YYYY-MM-DD format."""
    return datetime.strptime(date_str, "%Y-%m-%d")


def date_range(start: datetime, end: datetime):
    """Generate dates from start to end (inclusive)."""
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def analyze_edition(edition_dir: Path, clients: list[str] = None) -> list[dict]:
    """Analyze all pages in an edition directory."""
    page_map_path = edition_dir / "page_map.json"
    if not page_map_path.exists():
        print(f"No page_map.json found in {edition_dir}")
        return []

    with open(page_map_path) as f:
        page_map = json.load(f)
    all_ads = []

    for page_info in page_map:
        page_num = page_info['page_num']
        section = page_info['section']
        img_path = edition_dir / f"page_{page_num:03d}.png"

        if not img_path.exists():
            continue

        print(f"  Analyzing page {page_num} ({section})...")
        try:
            ads = analyze_page(img_path, clients)
            for ad in ads:
                all_ads.append({
                    'page': page_num,
                    'section': section,
                    'advertiser': ad.advertiser,
                    'description': ad.description,
                    'size': ad.size,
                    'location': ad.location,
                    'confidence': ad.confidence
                })
                print(f"    Found: {ad.advertiser} ({ad.size})")
        except Exception as e:
            print(f"    Error: {e}")

    return all_ads


def write_csv(ads: list[dict], output_path: Path, date_str: str):
    """Write ads to CSV file."""
    mode = 'a' if output_path.exists() else 'w'
    write_header = not output_path.exists()

    with open(output_path, mode, newline='') as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow(['Date', 'Page', 'Section', 'Advertiser', 'Description', 'Size', 'Location', 'Confidence'])

        for ad in ads:
            writer.writerow([
                date_str,
                ad['page'],
                ad['section'],
                ad['advertiser'],
                ad['description'][:200],
                ad['size'],
                ad['location'],
                ad.get('confidence', '')
            ])


def filter_client_ads(ads: list[dict], clients: list[str]) -> list[dict]:
    """Filter ads to only include client matches."""
    if not clients:
        return ads

    matches = []
    clients_lower = [c.lower() for c in clients]

    for ad in ads:
        advertiser_lower = ad['advertiser'].lower()
        for client in clients_lower:
            if client in advertiser_lower or advertiser_lower in client:
                matches.append(ad)
                break

    return matches


def process_date(scraper: PageSuiteScraper, date: datetime,
                 clients: list[str], upload: bool = False,
                 paper_config: dict = None) -> list[dict]:
    """Process a single date: download, analyze, optionally upload."""
    date_str = date.strftime("%Y-%m-%d")
    print(f"\nProcessing {date_str}...")

    # Download edition
    images = scraper.get_page_images(date)
    if not images:
        print(f"  No images for {date_str}")
        return []

    # Analyze
    edition_dir = scraper.output_dir / date_str
    ads = analyze_edition(edition_dir, clients)

    # Save raw results
    with open(edition_dir / "all_ads.json", 'w') as f:
        json.dump(ads, f, indent=2)

    # Upload to Supabase if requested
    if upload and paper_config:
        from db import upload_edition
        upload_edition(paper_config, date_str, edition_dir, ads)

    return ads


def main():
    parser = argparse.ArgumentParser(description="Paper Ad Scan - Multi-Newspaper Ad Tracker")
    parser.add_argument('--paper', required=True,
                        help='Paper slug (e.g., ajc, dmn) or "all"')
    parser.add_argument('--date', help='Single date to process (YYYY-MM-DD)')
    parser.add_argument('--start-date', help='Start date for range (YYYY-MM-DD)')
    parser.add_argument('--end-date', help='End date for range (YYYY-MM-DD)')
    parser.add_argument('--analyze', help='Analyze existing page images in directory')
    parser.add_argument('--output', default='output/ad_report.csv',
                        help='Output CSV file path')
    parser.add_argument('--clients-only', action='store_true',
                        help='Only include ads matching clients.txt')
    parser.add_argument('--list-dates', action='store_true',
                        help='List available edition dates')
    parser.add_argument('--upload', action='store_true',
                        help='Upload results to Supabase')

    args = parser.parse_args()

    # Load clients
    clients_path = Path(__file__).parent / "clients.txt"
    clients = load_clients(clients_path)
    if clients:
        print(f"Loaded {len(clients)} clients: {', '.join(clients)}")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Determine which papers to process
    if args.paper == "all":
        paper_configs = load_paper_configs()
    else:
        paper_configs = [get_paper_config(args.paper)]

    for paper_config in paper_configs:
        slug = paper_config["slug"]
        name = paper_config["name"]

        if not paper_config.get("account_guid"):
            print(f"\nSkipping {name}: no GUIDs configured")
            continue

        print(f"\n{'='*60}")
        print(f"  {name} ({slug})")
        print(f"{'='*60}")

        scraper = PageSuiteScraper(paper_config)

        # List dates mode
        if args.list_dates:
            dates = scraper.list_available_dates()
            print(f"\nAvailable dates ({len(dates)} total):")
            for d in dates[:30]:
                print(f"  {d}")
            if len(dates) > 30:
                print(f"  ... and {len(dates) - 30} more")
            continue

        # Analyze existing directory
        if args.analyze:
            edition_dir = Path(args.analyze)
            date_str = edition_dir.name
            print(f"Analyzing {edition_dir}...")
            ads = analyze_edition(edition_dir, clients)

            if args.clients_only:
                ads = filter_client_ads(ads, clients)
                print(f"\nFiltered to {len(ads)} client ads")

            if ads:
                write_csv(ads, output_path, date_str)
                print(f"\nWrote {len(ads)} ads to {output_path}")

            if args.upload:
                from db import upload_edition
                upload_edition(paper_config, date_str, edition_dir, ads)
            continue

        # Process date(s)
        if args.date:
            dates = [parse_date(args.date)]
        elif args.start_date and args.end_date:
            start = parse_date(args.start_date)
            end = parse_date(args.end_date)
            dates = list(date_range(start, end))
        else:
            print("Specify --date, --start-date/--end-date, --analyze, or --list-dates")
            return

        # Process each date
        all_ads = []
        for date in dates:
            date_str = date.strftime("%Y-%m-%d")
            try:
                ads = process_date(scraper, date, clients,
                                  upload=args.upload, paper_config=paper_config)
                for ad in ads:
                    ad['date'] = date_str
                all_ads.extend(ads)
            except Exception as e:
                print(f"\nERROR processing {slug} {date_str}: {e}")
                send_error_email(
                    subject=f"Error processing {slug} {date_str}",
                    error=e,
                    context=f"Paper: {name} ({slug}), Date: {date_str}"
                )

        # Filter if requested
        if args.clients_only:
            all_ads = filter_client_ads(all_ads, clients)
            print(f"\nFiltered to {len(all_ads)} client ads")

        # Write output
        if all_ads:
            if output_path.exists():
                output_path.unlink()

            for ad in all_ads:
                write_csv([ad], output_path, ad.get('date', ''))

            print(f"\nWrote {len(all_ads)} ads to {output_path}")

            advertisers = set(ad['advertiser'] for ad in all_ads)
            print(f"\nUnique advertisers found: {len(advertisers)}")
            for adv in sorted(advertisers)[:20]:
                print(f"  - {adv}")
            if len(advertisers) > 20:
                print(f"  ... and {len(advertisers) - 20} more")
        else:
            print("\nNo ads found.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        send_error_email(
            subject=f"Fatal error: {type(e).__name__}",
            error=e,
            context="main() top-level"
        )
        raise
