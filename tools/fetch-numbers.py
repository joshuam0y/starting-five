# Jersey numbers of every player on every team, 1946-47 to 2026-27, from Basketball-Reference team roster pages.
# Writes tools/number-cache.json: { "1960": { "BOS": { "russebi01": "6", ... }, ... }, ... } (Basketball-Reference team
# codes; a player with two numbers in one season keeps the first listed). Resumes where it stopped. One request every 3.2 s.
#   python3 tools/fetch-numbers.py
import json, os, re, time, urllib.request

OUT = os.path.join(os.path.dirname(__file__), 'number-cache.json')
data = json.load(open(OUT)) if os.path.exists(OUT) else {}

def get(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            return urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
        except Exception as e:
            if '404' in str(e): return ''
            time.sleep(20 * (attempt + 1))
    return ''

for Y in sorted(range(1947, 2028), reverse=True):   # newest first: most leagues start there
    ys = str(Y)
    lg = 'BAA' if Y <= 1949 else 'NBA'
    if ys not in data or '_teams' not in data[ys]:
        s = get('https://www.basketball-reference.com/leagues/%s_%d.html' % (lg, Y))
        teams = sorted(set(re.findall(r'/teams/([A-Z]{3})/%d\.html' % Y, s)))
        data.setdefault(ys, {})['_teams'] = teams
        json.dump(data, open(OUT, 'w'), separators=(',', ':'))
        time.sleep(3.2)
    for T in data[ys]['_teams']:
        if T in data[ys]: continue
        s = get('https://www.basketball-reference.com/teams/%s/%d.html' % (T, Y))
        i = s.find('id="roster"')
        body = s[i:s.find('</table>', i)] if i >= 0 else ''
        nums = {}
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>', body, re.S):
            n = re.search(r'data-stat="number"[^>]*>([^<]*)<', row)
            p = re.search(r'/players/[a-z]/([a-z0-9]+)\.html', row)
            if n and p and n.group(1).strip() and p.group(1) not in nums:
                nums[p.group(1)] = n.group(1).strip().split(',')[0].strip()
        data[ys][T] = nums
        json.dump(data, open(OUT, 'w'), separators=(',', ':'))
        time.sleep(3.2)
    print(Y, len(data[ys]['_teams']), 'teams', sum(len(v) for k, v in data[ys].items() if k != '_teams'), 'numbers', flush=True)
print('done')
