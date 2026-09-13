#!/usr/bin/env python3
"""Generate professional Arabic Web3 glossary PDF (cover + TOC + content)."""
import re
import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, NextPageTemplate, PageBreak, Table, TableStyle)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

FONT = "/usr/share/fonts/truetype/freefont/FreeSerif.ttf"
FONT_B = "/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf"
pdfmetrics.registerFont(TTFont("FF", FONT))
pdfmetrics.registerFont(TTFont("FFB", FONT_B))

def ar(t):
    return get_display(arabic_reshaper.reshape(t))

DARK = HexColor("#0f0c29")
PURP = HexColor("#302b63")
GOLD = HexColor("#e8d44d")
WHITE = HexColor("#ffffff")
GREY = HexColor("#555555")
LIGHT = HexColor("#f8f9fa")

# ---------- load & parse terms ----------
src = "web3-glossary-250-terms-ar.md"
raw = open(src, encoding="utf-8").read()
# pattern: **N. English** — Arabic\n> description
pat = re.compile(r"\*\*(\d+)\.\s+(.+?)\*\*\s*[—–-]\s*(.+?)(?:\n>\s*(.*?))?(?=\n\*\*|\Z)", re.DOTALL)
terms = []
for m in pat.finditer(raw):
    num, en, arname, desc = m.group(1), m.group(2).strip(), m.group(3).strip(), (m.group(4) or "").strip()
    if num and en and arname:
        terms.append((int(num), en, arname, desc))

# sections by range
SECTIONS = [
    (1, 50, "الأساسيات والبلوكتشين"),
    (51, 100, "البروتوكولات والشبكات"),
    (101, 150, "DeFi والمال اللامركزي"),
    (151, 200, "الأمان والعقود الذكية"),
    (201, 500, "المصطلحات المتقدمة"),
]

def section_for(n):
    for a, b, name in SECTIONS:
        if a <= n <= b:
            return name
    return "المصطلحات المتقدمة"

# ---------- styles ----------
st_title = ParagraphStyle("title", fontName="FFB", fontSize=34, leading=44, textColor=GOLD, alignment=TA_CENTER)
st_sub = ParagraphStyle("sub", fontName="FF", fontSize=16, leading=24, textColor=WHITE, alignment=TA_CENTER)
st_meta = ParagraphStyle("meta", fontName="FF", fontSize=11, leading=18, textColor=HexColor("#bbbbbb"), alignment=TA_CENTER)
st_h2 = ParagraphStyle("h2", fontName="FFB", fontSize=20, leading=28, textColor=WHITE, spaceAfter=10)
st_term = ParagraphStyle("term", fontName="FF", fontSize=12, leading=19, textColor=HexColor("#222222"), alignment=TA_RIGHT)
st_termhead = ParagraphStyle("termhead", fontName="FFB", fontSize=12.5, leading=19, textColor=PURP)
st_toc = ParagraphStyle("toc", fontName="FF", fontSize=10, leading=17, textColor=HexColor("#333333"))
st_sec = ParagraphStyle("sec", fontName="FFB", fontSize=14, leading=22, textColor=PURP, spaceBefore=8, spaceAfter=6)
st_foot = ParagraphStyle("foot", fontName="FF", fontSize=9, leading=12, textColor=HexColor("#999999"))

# ---------- story ----------
story = []

# ============ COVER ============
story.append(Spacer(1, 5.5*cm))
story.append(Paragraph(ar("📖 قاموس Web3 الشامل"), st_title))
story.append(Spacer(1, 0.8*cm))
story.append(Paragraph(ar("مصطلحات البلوكتشين والعقود الذكية والتمويل اللامركزي"), st_sub))
story.append(Spacer(1, 0.6*cm))
story.append(Paragraph(ar("عربي - إنجليزي · الإصدار 1.0 · "+str(len(terms))+" مصطلحاً"), st_meta))
story.append(Spacer(1, 2.5*cm))
story.append(Paragraph(ar("فريق عمالقة الصمت — Silent Giants"), st_meta))
story.append(Paragraph(ar("سبتمبر 2026"), st_meta))
story.append(NextPageTemplate("content"))
story.append(PageBreak())

# ============ TOC ============
story.append(Paragraph(ar("📋 الفهرس"), ParagraphStyle("t1", fontName="FFB", fontSize=22, leading=30, textColor=PURP)))
story.append(Spacer(1, 0.4*cm))
current_sec = None
for num, en, arname, desc in terms:
    sec = section_for(num)
    if sec != current_sec:
        current_sec = sec
        story.append(Paragraph(ar(sec), st_sec))
    story.append(Paragraph(ar(f"{num}. {en} — {arname}"), st_toc))

story.append(NextPageTemplate("content"))
story.append(PageBreak())

# ============ CONTENT ============
current_sec = None
for num, en, arname, desc in terms:
    sec = section_for(num)
    if sec != current_sec:
        current_sec = sec
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph(ar(sec), st_sec))
    head = Paragraph(ar(f"{num} &nbsp;|&nbsp; {en} — {arname}"), st_termhead)
    if desc:
        body_p = Paragraph(ar(desc), st_term)
    else:
        body_p = None
    rows = [[head]]
    if body_p:
        rows.append([body_p])
    t = Table(rows, colWidths=[16.5*cm])
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LINEBEFORE", (0,0), (0,-1), 3, PURP),
        ("BACKGROUND", (0,0), (-1,-1), LIGHT),
        ("BOX", (0,0), (-1,-1), 0.5, HexColor("#dddddd")),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.28*cm))

# ---------- build ----------
out = "web3-glossary-ar.pdf"

def on_cover(canv, doc):
    canv.saveState()
    canv.setFillColor(HexColor("#0f0c29"))
    canv.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canv.setFillColor(HexColor("#302b63"))
    canv.ellipse(-3*cm, -4*cm, 8*cm, 12*cm, fill=1, stroke=0)
    canv.setFillColor(HexColor("#e8d44d"), alpha=0.15)
    canv.ellipse(A4[0]-9*cm, A4[1]-11*cm, A4[0]+3*cm, A4[1]+3*cm, fill=1, stroke=0)
    canv.setFont("FF", 9)
    canv.setFillColor(HexColor("#999999"))
    canv.drawCentredString(A4[0]/2, 1.2*cm, "Silent Giants · عمالقة الصمت")
    canv.restoreState()

def on_page(canv, doc):
    canv.saveState()
    canv.setFillColor(WHITE)
    canv.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canv.setStrokeColor(HexColor("#dddddd"))
    canv.setLineWidth(0.5)
    canv.line(0, A4[1]-1.6*cm, A4[0], A4[1]-1.6*cm)
    canv.setFont("FF", 9)
    canv.setFillColor(HexColor("#999999"))
    canv.drawCentredString(A4[0]/2, A4[1]-1.1*cm, ar("قاموس Web3 الشامل — عمالقة الصمت"))
    canv.drawCentredString(A4[0]/2, 1.0*cm, f"{canv.getPageNumber()}")
    canv.restoreState()

doc = BaseDocTemplate(out, pagesize=A4,
                      leftMargin=1.8*cm, rightMargin=1.8*cm,
                      topMargin=2.2*cm, bottomMargin=1.8*cm,
                      title="قاموس Web3 الشامل", author="Silent Giants")
frame_c = Frame(0, 0, A4[0], A4[1], leftPadding=1.8*cm, rightPadding=1.8*cm, topPadding=1.8*cm, bottomPadding=1.8*cm, id="cover")
frame_p = Frame(doc.leftMargin, doc.bottomMargin, A4[0]-doc.leftMargin-doc.rightMargin,
                A4[1]-doc.topMargin-doc.bottomMargin, id="page")
doc.addPageTemplates([PageTemplate(id="cover", frames=[frame_c], onPage=on_cover),
                      PageTemplate(id="content", frames=[frame_p], onPage=on_page)])
doc.build(story)
print(f"OK: {out} with {len(terms)} terms")
