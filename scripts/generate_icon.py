#!/usr/bin/env python3
"""
Generate AzVault app icon – a shield with a key silhouette.
Outputs a 1024x1024 PNG suitable for Tauri icon generation.
"""

from PIL import Image, ImageDraw, ImageFont
import math
import os

SIZE = 1024
CENTER = SIZE // 2
PAD = 60

# ── Colours ──
BG_GRADIENT_TOP = (15, 23, 42)      # dark navy
BG_GRADIENT_BOT = (30, 41, 59)      # slightly lighter navy
SHIELD_FILL     = (37, 99, 235)     # vibrant blue (Azure-inspired)
SHIELD_EDGE     = (59, 130, 246)    # lighter blue edge
KEY_COLOR       = (255, 255, 255)   # white key
GLOW_COLOR      = (96, 165, 250)    # subtle blue glow


def draw_rounded_rect(draw, bbox, radius, fill):
    """Draw a rounded rectangle."""
    x0, y0, x1, y1 = bbox
    draw.rectangle([x0 + radius, y0, x1 - radius, y1], fill=fill)
    draw.rectangle([x0, y0 + radius, x1, y1 - radius], fill=fill)
    draw.pieslice([x0, y0, x0 + 2 * radius, y0 + 2 * radius], 180, 270, fill=fill)
    draw.pieslice([x1 - 2 * radius, y0, x1, y0 + 2 * radius], 270, 360, fill=fill)
    draw.pieslice([x0, y1 - 2 * radius, x0 + 2 * radius, y1], 90, 180, fill=fill)
    draw.pieslice([x1 - 2 * radius, y1 - 2 * radius, x1, y1], 0, 90, fill=fill)


def draw_shield(draw, cx, cy, w, h, fill, outline=None, outline_width=0):
    """Draw a shield shape (pointed bottom)."""
    top = cy - h // 2
    bot = cy + h // 2
    left = cx - w // 2
    right = cx + w // 2
    mid_y = cy + h // 6  # where the taper begins

    # Shield as polygon with rounded top
    points = [
        (left + 30, top),
        (right - 30, top),
        (right, top + 30),
        (right, mid_y),
        (cx, bot),
        (left, mid_y),
        (left, top + 30),
    ]

    if outline and outline_width:
        draw.polygon(points, fill=outline)
    draw.polygon(points, fill=fill)

    # Round top corners
    r = 50
    draw.pieslice([left, top, left + 2 * r, top + 2 * r], 180, 270, fill=fill)
    draw.pieslice([right - 2 * r, top, right, top + 2 * r], 270, 360, fill=fill)
    draw.rectangle([left + r, top, right - r, top + r], fill=fill)


def draw_key(draw, cx, cy, color, scale=1.0):
    """Draw a stylised key icon."""
    s = scale

    # Key head (circle with cutout)
    head_r = int(95 * s)
    head_cy = cy - int(100 * s)
    draw.ellipse(
        [cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r],
        fill=color
    )
    # Inner cutout of key head
    inner_r = int(50 * s)
    draw.ellipse(
        [cx - inner_r, head_cy - inner_r, cx + inner_r, head_cy + inner_r],
        fill=SHIELD_FILL
    )

    # Key shaft
    shaft_w = int(28 * s)
    shaft_top = head_cy + int(50 * s)
    shaft_bot = cy + int(180 * s)
    draw.rectangle(
        [cx - shaft_w // 2, shaft_top, cx + shaft_w // 2, shaft_bot],
        fill=color
    )

    # Key teeth (two notches on the right side)
    tooth_w = int(45 * s)
    tooth_h = int(22 * s)
    for i, ty in enumerate([shaft_bot - int(45 * s), shaft_bot - int(95 * s)]):
        tw = tooth_w if i == 0 else int(tooth_w * 0.7)
        draw.rectangle(
            [cx + shaft_w // 2, ty - tooth_h // 2,
             cx + shaft_w // 2 + tw, ty + tooth_h // 2],
            fill=color
        )


def create_icon():
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # ── Background: rounded square ──
    corner_r = 180
    # Gradient simulation via layered rectangles
    for y in range(PAD, SIZE - PAD):
        t = (y - PAD) / (SIZE - 2 * PAD)
        r = int(BG_GRADIENT_TOP[0] * (1 - t) + BG_GRADIENT_BOT[0] * t)
        g = int(BG_GRADIENT_TOP[1] * (1 - t) + BG_GRADIENT_BOT[1] * t)
        b = int(BG_GRADIENT_TOP[2] * (1 - t) + BG_GRADIENT_BOT[2] * t)
        draw.line([(PAD, y), (SIZE - PAD, y)], fill=(r, g, b, 255))

    # Create mask for rounded corners
    mask = Image.new('L', (SIZE, SIZE), 0)
    mask_draw = ImageDraw.Draw(mask)
    draw_rounded_rect(mask_draw, (PAD, PAD, SIZE - PAD, SIZE - PAD), corner_r, 255)
    img.putalpha(mask)

    # Re-create draw after alpha change
    comp = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    comp_draw = ImageDraw.Draw(comp)

    # Background with gradient
    for y in range(SIZE):
        t = y / SIZE
        r = int(BG_GRADIENT_TOP[0] * (1 - t) + BG_GRADIENT_BOT[0] * t)
        g = int(BG_GRADIENT_TOP[1] * (1 - t) + BG_GRADIENT_BOT[1] * t)
        b = int(BG_GRADIENT_TOP[2] * (1 - t) + BG_GRADIENT_BOT[2] * t)
        comp_draw.line([(0, y), (SIZE, y)], fill=(r, g, b, 255))

    # Apply rounded rect mask
    bg_mask = Image.new('L', (SIZE, SIZE), 0)
    bg_mask_draw = ImageDraw.Draw(bg_mask)
    draw_rounded_rect(bg_mask_draw, (PAD, PAD, SIZE - PAD, SIZE - PAD), corner_r, 255)
    comp.putalpha(bg_mask)

    draw = ImageDraw.Draw(comp)

    # ── Shield ──
    shield_w = 520
    shield_h = 600
    shield_cy = CENTER + 10

    # Outer glow
    glow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    draw_shield(glow_draw, CENTER, shield_cy, shield_w + 30, shield_h + 30,
                (*GLOW_COLOR, 40))
    comp = Image.alpha_composite(comp, glow)
    draw = ImageDraw.Draw(comp)

    # Shield body
    draw_shield(draw, CENTER, shield_cy, shield_w, shield_h, SHIELD_FILL)

    # Shield highlight (inner, slightly smaller, slightly lighter)
    draw_shield(draw, CENTER, shield_cy - 5, shield_w - 40, shield_h - 40,
                SHIELD_EDGE)
    draw_shield(draw, CENTER, shield_cy, shield_w - 50, shield_h - 50,
                SHIELD_FILL)

    # ── Key ──
    draw_key(draw, CENTER, shield_cy - 20, KEY_COLOR, scale=1.15)

    # ── Subtle "AZ" text at very bottom ──
    try:
        font = ImageFont.truetype("/System/Library/Fonts/SFMono-Bold.otf", 56)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 56)
        except (OSError, IOError):
            font = ImageFont.load_default()

    # Save
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                '..', 'src-tauri', 'icons', 'icon_source.png')
    comp.save(output_path, 'PNG')
    print(f"Icon saved to {output_path}")
    return output_path


if __name__ == '__main__':
    path = create_icon()
