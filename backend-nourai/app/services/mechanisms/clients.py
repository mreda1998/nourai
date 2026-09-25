"""
Thin clients for the open databases the mechanism job reads.

Identity comes from exact names (PubChem) and ChEBI's own relations — never
from fuzzy pathway search, which returns stearate for "magnesium".
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import quote

import httpx

REACTOME = "https://reactome.org/ContentService"
FORM_RELATIONS = {"is tautomer of", "is conjugate acid of", "is conjugate base of"}


class MechanismClients(Protocol):
    def chebi_ids_for_name(self, name: str) -> list[str]: ...
    def chebi_related_forms(self, chebi_id: str) -> list[str]: ...
    def reactome_pathways(self, chebi_id: str) -> list[tuple[str, str]]: ...
    def reactome_ancestors(self, stable_id: str) -> list[list[tuple[str, str, bool]]]: ...
    def reactome_proteins(self, stable_id: str) -> list[tuple[str, str]]: ...
    def uniprot_locations(self, accession: str) -> list[tuple[str, str]]: ...
    def rcsb_ligand(self, chebi_id: str) -> str | None: ...
    def rcsb_best_human_entry(self, comp_id: str) -> tuple[str, str] | None: ...


class HttpMechanismClients:
    def __init__(self, client: httpx.Client | None = None):
        self.http = client or httpx.Client(timeout=30, follow_redirects=True)

    def _json(self, method: str, url: str, **kw) -> Any:
        try:
            r = self.http.request(method, url, **kw)
        except httpx.HTTPError:
            return None
        if r.status_code != 200:
            return None
        try:
            return r.json()
        except ValueError:
            return None

    def chebi_ids_for_name(self, name: str) -> list[str]:
        d = self._json("GET", f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{quote(name)}/synonyms/JSON")
        if not d or "InformationList" not in d:
            return []
        synonyms = d["InformationList"]["Information"][0].get("Synonym", [])
        return [s.removeprefix("CHEBI:") for s in synonyms if s.startswith("CHEBI:")]

    def chebi_related_forms(self, chebi_id: str) -> list[str]:
        d = self._json("GET", f"https://www.ebi.ac.uk/chebi/backend/api/public/compound/{chebi_id}/")
        if not d:
            return []
        rel = d.get("ontology_relations") or {}
        out = []
        for r in rel.get("incoming_relations", []) + rel.get("outgoing_relations", []):
            if r.get("relation_type") in FORM_RELATIONS:
                other = r["init_id"] if str(r["final_id"]) == str(chebi_id) else r["final_id"]
                out.append(str(other))
        return list(dict.fromkeys(out))

    def reactome_pathways(self, chebi_id: str) -> list[tuple[str, str]]:
        d = self._json("GET", f"{REACTOME}/data/mapping/ChEBI/{chebi_id}/pathways", params={"species": "9606"})
        return [(p["stId"], p["displayName"]) for p in d or []]

    def reactome_ancestors(self, stable_id: str) -> list[list[tuple[str, str, bool]]]:
        d = self._json("GET", f"{REACTOME}/data/event/{stable_id}/ancestors")
        return [[(e["stId"], e["displayName"], bool(e.get("hasEHLD"))) for e in path] for path in d or []]

    def reactome_proteins(self, stable_id: str) -> list[tuple[str, str]]:
        d = self._json("GET", f"{REACTOME}/data/participants/{stable_id}/referenceEntities")
        out = []
        for x in d or []:
            if x.get("databaseName") == "UniProt":
                gene = (x.get("geneName") or [x.get("displayName", "").split(" ")[-1]])[0]
                out.append((x["identifier"], gene))
        return list(dict.fromkeys(out))

    def uniprot_locations(self, accession: str) -> list[tuple[str, str]]:
        d = self._json("GET", f"https://rest.uniprot.org/uniprotkb/{accession}.json",
                       params={"fields": "cc_subcellular_location"})
        out = []
        for c in (d or {}).get("comments", []):
            for s in c.get("subcellularLocations", []):
                loc = s.get("location") or {}
                if loc.get("id", "").startswith("SL-"):
                    out.append((loc["id"], loc.get("value", "")))
        return list(dict.fromkeys(out))

    def rcsb_ligand(self, chebi_id: str) -> str | None:
        query = {
            "query": {"type": "terminal", "service": "text_chem", "parameters": {
                "attribute": "rcsb_chem_comp_related.resource_accession_code",
                "operator": "exact_match", "value": f"CHEBI:{chebi_id}"}},
            "return_type": "mol_definition",
        }
        d = self._json("POST", "https://search.rcsb.org/rcsbsearch/v2/query", json=query)
        hits = (d or {}).get("result_set") or []
        return hits[0]["identifier"] if hits else None

    def rcsb_best_human_entry(self, comp_id: str) -> tuple[str, str] | None:
        query = {
            "query": {"type": "group", "logical_operator": "and", "nodes": [
                {"type": "terminal", "service": "text", "parameters": {
                    "attribute": "rcsb_nonpolymer_instance_annotation.comp_id",
                    "operator": "exact_match", "value": comp_id}},
                {"type": "terminal", "service": "text", "parameters": {
                    "attribute": "rcsb_entity_source_organism.taxonomy_lineage.name",
                    "operator": "exact_match", "value": "Homo sapiens"}},
            ]},
            "return_type": "entry",
            "request_options": {
                "sort": [{"sort_by": "rcsb_entry_info.resolution_combined", "direction": "asc"}],
                "paginate": {"start": 0, "rows": 1},
            },
        }
        d = self._json("POST", "https://search.rcsb.org/rcsbsearch/v2/query", json=query)
        hits = (d or {}).get("result_set") or []
        if not hits:
            return None
        pdb_id = hits[0]["identifier"]
        entry = self._json("GET", f"https://data.rcsb.org/rest/v1/core/entry/{pdb_id}") or {}
        return pdb_id, (entry.get("struct") or {}).get("title", "")


class RecordingClients:
    """Wraps real clients and saves every answer, for test fixtures."""

    def __init__(self, inner: MechanismClients, path: Path):
        self.inner, self.path, self.calls = inner, Path(path), {}

    def __getattr__(self, method: str):
        fn = getattr(self.inner, method)

        def call(*args):
            result = fn(*args)
            self.calls[f"{method}|{'|'.join(map(str, args))}"] = result
            self.path.write_text(json.dumps(self.calls, indent=1, ensure_ascii=False))
            return result
        return call


class ReplayClients:
    """Answers from a recording; unknown calls return empty results."""

    EMPTY = {"rcsb_ligand": None, "rcsb_best_human_entry": None}

    def __init__(self, path: Path):
        self.calls = json.loads(Path(path).read_text())

    def __getattr__(self, method: str):
        def call(*args):
            key = f"{method}|{'|'.join(map(str, args))}"
            if key in self.calls:
                value = self.calls[key]
                if method == "rcsb_best_human_entry":
                    return tuple(value) if value else None
                return _tuples(value)
            return self.EMPTY.get(method, [])
        return call


def _tuples(value):
    """JSON turns tuples into lists; restore them one level down."""
    if isinstance(value, list):
        return [tuple(_tuples(v)) if isinstance(v, list) and v and not isinstance(v[0], list) else _tuples(v)
                for v in value]
    return value
