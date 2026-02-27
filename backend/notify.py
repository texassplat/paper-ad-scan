"""
Email notifications via Mandrill (Mailchimp Transactional) API.
Sends error alerts so issues can be debugged remotely.
"""

import os
import traceback
from datetime import datetime

import requests
from dotenv import load_dotenv

load_dotenv('.env.local')


def send_error_email(subject: str, error: Exception, context: str = ""):
    """Send an error notification email via Mandrill."""
    api_key = os.environ.get("MANDRILL_API_KEY")
    email_from = os.environ.get("EMAIL_FROM")
    from_name = os.environ.get("EMAIL_FROM_NAME", "PaperAdScraper")
    email_to = os.environ.get("EMAIL_TO")

    if not all([api_key, email_from, email_to]):
        print("  Email not configured, skipping notification")
        return

    tb = traceback.format_exception(type(error), error, error.__traceback__)
    tb_text = "".join(tb)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    html_body = f"""
<h2>Paper Ad Scan - Error Report</h2>
<p><strong>Time:</strong> {timestamp}</p>
<p><strong>Context:</strong> {context}</p>
<p><strong>Error:</strong> {type(error).__name__}: {error}</p>
<h3>Traceback</h3>
<pre style="background:#f5f5f5;padding:12px;border-radius:4px;font-size:13px;">{tb_text}</pre>
"""

    text_body = f"""Paper Ad Scan - Error Report
Time: {timestamp}
Context: {context}
Error: {type(error).__name__}: {error}

Traceback:
{tb_text}
"""

    payload = {
        "key": api_key,
        "message": {
            "from_email": email_from,
            "from_name": from_name,
            "to": [{"email": email_to, "type": "to"}],
            "subject": f"[PaperAdScan] {subject}",
            "html": html_body,
            "text": text_body,
        }
    }

    try:
        resp = requests.post(
            "https://mandrillapp.com/api/1.0/messages/send",
            json=payload,
            timeout=10
        )
        if resp.status_code == 200:
            print(f"  Error notification sent to {email_to}")
        else:
            print(f"  Failed to send notification: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"  Failed to send notification: {e}")
