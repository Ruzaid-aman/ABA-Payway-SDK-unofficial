# Live-verified fix (Newman + curl, 21-22 Sep 2026): webhook.site moved its JSON API
# onto the main host - api.webhook.site/token* now serves an unrelated app (returns a
# bogus "translated_text" JSON with HTTP 200). Point the folder-09 KHQR flow and the
# folder-10 "Sync webhook.site -> Postman" request at https://webhook.site, and make
# the folder-10 sync parse BOTH the legacy top-level array and the current paginated
# {"data": [...]} response shape. Syncs _build parts 09 + 10.
import json, os

os.chdir(os.path.join(os.path.dirname(__file__), '..', '..', 'payway-boilerplate', 'Postman Collection API Testing'))
FN = 'exp-PayWay API — Complete Collection.postman_collection.json'
c = json.load(open(FN, encoding='utf-8'))

def to_main_host(url):
    host = url.get('host', [])
    if host and host[0] == 'api' and len(host) > 1 and host[1] == 'webhook' and host[-1] == 'site':
        url['host'] = host[1:]
        if url.get('raw', '').startswith('https://api.webhook.site/'):
            url['raw'] = url['raw'].replace('https://api.webhook.site/', 'https://webhook.site/', 1)
        return True
    return False

changed = []

# Folder 09: receiver creation + callback pull
f09 = [f for f in c['item'] if f['name'].startswith('09')][0]
for it in f09['item']:
    raw = it['request'].get('url', {}).get('raw', '')
    if to_main_host(it['request']['url']):
        changed.append(f"{f09['name']}/{it['name']} URL -> {it['request']['url']['raw']}")

# Folder 10: the existing sync request (same incident)
f10 = [f for f in c['item'] if f['name'].startswith('10')][0]
SYNC = 'Sync webhook.site -> Postman (pull callbacks)'
sync = [it for it in f10['item'] if it['name'] == SYNC][0]
if to_main_host(sync['request']['url']):
    changed.append(f"{f10['name']}/{SYNC} URL -> {sync['request']['url']['raw']}")

# Parse both response shapes; keep the rest of the import logic byte-identical.
te = sync['event'][1]['script']['exec']
OPEN_BLOCK = [
    "// webhook.site returns either a legacy top-level array or a paginated {data: [...]}.",
    "var pj = pm.response.json();",
    "var list = Array.isArray(pj) ? pj : (pj && pj.data) || [];",
    "var synced = false;",
    "list.forEach(function (req) {",
]
OLD_OPEN = [
    "var list = pm.response.json();",
    "var synced = false;",
    "[].concat(list || []).forEach(function (req) {",
]
if OPEN_BLOCK[0] in te:
    pass  # already applied
elif all(old in te for old in OLD_OPEN):
    i = te.index(OLD_OPEN[0])
    te[i:i + len(OLD_OPEN)] = OPEN_BLOCK
    changed.append(f"{SYNC} test: response-shape parsing block replaced ({len(OLD_OPEN)} lines -> {len(OPEN_BLOCK)})")
else:
    raise SystemExit(f"{SYNC}: expected opening lines not found - aborting")

json.dump(c, open(FN, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=2)
open(FN, 'a', encoding='utf-8', newline='\n').write('\n')

# Sync the touched _build parts.
for folder, partfile in ((f09, '_build/part_09_khqr.json'), (f10, '_build/part_10_callbacks.json')):
    import copy
    part = {'folder': folder['name'], 'description': folder.get('description', ''), 'item': copy.deepcopy(folder['item'])}
    with open(partfile, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(part, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    changed.append(f'{partfile} synced')

for line in changed:
    print('-', line)
print('done')
