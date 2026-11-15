"""Draws the demo people's portraits and snapshots into static/images/demo/people/.

The demo rooms are made-up people, so their "photos" are original flat illustrations:
one portrait each (4:5) and a few snapshots of their lives (4:3). Run once
(python tools/make_demo_art.py) after changing anything below.
"""

from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "static" / "images" / "demo" / "people"


def svg(width: int, height: int, body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
        f"{body}</svg>\n"
    )


# --- Portraits -----------------------------------------------------------------------

HAIR_BACK = {
    "long": '<path d="M112 200 Q100 90 200 80 Q300 90 288 200 L300 380 L100 380 Z" fill="{hair}"/>',
    "braid": '<path d="M120 190 Q110 90 200 82 Q290 90 280 190 Z" fill="{hair}"/>'
    '<g fill="{hair}"><ellipse cx="268" cy="300" rx="20" ry="26"/>'
    '<ellipse cx="272" cy="345" rx="18" ry="24"/><ellipse cx="275" cy="388" rx="15" ry="20"/></g>',
    "bun": '<circle cx="200" cy="72" r="42" fill="{hair}"/>',
}
HAIR_FRONT = {
    "short": '<path d="M122 170 Q118 88 200 84 Q284 88 278 170 Q262 118 200 120 Q150 118 122 170Z" '
    'fill="{hair}"/>',
    "spiky": '<path d="M120 172 L128 100 L150 120 L162 78 L188 108 L204 70 L222 106 L246 78 '
    'L256 118 L278 98 L280 172 Q262 122 200 124 Q146 122 120 172Z" fill="{hair}"/>',
    "long": '<path d="M122 190 Q116 92 200 86 Q284 92 278 190 Q270 128 212 118 Q196 150 130 170 '
    'Z" fill="{hair}"/>',
    "braid": '<path d="M124 176 Q120 96 200 90 Q280 96 276 176 Q256 124 200 122 Q144 124 124 176Z" '
    'fill="{hair}"/>',
    "bun": '<path d="M124 172 Q120 94 200 90 Q280 94 276 172 Q256 122 200 120 Q144 122 124 172Z" '
    'fill="{hair}"/>',
}

ACCESSORIES = {
    "glasses": '<g fill="none" stroke="#2b2420" stroke-width="5"><circle cx="170" cy="196" r="20"/>'
    '<circle cx="230" cy="196" r="20"/><path d="M190 196 H210"/></g>',
    "headphones": '<path d="M116 200 Q116 70 200 70 Q284 70 284 200" fill="none" stroke="#1d1d2b" '
    'stroke-width="14"/><rect x="100" y="180" width="30" height="56" rx="12" fill="#ff5fa2"/>'
    '<rect x="270" y="180" width="30" height="56" rx="12" fill="#ff5fa2"/>',
    "earrings": '<circle cx="128" cy="236" r="8" fill="#f2c14e"/><circle cx="272" cy="236" r="8" '
    'fill="#f2c14e"/>',
    "bindi": '<circle cx="200" cy="160" r="5" fill="#c0392b"/>',
    "beard": '<path d="M138 214 Q144 296 200 300 Q256 296 262 214 Q250 262 200 264 Q150 262 138 '
    '214Z" fill="{hair}"/>',
    "flower": '<g transform="translate(262 120)"><circle r="10" fill="#fff6e8"/>'
    '<circle cx="12" r="10" fill="#fff6e8"/><circle cy="12" r="10" fill="#fff6e8"/>'
    '<circle cx="12" cy="12" r="10" fill="#fff6e8"/>'
    '<circle cx="6" cy="6" r="6" fill="#f2c14e"/></g>',
}

PROPS = {
    "coffee": '<g transform="translate(320 400)">'
    '<path d="M-22 -30 H22 L16 24 H-16Z" fill="#c9ccd1"/>'
    '<path d="M-34 24 H34 L28 36 H-28Z" fill="#aeb2b8"/><path d="M-8 -44 q8 -10 0 -20 M8 -44 q8 '
    '-10 0 -20" stroke="#fff" stroke-width="4" fill="none" opacity=".8"/></g>',
    "pencil": '<g transform="translate(330 400) rotate(-35)"><rect x="-8" y="-50" width="16" '
    'height="80" fill="#f2c14e"/><path d="M-8 30 L0 50 L8 30Z" fill="#e8c9a0"/>'
    '<rect x="-8" y="-60" width="16" height="12" fill="#e57373"/></g>',
    "vinyl": '<g transform="translate(325 400)"><circle r="44" fill="#16161c"/><circle r="38" '
    'fill="none" stroke="#2d2d36" stroke-width="2"/><circle r="28" fill="none" stroke="#2d2d36" '
    'stroke-width="2"/><circle r="14" fill="#f2c14e"/><circle r="3" fill="#16161c"/></g>',
    "leaf": '<g transform="translate(325 400) rotate(-20)"><path d="M0 -50 Q40 -10 0 50 Q-40 -10 '
    '0 -50Z" fill="#4f9d69"/><path d="M0 -40 V44" stroke="#2e6b43" stroke-width="4"/></g>',
    "controller": '<g transform="translate(320 405)"><rect x="-46" y="-22" width="92" height="44" '
    'rx="22" fill="#2b2b3d"/><path d="M-30 0 h16 M-22 -8 v16" stroke="#9be7ff" stroke-width="5"/>'
    '<circle cx="20" cy="-4" r="6" fill="#ff5fa2"/><circle cx="32" cy="6" r="6" fill="#ffd166"/>'
    "</g>",
    "tea": '<g transform="translate(320 404)">'
    '<path d="M-30 -24 H30 V10 Q30 30 0 30 Q-30 30 -30 10Z" '
    'fill="#fff"/><path d="M30 -14 q22 0 22 14 q0 14 -22 14" fill="none" stroke="#fff" '
    'stroke-width="7"/><rect x="-30" y="-24" width="60" height="10" fill="#c98f5b"/></g>',
}

PEOPLE = {
    "aarav": dict(
        bg="#cfdcbc",
        bg2="#b7cba1",
        skin="#c68a5e",
        hair="#1f1a17",
        shirt="#2f8f8a",
        front="short",
        extras=["glasses"],
        prop="coffee",
    ),
    "priya": dict(
        bg="#f6d6d0",
        bg2="#efbfb6",
        skin="#b97a56",
        hair="#1b1412",
        shirt="#e9785f",
        back="long",
        front="long",
        extras=["earrings", "flower"],
        prop="pencil",
    ),
    "kabir": dict(
        bg="#2f3550",
        bg2="#3d4566",
        skin="#a8704a",
        hair="#241c18",
        shirt="#d9a441",
        front="short",
        extras=["beard"],
        prop="vinyl",
    ),
    "ananya": dict(
        bg="#f3ead2",
        bg2="#e3d8b8",
        skin="#d29a6c",
        hair="#3a261c",
        shirt="#7fae7a",
        back="bun",
        front="bun",
        extras=["bindi", "earrings"],
        prop="leaf",
    ),
    "rohan": dict(
        bg="#241a3a",
        bg2="#3a2a5c",
        skin="#9c6644",
        hair="#151012",
        shirt="#7b4fd6",
        front="spiky",
        extras=["headphones"],
        prop="controller",
    ),
    "meera": dict(
        bg="#e8e2d4",
        bg2="#d6cdb8",
        skin="#8d5a3b",
        hair="#14100e",
        shirt="#2f4a7a",
        back="braid",
        front="braid",
        extras=["bindi", "glasses"],
        prop="tea",
    ),
}


def portrait(p: dict) -> str:
    hair = p["hair"]
    parts = [
        f'<rect width="400" height="500" fill="{p["bg"]}"/>',
        f'<circle cx="200" cy="210" r="150" fill="{p["bg2"]}"/>',
        f'<circle cx="60" cy="70" r="26" fill="{p["bg2"]}"/>',
        f'<circle cx="350" cy="120" r="14" fill="{p["bg2"]}"/>',
    ]
    if p.get("back"):
        parts.append(HAIR_BACK[p["back"]].format(hair=hair))
    parts += [
        f'<path d="M60 500 Q70 360 200 350 Q330 360 340 500Z" fill="{p["shirt"]}"/>',
        f'<path d="M168 300 H232 V360 Q200 380 168 360Z" fill="{p["skin"]}"/>',
        f'<ellipse cx="200" cy="200" rx="80" ry="98" fill="{p["skin"]}"/>',
        f'<ellipse cx="122" cy="206" rx="12" ry="18" fill="{p["skin"]}"/>',
        f'<ellipse cx="278" cy="206" rx="12" ry="18" fill="{p["skin"]}"/>',
        HAIR_FRONT[p["front"]].format(hair=hair),
        '<ellipse cx="170" cy="198" rx="7" ry="9" fill="#2b2420"/>',
        '<ellipse cx="230" cy="198" rx="7" ry="9" fill="#2b2420"/>',
        '<path d="M160 176 q10 -8 20 0 M220 176 q10 -8 20 0" stroke="#2b2420" stroke-width="4" '
        'fill="none" stroke-linecap="round"/>',
        '<circle cx="152" cy="232" r="12" fill="#e8846b" opacity=".35"/>',
        '<circle cx="248" cy="232" r="12" fill="#e8846b" opacity=".35"/>',
        '<path d="M178 246 Q200 266 222 246" stroke="#5a2e22" stroke-width="5" fill="none" '
        'stroke-linecap="round"/>',
    ]
    parts += [ACCESSORIES[name].format(hair=hair) for name in p["extras"]]
    parts.append(PROPS[p["prop"]])
    return svg(400, 500, "".join(parts))


# --- Snapshots -------------------------------------------------------------------------


def sky(top: str, bottom: str, name: str) -> str:
    return (
        f'<defs><linearGradient id="{name}" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/>'
        f'</linearGradient></defs><rect width="400" height="300" fill="url(#{name})"/>'
    )


def rain(count: int = 40, color: str = "#ffffff") -> str:
    drops = "".join(f'<path d="M{(i * 53) % 400} {(i * 37) % 300} l-6 18"/>' for i in range(count))
    return f'<g stroke="{color}" stroke-width="2" opacity=".55">{drops}</g>'


def curve(t: float) -> float:
    """Height of the promenade path in priya-seaface (a quadratic Bezier) at t."""
    return (1 - t) ** 2 * 226 + 2 * t * (1 - t) * 176 + t * t * 211


SNAPSHOTS = {
    # Aarav
    "aarav-cricket": sky("#8fd3f4", "#d7f0fb", "s")
    + '<rect y="170" width="400" height="130" fill="#5aa95a"/>'
    '<path d="M150 300 L178 170 H222 L250 300Z" fill="#d9c58a"/>'
    '<g fill="#f8f3e6"><rect x="190" y="132" width="5" height="44"/>'
    '<rect x="198" y="132" width="5" height="44"/><rect x="206" y="132" width="5" height="44"/></g>'
    '<rect x="188" y="129" width="25" height="4" fill="#f8f3e6"/>'
    '<circle cx="250" cy="110" r="10" fill="#c0392b"/>'
    '<path d="M250 100 v20" stroke="#fff" stroke-width="2"/>'
    '<circle cx="330" cy="50" r="22" fill="#fff4b0"/>',
    "aarav-coffee": '<rect width="400" height="300" fill="#7a4a2c"/>'
    '<rect y="200" width="400" height="100" fill="#5c3720"/>'
    '<ellipse cx="200" cy="232" rx="110" ry="22" fill="#3f8f4f"/>'
    '<path d="M140 232 H260 L248 200 H152Z" fill="#c9ccd1"/>'
    '<path d="M168 200 H232 L224 90 H176Z" fill="#dfe2e6"/>'
    '<rect x="172" y="84" width="56" height="10" rx="4" fill="#eef0f2"/>'
    '<path d="M186 74 q10 -14 0 -28 M206 74 q10 -14 0 -28 M226 74 q10 -14 0 -28" '
    'stroke="#fff" stroke-width="5" fill="none" opacity=".7"/>',
    "aarav-code": '<rect width="400" height="300" fill="#1e2230"/>'
    '<rect x="30" y="30" width="340" height="220" rx="12" fill="#11141d"/>'
    '<g stroke-width="10" stroke-linecap="round">'
    '<path d="M60 70 H140" stroke="#c792ea"/><path d="M150 70 H230" stroke="#82aaff"/>'
    '<path d="M80 100 H200" stroke="#c3e88d"/><path d="M80 130 H170" stroke="#f78c6c"/>'
    '<path d="M180 130 H260" stroke="#89ddff"/><path d="M100 160 H240" stroke="#c3e88d"/>'
    '<path d="M60 190 H120" stroke="#c792ea"/></g>'
    '<path d="M60 222 l14 0 M84 222 h60" stroke="#ffcb6b" stroke-width="10" '
    'stroke-linecap="round"/><rect x="150" y="214" width="12" height="18" fill="#fff"/>',
    # Priya
    "priya-seaface": sky("#2b2d5c", "#f08a5d", "s")
    + '<rect y="190" width="400" height="110" fill="#1f3b63"/>'
    '<path d="M0 230 Q200 180 400 215 L400 240 Q200 205 0 255Z" fill="#3a3a48"/>'
    # Street lights along the promenade's curve (the same quadratic as the path above).
    + "".join(
        f'<circle cx="{400 * t:.0f}" cy="{curve(t):.0f}" r="4" fill="#ffd36e"/>'
        for t in (i / 16 for i in range(1, 16))
    )
    + '<g fill="#14162e"><rect x="300" y="120" width="20" height="80"/>'
    '<rect x="325" y="140" width="26" height="60"/><rect x="356" y="110" width="18" height="90"/>'
    '<rect x="270" y="150" width="24" height="50"/></g>',
    "priya-sketchbook": '<rect width="400" height="300" fill="#c9a27a"/>'
    '<path d="M40 50 L200 70 L360 50 V260 L200 280 L40 260Z" fill="#fdf8ee"/>'
    '<path d="M200 70 V280" stroke="#d9cdb8" stroke-width="3"/>'
    '<g fill="none" stroke="#4b4b55" stroke-width="3" stroke-linecap="round">'
    '<path d="M70 200 Q120 215 170 200 L160 225 H80Z"/><path d="M120 200 V130 L160 190"/>'
    '<path d="M60 240 q15 -8 30 0 t30 0 t30 0"/>'
    '<circle cx="290" cy="150" r="40"/><path d="M262 170 q28 22 56 0"/>'
    '<path d="M275 140 h4 M301 140 h4"/></g>'
    '<path d="M300 250 l60 -60" stroke="#f2c14e" stroke-width="10" stroke-linecap="round"/>',
    "priya-monsoon": sky("#5d6d7e", "#a9b7c6", "s")
    + '<rect y="210" width="400" height="90" fill="#3c4d5e"/>'
    '<path d="M200 120 Q200 60 270 60 Q340 60 340 120Z" fill="#e9785f"/>'
    '<path d="M270 60 V220" stroke="#2b2420" stroke-width="5"/>'
    '<path d="M270 220 q0 14 -14 14" stroke="#2b2420" stroke-width="5" fill="none"/>'
    '<g fill="#f6d36b"><rect x="40" y="150" width="90" height="60" rx="6"/></g>'
    '<rect x="50" y="120" width="70" height="30" fill="#c0392b"/>' + rain(),
    # Kabir
    "kabir-vinyl": '<rect width="400" height="300" fill="#3b2a20"/>'
    '<rect x="40" y="50" width="200" height="200" fill="#d9a441"/>'
    '<circle cx="140" cy="150" r="60" fill="#f6e2b0"/><path d="M90 150 h100 M140 100 v100" '
    'stroke="#d9a441" stroke-width="10"/>'
    '<circle cx="260" cy="150" r="100" fill="#121216"/>'
    '<circle cx="260" cy="150" r="80" fill="none" stroke="#26262e" stroke-width="3"/>'
    '<circle cx="260" cy="150" r="60" fill="none" stroke="#26262e" stroke-width="3"/>'
    '<circle cx="260" cy="150" r="32" fill="#c0392b"/><circle cx="260" cy="150" r="5" '
    'fill="#121216"/>',
    "kabir-chai": '<rect width="400" height="300" fill="#e8d5b5"/>'
    '<rect y="210" width="400" height="90" fill="#9b6a43"/>'
    '<g fill="#b5562f"><path d="M90 140 H170 L160 230 H100Z"/><path d="M230 150 H300 L292 230 '
    'H238Z"/></g><g fill="#c98f5b"><ellipse cx="130" cy="142" rx="40" ry="8"/>'
    '<ellipse cx="265" cy="152" rx="35" ry="7"/></g>'
    '<path d="M120 120 q10 -16 0 -32 M140 120 q10 -16 0 -32 M258 130 q10 -16 0 -32" '
    'stroke="#fff" stroke-width="5" fill="none" opacity=".8"/>'
    '<path d="M320 120 h40 v100 h-50 v-60 q-20 0 -20 20" fill="#7d7f86"/>',
    "kabir-olddelhi": sky("#f4a259", "#5b4b8a", "s")
    + '<g fill="#2a1f3d"><rect y="200" width="400" height="100"/>'
    '<path d="M120 200 V160 Q160 110 200 160 V200Z"/><circle cx="160" cy="126" r="6"/>'
    '<rect x="96" y="120" width="12" height="80"/><rect x="212" y="120" width="12" height="80"/>'
    '<path d="M96 120 l6 -14 l6 14Z M212 120 l6 -14 l6 14Z"/>'
    '<rect x="260" y="170" width="60" height="30"/><rect x="20" y="175" width="60" height="25"/>'
    '<rect x="330" y="160" width="50" height="40"/></g>'
    '<path d="M300 70 l14 -14 l14 14 l-14 14Z" fill="#e94f64"/>'
    '<path d="M314 84 q-10 30 10 60" stroke="#2a1f3d" stroke-width="2" fill="none"/>'
    '<path d="M60 60 l10 -10 l10 10 l-10 10Z" fill="#f6d36b"/>',
    # Ananya
    "ananya-monstera": '<rect width="400" height="300" fill="#f3ead2"/>'
    '<g fill="#3f8f57"><path d="M200 280 Q90 230 110 120 Q170 60 200 140 Q230 60 290 120 '
    'Q310 230 200 280Z"/></g><g fill="#f3ead2"><ellipse cx="150" cy="170" rx="10" ry="22" '
    'transform="rotate(30 150 170)"/><ellipse cx="250" cy="170" rx="10" ry="22" '
    'transform="rotate(-30 250 170)"/><ellipse cx="165" cy="220" rx="9" ry="18" '
    'transform="rotate(40 165 220)"/><ellipse cx="235" cy="220" rx="9" ry="18" '
    'transform="rotate(-40 235 220)"/></g><path d="M200 140 V290" stroke="#2e6b43" '
    'stroke-width="5"/><path d="M40 300 Q80 200 60 120" stroke="#4f9d69" stroke-width="10" '
    'fill="none"/><path d="M360 300 Q330 220 350 150" stroke="#7fae7a" stroke-width="10" '
    'fill="none"/>',
    "ananya-pottery": '<rect width="400" height="300" fill="#efe4cc"/>'
    '<rect y="220" width="400" height="16" fill="#9b6a43"/>'
    '<path d="M60 220 Q40 170 70 140 H110 Q140 170 120 220Z" fill="#c8693f"/>'
    '<path d="M170 220 Q150 120 200 100 Q250 120 230 220Z" fill="#7fae7a"/>'
    '<rect x="186" y="88" width="28" height="14" fill="#7fae7a"/>'
    '<path d="M280 220 Q270 180 290 170 H340 Q360 180 350 220Z" fill="#5d7fa3"/>'
    '<path d="M60 180 h60 M170 160 h60 M282 196 h66" stroke="#fff" stroke-width="4" '
    'opacity=".6"/><path d="M200 100 q-30 -40 -10 -70 M200 100 q30 -40 20 -60" '
    'stroke="#3f8f57" stroke-width="6" fill="none"/>',
    "ananya-run": sky("#fbd38d", "#fde9c7", "s")
    + '<circle cx="200" cy="170" r="60" fill="#f6ad55"/>'
    '<rect y="170" width="400" height="130" fill="#8fbf7f"/>'
    '<path d="M150 300 Q200 220 205 170 H195 Q190 220 60 300Z" fill="#d9c58a"/>'
    '<g fill="#3f6b45"><circle cx="40" cy="160" r="30"/><circle cx="360" cy="150" r="36"/>'
    '<rect x="36" y="160" width="8" height="40"/><rect x="356" y="160" width="8" height="40"/></g>',
    # Rohan
    "rohan-synthsun": '<rect width="400" height="300" fill="#1a1033"/>'
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" '
    'stop-color="#ffd166"/><stop offset="1" stop-color="#ff4f9a"/></linearGradient></defs>'
    '<circle cx="200" cy="150" r="80" fill="url(#g)"/>'
    '<g fill="#1a1033"><rect x="110" y="160" width="180" height="6"/>'
    '<rect x="110" y="180" width="180" height="8"/><rect x="110" y="200" width="180" height="10"/>'
    '</g><rect y="190" width="400" height="110" fill="#1a1033"/>'
    '<g stroke="#ff4fd8" stroke-width="2">'
    + "".join(f'<path d="M200 190 L{x} 300"/>' for x in range(-200, 601, 50))
    + "".join(f'<path d="M0 {y} H400"/>' for y in (200, 214, 234, 262, 300))
    + "</g>",
    "rohan-controller": '<rect width="400" height="300" fill="#2b2140"/>'
    '<path d="M90 120 Q100 80 150 90 H250 Q300 80 310 120 L340 220 Q345 250 315 250 Q290 250 '
    '270 210 H130 Q110 250 85 250 Q55 250 60 220Z" fill="#e8e6f0"/>'
    '<path d="M130 140 h40 M150 120 v40" stroke="#3a2a5c" stroke-width="14" '
    'stroke-linecap="round"/><g><circle cx="250" cy="125" r="11" fill="#ff5fa2"/>'
    '<circle cx="275" cy="145" r="11" fill="#ffd166"/><circle cx="225" cy="145" r="11" '
    'fill="#4fd1c5"/><circle cx="250" cy="165" r="11" fill="#7b4fd6"/></g>',
    "rohan-pixel": '<rect width="400" height="300" fill="#5bc0eb"/>'
    '<rect y="240" width="400" height="60" fill="#9bc53d"/>'
    '<g fill="#7a4a2c">'
    + "".join(f'<rect x="{x}" y="250" width="20" height="20"/>' for x in range(0, 400, 40))
    + '</g><g fill="#7b4fd6"><rect x="160" y="160" width="80" height="80"/>'
    '<rect x="150" y="180" width="100" height="60"/></g>'
    '<g fill="#fff"><rect x="175" y="180" width="16" height="16"/>'
    '<rect x="209" y="180" width="16" height="16"/></g><g fill="#1a1033">'
    '<rect x="181" y="186" width="8" height="8"/><rect x="215" y="186" width="8" height="8"/></g>'
    '<g fill="#ffd166"><rect x="300" y="100" width="20" height="20"/>'
    '<rect x="60" y="80" width="20" height="20"/></g>',
    # Meera
    "meera-londonrain": sky("#59657a", "#8e9aae", "s")
    + '<g fill="#3a4252"><rect x="0" y="120" width="70" height="180"/>'
    '<rect x="300" y="100" width="100" height="200"/><rect x="80" y="160" width="60" height="140"/>'
    '</g><rect x="150" y="190" width="150" height="70" rx="8" fill="#c0392b"/>'
    '<g fill="#f6e6b0"><rect x="160" y="200" width="24" height="18"/>'
    '<rect x="192" y="200" width="24" height="18"/><rect x="224" y="200" width="24" height="18"/>'
    '<rect x="256" y="200" width="24" height="18"/></g><g fill="#1d1d24">'
    '<circle cx="180" cy="262" r="10"/><circle cx="270" cy="262" r="10"/></g>'
    + rain(50)
    + '<g stroke="#2b2420" stroke-width="12" fill="none"><rect x="6" y="6" width="388" '
    'height="288"/><path d="M200 0 V300 M0 150 H400"/></g>',
    "meera-books": '<rect width="400" height="300" fill="#d6cdb8"/>'
    '<rect y="250" width="400" height="50" fill="#8a5a3b"/>'
    '<rect x="90" y="220" width="170" height="30" fill="#2f4a7a"/>'
    '<rect x="100" y="190" width="150" height="30" fill="#c8693f"/>'
    '<rect x="85" y="160" width="160" height="30" fill="#7fae7a"/>'
    '<rect x="105" y="130" width="140" height="30" fill="#d9a441"/>'
    '<path d="M290 200 H350 V236 Q350 250 320 250 Q290 250 290 236Z" fill="#fff"/>'
    '<path d="M350 210 q16 0 16 12 q0 12 -16 12" fill="none" stroke="#fff" stroke-width="6"/>'
    '<path d="M310 190 q8 -14 0 -28 M328 190 q8 -14 0 -28" stroke="#fff" stroke-width="4" '
    'fill="none" opacity=".8"/>',
    "meera-kolam": '<rect width="400" height="300" fill="#6b4a3a"/>'
    '<g fill="#fff">'
    + "".join(
        f'<circle cx="{120 + 40 * i}" cy="{70 + 40 * j}" r="5"/>'
        for i in range(5)
        for j in range(5)
    )
    + '</g><g fill="none" stroke="#fff" stroke-width="5">'
    '<circle cx="200" cy="150" r="70"/><path d="M200 60 Q260 150 200 240 Q140 150 200 60Z"/>'
    '<path d="M110 150 Q200 90 290 150 Q200 210 110 150Z"/></g>'
    '<g fill="#f2c14e"><circle cx="200" cy="150" r="10"/></g>',
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, person in PEOPLE.items():
        (OUT / f"{name}.svg").write_text(portrait(person), encoding="utf-8")
    for name, body in SNAPSHOTS.items():
        (OUT / f"{name}.svg").write_text(svg(400, 300, body), encoding="utf-8")
    print("wrote", len(PEOPLE) + len(SNAPSHOTS), "images to", OUT)


if __name__ == "__main__":
    main()
