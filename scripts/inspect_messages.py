#!/usr/bin/env python3
"""Inspect all messages from campaigns created during the stress test."""
import json, urllib.request

BASE = "http://localhost:3000"
# The stress test user — campaigns created under this UUID
# We don't know the exact UUID, so let's list ALL campaigns via direct Supabase
# Actually, let's use the test's approach: scan recent campaigns

import subprocess, os
# Get all campaigns from Supabase directly (using service_role)
# Read keys from environment — NEVER commit real keys to git.
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
SERVICE = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not all([SUPABASE_URL, ANON, SERVICE]):
    # Try loading from .env
    from pathlib import Path
    env_file = Path(__file__).parent.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
                SUPABASE_URL = line.split("=", 1)[1]
            elif line.startswith("NEXT_PUBLIC_SUPABASE_ANON_KEY="):
                ANON = line.split("=", 1)[1]
            elif line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                SERVICE = line.split("=", 1)[1]
if not all([SUPABASE_URL, ANON, SERVICE]):
    print("ERROR: Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY env vars.")
    sys.exit(1)

def supabase_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}" if params else f"{SUPABASE_URL}/rest/v1/{table}"
    req = urllib.request.Request(url, headers={
        "apikey": ANON,
        "Authorization": f"Bearer {SERVICE}",
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())

# Get all campaigns
campaigns = supabase_get("campaigns", "select=id,title,user_id,created_at&order=created_at.desc&limit=20")
print(f"Found {len(campaigns)} campaigns\n")

# Get messages for each
for c in campaigns[:10]:  # last 10
    cid = c["id"]
    title = c["title"]
    msgs = supabase_get("messages", f"select=role,content,created_at&campaign_id=eq.{cid}&order=created_at.asc")
    print(f"\n=== {title} ({len(msgs)} msgs) ===")
    for m in msgs:
        content = m["content"]
        preview = content[:150].replace("\n", " ") + ("..." if len(content) > 150 else "")
        print(f"  [{m['role']}] {preview}")
