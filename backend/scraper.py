"""
PageSuite E-Paper Scraper
Downloads page images from e-papers using the PageSuite API.
Supports multiple newspapers via paper config.

Two API modes:
  - "published" (AJC): published.json → ZIP download → PDF→PNG conversion
  - "replica" (DMN): replica API for edition list → get_image.aspx for page JPEGs
"""

import io
import json
import zipfile
import requests
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

load_dotenv('.env.local')

PUBLISHED_BASE = "https://published.pagesuite.com"
REPLICA_EDITIONS_BASE = "https://ep.prod.pagesuite.com/prod/replica/publication"
IMAGE_BASE = "https://edition.pagesuite.com/get_image.aspx"

# Placeholder GIF size returned by get_image.aspx for non-existent pages
PLACEHOLDER_MAX_BYTES = 15000


class PageSuiteScraper:
    def __init__(self, paper_config: dict):
        self.slug = paper_config['slug']
        self.name = paper_config['name']
        self.account_guid = paper_config.get('account_guid', '')
        self.pub_guid = paper_config.get('pub_guid', '')
        self.api_type = paper_config.get('api_type', 'published')
        self.api_key = paper_config.get('api_key', '')
        self.output_dir = Path(f"output/{self.slug}")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.editions_cache = None

    def get_editions(self, force_refresh: bool = False) -> list[dict]:
        """Fetch list of available editions."""
        if self.editions_cache and not force_refresh:
            return self.editions_cache

        print(f"Fetching {self.name} editions from API...")

        if self.api_type == 'replica':
            self.editions_cache = self._get_editions_replica()
        else:
            self.editions_cache = self._get_editions_published()

        print(f"Found {len(self.editions_cache)} editions")
        return self.editions_cache

    def _get_editions_published(self) -> list[dict]:
        """Fetch editions via published.json (AJC style)."""
        url = f"{PUBLISHED_BASE}/{self.account_guid}/{self.pub_guid}/published.json"
        response = requests.get(url)
        response.raise_for_status()
        return response.json()

    def _get_editions_replica(self) -> list[dict]:
        """Fetch editions via replica API (DMN style)."""
        url = f"{REPLICA_EDITIONS_BASE}/{self.pub_guid}/editions"
        headers = {'accept': 'application/json'}
        if self.api_key:
            headers['x-api-key'] = self.api_key
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        raw = response.json()

        # Normalize to same format as published.json
        editions = []
        for e in raw:
            date_str = e.get('publishDate', '')[:10]  # "2026-02-27T00:00:00.000Z" → "2026-02-27"
            editions.append({
                'date': date_str,
                'editions': [{
                    'editionGuid': e.get('editionGuid', ''),
                    'name': e.get('name', ''),
                }]
            })
        return editions

    def find_edition_by_date(self, target_date: datetime) -> dict | None:
        """Find edition for a specific date."""
        date_str = target_date.strftime("%Y-%m-%d")
        editions = self.get_editions()

        for edition_data in editions:
            if edition_data.get('date') == date_str:
                if edition_data.get('editions'):
                    return edition_data['editions'][0]
        return None

    def download_edition(self, edition: dict, date: datetime) -> Path:
        """Download an edition. Dispatches to the right method based on api_type."""
        if self.api_type == 'replica':
            return self._download_edition_replica(edition, date)
        else:
            return self._download_edition_published(edition, date)

    def _download_edition_replica(self, edition: dict, date: datetime) -> Path:
        """Download edition pages via get_image.aspx (DMN style)."""
        date_str = date.strftime("%Y-%m-%d")
        edition_dir = self.output_dir / date_str

        # Check if already downloaded
        if edition_dir.exists() and list(edition_dir.glob("page_*.png")):
            print(f"Edition {date_str} already downloaded")
            return edition_dir

        edition_guid = edition.get('editionGuid', '')
        if not edition_guid:
            print(f"No edition GUID for {date_str}")
            return None

        print(f"Downloading {self.name} edition {date_str} (image API)...")
        edition_dir.mkdir(parents=True, exist_ok=True)

        # Download pages by probing page numbers until we hit a placeholder
        page_map = []
        page_num = 1
        while True:
            url = f"{IMAGE_BASE}?eid={edition_guid}&pnum={page_num}&w=1200"
            response = requests.get(url)

            if response.status_code != 200:
                break

            # Placeholder GIF is ~10KB; real pages are much larger
            if len(response.content) < PLACEHOLDER_MAX_BYTES:
                break

            output_path = edition_dir / f"page_{page_num:03d}.png"
            output_path.write_bytes(response.content)

            page_map.append({
                'page_num': page_num,
                'section': 'Unknown',
                'hash': '',
                'pdf_name': ''
            })
            print(f"  Downloaded page {page_num}")
            page_num += 1

        # Save page map
        with open(edition_dir / "page_map.json", 'w') as f:
            json.dump(page_map, f, indent=2)

        # Save metadata
        with open(edition_dir / "metadata.json", 'w') as f:
            json.dump(edition, f, indent=2)

        print(f"  Downloaded {page_num - 1} pages")
        return edition_dir

    def _download_edition_published(self, edition: dict, date: datetime) -> Path:
        """Download and extract an edition ZIP file (AJC style)."""
        from pdf2image import convert_from_bytes

        date_str = date.strftime("%Y-%m-%d")
        edition_dir = self.output_dir / date_str

        # Check if already downloaded with converted pages
        if edition_dir.exists() and list(edition_dir.glob("page_*.png")):
            print(f"Edition {date_str} already downloaded")
            return edition_dir

        zip_url = edition.get('zip')
        if not zip_url:
            print(f"No ZIP URL for {date_str}")
            return None

        print(f"Downloading {self.name} edition {date_str}...")
        response = requests.get(zip_url)
        response.raise_for_status()

        edition_dir.mkdir(parents=True, exist_ok=True)

        # Download edition.json for page ordering
        page_map = []
        edition_link = edition.get('editionLink')
        if edition_link:
            try:
                resp = requests.get(edition_link)
                resp.raise_for_status()
                edition_json = resp.json()
                with open(edition_dir / "edition.json", 'w') as f:
                    json.dump(edition_json, f, indent=2)

                for i, page in enumerate(edition_json.get('pages', [])):
                    content_url = page.get('contenturl', '')
                    if not content_url.endswith('.pdf'):
                        continue
                    hash_name = content_url.replace('.pdf', '')
                    page_map.append({
                        'page_num': i + 1,
                        'section': page.get('section', 'Unknown'),
                        'hash': hash_name,
                        'pdf_name': content_url
                    })
                with open(edition_dir / "page_map.json", 'w') as f:
                    json.dump(page_map, f, indent=2)
            except Exception as e:
                print(f"  Could not fetch edition.json: {e}")

        # Build hash -> page_num mapping
        hash_to_page = {p['hash']: p['page_num'] for p in page_map}
        hash_to_section = {p['hash']: p['section'] for p in page_map}

        # Extract ZIP contents
        with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
            for name in zf.namelist():
                basename = Path(name).name
                hash_name = basename.rsplit('.', 1)[0]

                if name.lower().endswith('.pdf') and hash_name in hash_to_page:
                    page_num = hash_to_page[hash_name]
                    section = hash_to_section.get(hash_name, 'Unknown')
                    pdf_data = zf.read(name)
                    try:
                        images = convert_from_bytes(pdf_data, dpi=150)
                        if images:
                            output_path = edition_dir / f"page_{page_num:03d}.png"
                            images[0].save(str(output_path), 'PNG')
                            print(f"  Converted page {page_num} ({section})")
                    except Exception as e:
                        print(f"  Error converting {name}: {e}")

        # Save metadata
        with open(edition_dir / "metadata.json", 'w') as f:
            json.dump(edition, f, indent=2)

        return edition_dir

    def get_page_images(self, date: datetime) -> list[Path]:
        """Download and return page image paths for a date, in page order."""
        edition = self.find_edition_by_date(date)
        if not edition:
            print(f"No edition found for {date.strftime('%Y-%m-%d')}")
            return []

        edition_dir = self.download_edition(edition, date)
        if not edition_dir:
            return []

        images = sorted(
            list(edition_dir.glob("page_*.png")),
            key=lambda p: int(p.stem.replace('page_', ''))
        )
        return images

    def list_available_dates(self) -> list[str]:
        """List all available edition dates."""
        editions = self.get_editions()
        return [e['date'] for e in editions if e.get('date')]
