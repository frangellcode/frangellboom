# Renders src/assets/sky.jpg, the home screen's cloud sky (python3 scripts/generate-sky.py src/assets/sky.jpg).
# Generated rather than photographed, so the app ships no third-party imagery.
import numpy as np, sys
from PIL import Image, ImageFilter
W, H = 1320, 2868
rng = np.random.default_rng(7)
def noise(scale):
    h, w = max(2, H // scale), max(2, W // scale)
    small = Image.fromarray((rng.random((h, w)) * 255).astype(np.uint8))
    return np.asarray(small.resize((W, H), Image.BICUBIC), dtype=np.float32) / 255
def fbm(base, octaves=6):
    total, amp, norm = 0, 1.0, 0
    for o in range(octaves):
        total = total + noise(max(2, base >> o)) * amp
        norm += amp; amp *= 0.55
    return total / norm
y = np.linspace(0, 1, H)[:, None]
# sky: deep blue at the top, pale blue, then warm peach at the horizon
stops = [(0.0, (74, 112, 160)), (0.35, (128, 165, 205)), (0.62, (190, 205, 218)), (0.82, (236, 206, 170)), (1.0, (243, 184, 128))]
sky = np.zeros((H, 1, 3), np.float32)
for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
    m = (y >= p0) & (y <= p1); t = ((y - p0) / (p1 - p0)).clip(0, 1)
    for k in range(3):
        sky[..., k] = np.where(m, c0[k] + (c1[k] - c0[k]) * t, sky[..., k])
sky = np.repeat(sky, W, axis=1)
# clouds: billowy fbm (puffy edges), scattered patches, sparser up high
n = fbm(520, 7)
puff = 1 - np.abs(fbm(150, 5) * 2 - 1)
x = np.linspace(0, 1, W)[None, :]
band = 0.35 + 0.65 * np.exp(-((y - 0.34) / 0.2) ** 2) + 0.45 * np.exp(-((y - 0.78) / 0.1) ** 2)
dens = (n * 0.78 + puff * 0.22) * band
cover = np.clip((dens - 0.33) / 0.2, 0, 1)
cover = np.asarray(Image.fromarray((cover * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)), np.float32) / 255
# light from above: a pixel under a lot of cloud is in shadow
above = np.roll(cover, 36, axis=0); above[:36] = 0
above = np.asarray(Image.fromarray((above * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(24)), np.float32) / 255
shadow = np.clip(above * 0.55, 0, 0.5)[..., None]
white = np.array([255, 255, 255], np.float32)
cloud = white * (1 - shadow) + sky * 0.78 * shadow
warm = np.clip((y - 0.62) / 0.38, 0, 1)[..., None]
cloud = cloud * (1 - warm * 0.22) + np.array([252, 214, 176]) * warm * 0.22
img = sky * (1 - cover[..., None]) + cloud * cover[..., None]
im = Image.fromarray(img.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
# a touch of grain so it reads as a photograph rather than a render
g = (rng.normal(0, 3.2, (H, W, 1))).astype(np.float32)
arr = (np.asarray(im, np.float32) + g).clip(0, 255).astype(np.uint8)
Image.fromarray(arr).save(sys.argv[1], quality=82, optimize=True, progressive=True)
Image.fromarray(arr).resize((440, 956)).save(sys.argv[1] + ".preview.png")
