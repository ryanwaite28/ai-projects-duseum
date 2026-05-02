#!/usr/bin/env python3
"""
Generate frontend/public/favicon.ico for the Duseum D logo mark.

Renders 16×16, 32×32, and 48×48 frames with 8×8 supersampling anti-aliasing.
Uses signed-distance fields for the rounded-rect border and D letter shape.

Usage:  python3 scripts/generate-favicon.py
"""
import math
import os
import struct
import zlib

# ── Design tokens ──────────────────────────────────────────────────────────────
BG   = (14,  13,  11,  255)   # #0e0d0b  ink background
GOLD = (200, 151, 58,  255)   # #c8973a  gold

# ── SDF primitives ─────────────────────────────────────────────────────────────

def sdf_box(px, py, cx, cy, hw, hh):
    """Exact SDF for an axis-aligned rectangle. Negative = inside."""
    dx = abs(px - cx) - hw
    dy = abs(py - cy) - hh
    return math.sqrt(max(dx, 0)**2 + max(dy, 0)**2) + min(max(dx, dy), 0)

def sdf_rounded_rect(px, py, cx, cy, hw, hh, r):
    """Exact SDF for a rounded rectangle. Negative = inside."""
    return sdf_box(px, py, cx, cy, hw - r, hh - r) - r

def sdf_d_letter(px, py, size):
    """
    Approximate SDF for the D glyph (left vertical bar ∪ right half-ellipse).
    Proportions match the 32×32 CSS logo mark. Negative = inside the D.
    """
    s = size / 32.0

    # Vertical bar (left stroke)
    bx0, bx1 = 9.5 * s, 13.0 * s
    by0, by1 = 8.5 * s, 23.5 * s
    bar_cx   = (bx0 + bx1) / 2
    bar_cy   = (by0 + by1) / 2
    bar_hw   = (bx1 - bx0) / 2
    bar_hh   = (by1 - by0) / 2
    d_bar    = sdf_box(px, py, bar_cx, bar_cy, bar_hw, bar_hh)

    # Right half-ellipse (px >= bx1, bulges to the right)
    ec_x = bx1
    ec_y = (by0 + by1) / 2
    ea   = 9.0 * s                  # horizontal radius
    eb   = (by1 - by0) / 2          # vertical radius  (= bar_hh)

    if px >= ec_x:
        qx     = (px - ec_x) / ea
        qy     = (py - ec_y) / eb
        d_ell  = (math.sqrt(qx * qx + qy * qy) - 1.0) * min(ea, eb)
    else:
        # Left of the ellipse's flat edge — nearest point is on that edge
        clamp_y = max(by0, min(by1, py))
        d_ell   = math.sqrt((px - ec_x) ** 2 + (py - clamp_y) ** 2)

    return min(d_bar, d_ell)

# ── Renderer ───────────────────────────────────────────────────────────────────

def render(size):
    """Return a list of (R, G, B, A) tuples for a size×size image."""
    AA  = 8                             # sub-pixels per axis (8×8 = 64 samples)
    cx  = cy = (size - 1) / 2.0
    hw  = hh = (size - 2.0) / 2.0
    r   = 5.5 * size / 32.0            # corner radius
    bw  = 1.5 * size / 32.0            # border width

    pixels = []
    for y in range(size):
        for x in range(size):
            border_cov = 0.0
            d_cov      = 0.0

            for sy in range(AA):
                for sx in range(AA):
                    spx = x + (sx + 0.5) / AA
                    spy = y + (sy + 0.5) / AA

                    sdf_out = sdf_rounded_rect(spx, spy, cx, cy, hw, hh, r)
                    sdf_inn = sdf_out + bw   # negative when > bw inside outer rect

                    if sdf_out <= 0.0:
                        if sdf_inn > 0.0:
                            # Border zone (between outer edge and inner edge)
                            border_cov += 1.0
                        else:
                            # Interior — check D glyph
                            sd = sdf_d_letter(spx, spy, size)
                            if sd <= 0.0:
                                d_cov += 1.0
                            elif sd < 1.0:
                                d_cov += 1.0 - sd   # D edge AA
                    elif sdf_out < 1.0:
                        # Just outside outer rect — anti-alias fringe
                        border_cov += 1.0 - sdf_out

            frac       = 1.0 / (AA * AA)
            bc         = min(border_cov * frac, 1.0)
            dc         = min(d_cov * frac, 1.0)
            gold_cov   = bc + dc - bc * dc       # union

            rc = int(BG[0] + (GOLD[0] - BG[0]) * gold_cov)
            gc = int(BG[1] + (GOLD[1] - BG[1]) * gold_cov)
            bc_ = int(BG[2] + (GOLD[2] - BG[2]) * gold_cov)
            pixels.append((rc, gc, bc_, 255))

    return pixels

# ── PNG encoder (pure stdlib) ──────────────────────────────────────────────────

def make_png(size, pixels):
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    raw = b''.join(
        b'\x00' + b''.join(bytes(p) for p in pixels[y * size:(y + 1) * size])
        for y in range(size)
    )
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )

# ── ICO encoder ────────────────────────────────────────────────────────────────

def make_ico(frames):
    """frames: list of (size, png_bytes). Embeds PNGs directly (Vista+ ICO)."""
    n      = len(frames)
    offset = 6 + n * 16
    entries = b''
    data    = b''
    for size, png in frames:
        sz = size if size < 256 else 0
        entries += struct.pack('<BBBBHHII', sz, sz, 0, 0, 1, 32, len(png), offset)
        offset  += len(png)
        data    += png
    return struct.pack('<HHH', 0, 1, n) + entries + data

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path   = os.path.join(script_dir, '..', 'frontend', 'public', 'favicon.ico')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    frames = []
    for sz in (16, 32, 48):
        print(f'  rendering {sz}×{sz}…', end=' ', flush=True)
        px  = render(sz)
        png = make_png(sz, px)
        frames.append((sz, png))
        print('done')

    ico = make_ico(frames)
    with open(out_path, 'wb') as f:
        f.write(ico)

    print(f'\nfavicon.ico → {os.path.abspath(out_path)}  ({len(ico):,} bytes)')

if __name__ == '__main__':
    main()
