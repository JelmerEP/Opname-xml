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

# ---------- tapwater-mapping (uit 13 echte Vabi-exports, 2026-06-02) ----------
TW_AANTAL          = {'een': 0, 'twee': 1}                          # 0-GEINDEXEERD: Een=0, Twee=1 (bevestigd)
TYPE_INSTALLATIE   = {'individueel': 0, 'collectief': 1, 'externe_ind': 2, 'externe_centraal': 3}   # bevestigd
AANGESLOTEN        = {'hele': 0, 'badkamer': 1, 'keuken': 2}        # bevestigd
TYPE_OPWEKKER      = {'compleet': 0, 'direct': 1, 'indirect': 2, 'externe': 3}   # bevestigd
TOESTEL            = {'keukengeiser': 0, 'badgeiser': 1, 'combitoestel': 2, 'wkk': 3, 'ewp': 4,
                      'booster': 5, 'doorstromer': 6, 'gasboiler': 7, 'eboiler': 8, 'kokend': 9}     # 0/2/4/5/7/8/9 bevestigd, 1/3/6 volgorde
INDIRECT_OPWEKKER  = {'cr_olie': 0, 'cr': 1, 'vr': 2, 'hr100': 3, 'hr107': 4, 'biomassa': 5,
                      'ewp': 6, 'gaswp': 7, 'wkk': 8, 'warmtelevering': 9, 'onbekend': 10}            # ewp=6 bevestigd, rest volgorde
GASKEUR            = {'cw': 1, 'hr': 2, 'hrcw': 3, 'onbekend': 4}   # hrcw=3, onbekend=4 bevestigd; cw/hr = aanname
CWKLASSE           = {'cw1': 0, 'cw2': 1, 'cw3': 2, 'cw456': 3, 'onbekend': 4}   # cw456=3 bevestigd, rest volgorde
BRON_WP            = {'ventretour': 0, 'anders': 1, 'onbekend': 2}  # anders=1 bevestigd
BOOSTER_GEKOPPELD  = {'distr_rv': 0}                               # bevestigd
VERMOGEN_GASBOILER = {'le70': 0, '71-150': 1, 'gt150': 2}           # le70=0 bevestigd, rest volgorde
JAAR_DIRECT        = {'lt1985': 0, 'ge1985': 1, 'onbekend': 2}      # ge1985=1 bevestigd
OPSTELPLAATS       = {'binnen': 0, 'buiten': 1}                     # binnen=0 bevestigd
BRON_WP_INDIRECT   = {'bodem': 0, 'buitenlucht': 1, 'ventretour': 4, 'onbekend': -1}  # buitenlucht=1 bevestigd; rest aanname
VAT_AANTAL         = {'geen': 0, 'een': 1, 'twee': 2, 'drie': 3, 'vier': 4}
VAT_AANSLUIT       = {'geen_bruggen': 0, 'leiding': 1, 'leiding_tstuk': 2, 'ongeisoleerd': 3}   # geen_bruggen=0 bevestigd
VAT_WARMTEVERLIES  = {'forfaitair': 0, 'energielabel': 1}           # energielabel=1 bevestigd
VAT_ENERGIELABEL   = {'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7}   # B=2 bevestigd, rest aanname
AFLEVERTEMP        = {'onbekend': -1, 'lt60': 0, 'ge60': 1}         # aanname
UITTAP             = {'lt2': 0, '2-4': 1, '4-6': 2, '6-8': 3, '8-10': 4, '10-12': 5, '12-14': 6, 'gt14': 7}  # bevestigd

GAS_TOESTELLEN = ('keukengeiser', 'badgeiser', 'combitoestel', 'wkk')

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

# ---------- INSTALLATIE: tapwater (volledig, uit echte exports) ----------
def _fill_tapwater(root, S, o, pre):
    """Vul één Tapwatersysteem (S = XML-pad met trailing '/') uit opnamevelden met prefix pre (bv. 'tw1_')."""
    inst    = o.get(pre + 'type_installatie') or 'individueel'
    externe = inst in ('externe_ind', 'externe_centraal')
    topw    = 'externe' if externe else o.get(pre + 'type_opwekker')
    aang    = o.get(pre + 'aangesloten')

    _set(root, S + 'TypeInstallatie', TYPE_INSTALLATIE.get(inst, -1))
    if inst in ('collectief', 'externe_centraal'):
        _set(root, S + 'TotaalGebruiksoppervlakteSysteem', (o.get(pre + 'gebruiksopp') or '').strip())
    _set(root, S + 'AangeslotenOp', AANGESLOTEN.get(aang, -1))
    if aang in ('hele', 'badkamer'):
        _set(root, S + 'AantalBadkamers', (o.get(pre + 'badkamers') or '').strip())
    if aang in ('hele', 'keuken'):
        _set(root, S + 'AantalKeukens', (o.get(pre + 'keukens') or '').strip())
    _set(root, S + 'TypeOpwekker', TYPE_OPWEKKER.get(topw, -1))
    _set(root, S + 'AantalOpwekkers', 0)   # altijd Een (0-geindexeerd); hotfill-op-twee is zeldzaam -> evt. later

    O = S + 'TapwaterOpwekkerList/TapwaterOpwekker[1]/'
    _set(root, O + 'Merk', (o.get(pre + 'merk') or '').strip())
    _set(root, O + 'Type', (o.get(pre + 'typenr') or '').strip())
    _set(root, O + 'Jaar', (o.get(pre + 'jaar') or '').strip())

    if topw == 'compleet':
        toestel = o.get(pre + 'toestel')
        _set(root, O + 'TypeToestel', TOESTEL.get(toestel, -1))
        if toestel in GAS_TOESTELLEN:
            _set(root, O + 'Gaskeur', GASKEUR.get(o.get(pre + 'gaskeur'), -1))
            if o.get(pre + 'open_verbranding'):
                _set(root, O + 'OpenVerbrandingstoestel', 1)
            if toestel == 'combitoestel':
                _set(root, O + 'CwKlasse', CWKLASSE.get(o.get(pre + 'cwklasse'), -1))
        elif toestel == 'ewp':
            _set(root, O + 'BronWarmtepomp', BRON_WP.get(o.get(pre + 'bron_wp'), -1))
        elif toestel == 'booster':
            _set(root, O + 'BoosterwarmtepompGekoppeldAan', BOOSTER_GEKOPPELD.get(o.get(pre + 'booster_gekoppeld'), -1))

    elif topw == 'direct':
        toestel = o.get(pre + 'toestel_direct')
        _set(root, O + 'TypeToestel', TOESTEL.get(toestel, -1))
        if toestel == 'gasboiler':
            _set(root, O + 'VermogenGasboiler', VERMOGEN_GASBOILER.get(o.get(pre + 'vermogen_gasboiler'), -1))
        _set(root, O + 'Opstelplaats', OPSTELPLAATS.get(o.get(pre + 'opstelplaats'), -1))
        vol = (o.get(pre + 'volume_boilervat') or '').strip()
        if vol:
            _set(root, O + 'VolumeBoilervatBekend', 1)
            _set(root, O + 'VolumeBoilervat', vol)
        _set(root, O + 'Installatiejaar', JAAR_DIRECT.get(o.get(pre + 'jaar_direct'), -1))

    elif topw == 'indirect':
        opw_ind = o.get(pre + 'opwekker_indirect')
        _set(root, O + 'TypeOpwekkerIndirectVerwarmdVat', INDIRECT_OPWEKKER.get(opw_ind, -1))
        if opw_ind in ('ewp', 'gaswp'):
            _set(root, O + 'BronWarmtepompIndirectVerwarmdVat', BRON_WP_INDIRECT.get(o.get(pre + 'bron_wp_indirect'), -1))
        if o.get(pre + 'indirect_ook_rv'):
            _set(root, O + 'OpwekkerIndirecteVerwarmdVatOokVoorRuimteverwarming', 1)

    elif topw == 'externe':
        _set(root, O + 'Aflevertemperatuur', AFLEVERTEMP.get(o.get(pre + 'aflevertemp'), -1))

    if o.get(pre + 'kwaliteitsverklaring'):
        _set(root, O + 'Kwaliteitsverklaring', 1)

    # --- Voorraadvaten: bij indirect vat, of compleet + (elektrische boiler / kokend waterkraan) ---
    toestel_c = o.get(pre + 'toestel')
    if (topw == 'indirect') or (topw == 'compleet' and toestel_c in ('eboiler', 'kokend')):
        aantal = VAT_AANTAL.get(o.get(pre + 'aantal_vaten'), -1)
        if aantal >= 0:
            _set(root, S + 'AantalVoorraadvaten', aantal)
        if aantal >= 1:
            V = S + 'TapwaterVoorraadvatList/TapwaterVoorraadvat[1]/'
            _set(root, V + 'Aantal', 1)
            _set(root, V + 'Volume', (o.get(pre + 'vat_volume') or '').strip())
            _set(root, V + 'Aansluitwijze', VAT_AANSLUIT.get(o.get(pre + 'vat_aansluitwijze'), -1))
            _set(root, V + 'WarmteverliezenVoorraadvatObv', VAT_WARMTEVERLIES.get(o.get(pre + 'vat_warmteverlies'), -1))
            if o.get(pre + 'vat_warmteverlies') == 'energielabel':
                _set(root, V + 'EnergielabelVoorraadvat', VAT_ENERGIELABEL.get(o.get(pre + 'vat_energielabel'), -1))
            _set(root, V + 'Opstelplaats', OPSTELPLAATS.get(o.get(pre + 'vat_opstelplaats'), -1))

    if o.get(pre + 'dwtw'):
        _set(root, S + 'DwtwAanwezig', 1)
    if aang in ('hele', 'keuken'):
        _set(root, S + 'LeidinglengteNaarKeuken', UITTAP.get(o.get(pre + 'uittap_keuken'), -1))
    if aang in ('hele', 'badkamer'):
        _set(root, S + 'LeidinglengteNaarBadkamer', UITTAP.get(o.get(pre + 'uittap_badkamer'), -1))
    if o.get(pre + 'circulatie'):
        _set(root, S + 'CirculatieleidingAanwezig', 1)

def build_installatie(o, tpl_path):
    """o = dict met opnamevelden. Geeft xml_bytes (Installatiebibliotheek)."""
    tree = ET.parse(tpl_path)
    root = tree.getroot()
    _fresh_guids(root)

    has_tw = bool(o.get('tw_aantal') or o.get('tw1_aangesloten') or o.get('tw1_type_opwekker') or o.get('tw1_type_installatie'))
    if has_tw:
        num = 2 if o.get('tw_aantal') == 'twee' else 1
        TW = 'Installaties/Installatie/Tapwater/'
        _set(root, TW + 'AantalWarmtapwatersystemen', num - 1)   # 0-geindexeerd: Een=0, Twee=1 (uit echte Vabi-exports)
        for idx in range(1, num + 1):
            S = TW + 'TapwatersysteemList/Tapwatersysteem[%d]/' % idx
            _fill_tapwater(root, S, o, 'tw%d_' % idx)

    # vrije notitie -> Opmerkingen
    opm = (o.get('tw_opmerkingen') or '').strip()
    if opm:
        el = _find(root, 'Installaties/Installatie/Opmerkingen')
        if el is not None:
            el.text = opm

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
