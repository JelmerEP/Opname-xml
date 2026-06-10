# -*- coding: utf-8 -*-
"""report.py - simpele PDF-uitdraai van een opname (back-up zodat gegevens niet verloren gaan).
Krijgt een leesbare 'summary' binnen (door de frontend opgebouwd: label -> gekozen tekst per sectie),
zodat hier geen code->label-vertaling nodig is."""
import datetime, io
import requests
from fpdf import FPDF
from fpdf.enums import XPos, YPos

NL = dict(new_x=XPos.LMARGIN, new_y=YPos.NEXT)   # expliciete regelovergang (versie-onafhankelijk)

# core-fonts (Helvetica) zijn Latin-1; speciale tekens netjes vervangen i.p.v. laten breken
_REP = (('≤', '<='), ('≥', '>='), ('Δ', 'd'), ('–', '-'), ('—', '-'), ('…', '...'),
        ('•', '-'), ('²', '2'), ('³', '3'), ('×', 'x'), ('’', "'"), ('‘', "'"),
        ('“', '"'), ('”', '"'), ('€', 'EUR'))


def _lat(s):
    s = '' if s is None else str(s)
    for a, b in _REP:
        s = s.replace(a, b)
    return s.encode('latin-1', 'replace').decode('latin-1')


def _luchtfoto_bytes(x, y):
    """PDOK ortho-luchtfoto (~40 m) rond het pand als JPEG-bytes; None bij ontbrekende coords of fout."""
    try:
        x, y = float(x), float(y)
    except (TypeError, ValueError):
        return None
    d = 20
    url = ('https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0?SERVICE=WMS&VERSION=1.1.1'
           '&REQUEST=GetMap&LAYERS=Actueel_orthoHR&SRS=EPSG:28992&STYLES=&FORMAT=image/jpeg'
           '&WIDTH=600&HEIGHT=600&BBOX=' + ','.join('%.2f' % v for v in (x - d, y - d, x + d, y + d)))
    try:
        r = requests.get(url, timeout=8)
        if r.status_code == 200 and r.content[:2] == b'\xff\xd8':   # geldige JPEG
            return r.content
    except Exception:
        pass
    return None


def build_pdf(summary, titel, bag_x=None, bag_y=None):
    """summary = [{'section': str, 'rows': [[label, value], ...]}, ...]. Geeft pdf-bytes."""
    pdf = FPDF()
    pdf.set_auto_page_break(True, 15)
    pdf.add_page()

    pdf.set_font('Helvetica', 'B', 16)
    pdf.set_text_color(35, 76, 94)            # EP-Wonen teal
    pdf.multi_cell(0, 9, _lat(titel or 'Opname'), **NL)
    pdf.set_font('Helvetica', '', 9)
    pdf.set_text_color(120)
    pdf.multi_cell(0, 6, _lat('EP-Wonen opname-uitdraai - ' + datetime.date.today().strftime('%d-%m-%Y')), **NL)
    pdf.ln(3)

    img = _luchtfoto_bytes(bag_x, bag_y)      # luchtfoto bovenaan (optioneel)
    if img:
        try:
            pdf.set_font('Helvetica', 'B', 10)
            pdf.set_text_color(60)
            pdf.multi_cell(0, 6, _lat('Luchtfoto'), **NL)
            y0 = pdf.get_y()
            pdf.image(io.BytesIO(img), x=pdf.l_margin, y=y0, w=56, h=56)
            pdf.set_y(y0 + 59)
        except Exception:
            pass

    for sec in (summary or []):
        rows = [r for r in (sec.get('rows') or []) if r and len(r) >= 2]
        if not rows:
            continue
        pdf.set_font('Helvetica', 'B', 12)
        pdf.set_text_color(62, 158, 54)       # EP-Wonen groen
        pdf.multi_cell(0, 8, _lat(sec.get('section', '')), **NL)
        pdf.ln(0.5)
        for label, val in rows:
            pdf.set_font('Helvetica', 'B', 9)
            pdf.set_text_color(110)
            pdf.multi_cell(54, 5, _lat(label) + ':', **NL)
            pdf.set_font('Helvetica', '', 10.5)
            pdf.set_text_color(30)
            pdf.set_x(pdf.l_margin + 4)
            pdf.multi_cell(0, 5.2, _lat(val), **NL)
            pdf.ln(0.8)
        pdf.ln(2)

    return bytes(pdf.output())
