# -*- coding: utf-8 -*-
"""
mapping.py - opname (schone dict uit de app) -> Vabi EPA 12.0 XML.
Stap 1: object. Installatie volgt in latere stappen (hergebruik codes uit transform.py).
"""
import io, os, re, uuid, zipfile
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
BRON_WP_INDIRECT   = {'bodem': 0, 'buitenlucht': 1, 'grondwater': 2, 'oppervlaktewater': 3, 'retourlucht': 4}  # buitenlucht=1 bevestigd, rest dropdownvolgorde
VAT_AANTAL         = {'geen': 0, 'een': 1, 'twee': 2, 'drie': 3, 'vier': 4}
VAT_AANSLUIT       = {'geen_bruggen': 0, 'leiding': 1, 'leiding_tstuk': 2, 'ongeisoleerd': 3}   # geen_bruggen=0 bevestigd
VAT_WARMTEVERLIES  = {'forfaitair': 0, 'energielabel': 1}           # energielabel=1 bevestigd
VAT_ENERGIELABEL   = {'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7}   # B=2 bevestigd, rest aanname
AFLEVERTEMP        = {'onbekend': -1, 'lt60': 0, 'ge60': 1}         # aanname
UITTAP             = {'lt2': 0, '2-4': 1, '4-6': 2, '6-8': 3, '8-10': 4, '10-12': 5, '12-14': 6, 'gt14': 7}  # bevestigd

GAS_TOESTELLEN = ('keukengeiser', 'badgeiser', 'combitoestel', 'wkk')

# ---------- verwarming-mapping (uit 8 echte exports, 2026-06-02; bevestigd) ----------
VW_SYSTEEM       = {'individueel': 0, 'collectief': 1, 'warmtelev_ind': 2, 'warmtelev_gem': 3}
VW_AANTAL_OPW    = {'een': 0, 'twee': 1}
VW_TYPE_OPWEKKER = {'lokaal_gas': 0, 'lokaal_olie': 1, 'elektrisch': 2, 'moederhaard': 3, 'gasketel': 4,
                    'olieketel': 5, 'wkk': 6, 'wp_gasabsorptie': 7, 'wp_gasmotor': 8, 'wp_elektrisch': 9,
                    'biomassakachel': 10, 'biomassaketel': 11, 'warmtelevering': 12}
VW_SUBTYPE       = {'cr': 0, 'vr': 1, 'hr100': 2, 'hr104': 3, 'hr107': 4}
VW_TYPE_WP       = {'water_water': 0, 'lucht_water': 1, 'lucht_lucht': 2}
VW_BRON_WP       = {'buitenlucht': 1, 'retourlucht': 4}            # buitenlucht=1 bevestigd
VW_OPSTELPLAATS  = {'binnen': 0, 'buiten': 1}
VW_LOKALE_KACHEL = {'met_afvoer': 0, 'zonder_afvoer': 1}           # zonder=1 bevestigd, met=aanname
VW_AFGIFTE       = {'radiatoren': 0, 'ventilator_radiatoren': 1, 'vloer': 2, 'lucht': 3, 'overig': 4}
VW_REGELING      = {'hoofdvertrek': 0, 'centraal_naregeling': 1, 'individueel': 2}
VW_MEDIUM        = {'water': 0, 'lokaal': 1}
VW_AANVOERTEMP   = {'45_40': 3, '55_47': 5, '70_60': 8, '90_70': 11}
VW_DISTRTYPE     = {'tweepijps': 0}                               # tweepijps=0 bevestigd
VW_WARMTEMETERS  = {'een_of_meer': 0, 'geen': 1}
VW_AFLEVERTEMP   = {'onbekend': 3, 'lt60': 0, 'ge60': 1}          # onbekend=3 bevestigd

# ---------- ventilatie-mapping (uit echte exports + dropdowns, 2026-06-03; A/B/C/D/E bevestigd) ----------
VEN_SYSTEEM      = {'individueel': 0, 'collectief': 1}
VEN_SYSTEEMTYPE  = {'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4}        # A=0 B=1 C=2 D=3 E=4 bevestigd
VEN_SUBSYSTEEM   = {  # GLOBALE codes (sequentieel binnen elk type); a1=0/a_onb_bouwjaar=4/b1=6/b3=8/c1=10/c3b=17/c_onb2003=15/d2=27/e1=38 bevestigd
    'a1': 0, 'a2a': 1, 'a2b': 2, 'a2c': 3, 'a_onb_bouwjaar': 4, 'a_onb_2003': 5,
    'b1': 6, 'b2': 7, 'b3': 8,
    'c1': 10, 'c2a': 11, 'c2b': 12, 'c2c': 13, 'c_onb_bouwjaar': 14, 'c_onb_2003': 15,
    'c3a': 16, 'c3b': 17, 'c3c': 18, 'c4a': 19, 'c4b': 20, 'c4c': 21, 'c5a': 22, 'c5b': 23,
    'd1': 26, 'd2': 27, 'd3': 28, 'd4a': 29, 'd4b': 30, 'd5a': 31, 'd5b': 32, 'd5c': 33,
    'e1': 38}   # E = gecombineerd systeem, één subsysteem (decentrale WTW); deel 2 is een eigen systeem
VEN_LUCHTDICHT   = {'luka_abc': 0, 'luka_d': 1, 'geen_kanaal': 2, 'onbekend': 3}   # onbekend=3 bevestigd
VEN_OPGAVE       = {'nominaal': 2, 'kwaliteitsverklaring': 3, 'onbekend': 4}   # kwaliteitsverkl=3, onbekend=4 bevestigd; nominaal=2 aanname
VEN_ELEKTROMOTOR = {'gelijkstroom': 0, 'wisselstroom': 1, 'onbekend': 2}       # wisselstroom=1, onbekend=2 bevestigd
VEN_FABRICAGEJAAR= {'tot1980': 0, 't1980_1985': 1, 't1986_1990': 2, 't1991_1998': 3, 't1999_2006': 4, 'na2006': 5, 'onbekend': 6}  # 1980-85=1, 1999-2006=4, onbekend=6 bevestigd
VEN_TYPE_WTW     = {  # 1-geïndexeerde dropdownpositie; kwaliteitsverklaring=1 + tegenstroom_kunststof=10 bevestigd
    'kwaliteitsverklaring': 1, 'koude_laden': 2, 'platen': 3, 'kruisstroom': 4, 'twincoil': 5,
    'heatpipe': 6, 'warmtewiel': 7, 'enthalpie': 8, 'tegenstroom_alu': 9, 'tegenstroom_kunststof': 10,
    'tegenstroom_onbekend': 11, 'onbekend': 12}
VEN_VOLUMEREGELING = {'constant': 0, 'geen_constant': 1, 'onbekend': 2}        # onbekend=2 bevestigd
VEN_BYPASS       = {'niet_aanwezig': 0, 'volledig': 1, 'perc_bekend': 2, 'perc_onbekend': 3, 'onbekend': 4}  # volledig=1 bevestigd
VEN_ISOLATIE_KANAAL = {'ongeisoleerd': 0, 'geisoleerd_bekend': 1, 'geisoleerd_onbekend': 2, 'onbekend': 3}   # geïsoleerd-onbekend=2 bevestigd

# ---------- koeling-mapping (uit echte exports koeling 1/2/3.xml, 2026-06-03; bevestigd) ----------
KOEL_SYSTEEM     = {'individueel': 0, 'collectief': 1, 'koudelev_ind': 2, 'koudelev_gem': 3}  # individueel=0 bevestigd
KOEL_AANTAL_OPW  = {'een': 1, 'twee': 2, 'drie': 3}   # -> AantalOpwekkers = n-1 (0-geindexeerd; Twee=1 bevestigd)
KOEL_TYPE_OPW    = {'compressie': 0, 'absorptie': 1, 'passief': 2}            # compressie=0 bevestigd
KOEL_EXPANSIE    = {'directe_ruimte': 0, 'directe_lbk': 1, 'indirecte_verdamping': 2}  # ruimte=0, indirect=2 bevestigd
KOEL_SPLIT       = {'single': 0, 'multi': 1}          # single=0 bevestigd
KOEL_AANDRIJVING = {'gas': 0, 'elektrisch': 1}        # elektrisch=1 bevestigd
KOEL_KOUDE_AFG   = {'ruimtes': 0, 'lbk': 1, 'beide': 2}   # in-de-ruimtes=0 bevestigd
KOEL_AFGIFTE     = {'vloer': 0, 'wand': 1, 'plafond': 2, 'vc_plafond': 3, 'vc_buitenmuur': 4, 'overig': 5}  # vloer=0, vc_buitenmuur=4 bevestigd
KOEL_REGELING    = {'standalone': 0, 'centrale': 1, 'overig': 2}   # standalone=0, centrale=1 bevestigd
KOEL_MEDIUM      = {'water': 0, 'lokaal': 1}          # water=0, lokaal=1 bevestigd
KOEL_WATERTEMP   = {'6_12': 0, '12_16': 1, '12_18': 2, '17_21': 3, 'onbekend': 4}  # 17/21=3 bevestigd
KOEL_POMP        = {'werkelijk_eei': 1, 'werkelijk': 2, 'onbekend': 3}   # werkelijk_eei=1 bevestigd; 2/3 aanname
KOEL_LEIDLENGTE  = {'werkelijke': 0, 'onbekend': 1}   # onbekend=1 bevestigd
KOEL_LEIDISOL    = {'nee': 0, 'ja': 1, 'onbekend': 6} # onbekend=6 bevestigd; ja/nee aanname

# ---------- zonne-energie-mapping (uit zonneoiler.xml + Zonnepanelen.xml, 2026-06-03; bevestigd) ----------
ZON_SYSTEEM       = {'pv': 0, 'pvt': 1, 'zonneboiler': 2}    # PV=0, zonneboiler=2 bevestigd; pvt=1 aanname
ZON_WARMTE_TBV    = {'tapwater': 0, 'tapwater_verwarming': 1, 'verwarming': 2}   # tapwater+verwarming=1 bevestigd
ZON_NAVERWARMING  = {'separaat': 0, 'geintegreerd_gas': 1, 'geintegreerd_elektrisch': 2, 'onbekend': 3}  # separaat=0 bevestigd
ZON_VAT_SYSTEEM   = {'systeem1': 0, 'systeem2': 1}           # systeem1=0 bevestigd
ZON_WARMTEVERLIES = {'kwaliteitsverklaring': 0, 'energielabel': 1, 'fabricagejaar': 2}   # energielabel=1 bevestigd
ZON_ENERGIELABEL  = {'aplus': 0, 'a': 1, 'b': 2, 'c': 3, 'd': 4, 'e': 5, 'f': 6, 'g': 7}  # A+=0 bevestigd; rest aanname (zelfde schaal als tapwater-vat A=1/B=2)

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
        _set(root, O + 'TypeToestel', 7)        # direct verwarmd vat = altijd gasboiler
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
        pass   # externe warmtelevering: geen opwekkergegevens; alleen kwaliteitsverklaring (regio)

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
            _set(root, V + 'WarmteverliezenVoorraadvatObv', VAT_WARMTEVERLIES.get(o.get(pre + 'vat_warmteverlies'), -1))
            if o.get(pre + 'vat_warmteverlies') == 'energielabel':
                _set(root, V + 'EnergielabelVoorraadvat', VAT_ENERGIELABEL.get(o.get(pre + 'vat_energielabel'), -1))
            if topw == 'indirect':   # aansluitwijze + opstelplaats alleen bij indirect vat (niet bij compleet toestel)
                _set(root, V + 'Aansluitwijze', VAT_AANSLUIT.get(o.get(pre + 'vat_aansluitwijze'), -1))
                _set(root, V + 'Opstelplaats', OPSTELPLAATS.get(o.get(pre + 'vat_opstelplaats'), -1))

    if o.get(pre + 'dwtw'):
        _set(root, S + 'DwtwAanwezig', 1)
    if aang in ('hele', 'keuken'):
        _set(root, S + 'LeidinglengteNaarKeuken', UITTAP.get(o.get(pre + 'uittap_keuken'), -1))
    if aang in ('hele', 'badkamer'):
        _set(root, S + 'LeidinglengteNaarBadkamer', UITTAP.get(o.get(pre + 'uittap_badkamer'), -1))
    if o.get(pre + 'circulatie'):
        _set(root, S + 'CirculatieleidingAanwezig', 1)

# ---------- INSTALLATIE: verwarming ----------
def _fill_verwarming_opwekker(root, O, o, pre, systeem):
    """Vul één VerwarmingOpwekker (O = pad met trailing '/') uit velden met prefix pre (bv. 'vo1_')."""
    warmtelev = systeem in ('warmtelev_ind', 'warmtelev_gem')
    typ = 'warmtelevering' if warmtelev else o.get(pre + 'type')
    _set(root, O + 'TypeOpwekker', VW_TYPE_OPWEKKER.get(typ, -1))
    _set(root, O + 'Merk', (o.get(pre + 'merk') or '').strip())
    _set(root, O + 'Type', (o.get(pre + 'typenr') or '').strip())
    _set(root, O + 'Installatiejaar', (o.get(pre + 'jaar') or '').strip())

    if typ in ('gasketel', 'olieketel'):
        _set(root, O + 'SubType', VW_SUBTYPE.get(o.get(pre + 'subtype'), -1))
        _set(root, O + 'OpstelplaatsOpwekker', VW_OPSTELPLAATS.get(o.get(pre + 'opstelplaats'), -1))
        if o.get(pre + 'direct_lucht'):
            _set(root, O + 'DirectGestookteLuchtverwarming', 1)
        if o.get(pre + 'open_verbranding'):
            _set(root, O + 'OpenVerbrandingstoestel', 1)
    elif typ in ('wp_elektrisch', 'wp_gasabsorptie', 'wp_gasmotor'):
        _set(root, O + 'TypeWarmtepomp', VW_TYPE_WP.get(o.get(pre + 'type_wp'), -1))
        _set(root, O + 'BronWarmtepomp', VW_BRON_WP.get(o.get(pre + 'bron_wp'), -1))
        _set(root, O + 'OpstelplaatsOpwekker', VW_OPSTELPLAATS.get(o.get(pre + 'opstelplaats'), -1))
        if o.get(pre + 'min_cop'):
            _set(root, O + 'VoldoetAanMinCOP', 1)
        if o.get(pre + 'additioneel'):
            _set(root, O + 'IsAdditioneelGeplaatstBijRenovatie', 1)
    elif typ in ('lokaal_gas', 'lokaal_olie'):
        _set(root, O + 'LokaleKachel', VW_LOKALE_KACHEL.get(o.get(pre + 'lokale_kachel'), -1))
        if o.get(pre + 'heeft_stekker'):
            _set(root, O + 'HeeftStekker', 1)
        if o.get(pre + 'open_verbranding'):
            _set(root, O + 'OpenVerbrandingstoestel', 1)
    elif typ == 'elektrisch':
        if o.get(pre + 'heeft_stekker'):
            _set(root, O + 'HeeftStekker', 1)
    elif typ == 'warmtelevering':
        _set(root, O + 'Aflevertemperatuur', VW_AFLEVERTEMP.get(o.get(pre + 'aflevertemp'), -1))

    if o.get(pre + 'kwaliteitsverklaring'):
        _set(root, O + 'KwaliteitsverklaringWarmteopwekker', 1)

def _fill_verwarming(root, o):
    systeem = o.get('vw_systeem') or 'individueel'
    warmtelev = systeem in ('warmtelev_ind', 'warmtelev_gem')
    V = 'Installaties/Installatie/Verwarming/'
    _set(root, V + 'Verwarmingsysteem', VW_SYSTEEM.get(systeem, -1))
    if systeem in ('collectief', 'warmtelev_gem'):
        _set(root, V + 'AgAangeslotenOpInstallatie', (o.get('vw_gebruiksopp') or '').strip())
    num = 1 if warmtelev else (2 if o.get('vw_aantal_opwekkers') == 'twee' else 1)
    _set(root, V + 'AantalWarmteopwekkers', num - 1)   # 0-geindexeerd: Een=0, Twee=1
    for idx in range(1, num + 1):
        O = V + 'VerwarmingOpwekkerList/VerwarmingOpwekker[%d]/' % idx
        _fill_verwarming_opwekker(root, O, o, 'vo%d_' % idx, systeem)

    AF = 'Installaties/Installatie/VerwarmingAfgifte/'
    afg = o.get('vw_afgifte')
    _set(root, AF + 'Afgiftesysteem', VW_AFGIFTE.get(afg, -1))
    if afg == 'ventilator_radiatoren':
        _set(root, AF + 'AantalVentilatoren', (o.get('vw_aantal_ventilatoren') or '').strip())
    _set(root, AF + 'Regeling', VW_REGELING.get(o.get('vw_regeling'), -1))

    DI = 'Installaties/Installatie/VerwarmingDistributie/'
    medium = o.get('vw_medium')
    _set(root, DI + 'DistributieMedium', VW_MEDIUM.get(medium, -1))
    if medium == 'water':
        _set(root, DI + 'WaterAanvoertemperatuur', VW_AANVOERTEMP.get(o.get('vw_aanvoertemp'), -1))
        _set(root, DI + 'DistributieType', VW_DISTRTYPE.get(o.get('vw_distributietype'), -1))
        if o.get('vw_waterzijdig'):
            _set(root, DI + 'WaterzijdigIngeregeld', 1)
        if o.get('vw_aanvullende_pompen'):
            _set(root, DI + 'AanvullendePompenAanwezig', 1)
        if o.get('vw_onverwarmd_leidingen'):
            _set(root, DI + 'OnverwarmdLeidingenDoorRuimte', 1)
        _set(root, DI + 'AantalBouwlagenWaardoorLeidingenLopen', (o.get('vw_aantal_bouwlagen') or '').strip())
    if systeem in ('collectief', 'warmtelev_ind', 'warmtelev_gem'):
        _set(root, DI + 'AantalWarmtemeters', VW_WARMTEMETERS.get(o.get('vw_warmtemeters'), -1))

# ---------- INSTALLATIE: ventilatie ----------
def _fill_ven_deel(root, base, syst, sub_code, f):
    """Vult één Ventilatiesysteem-node (base = '.../Ventilatiesysteem[n]/'). syst = a/b/c/d/e."""
    _set(root, base + 'Subsysteem', sub_code)
    _set(root, base + 'OpstelplaatsLbk', 1)            # staat zo in de echte ventilatie-exports
    _set(root, base + 'Verblijfsgebied', (f.get('verblijfsgebied') or '').strip())

    if syst in ('b', 'c', 'd', 'e'):                   # luchtdichtheid bij alles behalve A
        _set(root, base + 'Luchtdichtheidsklasse', VEN_LUCHTDICHT.get(f.get('luchtdichtheid'), -1))
        opg = f.get('opgave')
        _set(root, base + 'OpgaveVentilatoren', VEN_OPGAVE.get(opg, -1))
        if opg == 'nominaal':
            _set(root, base + 'VentilatorList/Ventilator[1]/NominaalVermogen', (f.get('nominaal_vermogen') or '').strip())
        elif opg == 'onbekend':
            _set(root, base + 'TypeElektromotor', VEN_ELEKTROMOTOR.get(f.get('type_elektromotor'), -1))
            _set(root, base + 'FabricagejaarVentilator', VEN_FABRICAGEJAAR.get(f.get('fabricagejaar'), -1))

    if syst in ('d', 'e'):                             # WTW (D = balans, E-deel1 = decentrale WTW)
        _set(root, base + 'TypeWtw', VEN_TYPE_WTW.get(f.get('type_wtw'), -1))
        _set(root, base + 'Volumeregeling', VEN_VOLUMEREGELING.get(f.get('volumeregeling'), -1))
        _set(root, base + 'Bypass', VEN_BYPASS.get(f.get('bypass'), -1))
        _set(root, base + 'IsolatieKanaalBuitenaansluiting', VEN_ISOLATIE_KANAAL.get(f.get('isolatie_kanaal'), -1))
        if f.get('koudeterugwinning'):
            _set(root, base + 'KoudeterugwinningWtw', 1)

    if f.get('passieve_koeling'):
        _set(root, base + 'IsSysteemVoorzienVanPassieveKoeling', 1)

def _fill_ventilatie(root, o):
    systeem = o.get('ven_systeem') or 'individueel'
    syst = o.get('ven_ventilatiesysteem')   # a/b/c/d/e
    V = 'Installaties/Installatie/Ventilatie/'
    _set(root, V + 'Systeem', VEN_SYSTEEM.get(systeem, -1))
    if systeem == 'collectief':
        _set(root, V + 'AgAangeslotenOpInstallatie', (o.get('ven_gebruiksopp') or '').strip())
    _set(root, V + 'Ventilatiesysteem', VEN_SYSTEEMTYPE.get(syst, -1))
    VL = V + 'VentilatiesysteemList/Ventilatiesysteem'

    if syst == 'e':
        # deel 1 = decentrale WTW (E1 = 38), gebruikt de ven_*-velden
        _fill_ven_deel(root, VL + '[1]/', 'e', VEN_SUBSYSTEEM['e1'], {
            'verblijfsgebied': o.get('ven_verblijfsgebied1'),
            'luchtdichtheid': o.get('ven_luchtdichtheid'), 'opgave': o.get('ven_opgave'),
            'nominaal_vermogen': o.get('ven_nominaal_vermogen'), 'type_elektromotor': o.get('ven_type_elektromotor'),
            'fabricagejaar': o.get('ven_fabricagejaar'), 'type_wtw': o.get('ven_type_wtw'),
            'volumeregeling': o.get('ven_volumeregeling'), 'bypass': o.get('ven_bypass'),
            'isolatie_kanaal': o.get('ven_isolatie_kanaal'), 'koudeterugwinning': o.get('ven_koudeterugwinning'),
            'passieve_koeling': o.get('ven_passieve_koeling')})
        # deel 2 = overige ventilatie (ven2_*), een gewoon ventilatiesysteem
        s2 = o.get('ven2_ventilatiesysteem')
        sub2key = {'a': 'ven2_sub_a', 'b': 'ven2_sub_b', 'c': 'ven2_sub_c', 'd': 'ven2_sub_d'}.get(s2)
        _fill_ven_deel(root, VL + '[2]/', s2, VEN_SUBSYSTEEM.get(o.get(sub2key), -1) if sub2key else -1, {
            'verblijfsgebied': o.get('ven2_verblijfsgebied'),
            'luchtdichtheid': o.get('ven2_luchtdichtheid'), 'opgave': o.get('ven2_opgave'),
            'nominaal_vermogen': o.get('ven2_nominaal_vermogen'), 'type_elektromotor': o.get('ven2_type_elektromotor'),
            'fabricagejaar': o.get('ven2_fabricagejaar'), 'type_wtw': o.get('ven2_type_wtw'),
            'volumeregeling': o.get('ven2_volumeregeling'), 'bypass': o.get('ven2_bypass'),
            'isolatie_kanaal': o.get('ven2_isolatie_kanaal')})
    else:
        subkey = {'a': 'ven_sub_a', 'b': 'ven_sub_b', 'c': 'ven_sub_c', 'd': 'ven_sub_d'}.get(syst)
        _fill_ven_deel(root, VL + '[1]/', syst, VEN_SUBSYSTEEM.get(o.get(subkey), -1) if subkey else -1, {
            'luchtdichtheid': o.get('ven_luchtdichtheid'), 'opgave': o.get('ven_opgave'),
            'nominaal_vermogen': o.get('ven_nominaal_vermogen'), 'type_elektromotor': o.get('ven_type_elektromotor'),
            'fabricagejaar': o.get('ven_fabricagejaar'), 'type_wtw': o.get('ven_type_wtw'),
            'volumeregeling': o.get('ven_volumeregeling'), 'bypass': o.get('ven_bypass'),
            'isolatie_kanaal': o.get('ven_isolatie_kanaal'), 'koudeterugwinning': o.get('ven_koudeterugwinning'),
            'passieve_koeling': o.get('ven_passieve_koeling')})

# ---------- INSTALLATIE: koeling ----------
def _fill_koeling(root, o):
    if not o.get('koel_aanwezig'):
        return
    KO = 'Installaties/Installatie/KoelingOpwekking/'
    _set(root, KO + 'KoelingAanwezig', 1)
    _set(root, KO + 'Koelsysteem', KOEL_SYSTEEM.get(o.get('koel_systeem') or 'individueel', -1))
    aantal = KOEL_AANTAL_OPW.get(o.get('koel_aantal_opwekkers') or 'een', 1)
    _set(root, KO + 'AantalOpwekkers', aantal - 1)               # 0-geindexeerd
    for i in range(1, aantal + 1):
        OP = KO + 'KoelingOpwekkers/KoelingOpwekker[%d]/' % i
        pre = 'ko%d_' % i
        typ = o.get(pre + 'type')
        _set(root, OP + 'TypeOpwekker', KOEL_TYPE_OPW.get(typ, -1))
        _set(root, OP + 'Merk', (o.get(pre + 'merk') or '').strip())
        _set(root, OP + 'Type', (o.get(pre + 'typenr') or '').strip())
        _set(root, OP + 'Installatiejaar', (o.get(pre + 'jaar') or '').strip())
        if typ == 'compressie':
            exp = o.get(pre + 'expansie')
            _set(root, OP + 'Expansie', KOEL_EXPANSIE.get(exp, -1))
            if exp == 'directe_ruimte':
                _set(root, OP + 'Splitsysteem', KOEL_SPLIT.get(o.get(pre + 'split'), -1))
            elif exp == 'indirecte_verdamping':
                _set(root, OP + 'Aandrijving', KOEL_AANDRIJVING.get(o.get(pre + 'aandrijving'), -1))
                _set(root, OP + 'KoudeAfgifte', KOEL_KOUDE_AFG.get(o.get(pre + 'koude_afgifte'), -1))
        _set(root, OP + 'TotaalVermogen', (o.get(pre + 'vermogen') or '').strip())
        if o.get(pre + 'kwaliteit'):
            _set(root, OP + 'KwaliteitsverklaringKoudeOpwekker', 1)

    AF = 'Installaties/Installatie/KoelingAfgifte/'
    afg = o.get('koel_afgifte')
    _set(root, AF + 'Afgiftesysteem', KOEL_AFGIFTE.get(afg, -1))
    if afg in ('vc_plafond', 'vc_buitenmuur'):
        _set(root, AF + 'AantalToestellen', (o.get('koel_aantal_toestellen') or '').strip())
        if o.get('koel_ventilatorvermogen'):
            _set(root, AF + 'VentilatorvermogenBekend', 1)
            _set(root, AF + 'VermogenPerVentilator', (o.get('koel_vermogen_ventilator') or '').strip())
    _set(root, AF + 'AfgiftesysteemRegeling', KOEL_REGELING.get(o.get('koel_regeling'), -1))

    DI = 'Installaties/Installatie/KoelingDistributie/'
    medium = o.get('koel_medium')
    _set(root, DI + 'Distributiemedium', KOEL_MEDIUM.get(medium, -1))
    if medium == 'water':
        _set(root, DI + 'Wateraanvoertemperatuur', KOEL_WATERTEMP.get(o.get('koel_watertemp'), -1))
        if o.get('koel_waterzijdig'):
            _set(root, DI + 'WaterzijdigInregelen', 1)
        pomp = o.get('koel_hoofdpomp')
        _set(root, DI + 'Circulatiepomp', KOEL_POMP.get(pomp, -1))
        if pomp in ('werkelijk_eei', 'werkelijk'):
            _set(root, DI + 'CirculatiepompTotaalVermogen', (o.get('koel_pomp_vermogen') or '').strip())
        if pomp == 'werkelijk_eei':
            _set(root, DI + 'CirculatiepompEnergieEfficientieIndex', (o.get('koel_pomp_eei') or '').strip())
        if o.get('koel_aanvullende_pompen'):
            _set(root, DI + 'TweedeCirculatiepompAanwezig', 1)
            p2 = o.get('koel_pomp2')
            _set(root, DI + 'TweedeCirculatiepomp', KOEL_POMP.get(p2, -1))
            if p2 in ('werkelijk_eei', 'werkelijk'):
                _set(root, DI + 'TweedeCirculatiepompVermogen', (o.get('koel_pomp2_vermogen') or '').strip())
            if p2 == 'werkelijk_eei':
                _set(root, DI + 'TweedeCirculatiepompEnergieEfficientieIndex', (o.get('koel_pomp2_eei') or '').strip())
        if o.get('koel_leidingen_ongekoeld'):
            _set(root, DI + 'LeidingenDoorOngekoeldeRuimte', 1)
            _set(root, DI + 'OngekoeldeRuimteLeidingenLengte', KOEL_LEIDLENGTE.get(o.get('koel_leiding_lengte'), -1))
            _set(root, DI + 'OngekoeldeRuimteLeidingenGeisoleerd', KOEL_LEIDISOL.get(o.get('koel_leiding_isolatie'), -1))
            if o.get('koel_appendages_isolatie'):
                _set(root, DI + 'KleppenBeugelsGeisoleerd', 1)
            _set(root, DI + 'AantalBouwlagenWaardoorLeidingenLopen', (o.get('koel_bouwlagen') or '').strip())

# ---------- INSTALLATIE: zonne-energie (PV + zonneboiler) ----------
def _node_set(node, tag, val):
    """Zet de tekst van een direct kind-element (skip None/''/-1, schrijft wel 0)."""
    if val is None or val == '' or val == -1:
        return
    el = node.find(tag)
    if el is not None:
        el.text = str(val)

def _zonne_node(tpl_path):
    """Verse <ZonneEnergie>-node uit het sub-template (template-lijst is leeg)."""
    p = os.path.join(os.path.dirname(tpl_path), 'zonne_energie.xml')
    n = ET.parse(p).getroot()
    _node_set(n, 'Guid', str(uuid.uuid4()))
    return n

def _fill_zonne(root, o, tpl_path):
    has_pv = bool(o.get('pv_aanwezig'))
    has_zb = bool(o.get('zb_aanwezig'))
    if not (has_pv or has_zb):
        return
    lst = _find(root, 'Installaties/Installatie/ZonneEnergieList')
    if lst is None:
        return
    if has_pv:
        n = _zonne_node(tpl_path)
        _node_set(n, 'ZonneEnergiesysteem', ZON_SYSTEEM['pv'])
        _node_set(n, 'AantalPanelen', (o.get('pv_aantal') or '').strip())
        _node_set(n, 'Opmerkingen', (o.get('pv_type') or '').strip())
        lst.append(n)
    if has_zb:
        n = _zonne_node(tpl_path)
        _node_set(n, 'ZonneEnergiesysteem', ZON_SYSTEEM['zonneboiler'])
        _node_set(n, 'WarmteTbv', ZON_WARMTE_TBV.get(o.get('zb_warmte_tbv'), -1))
        _node_set(n, 'Naverwarming', ZON_NAVERWARMING.get(o.get('zb_naverwarming'), -1))
        _node_set(n, 'VolumeVoorraadvat', (o.get('zb_volume') or '').strip())
        _node_set(n, 'VoorraadvatAangeslotenOpTapwatersysteem', ZON_VAT_SYSTEEM.get(o.get('zb_vat_systeem'), -1))
        _node_set(n, 'WarmteverliezenVoorraadvatObv', ZON_WARMTEVERLIES.get(o.get('zb_warmteverlies'), -1))
        if o.get('zb_warmteverlies') == 'energielabel':
            _node_set(n, 'EnergielabelOpslagvat', ZON_ENERGIELABEL.get(o.get('zb_energielabel'), -1))
        lst.append(n)

def build_installatie(o, tpl_path):
    """o = dict met opnamevelden. Geeft xml_bytes (Installatiebibliotheek)."""
    tree = ET.parse(tpl_path)
    root = tree.getroot()
    _fresh_guids(root)

    if o.get('ven_ventilatiesysteem'):
        _fill_ventilatie(root, o)

    has_vw = bool(o.get('vo1_type') or o.get('vw_afgifte') or ((o.get('vw_systeem') or 'individueel') != 'individueel'))
    if has_vw:
        _fill_verwarming(root, o)

    has_tw = bool(o.get('tw_aantal') or o.get('tw1_aangesloten') or o.get('tw1_type_opwekker') or o.get('tw1_type_installatie'))
    if has_tw:
        num = 2 if o.get('tw_aantal') == 'twee' else 1
        TW = 'Installaties/Installatie/Tapwater/'
        _set(root, TW + 'AantalWarmtapwatersystemen', num - 1)   # 0-geindexeerd: Een=0, Twee=1 (uit echte Vabi-exports)
        for idx in range(1, num + 1):
            S = TW + 'TapwatersysteemList/Tapwatersysteem[%d]/' % idx
            _fill_tapwater(root, S, o, 'tw%d_' % idx)

    if o.get('koel_aanwezig'):
        _fill_koeling(root, o)

    if o.get('pv_aanwezig') or o.get('zb_aanwezig'):
        _fill_zonne(root, o, tpl_path)

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
