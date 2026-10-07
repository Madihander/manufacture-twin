"""Готовит модели Kenney для сцены: копирует нужные GLB в public/models и перекрашивает палитры
под дизайн-систему (сталь + бренд-голубой вместо фиолетового и оранжевого).
Запуск: python scripts/prepare-models.py"""
import colorsys
import os
import shutil
from PIL import Image

SRC = 'assets/kenney'
DST = 'public/models'

SETS = {
    'factory': ('factory-kit_3.0', ['robot-arm-a', 'machine', 'machine-window', 'machine-fortified', 'scanner-high',
                                    'conveyor-long', 'crane', 'screen-hanging-wide', 'warning-traffic']),
    'crates': ('factory-kit_3.0', ['box-large', 'box-small', 'box-wide']),
    'cars': ('car-kit', ['sedan', 'hatchback-sports', 'sedan-sports']),
}


def remap(img, mode):
    img = img.convert('RGB')
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b = (c / 255 for c in px[x, y])
            h, s, v = colorsys.rgb_to_hsv(r, g, b)
            deg = h * 360
            if mode == 'factory':
                if 200 <= deg <= 300 and s > 0.12:
                    # Фиолетово-синий металл Kenney → светлая сталь с холодным оттенком.
                    h, s, v = 212 / 360, s * 0.28, min(1, v * 1.18 + 0.04)
                elif 10 <= deg <= 55 and s > 0.3:
                    # Оранжевые акценты → бренд-голубой.
                    h, s, v = 200 / 360, 0.95, min(1, v * 0.85)
            elif mode == 'crates':
                if 10 <= deg <= 55 and s > 0.2:
                    # Картон: тёплый, но приглушённый.
                    h, s, v = 38 / 360, s * 0.32, min(1, v * 1.08)
            elif mode == 'cars':
                # Краска кузова (серо-фиолетовая клетка) → почти белая, цвет даёт instanceColor.
                if 0.32 < v < 0.62 and s < 0.25 and 200 <= deg <= 260:
                    h, s, v = 0, 0, min(1, 0.86 + (v - 0.45) * 0.6)
                elif 10 <= deg <= 55 and s > 0.3:
                    h, s, v = 0, 0, 0.25
            px[x, y] = tuple(int(c * 255) for c in colorsys.hsv_to_rgb(h, s, v))
    return img


for name, (kit, files) in SETS.items():
    out = os.path.join(DST, name)
    os.makedirs(os.path.join(out, 'Textures'), exist_ok=True)
    for f in files:
        shutil.copy(os.path.join(SRC, kit, 'GLB format', f + '.glb'), os.path.join(out, f + '.glb'))
    tex = Image.open(os.path.join(SRC, kit, 'GLB format', 'Textures', 'colormap.png'))
    remap(tex, name).save(os.path.join(out, 'Textures', 'colormap.png'))
    print(name, len(files), 'моделей')
