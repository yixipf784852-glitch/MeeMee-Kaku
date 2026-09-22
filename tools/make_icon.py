# 画桌面端图标：跟界面左上角的「咩」字章一个样子（暖纸底、黄铜描边、黄铜字）。
# 用法：python tools/make_icon.py → desktop/icon.png（512×512，electron-builder 会自己转成 .ico）
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 512
PAPER, BRASS, INK = (242, 239, 232, 255), (143, 95, 20, 255), (35, 31, 26, 255)

img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([16, 16, S - 16, S - 16], radius=96, fill=INK)
d.rounded_rectangle([56, 56, S - 56, S - 56], radius=64, outline=BRASS, width=14, fill=None)
font = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 290)
box = d.textbbox((0, 0), '咩', font=font)
w, h = box[2] - box[0], box[3] - box[1]
d.text(((S - w) / 2 - box[0], (S - h) / 2 - box[1] - 6), '咩', font=font, fill=(217, 165, 84, 255))

out = os.path.join(ROOT, 'desktop', 'icon.png')
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out)
print('写好了', out)
