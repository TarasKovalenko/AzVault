#!/usr/bin/env python3
"""
Generate AzVault app icon – professional shield + key design.
Renders at 4x then downsamples for crisp anti-aliased output.
Outputs 1024x1024 PNG for Tauri / iOS / macOS icon generation.
"""

from PIL import Image, ImageDraw, ImageFilter, ImageChops
import math
import os

SS = 4
FINAL = 1024
SZ = FINAL * SS
CX, CY = SZ // 2, SZ // 2


def lerp(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def shield(cx, cy, w, h):
    """Traditional shield: curved sides, tapered point bottom."""
    pts = []
    hw, hh = w / 2, h / 2
    top, bot, left, right = cy - hh, cy + hh, cx - hw, cx + hw
    r = w * 0.07
    taper = cy + hh * 0.10
    max_bow = w * 0.025

    for i in range(12):
        a = math.pi + (math.pi / 2) * i / 11
        pts.append((left + r + r * math.cos(a), top + r + r * math.sin(a)))
    for i in range(12):
        a = 1.5 * math.pi + (math.pi / 2) * i / 11
        pts.append((right - r + r * math.cos(a), top + r + r * math.sin(a)))
    for i in range(21):
        t = i / 20
        y = top + r + (taper - top - r) * t
        pts.append((right + math.sin(t * math.pi) * max_bow, y))
    for i in range(1, 36):
        t = i / 35
        e = t * t * (3 - 2 * t)
        pts.append((right - (right - cx) * e, taper + (bot - taper) * t))
    for i in range(34, 0, -1):
        t = i / 35
        e = t * t * (3 - 2 * t)
        pts.append((left + (cx - left) * e, taper + (bot - taper) * t))
    for i in range(20, -1, -1):
        t = i / 20
        y = top + r + (taper - top - r) * t
        pts.append((left - math.sin(t * math.pi) * max_bow, y))
    return pts


def gradient_fill(img, pts, c_top, c_bot, cy, hh):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    t_y, b_y = int(cy - hh), int(cy + hh)
    grad = Image.new('RGB', img.size)
    gd = ImageDraw.Draw(grad)
    for y in range(t_y, b_y + 1):
        gd.line([(0, y), (img.size[0], y)],
                fill=lerp(c_top, c_bot, (y - t_y) / max(1, b_y - t_y)))
    img.paste(grad, mask=mask)
    return img


def create_icon():
    img = Image.new('RGB', (SZ, SZ))
    draw = ImageDraw.Draw(img)

    # ─── Background ───
    for y in range(SZ):
        draw.line([(0, y), (SZ, y)],
                  fill=lerp((44, 78, 116), (24, 48, 76), y / SZ))

    # Circuit traces
    trc = Image.new('RGBA', (SZ, SZ), (0, 0, 0, 0))
    td = ImageDraw.Draw(trc)
    lw, cc, ca = max(3, SZ // 350), (52, 82, 118), 32
    for frac in [0.14, 0.30, 0.50, 0.70, 0.86]:
        y = int(frac * SZ)
        for x0, x1, sx in [(int(.03 * SZ), int(.17 * SZ), int(.17 * SZ)),
                            (int(.83 * SZ), int(.97 * SZ), int(.83 * SZ))]:
            td.line([(x0, y), (x1, y)], fill=(*cc, ca), width=lw)
            sd = int(.023 * SZ) * (1 if int(frac * 100) % 2 == 0 else -1)
            td.line([(sx, y), (sx, y + sd)], fill=(*cc, ca), width=lw)
            r2 = lw * 2
            td.ellipse([sx - r2, y + sd - r2, sx + r2, y + sd + r2], fill=(*cc, ca))
    img = img.convert('RGBA')
    img = Image.alpha_composite(img, trc)

    # ─── Shield shadow ───
    sw, sh = SZ * 0.74, SZ * 0.82
    scy = CY + SZ * 0.025
    shad = Image.new('RGBA', (SZ, SZ), (0, 0, 0, 0))
    ImageDraw.Draw(shad).polygon(
        shield(CX, scy + SZ * .014, sw + SZ * .005, sh + SZ * .005), fill=(0, 0, 0, 55))
    shad = shad.filter(ImageFilter.GaussianBlur(radius=SZ // 45))
    img = Image.alpha_composite(img, shad)

    flat = Image.new('RGB', (SZ, SZ), (30, 55, 82))
    flat.paste(img, mask=img.split()[3])
    img = flat
    draw = ImageDraw.Draw(img)

    # ─── Shield layers ───
    draw.polygon(shield(CX, scy, sw, sh), fill=(28, 38, 62))
    draw.polygon(shield(CX, scy, sw - SZ * .014, sh - SZ * .014), fill=(48, 62, 92))

    silver_top, silver_bot = (210, 218, 228), (155, 167, 183)
    fw, fh = sw - SZ * .055, sh - SZ * .055
    img = gradient_fill(img, shield(CX, scy, fw, fh),
                        silver_top, silver_bot, scy, fh / 2)
    draw = ImageDraw.Draw(img)

    iw, ih = fw - SZ * .022, fh - SZ * .022
    draw.polygon(shield(CX, scy, iw, ih), fill=(128, 140, 158))
    iw2, ih2 = iw - SZ * .008, ih - SZ * .008
    img = gradient_fill(img, shield(CX, scy, iw2, ih2),
                        silver_top, silver_bot, scy, ih2 / 2)
    draw = ImageDraw.Draw(img)

    # ─── Accents ───
    ac = (80, 215, 245)
    ts = SZ * .022
    inr = fw * .43

    def tri(px, py, s, d):
        if d == 'r':
            return [(px, py - s * .55), (px, py + s * .55), (px + s * 1.1, py)]
        if d == 'l':
            return [(px, py - s * .55), (px, py + s * .55), (px - s * 1.1, py)]
        return []

    for px, py, d in [
        (CX - inr + SZ * .02, scy - fh * .38, 'r'),
        (CX + inr - SZ * .02, scy - fh * .38, 'l'),
        (CX - inr + SZ * .005, scy + fh * .06, 'r'),
        (CX + inr - SZ * .005, scy + fh * .06, 'l'),
        (CX - fw * .13, scy + fh * .25, 'r'),
        (CX + fw * .13, scy + fh * .25, 'l'),
    ]:
        draw.polygon(tri(px, py, ts, d), fill=ac)

    # ─── Rivets ───
    ro, ri = SZ * .011, SZ * .0065
    for px, py in [
        (CX - sw / 2 + sw * .068, scy - sh / 2 + sh * .048),
        (CX + sw / 2 - sw * .068, scy - sh / 2 + sh * .048),
        (CX - sw / 2 + sw * .012, scy - sh * .08),
        (CX + sw / 2 - sw * .012, scy - sh * .08),
        (CX - sw / 2 + sw * .024, scy + sh / 2 * .12),
        (CX + sw / 2 - sw * .024, scy + sh / 2 * .12),
        (CX, scy + sh / 2 * .70),
    ]:
        draw.ellipse([px - ro, py - ro, px + ro, py + ro], fill=(80, 92, 112))
        draw.ellipse([px - ri, py - ri, px + ri, py + ri], fill=(178, 188, 205))

    # ═══════════════════ KEY ═══════════════════
    s = SZ / 1024 * 1.50
    kcy = scy - SZ * .005

    head_r = int(105 * s)
    head_cy = kcy - int(95 * s)
    hole_r = int(42 * s)
    shaft_hw = int(24 * s)   # wider shaft
    shaft_top = head_cy + int(58 * s)
    shaft_bot = kcy + int(185 * s)
    kc = (85, 218, 248)
    khi = (160, 242, 255)
    kdk = (48, 172, 205)
    shield_mid = lerp(silver_top, silver_bot, 0.35)

    # Key shadow
    img_rgba = img.convert('RGBA')
    ks = Image.new('RGBA', (SZ, SZ), (0, 0, 0, 0))
    ksd = ImageDraw.Draw(ks)
    off = int(8 * s)
    ksd.ellipse([CX - head_r + off, head_cy - head_r + off,
                 CX + head_r + off, head_cy + head_r + off], fill=(0, 0, 0, 32))
    ksd.rectangle([CX - shaft_hw + off, shaft_top + off,
                   CX + shaft_hw + off, shaft_bot + off], fill=(0, 0, 0, 32))
    teeth = [
        (shaft_bot - int(48 * s), int(58 * s), int(28 * s)),
        (shaft_bot - int(105 * s), int(45 * s), int(26 * s)),
    ]
    for ty, tw, th in teeth:
        ksd.rectangle([CX + shaft_hw + off, ty - th // 2 + off,
                       CX + shaft_hw + tw + off, ty + th // 2 + off], fill=(0, 0, 0, 32))
    ks = ks.filter(ImageFilter.GaussianBlur(radius=int(12 * s)))
    img_rgba = Image.alpha_composite(img_rgba, ks)
    flat2 = Image.new('RGB', (SZ, SZ), (30, 55, 82))
    flat2.paste(img_rgba, mask=img_rgba.split()[3])
    img = flat2
    draw = ImageDraw.Draw(img)

    # Key head circle
    draw.ellipse([CX - head_r, head_cy - head_r, CX + head_r, head_cy + head_r],
                 fill=kc)

    # Head top highlight
    hl_mask = Image.new('L', (SZ, SZ), 0)
    ImageDraw.Draw(hl_mask).ellipse(
        [CX - head_r, head_cy - head_r, CX + head_r, head_cy + head_r], fill=255)
    top_band = Image.new('L', (SZ, SZ), 0)
    ImageDraw.Draw(top_band).rectangle(
        [0, head_cy - head_r, SZ, head_cy], fill=255)
    band_mask = ImageChops.multiply(hl_mask, top_band)
    band_mask = band_mask.filter(ImageFilter.GaussianBlur(radius=int(20 * s)))
    img.paste(Image.new('RGB', (SZ, SZ), khi), mask=band_mask)
    draw = ImageDraw.Draw(img)

    # Hole
    draw.ellipse([CX - hole_r - int(4 * s), head_cy - hole_r - int(4 * s),
                  CX + hole_r + int(4 * s), head_cy + hole_r + int(4 * s)],
                 fill=kdk)
    draw.ellipse([CX - hole_r, head_cy - hole_r,
                  CX + hole_r, head_cy + hole_r], fill=shield_mid)

    # Shaft (thicker)
    draw.rectangle([CX - shaft_hw, shaft_top, CX + shaft_hw, shaft_bot], fill=kc)

    # Shaft center highlight stripe
    hl_hw = max(2, shaft_hw // 3)
    draw.rectangle([CX - hl_hw, shaft_top, CX + hl_hw, shaft_bot], fill=khi)

    # Shaft bottom rounded cap
    draw.ellipse([CX - shaft_hw, shaft_bot - shaft_hw,
                  CX + shaft_hw, shaft_bot + shaft_hw], fill=kc)

    # Two bold teeth (right side)
    for ty, tw, th in teeth:
        # Main tooth body
        draw.rectangle([CX + shaft_hw - 2, ty - th // 2,
                        CX + shaft_hw + tw, ty + th // 2], fill=kc)
        # Rounded end
        tr = th // 2
        draw.ellipse([CX + shaft_hw + tw - tr, ty - tr,
                      CX + shaft_hw + tw + tr, ty + tr], fill=kc)
        # Highlight band on top of tooth
        draw.rectangle([CX + shaft_hw - 2, ty - th // 2,
                        CX + shaft_hw + tw, ty - th // 5], fill=khi)

    # Zigzag / serrated left edge (more pronounced)
    n_top = shaft_top + int(50 * s)
    n_bot = shaft_bot - int(8 * s)
    n_n = 7
    n_h = (n_bot - n_top) / n_n
    dep = int(16 * s)
    for i in range(n_n):
        ny = n_top + i * n_h
        draw.polygon([
            (CX - shaft_hw, ny),
            (CX - shaft_hw + dep, ny + n_h / 2),
            (CX - shaft_hw, ny + n_h),
        ], fill=shield_mid)

    # ─── Specular highlight on shield ───
    img_rgba = img.convert('RGBA')
    spec = Image.new('RGBA', (SZ, SZ), (0, 0, 0, 0))
    ImageDraw.Draw(spec).ellipse(
        [CX - fw * .35, scy - fh * .45, CX + fw * .35, scy - fh * .22],
        fill=(255, 255, 255, 12))
    spec = spec.filter(ImageFilter.GaussianBlur(radius=SZ // 22))
    img_rgba = Image.alpha_composite(img_rgba, spec)

    # Vignette
    vig = Image.new('RGBA', (SZ, SZ), (0, 0, 0, 0))
    vd = ImageDraw.Draw(vig)
    for i in range(20):
        a = int(16 * (i / 20) ** 2)
        m = max(1, int(SZ * .005 * (20 - i) / 20))
        vd.rectangle([m, m, SZ - m, SZ - m], outline=(0, 0, 0, a))
    vig = vig.filter(ImageFilter.GaussianBlur(radius=SZ // 40))
    img_rgba = Image.alpha_composite(img_rgba, vig)

    # Downsample
    result = img_rgba.resize((FINAL, FINAL), Image.LANCZOS)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       '..', 'src-tauri', 'icons', 'icon_source.png')
    result.save(out, 'PNG')
    print(f"Saved {out} ({FINAL}x{FINAL})")
    return out


if __name__ == '__main__':
    create_icon()
