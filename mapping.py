# -*- coding: utf-8 -*-
"""
mapping.py - opname (schone dict uit de app) -> Vabi EPA 12.0 XML.
Stap 1: object. Installatie volgt in latere stappen (hergebruik codes uit transform.py).
"""
import io, re, uuid, zipfile
import xml.etree.ElementTree as ET

# ---------- code-mapping (bevestigd) ----------
GEBOUWTYPE   = {'eengezinswoning': 0, 'appartement': 1}
SUBTYPE_EGW  = {'vrijstaand': 0, 'hoekwoning': 1, 'tussenwoning': 2, 'twee-onder-een-kap': 3}
SUBTYPE_APP  = {'hoek': 1, 'tussen': 2}
LIGGING_APP  = {'onderste': 0, 'midden': 1, 'bovenste': 2}
DAKTYPE      = {'hellend': 0, 'deels plat': 1, 'plat': 2}
BOUWWIJZE    = {'licht': 0, 'zwaar': 1, 'zeer zwaar': 2}

# ---------- tapwater-mapping (uit Vabi-schermen 2026-05-31) ----------
TYPE_INSTALLATIE  = {'individueel': 0, 'collectief': 1}            # 0 bevestigd (template-default); 1 = aanname
AANGESLOTEN       = {'hele': 0, 'badkamer': 1, 'keuken': 2}        # bevestigd (transform m_aangeslop)
TYPE_OPWEKKER     = {'compleet': 0, 'direct': 1, 'indirect': 2}    # AANNAME (dropdownvolgorde) -> test-export bevestigen
TOESTEL           = {'keukengeiser': 0, 'badgeiser': 1, 'combitoestel': 2, 'wkk': 3, 'ewp': 4,
                     'booster': 5, 'doorstromer': 6, 'gasboiler': 7, 'eboiler': 8, 'kokend': 9}  # bevestigd (kruist met T-batch)
INDIRECT_OPWEKKER = {'cr_olie': 0, 'cr': 1, 'vr': 2, 'hr100': 3, 'hr107': 4, 'biomassa': 5,
                     'ewp': 6, 'gaswp': 7, 'wkk': 8, 'warmtelevering': 9, 'onbekend': 10}        # AANNAME (dropdownvolgorde)
VAT_AANTAL        = {'geen': 0, 'een': 1, 'twee': 2, 'drie': 3, 'vier': 4}
AANSLUITWIJZE_VAT = {'geen_isolatie': 0, 'leiding': 1, 'leiding_tstuk': 2}                        # AANNAME
UITTAP            = {'lt2': 0, '2-4': 1, '4-6': 2, '6-8': 3, '8-10': 4, '10-12': 5, '12-14': 6, 'gt14': 7}  # bevestigd (transform m_uittap)

def _find(root, path):
    """child-navigatie met ondersteuning voor Tag[n] (1-based), zonder ET-predicaat-afhankelijkheid."""
    el = root
    for step in path.split('/'):
        if el is None:
            return None
        m = re.match(r'^(.+?)\[(\d+)\]$', step)
        if m:
            kids = el.findall(m.group(1))
            i = int(m.group(2)) - 1
            el = kids[i] if 0 <= i < len(kids) else None
        else:
            el = el.find(step)
    return el

def _set(root, path, val):
    if val is None or val == '' or val == -1:
        return
    el = _find(root, path)
    if el is not None:
        el.text = str(val)

def _fresh_guids(root):
    for el in root.iter('Guid'):
        if el.text and el.text != '00000000-0000-0000-0000-000000000000':
            el.text = str(uuid.uuid4())

def _xml_bytes(tree):
    buf = io.BytesIO()
    tree.write(buf, encoding='utf-8', xml_declaration=False)
    # Vabi (Windows) verwacht CRLF
    return buf.getvalue().replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')

# ---------- OBJECT ----------
def build_object(o, tpl_path):
    """o = dict met opnamevelden. Geeft (xml_bytes, naam)."""
    tree = ET.parse(tpl_path)
    root = tree.getroot()
    _fresh_guids(root)

    straat = (o.get('straat') or '').strip()
    huisnr = (o.get('huisnummer') or '').strip()
    huisletter = (o.get('huisletter') or '').strip()
    postcode = (o.get('postcode') or '').strip().replace(' ', '')
    plaats = (o.get('woonplaats') or '').strip()
    hnr = (huisnr + (' ' + huisletter if huisletter else '')).strip()
    naam = (straat + ' ' + hnr + ', ' + (postcode + ' ' + plaats).strip()).strip().rstrip(',')

    is_app = (o.get('type_woning') == 'appartement')
    gebtype = GEBOUWTYPE.get(o.get('type_woning'), -1)
    if is_app:
        subtype = SUBTYPE_APP.get(o.get('subtype_app'), -1)
        ligging = LIGGING_APP.get(o.get('ligging_app'), -1)
        daktype = -1
    else:
        subtype = SUBTYPE_EGW.get(o.get('subtype_grond'), -1)
        ligging = -1
        daktype = DAKTYPE.get(o.get('daktype'), -1)

    OA = 'Objecten/Object/ObjectAlgemeen/'
    _set(root, 'Algemeen/Projectgegevens/Naam', naam)
    A = OA + 'Adresgegevens/'
    _set(root, A + 'Straat', straat)
    _set(root, A + 'Huisnummer', huisnr)
    _set(root, A + 'HuisletterHuisnummertoevoeging', huisletter)
    _set(root, A + 'Postcode', postcode)
    _set(root, A + 'Woonplaats', plaats)
    _set(root, OA + 'ObjectObject/NaamObject', naam)
    _set(root, 'Objecten/Object/Phtd', '%s_%s__' % (postcode, huisnr))

    OC = OA + 'ObjectClassificatie/'
    # gebouwtype/subtype/ligging/daktype altijd zetten (ook 0); -1 = leeg laten
    for tag, v in [('Gebouwtype', gebtype), ('Subtype', subtype), ('Ligging', ligging), ('Daktype', daktype)]:
        if v != -1:
            el = _find(root, OC + tag)
            if el is not None:
                el.text = str(v)
    if o.get('gebouwhoogte'):
        _set(root, OC + 'Gebouwhoogte', o['gebouwhoogte'])

    RZ = 'Objecten/Object/Rekenzones/Rekenzone/Algemeen/'
    if o.get('bouwjaar'):
        _set(root, RZ + 'Bouwjaar', o['bouwjaar'])
    _set(root, RZ + 'TypeBouwwijzeVloeren', BOUWWIJZE.get(o.get('bouwwijze_vloer'), -1))
    _set(root, RZ + 'TypeBouwwijzeWanden', BOUWWIJZE.get(o.get('bouwwijze_wand'), -1))

    datum = (o.get('opnamedatum') or '').strip()  # verwacht YYYY-MM-DD
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', datum)
    if m:
        _set(root, OA + 'RegistratiegegevensInvoer/Opnamedatum', m.group(1) + m.group(2) + m.group(3))

    return _xml_bytes(tree), (naam or 'opname')

# ---------- INSTALLATIE (stap 2: tapwater) ----------
def _fill_tapwater(root, S, o, pre):
    """Vul één Tapwatersysteem (S = XML-pad met trailing '/') uit opnamevelden met prefix pre (bv. 'tw1_')."""
    topw = o.get(pre + 'type_opwekker')
    _set(root, S + 'TypeInstallatie', TYPE_INSTALLATIE.get(o.get(pre + 'type_installatie'), -1))
    _set(root, S + 'AangeslotenOp', AANGESLOTEN.get(o.get(pre + 'aangesloten'), -1))
    if o.get(pre + 'aangesloten') == 'hele':
        _set(root, S + 'AantalBadkamers', o.get(pre + 'badkamers'))
        _set(root, S + 'AantalKeukens', o.get(pre + 'keukens'))
    # TypeOpwekker alleen zetten voor vat-types (daar nodig); 'compleet' laat -1 staan,
    # exact zoals de bewezen-goede import (TypeToestel volstaat). AantalOpwekkers idem niet
    # geforceerd: beide codes zijn nog AANNAME -> pas hard zetten na de oogst-stap.
    if topw in ('direct', 'indirect'):
        _set(root, S + 'TypeOpwekker', TYPE_OPWEKKER.get(topw, -1))

    O = S + 'TapwaterOpwekkerList/TapwaterOpwekker[1]/'
    _set(root, O + 'Merk', (o.get(pre + 'merk') or '').strip())
    _set(root, O + 'Type', (o.get(pre + 'typenr') or '').strip())
    _set(root, O + 'Installatiejaar', (o.get(pre + 'jaar') or '').strip())
    if topw == 'compleet':
        code = TOESTEL.get(o.get(pre + 'toestel'), -1)
        _set(root, O + 'TypeToestel', code)
        if code == 2:
            _set(root, O + 'Gaskeur', 3)                      # combitoestel -> Gaskeur=3 (bevestigd)
    elif topw == 'direct':
        _set(root, O + 'TypeToestel', TOESTEL.get(o.get(pre + 'toestel_direct'), -1))
    elif topw == 'indirect':
        _set(root, O + 'TypeOpwekkerIndirectVerwarmdVat', INDIRECT_OPWEKKER.get(o.get(pre + 'opwekker_indirect'), -1))
        if o.get(pre + 'indirect_ook_rv'):
            _set(root, O + 'OpwekkerIndirecteVerwarmdVatOokVoorRuimteverwarming', 1)
    if o.get(pre + 'kwaliteitsverklaring'):
        _set(root, O + 'Kwaliteitsverklaring', 1)

    if topw in ('direct', 'indirect'):
        aantal = VAT_AANTAL.get(o.get(pre + 'aantal_vaten'), -1)
        if aantal >= 0:
            _set(root, S + 'AantalVoorraadvaten', aantal)
        if aantal >= 1:
            V = S + 'TapwaterVoorraadvatList/TapwaterVoorraadvat[1]/'
            _set(root, V + 'Aantal', 1)
            _set(root, V + 'Volume', (o.get(pre + 'vat_volume') or '').strip())
            _set(root, V + 'Aansluitwijze', AANSLUITWIJZE_VAT.get(o.get(pre + 'vat_aansluitwijze'), -1))
            if o.get(pre + 'vat_kwaliteit'):
                _set(root, V + 'Kwaliteitsverklaring', 1)

    if o.get(pre + 'dwtw'):
        _set(root, S + 'DwtwAanwezig', 1)
    _set(root, S + 'LeidinglengteNaarKeuken', UITTAP.get(o.get(pre + 'uittap_keuken'), -1))
    _set(root, S + 'LeidinglengteNaarBadkamer', UITTAP.get(o.get(pre + 'uittap_badkamer'), -1))
    if o.get(pre + 'circulatie'):
        _set(root, S + 'CirculatieleidingAanwezig', 1)

def build_installatie(o, tpl_path):
    """o = dict met opnamevelden. Geeft xml_bytes (Installatiebibliotheek)."""
    tree = ET.parse(tpl_path)
    root = tree.getroot()
    _fresh_guids(root)

    has_tw = bool(o.get('tw1_type_opwekker') or o.get('tw_aantal'))
    if has_tw:
        n = 2 if o.get('tw_aantal') == 'twee' else 1
        TW = 'Installaties/Installatie/Tapwater/'
        _set(root, TW + 'AantalWarmtapwatersystemen', n)
        for idx in range(1, n + 1):
            S = TW + 'TapwatersysteemList/Tapwatersysteem[%d]/' % idx
            _fill_tapwater(root, S, o, 'tw%d_' % idx)

    # vrije tekst -> Opmerkingen (vermogen gasboiler is in Vabi een dropdown; bewaren als notitie)
    extra = []
    for idx in (1, 2):
        v = (o.get('tw%d_vermogen_gasboiler' % idx) or '').strip()
        if v:
            extra.append('Vermogen gasboiler systeem %d: %s kW' % (idx, v))
    opm = (o.get('tw_opmerkingen') or '').strip()
    if opm:
        extra.append(opm)
    if extra:
        el = _find(root, 'Installaties/Installatie/Opmerkingen')
        if el is not None:
            el.text = ' | '.join(extra)

    return _xml_bytes(tree)

def generate_zip(o, tpl_dir):
    """Geeft (zip_bytes, naam). Stap 2: object + installatie (tapwater)."""
    import os
    obj_bytes, naam = build_object(o, os.path.join(tpl_dir, 'object_template.xml'))
    ins_bytes = build_installatie(o, os.path.join(tpl_dir, 'installatie_template.xml'))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('Objectenbibliotheek.xml', obj_bytes)
        z.writestr('Installatiebibliotheek.xml', ins_bytes)
    return buf.getvalue(), naam
