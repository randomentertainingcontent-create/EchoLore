#!/usr/bin/env python3
"""
EchoLore stress test.

Tests 10 diverse campaign configurations with 3-4 messages each, plus edge cases.
Captures errors, response quality issues, and persistence problems.

Usage:
  python3 scripts/stress_test.py
"""

import json
import time
import sys
import urllib.request
import urllib.error
from uuid import uuid4

BASE = "http://localhost:3000"
# Read from environment — NEVER commit real keys to git.
import os
OPENROUTER_KEY = os.environ.get("OPENROUTER_KEY", "")
if not OPENROUTER_KEY:
    print("ERROR: Set OPENROUTER_KEY env var before running this script.")
    sys.exit(1)
USER_ID = str(uuid4())

# Diverse campaign configurations — each tests a different scenario
CAMPAIGNS = [
    {
        "name": "modern-slice-of-life",
        "title": "Study Session",
        "worldDescription": "A modern suburban home on a quiet Tuesday evening. The user is a high school student preparing for finals week.",
        "userPersona": "I'm a 16-year-old high school student. I'm stressed about my math final tomorrow and a bit sleep-deprived.",
        "aiPersona": "You are my best friend Maya, who came over to study with me. You're supportive, funny, and good at math.",
        "startingState": {"location": "my bedroom", "time": "7pm Tuesday", "mood": "stressed"},
        "messages": [
            "hey, thanks for coming over",
            "can you help me with this calculus problem? I don't get limits",
            "*yawns* sorry I'm so tired",
        ],
    },
    {
        "name": "fantasy-epic",
        "title": "The Last Dragonsworn",
        "worldDescription": "A high fantasy world where dragons went extinct 200 years ago. An ancient prophecy speaks of a Dragonsworn who will wake them. The kingdom of Eldoria is ruled by a paranoid king who hunts anyone with dragon blood.",
        "userPersona": "I am Kael, a 22-year-old blacksmith's apprentice. I recently discovered scaly marks on my arms that glow at night. I don't know what they mean.",
        "aiPersona": "You are the Game Master. Narrate the world cinematically, voice all NPCs distinctly, and let my choices have real consequences. The tone is epic but grounded.",
        "startingState": {"location": "Village of Millhaven", "inventory": ["hammer", "leather apron"], "health": 100, "gold": 5, "secret": "dragon marks on arms"},
        "messages": [
            "I wake up and look at my arms in the mirror",
            "I should probably hide these marks before going to work",
            "I hear a knock at the door — who is it?",
        ],
    },
    {
        "name": "cyberpunk-noir",
        "title": "Neon Requiem",
        "worldDescription": "Neo-Kowloon, 2087. A vertical megacity run by 5 megacorps. The rain is acidic, the neon never sleeps, and the net is more real than the street. Augmented mercenaries called 'razors' do the corps' dirty work.",
        "userPersona": "I'm a razor named Vex. I have a military-grade cybernetic left arm, a chip in my head that lets me jack into the net, and a 50,000 cred debt to the Triad.",
        "aiPersona": "You are the Game Master. Gritty noir tone. Neon and rain and chrome. Control all NPCs (fixers, corpos, gangers, AIs). Present hard choices with real stakes.",
        "startingState": {"location": "Sector 7 night market", "inventory": ["cyberdeck", "kyber pistol", "fake ID"], "health": 100, "cred": 500, "debt": 50000},
        "messages": [
            "I step into the night market, hood up, looking for my fixer",
            "I jack into a nearby terminal to check for messages",
            "I notice someone following me — what do I do?",
        ],
    },
    {
        "name": "horror-isolation",
        "title": "The Lighthouse",
        "worldDescription": "A remote lighthouse on a rocky island off the coast of Maine, 1923. The previous keeper vanished without a trace. The supply boat comes once a month. A storm is rolling in.",
        "userPersona": "I am Thomas Whateley, the new lighthouse keeper. I took this job to escape a tragic past. I'm quiet, methodical, and starting to hear things at night.",
        "aiPersona": "You are the Storyteller. Build dread slowly. Sensory detail — the smell of brine, the sound of wind, the creak of old wood. Never show the monster directly. Let me scare myself.",
        "startingState": {"location": "lighthouse keeper's quarters", "sanity": 100, "inventory": ["lantern", "journal", "oil can"], "storm": "approaching"},
        "messages": [
            "I sit at the desk and open the previous keeper's journal",
            "I hear something scratching at the door — I freeze",
            "I light my lantern and go downstairs to investigate",
        ],
    },
    {
        "name": "space-opera",
        "title": "Void Between Stars",
        "worldDescription": "The year is 2387. Humanity spans 12 star systems via the Voidgate network. The Andromeda Compact is a fragile alliance of humans and two alien species. A civil war is brewing.",
        "userPersona": "I'm Captain Yara Okafor of theCompact patrol ship Whitetip. I'm ex-military, pragmatic, and I have a daughter back on Earth I haven't seen in 3 years.",
        "aiPersona": "You are the Game Master. Space opera tone. Ship-to-ship combat, diplomacy, moral dilemmas. Voice the crew and any aliens distinctly.",
        "startingState": {"location": "bridge of the Whitetip", "ship": "Whitetip (patrol corvette)", "crew": 47, "fuel": 60, "shields": 100, "mission": "patrol Sector 9"},
        "messages": [
            "I sit in the captain's chair and ask for a status report",
            "An unknown ship drops out of voidspace 1000 klicks ahead — what do I see?",
            "I order comms open and hail them",
        ],
    },
    {
        "name": "cozy-mystery",
        "title": "Murder at Pinewood Manor",
        "worldDescription": "An English country estate, 1934. Lord Pinewood has been murdered in his study during a dinner party. Six guests remain in the house, snowed in. The police can't arrive until morning.",
        "userPersona": "I am Lady Eleanor Ashby, a widow and amateur detective. I'm 52, sharp-eyed, and I knew Lord Pinewood from our youth. I have a reputation for solving puzzles.",
        "aiPersona": "You are the Storyteller. Cozy mystery tone — atmospheric, character-driven, no gore. Voice each of the six suspects distinctly. Drop clues fair and square.",
        "startingState": {"location": "Pinewood Manor — drawing room", "suspects": ["the butler", "the widow", "the business partner", "the niece", "the doctor", "the maid"], "clues": [], "time": "9pm"},
        "messages": [
            "I survey the drawing room. Who's here and what are they doing?",
            "I'd like to question the butler first",
            "I notice something odd about the fireplace — what is it?",
        ],
    },
    {
        "name": "post-apocalyptic",
        "title": "The Long Winter",
        "worldDescription": "2031. A solar flare wiped out the power grid 3 years ago. 90% of humanity is dead. The survivors scrape by in small communities, hoarding canned food and ammo. A perpetual nuclear winter has set in.",
        "userPersona": "I'm Scout, a 28-year-old scavenger. I travel alone with my dog Rusty. I trust no one but I have a soft spot for kids.",
        "aiPersona": "You are the Game Master. Bleak, realistic tone. Resources are scarce. Every encounter could be a trap or a friend. Voice NPCs warily — trust is rare.",
        "startingState": {"location": "abandoned gas station", "inventory": ["hunting rifle (6 rounds)", "canned beans x3", "water (half full)", "Rusty (dog)"], "health": 80, "ammo": 6, "warmth": "cold"},
        "messages": [
            "I duck into the gas station to escape the wind. What do I see?",
            "Rusty growls at something in the back room — I raise my rifle",
            "I call out: 'Whoever's in there, come out slow'",
        ],
    },
    {
        "name": "romance-slow-burn",
        "title": "The Bookshop",
        "worldDescription": "A small independent bookshop in Edinburgh, present day. Rain against the windows. The smell of old paper and coffee. Two people keep bumping into each other in the poetry section.",
        "userPersona": "I'm Alex, a 30-year-old graphic designer who just moved to Edinburgh after a bad breakup. I spend my lunch breaks in this bookshop, hiding in the poetry section.",
        "aiPersona": "You play Jamie, the bookshop owner's son who works the register. Jamie is 32, warm, well-read, and has noticed Alex. Slow-burn romance tone — longing glances, not instalove.",
        "startingState": {"location": "poetry section, back of shop", "time": "Tuesday lunch", "tension": "low", "alex_heart": "guarded"},
        "messages": [
            "I'm browsing the Larkin shelf when someone clears their throat behind me",
            "I look up — what does Jamie look like and what do they say?",
            "I smile back, suddenly aware I haven't brushed my hair",
        ],
    },
    {
        "name": "thin-prompts-modern",
        "title": "idk whatever",
        "worldDescription": "just normal life",
        "userPersona": "im a guy",
        "aiPersona": "ur my buddy",
        "startingState": {},
        "messages": [
            "sup",
            "wanna play video games",
            "i got a new game wanna try",
        ],
    },
    {
        "name": "edge-cases-special-chars",
        "title": "Weird \"Quotes\" & Emojis 🎉",
        "worldDescription": "A world with \"quotes\" and 'apostrophes' and special chars: <>&; and emoji 🚀 and unicode: 日本語 and RTL: שלום",
        "userPersona": "I'm a tester who uses weird characters: \"quotes\" 'apos' <html> &amp; 🎉 日本語",
        "aiPersona": "You handle edge cases gracefully. \"Quotes\" and emoji 🎉 and unicode 日本語 should not break you.",
        "startingState": {"location": "test 🎉", "unicode": "日本語", "nested": {"a": 1, "b": [1, 2, 3]}},
        "messages": [
            "Let's test \"quotes\" and emoji 🎀 and unicode 中文",
            "What about <script>alert('xss')</script> in my input?",
            "And newlines?\nLine 2\nLine 3",
        ],
    },
]


def api(method, path, body=None, headers=None):
    """Call the API, return (status, json_or_text, raw_response)."""
    h = {"Content-Type": "application/json", "x-user-id": USER_ID}
    if headers:
        h.update(headers)
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode()
            try:
                return r.status, json.loads(raw), raw
            except json.JSONDecodeError:
                return r.status, None, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw), raw
        except json.JSONDecodeError:
            return e.code, None, raw
    except Exception as e:
        return 0, {"error": str(e)}, str(e)


def create_campaign(cfg):
    """Create a campaign, return (campaign_id, error_or_none)."""
    body = {
        "title": cfg["title"],
        "worldDescription": cfg["worldDescription"],
        "userPersona": cfg["userPersona"],
        "aiPersona": cfg["aiPersona"],
    }
    if cfg.get("startingState"):
        body["startingState"] = cfg["startingState"]
    status, j, _ = api("POST", "/api/campaigns", body)
    if status != 201 or not j or "campaign" not in j:
        return None, f"HTTP {status}: {j}"
    return j["campaign"]["id"], None


def send_message(campaign_id, message):
    """Send a chat message, return (status, response_text_or_error, duration_s)."""
    headers = {
        "x-openrouter-key": OPENROUTER_KEY,
        "x-chat-model": "openai/gpt-oss-120b:free",
        "x-lore-model": "openai/gpt-oss-20b:free",
        "x-embed-model": "text-embedding-3-small",
        "x-embed-dimensions": "1536",
    }
    body = {"campaignId": campaign_id, "message": message}
    t0 = time.time()
    status, j, raw = api("POST", "/api/chat", body, headers)
    duration = time.time() - t0
    # /api/chat returns an SSE stream, not JSON. Parse it.
    if status == 200 and raw:
        # Extract text from the SSE stream
        text_parts = []
        for line in raw.split("\n"):
            line = line.strip()
            if line.startswith("data:"):
                try:
                    d = json.loads(line[5:].strip())
                    if d.get("type") == "error":
                        return status, f"STREAM ERROR: {d.get('errorText', 'unknown')}", duration
                except json.JSONDecodeError:
                    pass
        # If we got 200 and no error in stream, the assistant reply was persisted.
        # Verify by fetching messages.
        time.sleep(2)
        s2, j2, _ = api("GET", f"/api/messages/{campaign_id}")
        if s2 == 200 and j2:
            msgs = j2.get("messages", [])
            assistant_msgs = [m for m in msgs if m["role"] == "assistant"]
            if assistant_msgs:
                last = assistant_msgs[-1]["content"]
                return status, last, duration
            return status, "NO ASSISTANT REPLY PERSISTED", duration
        return status, f"FAILED to fetch messages: HTTP {s2}", duration
    return status, str(j) if j else raw, duration


def get_lorebook(campaign_id):
    s, j, _ = api("GET", f"/api/lorebook/{campaign_id}")
    if s == 200 and j:
        return j.get("state"), j.get("updatedAt")
    return None, None


def run():
    print(f"EchoLore stress test — user {USER_ID}")
    print(f"Testing {len(CAMPAIGNS)} campaign configurations × 3 messages each")
    print("=" * 80)

    findings = []
    total_messages = 0
    total_errors = 0

    for cfg in CAMPAIGNS:
        print(f"\n--- {cfg['name']} ---")
        print(f"  Title: {cfg['title']}")

        # Create campaign
        cid, err = create_campaign(cfg)
        if err:
            print(f"  ❌ CREATE FAILED: {err}")
            findings.append({"campaign": cfg["name"], "issue": "create failed", "detail": err})
            continue
        print(f"  ✓ Created: {cid}")

        # Verify lorebook initial state
        state, _ = get_lorebook(cid)
        if state is None:
            print(f"  ❌ LOREBOOK MISSING")
            findings.append({"campaign": cfg["name"], "issue": "lorebook missing after create"})
        else:
            print(f"  ✓ Lorebook has {len(state)} keys")

        # Send each message
        for i, msg in enumerate(cfg["messages"], 1):
            total_messages += 1
            print(f"  → msg {i}: {msg[:60]}{'...' if len(msg) > 60 else ''}")
            status, reply, duration = send_message(cid, msg)
            if status != 200:
                total_errors += 1
                print(f"    ❌ HTTP {status} ({duration:.1f}s): {reply[:200]}")
                findings.append({
                    "campaign": cfg["name"], "msg_idx": i, "msg": msg,
                    "issue": f"HTTP {status}", "detail": str(reply)[:300],
                })
            elif "ERROR" in str(reply) or "FAILED" in str(reply):
                total_errors += 1
                print(f"    ❌ {reply[:200]}")
                findings.append({
                    "campaign": cfg["name"], "msg_idx": i, "msg": msg,
                    "issue": "stream/persistence error", "detail": str(reply)[:300],
                })
            else:
                # Check reply quality
                reply_lower = reply.lower()
                quality_issues = []
                if "as an ai" in reply_lower or "language model" in reply_lower:
                    quality_issues.append("broke character (mentioned being AI)")
                if "i'd be happy to help" in reply_lower or "how can i assist" in reply_lower:
                    quality_issues.append("chatbot language")
                if len(reply) < 50:
                    quality_issues.append(f"suspiciously short reply ({len(reply)} chars)")
                if reply.startswith("Need to") or reply.startswith("Let me") or reply.startswith("I should"):
                    quality_issues.append("reasoning leak suspected")

                if quality_issues:
                    print(f"    ⚠️  Quality issues: {', '.join(quality_issues)}")
                    findings.append({
                        "campaign": cfg["name"], "msg_idx": i, "msg": msg,
                        "issue": "quality", "detail": "; ".join(quality_issues),
                        "reply_preview": reply[:200],
                    })
                else:
                    print(f"    ✓ OK ({len(reply)} chars, {duration:.1f}s)")

            # Rate limit courtesy pause
            time.sleep(2)

        # After 3 messages, check lorebook (should NOT have updated yet — needs 4)
        state_after, updated_at = get_lorebook(cid)
        if state_after is None:
            print(f"  ❌ LOREBOOK DISAPPEARED after messages")
            findings.append({"campaign": cfg["name"], "issue": "lorebook disappeared"})
        else:
            print(f"  ✓ Lorebook still has {len(state_after)} keys (3 msgs — no auto-update expected)")

    print("\n" + "=" * 80)
    print(f"SUMMARY: {total_messages} messages sent, {total_errors} errors, {len(findings)} findings")
    print("\nFINDINGS:")
    for f in findings:
        print(f"  • [{f['campaign']}] {f['issue']}: {f.get('detail', '')[:150]}")

    # Save full findings to file
    with open("/home/z/my-project/scripts/stress_findings.json", "w") as fp:
        json.dump({"total_messages": total_messages, "total_errors": total_errors, "findings": findings}, fp, indent=2)
    print(f"\nFull findings saved to scripts/stress_findings.json")


if __name__ == "__main__":
    run()
