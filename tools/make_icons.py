#!/usr/bin/env python3
"""Generate the extension's PNG icons without any image library.
Draws a blue rounded tile with three white "bin" bars (a sifter)."""
import struct, zlib, os, sys

def png(width, height, pixels):
    raw = b''.join(b'\x00' + bytes(row) for row in pixels)
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def icon(size):
    bg, fg = (31, 79, 216), (255, 255, 255)
    r = size * 0.22
    rows = []
    bars = [(0.24, 0.36), (0.44, 0.56), (0.64, 0.76)]
    for y in range(size):
        row = []
        for x in range(size):
            cx = min(max(x + 0.5, r), size - r); cy = min(max(y + 0.5, r), size - r)
            inside = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r
            if not inside:
                row += [0, 0, 0, 0]; continue
            fy = (y + 0.5) / size; fx = (x + 0.5) / size
            bar = any(a <= fy < b for a, b in bars) and 0.2 <= fx < 0.8
            # taper: each lower bar slightly narrower to suggest a funnel
            if bar:
                idx = next(i for i, (a, b) in enumerate(bars) if a <= fy < b)
                inset = 0.06 * idx
                bar = (0.2 + inset) <= fx < (0.8 - inset)
            row += list(fg if bar else bg) + [255]
        rows.append(row)
    return png(size, size, rows)

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'SifterSaverExtension', 'icons')
os.makedirs(out, exist_ok=True)
for s in (16, 48, 128):
    with open(os.path.join(out, f'icon{s}.png'), 'wb') as f:
        f.write(icon(s))
    print('wrote', os.path.join(out, f'icon{s}.png'))
