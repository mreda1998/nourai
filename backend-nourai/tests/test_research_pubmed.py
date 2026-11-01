"""PubMed search queries and the metadata kept from each paper."""
import asyncio
import time

import httpx
import pytest

from app.services.research import pubmed
from app.services.research.pubmed import build_query, parse_articles


@pytest.mark.anyio
async def test_parallel_searches_are_spaced_to_pubmeds_rate_limit(monkeypatch):
    """Four ingredients searching at once sent ~15 requests/s and PubMed answered 429."""
    monkeypatch.setattr(pubmed, "_interval", lambda: 0.05)
    sent: list[float] = []

    def api(request: httpx.Request) -> httpx.Response:
        sent.append(time.monotonic())
        return httpx.Response(200, json={"esearchresult": {"idlist": []}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(api)) as http:
        sem = asyncio.Semaphore(8)
        await asyncio.gather(*(pubmed.search(http, f"q{i}", 3, sem) for i in range(6)))

    gaps = [b - a for a, b in zip(sent, sent[1:])]
    assert len(sent) == 6
    assert min(gaps) >= 0.045

_XML = """<?xml version="1.0" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>111</PMID>
      <Article>
        <Journal><JournalIssue><PubDate><Year>2023</Year></PubDate></JournalIssue><Title>Nutrients</Title></Journal>
        <ArticleTitle>Curcumin for knee <i>osteoarthritis</i>: a randomized trial</ArticleTitle>
        <Abstract>
          <AbstractText Label="BACKGROUND">Knee pain is common and curcumin is widely used.</AbstractText>
          <AbstractText Label="METHODS">We randomised 140 adults to 1 g curcumin or placebo for 12 weeks.</AbstractText>
          <AbstractText Label="RESULTS">Pain fell more with curcumin than placebo (p=0.01).</AbstractText>
        </Abstract>
        <GrantList><Grant><Agency>National Institutes of Health</Agency></Grant></GrantList>
        <PublicationTypeList>
          <PublicationType>Journal Article</PublicationType>
          <PublicationType>Randomized Controlled Trial</PublicationType>
        </PublicationTypeList>
        <DataBankList><DataBank><DataBankName>ClinicalTrials.gov</DataBankName>
          <AccessionNumberList><AccessionNumber>NCT01234567</AccessionNumber></AccessionNumberList>
        </DataBank></DataBankList>
      </Article>
      <MeshHeadingList>
        <MeshHeading><DescriptorName>Osteoarthritis, Knee</DescriptorName></MeshHeading>
        <MeshHeading><DescriptorName>Curcumin</DescriptorName></MeshHeading>
      </MeshHeadingList>
      <CoiStatement>Author A consults for a supplement maker.</CoiStatement>
    </MedlineCitation>
    <PubmedData><ArticleIdList><ArticleId IdType="doi">10.3390/nu1</ArticleId></ArticleIdList></PubmedData>
  </PubmedArticle>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>222</PMID>
      <Article>
        <Journal><JournalIssue><PubDate><MedlineDate>2019 Jan-Feb</MedlineDate></PubDate></JournalIssue><Title>J X</Title></Journal>
        <ArticleTitle>Retracted: turmeric cures everything</ArticleTitle>
        <Abstract><AbstractText>A long enough abstract about turmeric that was later retracted by the journal after concerns about its data.</AbstractText></Abstract>
        <PublicationTypeList><PublicationType>Retracted Publication</PublicationType></PublicationTypeList>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
  <PubmedArticle>
    <MedlineCitation><PMID>333</PMID><Article><ArticleTitle>No abstract</ArticleTitle></Article></MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>"""


def test_parse_keeps_method_relevant_metadata_and_labelled_abstract_sections():
    article = parse_articles(_XML)[0]
    assert article.pmid == "111"
    assert article.title == "Curcumin for knee osteoarthritis: a randomized trial"
    assert article.abstract.startswith("BACKGROUND: Knee pain is common")
    assert "METHODS: We randomised 140 adults" in article.abstract
    assert article.year == 2023
    assert article.journal == "Nutrients"
    assert article.doi == "10.3390/nu1"
    assert article.publication_types == ["Journal Article", "Randomized Controlled Trial"]
    assert article.mesh_terms == ["Osteoarthritis, Knee", "Curcumin"]
    assert article.registry_ids == ["NCT01234567"]
    assert article.grant_agencies == ["National Institutes of Health"]
    assert article.coi_statement == "Author A consults for a supplement maker."
    assert article.retracted is False


def test_parse_marks_retractions_reads_medline_dates_and_skips_papers_without_abstracts():
    articles = parse_articles(_XML)
    assert [a.pmid for a in articles] == ["111", "222"]
    assert articles[1].retracted is True
    assert articles[1].year == 2019


def test_query_combines_names_and_outcomes_and_excludes_retractions():
    query = build_query(["curcumin", "turmeric"], ["osteoarthritis", "knee pain"], "trials")
    assert '("curcumin"[tiab] OR "turmeric"[tiab])' in query
    assert '("osteoarthritis"[tiab] OR "knee pain"[tiab])' in query
    assert '"randomized controlled trial"[pt]' in query
    assert "humans[mh]" in query
    assert '"retracted publication"[pt]' in query


def test_preclinical_query_covers_animal_cell_and_chemistry_studies_but_not_human_ones():
    query = build_query(["sucralose"], ["chloropropanols", "heating"], "preclinical")
    assert "NOT humans[mh]" in query
    assert "animals[mh] NOT" not in query  # food-chemistry papers carry no animal heading
