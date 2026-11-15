# Head coaches of every team, 1946-47 to 2002-03, from Basketball-Reference's season coach pages (BAA_1947..1949,
# NBA_1950..2003). Writes tools/coach-old-cache.json: { "1947": [ { id, name, team, nth, overall, g, w, l, cw, cl, pw, pl }, ... ] }
# in page order (a team's first coach listed is its opening-night coach). One request every 3.2 seconds.
#   python3 tools/fetch-coaches-old.py
import json, os, re, time, urllib.request, html

OUT = os.path.join(os.path.dirname(__file__), 'coach-old-cache.json')
data = json.load(open(OUT)) if os.path.exists(OUT) else {}

def cell(row, stat):
    m = re.search(r'data-stat="%s"[^>]*>(.*?)</t[dh]>' % stat, row, re.S)
    return html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip() if m else ''

def num(v):
    try: return int(v)
    except ValueError: return 0

for Y in range(1947, 2004):
    if str(Y) in data: continue
    lg = 'BAA' if Y <= 1949 else 'NBA'
    url = 'https://www.basketball-reference.com/leagues/%s_%d_coaches.html' % (lg, Y)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    s = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
    i = s.find('id="%s_coaches"' % lg)
    body = s[i:s.find('</table>', i)]
    rows = []
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', body, re.S):
        m = re.search(r'href=["\']/coaches/([a-z0-9]+?)c?\.html["\']>([^<]+)</a>', row)
        t = re.search(r'href=["\']/teams/([A-Z]{3})/', row)
        if not m or not t: continue
        rows.append({ 'id': m.group(1), 'name': html.unescape(m.group(2)), 'team': t.group(1),
          'nth': num(cell(row, 'seas_num_franch')), 'overall': num(cell(row, 'seas_num_overall')),
          'g': num(cell(row, 'cur_g')), 'w': num(cell(row, 'cur_w')), 'l': num(cell(row, 'cur_l')),
          'cw': num(cell(row, 'car_w')), 'cl': num(cell(row, 'car_l')), 'pw': num(cell(row, 'car_w_p')), 'pl': num(cell(row, 'car_l_p')) })
    data[str(Y)] = rows
    json.dump(data, open(OUT, 'w'), separators=(',', ':'))
    print(Y, len(rows), rows[0]['name'] if rows else '-', flush=True)
    time.sleep(3.2)
print('done')
