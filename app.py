# -*- coding: utf-8 -*-
"""
app.py - Vabi opname-app (PWA). Serveert de frontend en genereert de Vabi-XML online.
Stap 1: object-sectie. Opnames worden (voorlopig) lokaal op het apparaat bewaard;
de server is stateless en genereert alleen de XML on demand.
"""
import os, io
from flask import Flask, request, jsonify, send_from_directory, send_file
import mapping

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

@app.route('/api/health')
def health():
    return jsonify({'ok': True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', '5000')))
