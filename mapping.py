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

# ---------- ventilatie-mapping (uit echte exports + dropdowns, 2026-06-02; bevestigd) ----------
VEN_SYSTEEM      = {'individueel': 0, 'collectief': 1}
VEN_SYSTEEMTYPE  = {'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4}        # A=0 C=2 D=3 bevestigd; B/E afgeleid
VEN_SUBSYSTEEM   = {  # GLOBALE codes (sequentieel binnen elk type); a1=0/a_onb_bouwjaar=4/c1=10/c3b=17/c_onb2003=15/d2=27 bevestigd
    'a1': 0, 'a2a': 1, 'a2b': 2, 'a2c': 3, 'a_onb_bouwjaar': 4, 'a_onb_2003': 5,
    'c1': 10, 'c2a': 11, 'c2b': 12, 'c2c': 13, 'c_onb_bouwjaar': 14, 'c_onb_2003': 15,
    'c3a': 16, 'c3b': 17, 'c3c': 18, 'c4a': 19, 'c4b': 20, 'c4c': 21, 'c5a': 22, 'c5b': 23,
    'd1': 26, 'd2': 27, 'd3': 28, 'd4a': 29, 'd4b': 30, 'd5a': 31, 'd5b': 32, 'd5c': 33}
VEN_LUCHTDICHT   = {'klasse1': 0, 'klasse2': 1, 'klasse3': 2, 'onbekend': 3}   # onbekend=3 bevestigd, rest aanname
VEN_OPGAVE       = {'nominaal': 2, 'kwaliteitsverklaring': 3, 'onbekend': 4}   # kwaliteitsverkl=3, onbekend=4 bevestigd; nominaal=2 aanname
VEN_ELEKTROMOTOR = {'gelijkstroom': 0, 'wisselstroom': 1, 'onbekend': 2}
VEN_FABRICAGEJAAR= {'tot1980': 0, 't1980_1985': 1, 't1986_1990': 2, 't1991_1998': 3, 't1999_2006': 4, 'na2006': 5, 'onbekend': 6}  # 1999-2006=4 bevestigd
VEN_TYPE_WTW     = {'kwaliteitsverklaring': 1, 'rendement': 0, 'geen': -1}     # kwaliteitsverkl=1 bevestigd, rest aanname
VEN_BYPASS       = {'geen': 0, 'volledig': 1, 'gedeeltelijk': 2}              # volledig=1 bevestigd, rest aanname

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
def _fill_ventilatie(root, o):
    systeem = o.get('ven_systeem') or 'individueel'
    syst = o.get('ven_ventilatiesysteem')   # a/b/c/d/e
    V = 'Installaties/Installatie/Ventilatie/'
    _set(root, V + 'Systeem', VEN_SYSTEEM.get(systeem, -1))
    if systeem == 'collectief':
        _set(root, V + 'AgAangeslotenOpInstallatie', (o.get('ven_gebruiksopp') or '').strip())
    _set(root, V + 'Ventilatiesysteem', VEN_SYSTEEMTYPE.get(syst, -1))

    VS = V + 'VentilatiesysteemList/Ventilatiesysteem[1]/'
    subkey = {'a': 'ven_sub_a', 'c': 'ven_sub_c', 'd': 'ven_sub_d'}.get(syst)
    if subkey:
        _set(root, VS + 'Subsysteem', VEN_SUBSYSTEEM.get(o.get(subkey), -1))
    _set(root, VS + 'OpstelplaatsLbk', 1)   # staat zo in alle echte ventilatie-exports

    if syst in ('b', 'c', 'd'):              # mechanisch
        _set(root, VS + 'Luchtdichtheidsklasse', VEN_LUCHTDICHT.get(o.get('ven_luchtdichtheid'), -1))
        opg = o.get('ven_opgave')
        _set(root, VS + 'OpgaveVentilatoren', VEN_OPGAVE.get(opg, -1))
        if opg == 'nominaal':
            _set(root, VS + 'VentilatorList/Ventilator[1]/NominaalVermogen', (o.get('ven_nominaal_vermogen') or '').strip())
        elif opg == 'onbekend':
            _set(root, VS + 'TypeElektromotor', VEN_ELEKTROMOTOR.get(o.get('ven_type_elektromotor'), -1))
            _set(root, VS + 'FabricagejaarVentilator', VEN_FABRICAGEJAAR.get(o.get('ven_fabricagejaar'), -1))

    if syst == 'd':                          # WTW-balansventilatie
        _set(root, VS + 'TypeWtw', VEN_TYPE_WTW.get(o.get('ven_type_wtw'), -1))
        _set(root, VS + 'Bypass', VEN_BYPASS.get(o.get('ven_bypass'), -1))
        if o.get('ven_koudeterugwinning'):
            _set(root, VS + 'KoudeterugwinningWtw', 1)

    if o.get('ven_passieve_koeling'):
        _set(root, VS + 'IsSysteemVoorzienVanPassieveKoeling', 1)

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
