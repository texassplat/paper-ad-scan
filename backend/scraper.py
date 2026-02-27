"""
PageSuite E-Paper Scraper
Downloads page images from e-papers using the PageSuite API.
Supports multiple newspapers via paper config.
"""

import os
import io
import json
import zipfile
import requests
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

load_dotenv('.env.local')

PUBLISHED_BASE = "https://published.pagesuite.com"


class PageSuiteScraper:
    def __init__(self, paper_config: dict):
        self.slug = paper_config['slug']
        self.name = paper_config['name']
        self.account_guid = paper_config['account_guid']
        self.pub_guid = paper_config['pub_guid']
        self.published_url = f"{PUBLISHED_BASE}/{self.account_guid}/{self.pub_guid}/published.json"
        self.output_dir = Path(f"output/{self.slug}")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.editions_cache = None

    def get_editions(self, force_refresh: bool = False) -> list[dict]:
        """Fetch list of available editions."""
        if self.editions_cache and not force_refresh:
            return self.editions_cache

        print(f"Fetching {self.name} editions from API...")
        response = requests.get(self.published_url)
        response.raise_for_status()
        self.editions_cache = response.json()

        print(f"Found {len(self.editions_cache)} editions")
        return self.editions_cache

    def find_edition_by_date(self, target_date: datetime) -> dict | None:
        """Find edition for a specific date."""
        date_str = target_date.strftime("%Y-%m-%d")
        editions = self.get_editions()

        for edition_data in editions:
            if edition_data.get('date') == date_str:
                if edition_data.get('editions'):
                    return edition_data['editions'][0]
        return None

    def download_edition(self, edition: dict, date: datetime, convert_pdfs: bool = True) -> Path:
        """Download and extract an edition ZIP file."""
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

        # First, download edition.json for page ordering
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
                    if convert_pdfs:
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
        metadata_path = edition_dir / "metadata.json"
        with open(metadata_path, 'w') as f:
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
