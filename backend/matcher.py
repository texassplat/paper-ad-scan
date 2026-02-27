"""
Client name matcher for finding ads in OCR text.
"""

import re
from pathlib import Path
from dataclasses import dataclass


@dataclass
class AdMatch:
    """Represents a matched advertisement."""
    client: str
    date: str
    page: int
    matched_text: str
    context: str  # Surrounding text for verification


def load_clients(clients_file: Path = Path("clients.txt")) -> list[str]:
    """Load client names from file, one per line."""
    if not clients_file.exists():
        print(f"Warning: {clients_file} not found. Create it with client names, one per line.")
        return []

    clients = []
    with open(clients_file) as f:
        for line in f:
            name = line.strip()
            if name and not name.startswith('#'):
                clients.append(name)

    return clients


def find_matches(text: str, clients: list[str], context_chars: int = 100) -> list[tuple[str, str, str]]:
    """Find client name matches in text.

    Returns list of (client_name, matched_text, context) tuples.
    """
    matches = []

    for client in clients:
        pattern = re.compile(re.escape(client), re.IGNORECASE)

        for match in pattern.finditer(text):
            matched_text = match.group()
            start = max(0, match.start() - context_chars)
            end = min(len(text), match.end() + context_chars)
            context = text[start:end].replace('\n', ' ').strip()

            matches.append((client, matched_text, context))

    return matches
