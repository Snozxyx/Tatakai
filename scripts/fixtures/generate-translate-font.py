"""Generate original test artwork as a tiny font; requires fonttools==4.60.1.

This fixture and its outlines are authored for Tatakai's tests (MIT).
The generated binary is checked in; production/testing does not require Python.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / '.cache/translate-font-tools'))
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

font = FontBuilder(1000, isTTF=True)
font.setupGlyphOrder(['.notdef', 'space', 'A'])
font.setupCharacterMap({32: 'space', 65: 'A'})
glyphs = {}
for name in ['.notdef', 'space', 'A']:
    pen = TTGlyphPen(None)
    if name != 'space':
        pen.moveTo((70, 0)); pen.lineTo((350, 720)); pen.lineTo((630, 0)); pen.closePath()
    glyphs[name] = pen.glyph()
font.setupGlyf(glyphs)
font.setupHorizontalMetrics({name: (700, 70) for name in glyphs})
font.setupHorizontalHeader(ascent=800, descent=-200)
font.setupNameTable({'familyName': 'Tatakai Fixture', 'styleName': 'Regular',
    'uniqueFontIdentifier': 'TatakaiFixtureRegular', 'fullName': 'Tatakai Fixture Regular',
    'psName': 'TatakaiFixture-Regular', 'version': 'Version 1.0'})
font.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
font.setupPost()
font.font['head'].created = 3400000000
font.font['head'].modified = 3400000000
destination = Path(__file__).resolve().parents[2] / 'tests/fixtures/translate/TatakaiFixture.ttf'
destination.parent.mkdir(parents=True, exist_ok=True)
font.save(destination)
