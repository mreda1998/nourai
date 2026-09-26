"""
Draw an ingredient's 2D structure in Elory's style: ink bonds, nitrogen in
teal, oxygen in terracotta, sulfur in gold, on a transparent background.
Drawn from SMILES with RDKit, so every identified compound looks the same.
"""
from __future__ import annotations

import re
from functools import lru_cache

from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors, rdDepictor, rdMolDescriptors
from rdkit.Chem.Draw import rdMolDraw2D

RDLogger.DisableLog("rdApp.*")

MAX_HEAVY_ATOMS = 60  # beyond this a 2D drawing stops being readable on a phone

INK = "#0E1F1E"
PALETTE = {7: "#0F5652", 8: "#BE5B3B", 16: "#C9A465", 15: "#C38A26"}  # N, O, S, P


def _rgb(hex_colour: str) -> tuple[float, float, float]:
    h = hex_colour.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def _mol(smiles: str):
    mol = Chem.MolFromSmiles(smiles)
    if mol is None or mol.GetNumHeavyAtoms() > MAX_HEAVY_ATOMS:
        return None
    return mol


@lru_cache(maxsize=512)
def render_molecule_svg(smiles: str, width: int = 360, height: int = 240) -> str | None:
    mol = _mol(smiles)
    if mol is None:
        return None
    rdDepictor.SetPreferCoordGen(True)
    rdDepictor.Compute2DCoords(mol)

    drawer = rdMolDraw2D.MolDraw2DSVG(width, height, -1, -1, True)  # True: text labels, not paths
    options = drawer.drawOptions()
    options.bondLineWidth = 2.0
    options.padding = 0.12
    options.fixedBondLength = 34
    options.clearBackground = False
    options.addStereoAnnotation = False
    palette = {-1: _rgb(INK), 1: _rgb(INK), 6: _rgb(INK)}
    palette.update({z: _rgb(c) for z, c in PALETTE.items()})
    options.updateAtomPalette(palette)
    drawer.DrawMolecule(mol)
    drawer.FinishDrawing()

    svg = drawer.GetDrawingText()
    svg = re.sub(r"<\?xml[^>]*>\s*", "", svg)
    svg = re.sub(r"<rect[^>]*/>\s*", "", svg)  # any background box
    svg = svg.replace("font-family:sans-serif", "font-family:Inter,-apple-system,sans-serif;font-weight:500")
    return svg.strip()


def molecule_facts(smiles: str) -> dict | None:
    mol = _mol(smiles)
    if mol is None:
        return None
    return {"formula": rdMolDescriptors.CalcMolFormula(mol), "mass": round(Descriptors.MolWt(mol), 2)}
