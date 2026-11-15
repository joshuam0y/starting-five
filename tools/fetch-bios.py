#!/usr/bin/env python3
# Downloads height, weight and position from Basketball-Reference player pages for the drafted players the game has no
# ratings file for (most never played, so tools/build-start.js used to make their body up). -> tools/bio-cache.json
#   { "mcneecl01": { "ht": 70, "wt": null, "pos": "Forward" }, ... }
# The queue is tools/bio-queue.json (first-round picks first). Resumable: ids already in the cache are skipped.
# Basketball-Reference allows about 20 requests a minute, so this waits 3.2 seconds between pages (all 6,500 take ~6 hours).
#   python3 tools/fetch-bios.py [max]
import json, os, re, subprocess, sys, time
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'tools', 'bio-cache.json')
QUEUE = json.load(open(os.path.join(ROOT, 'tools', 'bio-queue.json')))
cache = json.load(open(OUT)) if os.path.exists(OUT) else {}
limit = int(sys.argv[1]) if len(sys.argv) > 1 else len(QUEUE)

def get(url):
    for attempt in range(4):
        r = subprocess.run(['curl', '-sL', '-m', '40', '-A', 'Mozilla/5.0', '-w', '\n%{http_code}', url], capture_output=True)
        body, code = r.stdout.decode('utf8', 'ignore').rsplit('\n', 1)
        if code == '200': return body
        if code == '404': return ''
        print('http', code, 'waiting', flush=True)
        time.sleep(120 * (attempt + 1))   # 429: Basketball-Reference wants a long pause
    return None

def parse(html):
    text = re.sub(r'<[^>]+>', ' ', html)
    text = text.replace('&nbsp;', ' ')
    pos = None
    m = re.search(r'Position:\s*([A-Za-z ,/-]+?)\s{2,}', text)
    if m: pos = re.sub(r'\s+', ' ', m.group(1)).strip()
    ht = wt = None
    m = re.search(r'\b(\d)-(\d{1,2})\s*,?\s*(\d{2,3})lb', text) or re.search(r'\b(\d)-(\d{1,2})\s*\(\d{3}cm', text)
    if m:
        ht = int(m.group(1)) * 12 + int(m.group(2))
        if m.lastindex >= 3 and m.group(3) and m.group(3).isdigit() and len(m.group(3)) >= 2 and 'lb' in m.group(0): wt = int(m.group(3))
    m2 = re.search(r'(\d{2,3})lb', text)
    if wt is None and m2: wt = int(m2.group(1))
    return { 'ht': ht, 'wt': wt, 'pos': pos }

done = 0
for pid in QUEUE:
    if done >= limit: break
    if pid in cache: continue
    html = get('https://www.basketball-reference.com/players/%s/%s.html' % (pid[0], pid))
    if html is None: print('giving up for now at', pid, flush=True); break
    cache[pid] = parse(html) if html else { 'ht': None, 'wt': None, 'pos': None }
    done += 1
    if done % 25 == 0:
        json.dump(cache, open(OUT, 'w'), separators=(',', ':'))
        print(done, 'fetched, cache', len(cache), pid, cache[pid], flush=True)
    time.sleep(3.2)
json.dump(cache, open(OUT, 'w'), separators=(',', ':'))
print('done', done, 'cache', len(cache), flush=True)
