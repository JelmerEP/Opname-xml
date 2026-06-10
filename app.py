# -*- coding: utf-8 -*-
"""
app.py - Vabi opname-app (PWA). Serveert de frontend en genereert de Vabi-XML online.
Stap 1: object-sectie. Opnames worden (voorlopig) lokaal op het apparaat bewaard;
de server is stateless en genereert alleen de XML on demand.
"""
import os, io, re, base64
import requests
from flask import Flask, request, jsonify, send_from_directory, send_file
import mapping, report

BASE = os.path.dirname(__file__)
STATIC = os.path.join(BASE, 'static')
TPL = os.path.join(BASE, 'templates_xml')

app = Flask(__name__, static_folder=None)

@app.route('/')
def index():
    return send_from_directory(STATIC, 'index.html')

@app.route('/<path:fn>')
def static_files(fn):
    return send_from_directory(STATIC, fn)

@app.route('/api/generate', methods=['POST'])
def generate():
    """Ontvangt opname-JSON, geeft een ZIP met de Vabi-XML('s) terug."""
    o = request.get_json(force=True, silent=True) or {}
    try:
        zip_bytes, naam = mapping.generate_zip(o, TPL)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    fname = 'VabiImport_%s.zip' % (naam.replace(' ', '_').replace(',', '') or 'opname')
    return send_file(io.BytesIO(zip_bytes), mimetype='application/zip',
                     as_attachment=True, download_name=fname)

BREVO_SENDER = {'name': 'EP-Wonen Opname', 'email': 'jelmer@ep-wonen.nl'}

def _send_email(to_email, subject, html, attachments):
    """attachments = [(filename, bytes), ...]. Verstuurt via de Brevo HTTPS-API (Render blokkeert SMTP)."""
    key = os.environ.get('BREVO_API_KEY', '')
    if not key:
        raise RuntimeError('mailservice niet geconfigureerd (BREVO_API_KEY ontbreekt op de server)')
    payload = {
        'sender': BREVO_SENDER,
        'to': [{'email': to_email}],
        'subject': subject,
        'htmlContent': html,
        'attachment': [{'name': n, 'content': base64.b64encode(b).decode('ascii')} for n, b in attachments],
    }
    r = requests.post('https://api.brevo.com/v3/smtp/email',
                      headers={'api-key': key, 'content-type': 'application/json', 'accept': 'application/json'},
                      json=payload, timeout=30)
    if r.status_code >= 300:
        raise RuntimeError('mail mislukt (HTTP %s): %s' % (r.status_code, r.text[:300]))

@app.route('/api/send', methods=['POST'])
def send():
    """Genereert ZIP (XML) + PDF-uitdraai en mailt beide naar het opgegeven adres."""
    data = request.get_json(force=True, silent=True) or {}
    o = data.get('opname') or {}
    summary = data.get('summary') or []
    email = (data.get('email') or '').strip()
    if not email or '@' not in email or '.' not in email.split('@')[-1]:
        return jsonify({'error': 'geldig e-mailadres vereist'}), 400
    try:
        zip_bytes, naam = mapping.generate_zip(o, TPL)
        pdf_bytes = report.build_pdf(summary, naam, o.get('bag_x'), o.get('bag_y'))
    except Exception as e:
        return jsonify({'error': 'genereren mislukt: %s' % e}), 500
    base = (naam.replace(' ', '_').replace(',', '') or 'opname')
    html = ('<p>In de bijlage de Vabi-import (ZIP met de bibliotheken) en een PDF-uitdraai '
            'van de opname <b>%s</b>.</p>'
            '<p style="color:#888;font-size:12px">Automatisch verzonden vanuit de EP-Wonen opname-app.</p>' % naam)
    try:
        _send_email(email, 'Vabi-opname: ' + naam, html,
                    [('VabiImport_%s.zip' % base, zip_bytes), ('Opname_%s.pdf' % base, pdf_bytes)])
    except Exception as e:
        return jsonify({'error': str(e)}), 502
    return jsonify({'ok': True})

def _bouwjaar_hoogte(x, y, huisnummer=None):
    """RD-coordinaat -> (bouwjaar, hoogte). BAG WFS (BBOX ~10 m, EPSG:28992) -> bouwjaar+pandid;
    3DBAG WFS -> hoogte (schuin dak nok / plat max, minus maaiveld, max over gebouwdelen)."""
    bbox = '%.2f,%.2f,%.2f,%.2f,urn:ogc:def:crs:EPSG::28992' % (x - 10, y - 10, x + 10, y + 10)
    vo = requests.get('https://service.pdok.nl/lv/bag/wfs/v2_0',
                      params={'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature',
                              'typeNames': 'bag:verblijfsobject', 'srsName': 'urn:ogc:def:crs:EPSG::28992',
                              'outputFormat': 'application/json', 'count': 20, 'bbox': bbox},
                      timeout=15).json()
    bouwjaar = pandid = None
    feats = vo.get('features', [])
    for f in feats:
        pr = f.get('properties', {})
        if huisnummer is None or str(pr.get('huisnummer', '')) == str(huisnummer):
            bouwjaar, pandid = pr.get('bouwjaar'), pr.get('pandidentificatie')
            break
    if pandid is None and feats:
        pr = feats[0].get('properties', {})
        bouwjaar, pandid = pr.get('bouwjaar'), pr.get('pandidentificatie')
    hoogte = None
    if pandid:
        tb = requests.get('https://data.3dbag.nl/api/BAG3D/wfs',
                          params={'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature',
                                  'typeNames': 'BAG3D:lod12', 'outputFormat': 'application/json', 'count': 100,
                                  'CQL_FILTER': "identificatie='NL.IMBAG.Pand.%s'" % pandid},
                          timeout=15).json()
        hs = []
        for f in tb.get('features', []):
            pr = f.get('properties', {})
            nok, mx, mv = pr.get('b3_h_nok'), pr.get('b3_h_max'), pr.get('b3_h_maaiveld')
            roof = nok if nok is not None else mx
            if roof is not None and mv is not None:
                hs.append(roof - mv)
        if hs:
            hoogte = round(max(hs), 1)
    return bouwjaar, hoogte

@app.route('/api/bag/suggest')
def bag_suggest():
    """Typeahead: 'Langstraat 4' -> lijst adres-suggesties (PDOK Locatieserver suggest)."""
    q = (request.args.get('q') or '').strip()
    if len(q) < 3:
        return jsonify([])
    try:
        s = requests.get('https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest',
                         params={'fq': 'type:adres', 'rows': 6, 'q': q}, timeout=10).json()
        return jsonify([{'id': d['id'], 'label': d['weergavenaam']}
                        for d in s.get('response', {}).get('docs', [])])
    except Exception as e:
        return jsonify({'error': str(e)}), 502

@app.route('/api/bag/lookup')
def bag_lookup():
    """Gekozen suggestie (id) -> alle adresvelden + bouwjaar + gebouwhoogte."""
    bagid = (request.args.get('id') or '').strip()
    if not bagid:
        return jsonify({'error': 'id vereist'}), 400
    try:
        l = requests.get('https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup',
                         params={'fl': '*', 'id': bagid}, timeout=15).json()
        docs = l.get('response', {}).get('docs', [])
        if not docs:
            return jsonify({'error': 'adres niet gevonden'}), 404
        d = docs[0]
        huisnummer = str(d.get('huisnummer', '') or '')
        toev = (d.get('huisletter', '') or '') + (d.get('huisnummertoevoeging', '') or '')
        bouwjaar = hoogte = x = y = None
        m = re.search(r'POINT\(([\d.]+) ([\d.]+)\)', d.get('centroide_rd', ''))
        if m:
            x, y = float(m.group(1)), float(m.group(2))
            bouwjaar, hoogte = _bouwjaar_hoogte(x, y, huisnummer)
        return jsonify({'straat': d.get('straatnaam', ''), 'huisnummer': huisnummer, 'huisletter': toev,
                        'postcode': d.get('postcode', ''), 'woonplaats': d.get('woonplaatsnaam', ''),
                        'bouwjaar': bouwjaar, 'hoogte': hoogte, 'x': x, 'y': y})
    except Exception as e:
        return jsonify({'error': str(e)}), 502

@app.route('/api/health')
def health():
    return jsonify({'ok': True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', '5000')))
