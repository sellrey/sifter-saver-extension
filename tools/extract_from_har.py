#!/usr/bin/env python3
"""Decode the Seller Portal quicklist bundle from a HAR capture and print the
markup facts Sifter Saver depends on. Use it when TCGplayer ships a new build.

    python3 tools/extract_from_har.py sellerportal.tcgplayer.com-scan-identify.har [--dump out.js]
"""
import base64, json, re, sys

def load_bundle(har_path):
    with open(har_path) as f:
        har = json.load(f)
    for e in har['log']['entries']:
        url = e['request']['url']
        if url.endswith('quicklist.js'):
            c = e['response']['content']
            txt = c.get('text', '')
            return url, base64.b64decode(txt).decode('utf-8', 'replace') if c.get('encoding') == 'base64' else txt
    raise SystemExit('quicklist.js not found in HAR (open the Scan & Identify page while recording)')

def show(title, pattern, src, limit=40):
    hits = sorted(set(re.findall(pattern, src)))
    print(f'\n== {title} ({len(hits)}) ==')
    for h in hits[:limit]:
        print('  ', h)

def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    url, src = load_bundle(sys.argv[1])
    print('bundle:', url, len(src), 'chars')
    if '--dump' in sys.argv:
        out = sys.argv[sys.argv.index('--dump') + 1]
        open(out, 'w').write(src)
        print('dumped to', out)

    show('routes', r'path:`\$\{JM\}(/[^`]+)`', src)
    show('sifter-job classes', r'"((?:sellerportal-sifter-job|job-config|job-summary|select-game-and-job-type)__[a-z0-9_-]+)"', src, 80)
    show('design-system input classes', r'"(tcg-input-(?:select|radio|checkbox|text|textarea|field)__[a-z0-9_-]+|tcg-base-dropdown__[a-z0-9_-]+|currency-input__[a-z0-9_-]+)"', src, 80)
    show('radio group names', r'name:"(foil-options|match-mode|batch-name-mode)"', src)
    show('data-testids (job config)', r'"data-testid":"(job-config-[a-z0-9-]+|sifter-job-[a-z0-9-]+|job-summary-[a-z0-9-]+)"', src, 80)
    show('button labels', r'\(0,[a-z]\.eW\)\("\s*(Start job|Continue|Go back|Cancel)\s*"\)', src)
    show('job type codes', r'"(sift-only|scan-and-sift|scan-only)"', src)

    for label, key in [('rarity table', 'const n={MTG:[{value:"c",label:"Common"}'), ('color table', 'const n={MTG:[{value:"black"'), ('foil finish table', 'LC={MTG:[{value:"Foil"'), ('games', 'code:"MTG",name:"Magic: The Gathering"')]:
        i = src.find(key)
        print(f'\n== {label} ==')
        print('  ' + (src[i:i + 1400] if i >= 0 else 'NOT FOUND — check catalog.js by hand'))

    m = re.search(r'IC=e=>[^;]{0,120}', src)
    print('\n== price-sift conditions ==\n  ', m.group(0) if m else 'NOT FOUND')
    m = re.search(r'hE=e=>[^,;]{0,160}', src)
    print('\n== bins section visibility (hE) ==\n  ', m.group(0) if m else 'NOT FOUND')

if __name__ == '__main__':
    main()
