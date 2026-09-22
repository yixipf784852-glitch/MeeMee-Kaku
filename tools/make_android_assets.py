# 把安卓工程里 Capacitor 自带的图标、启动屏换成「咩」字章。按原图尺寸逐张重画，不改文件名和目录。
# 用法：python tools/make_android_assets.py
import glob, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
FONT = r'C:\Windows\Fonts\msyhbd.ttc'
PAPER, INK, BRASS, GOLD = (242, 239, 232, 255), (35, 31, 26, 255), (143, 95, 20, 255), (217, 165, 84, 255)


def glyph(d, cx, cy, size):
    font = ImageFont.truetype(FONT, int(size))
    b = d.textbbox((0, 0), '咩', font=font)
    d.text((cx - (b[2] - b[0]) / 2 - b[0], cy - (b[3] - b[1]) / 2 - b[1] - size * 0.02), '咩', font=font, fill=GOLD)


def seal(n, round_=False):
    """传统图标：深色底 + 黄铜描边 + 咩"""
    k = 4  # 先画 4 倍再缩，边缘平滑
    s = n * k
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if round_:
        d.ellipse([0, 0, s - 1, s - 1], fill=INK)
        d.ellipse([s * .09, s * .09, s * .91, s * .91], outline=BRASS, width=int(s * .03))
    else:
        d.rounded_rectangle([s * .03, s * .03, s * .97, s * .97], radius=s * .19, fill=INK)
        d.rounded_rectangle([s * .11, s * .11, s * .89, s * .89], radius=s * .12, outline=BRASS, width=int(s * .028))
    glyph(d, s / 2, s / 2, s * .57)
    return img.resize((n, n), Image.LANCZOS)


def foreground(n):
    """自适应图标前景：透明底，描边和字都落在中间 66/108 的安全区里；背景色另在 xml 里给深色"""
    k = 4
    s = n * k
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    a, b = s * 0.25, s * 0.75
    d.rounded_rectangle([a, a, b, b], radius=s * .07, outline=BRASS, width=int(s * .018))
    glyph(d, s / 2, s / 2, s * .33)
    return img.resize((n, n), Image.LANCZOS)


def splash(w, h):
    img = Image.new('RGBA', (w, h), PAPER)
    m = int(min(w, h) * 0.28)
    icon = seal(m)
    img.alpha_composite(icon, ((w - m) // 2, (h - m) // 2))
    return img.convert('RGB')


done = 0
for path in glob.glob(os.path.join(RES, 'mipmap-*', '*.png')):
    n = Image.open(path).size[0]
    name = os.path.basename(path)
    img = foreground(n) if 'foreground' in name else seal(n, round_='round' in name)
    img.save(path)
    done += 1
for path in glob.glob(os.path.join(RES, 'drawable*', 'splash.png')):
    w, h = Image.open(path).size
    splash(w, h).save(path)
    done += 1

bg = os.path.join(RES, 'values', 'ic_launcher_background.xml')
xml = open(bg, encoding='utf-8').read().replace('#FFFFFF', '#231F1A')
open(bg, 'w', encoding='utf-8').write(xml)
print(f'换好了 {done} 张图，自适应图标背景改成深色')
