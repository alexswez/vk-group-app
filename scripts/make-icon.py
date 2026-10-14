# Рисует иконку приложения 512×512 — она нужна для карточки приложения при модерации.
#
# Запуск: python scripts/make-icon.py

from PIL import Image, ImageDraw, ImageFont

SIZE = 512
BLUE_TOP = (86, 160, 248)
BLUE_BOTTOM = (24, 104, 200)
WHITE = (255, 255, 255)
LIGHT = (205, 220, 240)
ACCENT = (39, 135, 245)

image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)

# Фон — вертикальный градиент синего цвета ВКонтакте.
for y in range(SIZE):
    t = y / (SIZE - 1)
    color = tuple(int(BLUE_TOP[i] + (BLUE_BOTTOM[i] - BLUE_TOP[i]) * t) for i in range(3))
    draw.line([(0, y), (SIZE, y)], fill=color)

# Скруглённые углы: рисуем маску и «вырезаем» ею фон.
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=104, fill=255)
image.putalpha(mask)
draw = ImageDraw.Draw(image)

# --- Календарь (символ расписания) ---
left, right = 92, 420
body_top, body_bottom = 132, 356

# «Кольца» рисуем ПЕРВЫМИ: потом корпус календаря закроет их снизу, и сверху останутся петельки.
for x in (left + 74, right - 74):
    draw.rounded_rectangle([x - 11, 100, x + 11, 168], radius=11, fill=WHITE)

# Корпус календаря.
draw.rounded_rectangle([left, body_top, right, body_bottom], radius=30, fill=WHITE)
# Цветная шапка календаря и «корешок» под ней.
draw.rounded_rectangle([left, body_top, right, body_top + 54], radius=30, fill=ACCENT)
draw.rectangle([left, body_top + 26, right, body_top + 56], fill=ACCENT)

# Сетка дней: 3 столбца × 2 строки, один день выделен как «сегодня».
cell, gap = 62, 26
grid_left = left + (right - left - (3 * cell + 2 * gap)) // 2
grid_top = body_top + 84
for row in range(2):
    for col in range(3):
        x = grid_left + col * (cell + gap)
        y = grid_top + row * (cell + gap)
        highlighted = row == 0 and col == 1
        draw.rounded_rectangle(
            [x, y, x + cell, y + cell],
            radius=16,
            fill=ACCENT if highlighted else LIGHT,
        )

# --- Подпись с номером группы ---
font = None
for path in (
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arial.ttf",
):
    try:
        font = ImageFont.truetype(path, 54)
        break
    except OSError:
        continue

label = "ИСПСВ-301"
if font is None:
    draw.text((SIZE / 2, 424), label, fill=WHITE, anchor="mm")
else:
    draw.text((SIZE / 2, 424), label, font=font, fill=WHITE, anchor="mm")

image.save("public/app-icon-512.png")
print("Готово: public/app-icon-512.png", image.size)
