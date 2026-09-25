from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_cell_viewer_renders_locations():
    r = client.get("/viewers/cell", params={"sls": "SL-0086,SL-0173"})
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]
    assert 'sls="86,173"' in r.text
    assert "SwissBioPics" in r.text  # attribution


def test_structure_viewer_focuses_the_ligand():
    r = client.get("/viewers/structure", params={"pdb": "5MZP", "ligand": "CFF"})
    assert r.status_code == 200
    assert '"5mzp"' in r.text and '"CFF"' in r.text


def test_pathway_viewer_highlights_the_region():
    r = client.get("/viewers/pathway", params={"ehld": "R-HSA-71291", "highlight": "R-HSA-71288"})
    assert r.status_code == 200
    assert "\"R-HSA-71288\"" in r.text and "REGION-" in r.text


def test_invalid_parameters_are_rejected():
    assert client.get("/viewers/cell", params={"sls": "<script>"}).status_code == 422
    assert client.get("/viewers/structure", params={"pdb": "5MZP'); alert(1)//", "ligand": "CFF"}).status_code == 422
    assert client.get("/viewers/pathway", params={"ehld": "javascript:x", "highlight": ""}).status_code == 422


def test_image_cache_only_fetches_allowed_hosts():
    r = client.get("/viewers/image", params={"url": "https://evil.example/x.png"})
    assert r.status_code == 400
    r = client.get("/viewers/image", params={"url": "http://reactome.org/x.svg"})
    assert r.status_code == 400  # https only
