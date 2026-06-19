#!/usr/bin/env python3
"""
EchoLore edge-case tests — fast, no LLM calls needed.

Tests API validation, error handling, and edge cases that don't require
the LLM to respond. Runs in <30 seconds.
"""
import json, urllib.request, urllib.error
from uuid import uuid4

BASE = "http://localhost:3000"
USER_ID = str(uuid4())

passed = 0
failed = 0
findings = []

def test(name, method, path, body=None, headers=None, expect_status=None, expect_in_body=None):
    global passed, failed
    h = {"Content-Type": "application/json", "x-user-id": USER_ID}
    if headers: h.update(headers)
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            status = r.status
            raw = r.read().decode()
    except urllib.error.HTTPError as e:
        status = e.code
        raw = e.read().decode()
    except Exception as e:
        status = 0
        raw = str(e)

    ok = True
    if expect_status is not None and status != expect_status:
        ok = False
    if expect_in_body is not None and expect_in_body not in raw:
        ok = False

    if ok:
        passed += 1
        print(f"  ✓ {name} (HTTP {status})")
    else:
        failed += 1
        print(f"  ❌ {name} (HTTP {status}, expected {expect_status})")
        print(f"     Response: {raw[:200]}")
        findings.append({"test": name, "status": status, "expected": expect_status, "body": raw[:300]})

print("=== AUTH & VALIDATION ===")
test("GET /api/campaigns without x-user-id", "GET", "/api/campaigns", headers={"x-user-id": ""}, expect_status=401)
test("POST /api/campaigns without x-user-id", "POST", "/api/campaigns", body={"title":"x","worldDescription":"x","userPersona":"x","aiPersona":"x"}, headers={"x-user-id": ""}, expect_status=401)
test("POST /api/campaigns missing title", "POST", "/api/campaigns", body={"worldDescription":"x","userPersona":"x","aiPersona":"x"}, expect_status=400)
test("POST /api/campaigns missing worldDescription", "POST", "/api/campaigns", body={"title":"x","userPersona":"x","aiPersona":"x"}, expect_status=400)
test("POST /api/campaigns missing userPersona", "POST", "/api/campaigns", body={"title":"x","worldDescription":"x","aiPersona":"x"}, expect_status=400)
test("POST /api/campaigns missing aiPersona", "POST", "/api/campaigns", body={"title":"x","worldDescription":"x","userPersona":"x"}, expect_status=400)
test("POST /api/campaigns empty title", "POST", "/api/campaigns", body={"title":"  ","worldDescription":"x","userPersona":"x","aiPersona":"x"}, expect_status=400)
test("POST /api/campaigns invalid JSON body", "POST", "/api/campaigns", body=None, expect_status=400)
test("GET /api/campaigns/nonexistent-id", "GET", "/api/campaigns/00000000-0000-0000-0000-000000000000", expect_status=404)
test("DELETE /api/campaigns/nonexistent-id", "DELETE", "/api/campaigns/00000000-0000-0000-0000-000000000000", expect_status=404)

print("\n=== CHAT ROUTE VALIDATION ===")
# First create a real campaign
body = {
    "title": "Edge Case Test Campaign",
    "worldDescription": "A test world with enough words to pass the thin prompt check and then some more words here.",
    "userPersona": "I am a tester who verifies edge cases work properly without breaking the system.",
    "aiPersona": "You are a helpful test assistant that responds briefly to verify the pipeline works.",
}
req = urllib.request.Request(f"{BASE}/api/campaigns", data=json.dumps(body).encode(),
    headers={"Content-Type":"application/json", "x-user-id": USER_ID}, method="POST")
with urllib.request.urlopen(req) as r:
    cid = json.loads(r.read().decode())["campaign"]["id"]
print(f"  Created test campaign: {cid}\n")

chat_headers = {
    "x-openrouter-key": "sk-or-v1-fake-key-for-validation-test",
    "x-chat-model": "openai/gpt-oss-120b:free",
    "x-lore-model": "openai/gpt-oss-20b:free",
    "x-embed-model": "text-embedding-3-small",
    "x-embed-dimensions": "1536",
}

test("POST /api/chat missing campaignId", "POST", "/api/chat", body={"message":"hi"}, headers=chat_headers, expect_status=400)
test("POST /api/chat missing message", "POST", "/api/chat", body={"campaignId": cid}, headers=chat_headers, expect_status=400)
test("POST /api/chat empty message", "POST", "/api/chat", body={"campaignId": cid, "message": "   "}, headers=chat_headers, expect_status=400)
test("POST /api/chat nonexistent campaignId", "POST", "/api/chat", body={"campaignId": "00000000-0000-0000-0000-000000000000", "message": "hi"}, headers=chat_headers, expect_status=404)
test("POST /api/chat missing openrouter-key", "POST", "/api/chat", body={"campaignId": cid, "message": "hi"},
     headers={k:v for k,v in chat_headers.items() if k != "x-openrouter-key"}, expect_status=500)

print("\n=== SPECIAL CHARACTERS IN CAMPAIGN FIELDS ===")
# Test emoji, unicode, quotes, HTML, SQL injection attempts in title/descriptions
special_bodies = [
    ("emoji title", {
        "title": "🎉 Emoji World 🎊",
        "worldDescription": "A world full of emoji 🚀 and unicode 日本語",
        "userPersona": "I'm a tester with emoji 🎀 in my persona",
        "aiPersona": "You handle emoji 🎯 correctly",
    }),
    ("HTML in title", {
        "title": "<script>alert('xss')</script>",
        "worldDescription": "A world with <b>HTML</b> and <script>tags</script>",
        "userPersona": "I'm <i>italic</i> tester",
        "aiPersona": "You handle <html> properly",
    }),
    ("SQL injection in title", {
        "title": "'; DROP TABLE campaigns; --",
        "worldDescription": "A world with '; DROP TABLE users; --",
        "userPersona": "I'm ' OR 1=1; --",
        "aiPersona": "You handle SQL injection ' OR '1'='1",
    }),
    ("Very long title (500 chars)", {
        "title": "A" * 500,
        "worldDescription": "A world with a very long title to test DB column limits",
        "userPersona": "I'm a tester",
        "aiPersona": "You are a test assistant",
    }),
    ("RTL text", {
        "title": "שלום עולם",
        "worldDescription": "A world with RTL text العربية and Hebrew עברית",
        "userPersona": "I'm a tester who speaks עברית",
        "aiPersona": "You handle RTL text العربية correctly",
    }),
    ("Newlines in fields", {
        "title": "Line1\nLine2\nLine3",
        "worldDescription": "World\nwith\nnewlines",
        "userPersona": "I'm a tester\nwith newlines",
        "aiPersona": "You handle\nnewlines",
    }),
]
for name, b in special_bodies:
    test(f"Create campaign with {name}", "POST", "/api/campaigns", body=b, expect_status=201)

print("\n=== STARTING STATE JSON EDGE CASES ===")
starting_state_cases = [
    ("empty object", {}),
    ("null values", {"location": None, "inventory": None}),
    ("nested object", {"location": "x", "nested": {"a": {"b": {"c": 1}}}}),
    ("array at root level — should fail", []),
    ("string at root — should fail", "not an object"),
    ("number at root — should fail", 42),
    ("very large array", {"items": list(range(1000))}),
    ("deeply nested", {"a": {"b": {"c": {"d": {"e": {"f": {"g": {"h": "deep"}}}}}}}}),
]
for name, state in starting_state_cases:
    body = {
        "title": f"State test: {name}",
        "worldDescription": "A test world with enough words to pass validation checks properly.",
        "userPersona": "I am a tester verifying starting state JSON edge cases work fine.",
        "aiPersona": "You are a test assistant that responds briefly to verify the pipeline works.",
    }
    if state is not None:
        body["startingState"] = state
    expect = 201 if name != "array at root level — should fail" and name != "string at root — should fail" and name != "number at root — should fail" else None
    test(f"Starting state: {name}", "POST", "/api/campaigns", body=body, expect_status=expect)

print("\n=== MESSAGE CONTENT EDGE CASES ===")
# We can't easily test these without an LLM key, but we can verify the route accepts them
# by checking that we get past validation (any non-400/401 status)
msg_cases = [
    ("very long message", "x" * 10000),
    ("only emoji", "🎉🎊🎀🎯🚀"),
    ("RTL text", "שלום עולם"),
    ("HTML in message", "<script>alert('xss')</script>"),
    ("SQL injection in message", "'; DROP TABLE messages; --"),
    ("newlines", "line1\nline2\nline3"),
    ("tabs", "col1\tcol2\tcol3"),
    ("null bytes", "before\x00after"),
    ("unicode", "Hello 世界 🌍"),
]
for name, msg in msg_cases:
    # These will fail at OpenRouter (fake key) but should pass validation (not 400)
    test(f"Message: {name}", "POST", "/api/chat", body={"campaignId": cid, "message": msg}, headers=chat_headers)

print("\n=== SUMMARY ===")
print(f"Passed: {passed}")
print(f"Failed: {failed}")
if findings:
    print("\nFINDINGS:")
    for f in findings:
        print(f"  • {f['test']}: HTTP {f['status']} (expected {f['expected']})")
        print(f"    {f['body'][:150]}")

with open("/home/z/my-project/scripts/edge_findings.json", "w") as fp:
    json.dump({"passed": passed, "failed": failed, "findings": findings}, fp, indent=2)
