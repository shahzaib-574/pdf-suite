from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


OUT = Path(__file__).resolve().parents[1] / "tmp" / "ocr-qa"
OUT.mkdir(parents=True, exist_ok=True)
PNG = OUT / "scanned-page.png"
PDF = OUT / "scanned-source.pdf"


def font(name: str, size: int):
    path = Path("C:/Windows/Fonts") / name
    return ImageFont.truetype(str(path), size)


page = Image.new("RGB", (1275, 1650), "white")
draw = ImageDraw.Draw(page)
regular = font("arial.ttf", 30)
bold = font("arialbd.ttf", 30)
title = font("arialbd.ttf", 54)
small = font("arial.ttf", 25)

draw.text((110, 105), "SCANNED OPERATIONS REPORT", fill="black", font=title)
draw.text((110, 205), "This page contains only pixels and has no PDF text layer.", fill="black", font=regular)
draw.text((110, 255), "On-device OCR should rebuild this content as editable Word text.", fill="black", font=regular)
draw.text((110, 350), "Key finding:", fill="black", font=bold)
draw.text((300, 350), "customer retention increased across every region.", fill="black", font=regular)

x = [110, 610, 870, 1165]
y = [480, 555, 630, 705, 780]
for value in x:
    draw.line((value, y[0], value, y[-1]), fill="black", width=2)
for value in y:
    draw.line((x[0], value, x[-1], value), fill="black", width=2)
rows = [
    ("Region", "Orders", "Revenue"),
    ("North", "1,240", "$84,200"),
    ("Central", "980", "$72,450"),
    ("South", "1,110", "$79,880"),
]
for row_index, row in enumerate(rows):
    row_font = bold if row_index == 0 else regular
    baseline = y[row_index] + 20
    draw.text((x[0] + 18, baseline), row[0], fill="black", font=row_font)
    draw.text((x[1] + 18, baseline), row[1], fill="black", font=row_font)
    draw.text((x[2] + 18, baseline), row[2], fill="black", font=row_font)

draw.text((110, 900), "Notes", fill="black", font=bold)
draw.text((110, 960), "1. Recognition runs locally in the browser.", fill="black", font=small)
draw.text((110, 1010), "2. Low-confidence pages remain images to avoid corrupt text.", fill="black", font=small)
page.save(PNG, quality=95)

pdf = canvas.Canvas(str(PDF), pagesize=(612, 792))
pdf.drawImage(ImageReader(page), 0, 0, width=612, height=792)
pdf.showPage()
pdf.save()

print(PNG)
print(PDF)
