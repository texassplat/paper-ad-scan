"""
AI-powered ad analyzer using Claude Vision API.
Identifies advertisements in newspaper page images.
"""

import anthropic
import base64
from pathlib import Path
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv('.env.local')


@dataclass
class AdInfo:
    """Information about a detected advertisement."""
    advertiser: str
    description: str
    location: str  # e.g., "top right", "bottom half"
    size: str  # e.g., "full page", "quarter page", "banner"
    confidence: str  # "high", "medium", "low"


def encode_image(image_path: Path, max_size_mb: float = 4.5) -> str:
    """Encode image to base64 for Claude API, resizing if too large."""
    from PIL import Image
    import io

    img = Image.open(image_path)

    if img.mode in ('RGBA', 'P'):
        img = img.convert('RGB')

    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=95)
    size_mb = len(buffer.getvalue()) / (1024 * 1024)

    while size_mb > max_size_mb:
        new_width = int(img.width * 0.8)
        new_height = int(img.height * 0.8)
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=90)
        size_mb = len(buffer.getvalue()) / (1024 * 1024)

    return base64.standard_b64encode(buffer.getvalue()).decode("utf-8")


def analyze_page(image_path: Path, clients: list[str] = None) -> list[AdInfo]:
    """
    Analyze a newspaper page image to find advertisements.

    Args:
        image_path: Path to the page image
        clients: Optional list of client names to specifically look for

    Returns:
        List of AdInfo objects describing each ad found
    """
    client = anthropic.Anthropic()

    image_data = encode_image(image_path)

    client_context = ""
    if clients:
        client_context = f"""
Pay special attention to ads from these clients (case-insensitive):
{chr(10).join(f'- {c}' for c in clients)}

If you find any ads from these specific clients, make sure to note them clearly.
"""

    prompt = f"""Analyze this newspaper page image and identify all PAID ADVERTISEMENTS.

CRITICAL RULES:
- Each ad is a single rectangular block placed by ONE advertiser/company. One ad = one advertiser.
- Standard newspaper ad sizes are: full page, half page, quarter page, eighth page, strip/banner.
- An ad may contain images of products, cars, people, logos, etc. — these are PART OF the ad, not separate ads. For example, a credit union ad showing a car for auto loans is ONE ad by the credit union, NOT a separate car ad.
- The advertiser is whoever PAID for the ad — look for the company name, logo, phone number, or website in the ad. Stock photos and product images within an ad do not indicate a separate advertiser.
- Do NOT count editorial content, news articles, photos, weather, comics, or other non-advertising content.
- Do NOT count the newspaper's own house ads or section headers.

For each advertisement, provide:
1. Advertiser name (the company/business that paid for the ad)
2. Brief description of what's being advertised
3. Location on page (e.g., "top right", "bottom half", "left column")
4. Size (use standard sizes: "full page", "half page", "quarter page", "eighth page", "strip/banner", "classified")
5. Confidence level (high/medium/low)

{client_context}

If there are no paid ads on this page, say "No advertisements found."

Respond in this exact format for each ad:
---
ADVERTISER: [company name]
DESCRIPTION: [what they're advertising]
LOCATION: [where on page]
SIZE: [ad size]
CONFIDENCE: [high/medium/low]
---
"""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": image_data,
                        }
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }
        ]
    )

    return parse_ad_response(response.content[0].text)


def parse_ad_response(response_text: str) -> list[AdInfo]:
    """Parse Claude's response into AdInfo objects."""
    ads = []

    if "no advertisements found" in response_text.lower():
        return ads

    sections = response_text.split('---')

    current_ad = {}
    for section in sections:
        section = section.strip()
        if not section:
            continue

        lines = section.split('\n')
        for line in lines:
            line = line.strip()
            if line.startswith('ADVERTISER:'):
                current_ad['advertiser'] = line.replace('ADVERTISER:', '').strip()
            elif line.startswith('DESCRIPTION:'):
                current_ad['description'] = line.replace('DESCRIPTION:', '').strip()
            elif line.startswith('LOCATION:'):
                current_ad['location'] = line.replace('LOCATION:', '').strip()
            elif line.startswith('SIZE:'):
                current_ad['size'] = line.replace('SIZE:', '').strip()
            elif line.startswith('CONFIDENCE:'):
                current_ad['confidence'] = line.replace('CONFIDENCE:', '').strip()

        if current_ad.get('advertiser'):
            ads.append(AdInfo(
                advertiser=current_ad.get('advertiser', 'Unknown'),
                description=current_ad.get('description', ''),
                location=current_ad.get('location', ''),
                size=current_ad.get('size', ''),
                confidence=current_ad.get('confidence', 'medium')
            ))
            current_ad = {}

    return ads


def analyze_edition(edition_dir: Path, clients: list[str] = None) -> dict[str, list[AdInfo]]:
    """Analyze all pages in an edition directory."""
    results = {}
    page_files = sorted(edition_dir.glob("page_*.png"))

    for page_file in page_files:
        print(f"Analyzing: {page_file.name}")
        try:
            ads = analyze_page(page_file, clients)
            results[page_file.name] = ads
            print(f"  Found {len(ads)} ads")
            for ad in ads:
                print(f"    - {ad.advertiser}: {ad.description[:50]}...")
        except Exception as e:
            print(f"  Error: {e}")
            results[page_file.name] = []

    return results
