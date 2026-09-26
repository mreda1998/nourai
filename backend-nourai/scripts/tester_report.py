"""
Tester report — what friends actually scan, what we are missing, and which
ingredients to research next.

Usage (from backend-nourai/):
    make tester-report                 # all activity
    make tester-report ARGS="--days 7" # last week only
    python -m scripts.tester_report --out /tmp/report.html

Writes a self-contained HTML file (default: ../reports/tester-report-<date>.html)
and prints a short summary. Submission photos are linked through 7-day signed
URLs when Supabase storage is configured.
"""
from __future__ import annotations

import argparse
import asyncio
import html
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
REPORTS_DIR = Path(__file__).resolve().parents[2] / "reports"

# Every scan resolved to the product it points at *today* — a scan that was
# queued for ingestion counts as a hit once the worker has published it.
_SCANS = """
scans AS (
    SELECT e.device_id, e.barcode, e.created_at,
           COALESCE(
               e.product_id,
               (SELECT pi.product_id FROM product_identifiers pi
                 WHERE pi.scheme = 'gtin' AND pi.value = e.barcode LIMIT 1),
               (SELECT p.id FROM products p
                 WHERE p.barcode IN (e.barcode, right(e.barcode, 13), right(e.barcode, 12),
                                     right(e.barcode, 8), ltrim(e.barcode, '0'))
                 LIMIT 1)
           ) AS product_id
      FROM tester_events e
     WHERE e.event_type = 'scan' AND e.barcode IS NOT NULL AND e.created_at >= :since
)"""

# Products a tester demonstrably uses: scanned, opened or added to their stack.
_USED = _SCANS + """,
used AS (
    SELECT device_id, product_id FROM scans WHERE product_id IS NOT NULL
    UNION
    SELECT device_id, product_id FROM tester_events
     WHERE event_type IN ('product_view', 'stack_add')
       AND product_id IS NOT NULL AND created_at >= :since
)"""


async def _rows(session: AsyncSession, sql: str, since: datetime) -> list[dict[str, Any]]:
    result = await session.execute(text(sql), {"since": since})
    return [dict(row._mapping) for row in result]


async def gather_report(session: AsyncSession, since: datetime | None) -> dict[str, Any]:
    since = since or EPOCH

    overview = (await _rows(session, "WITH " + _SCANS + """
        SELECT
          (SELECT count(DISTINCT device_id) FROM tester_events WHERE created_at >= :since) AS testers,
          (SELECT count(*) FROM tester_events WHERE event_type = 'scan' AND created_at >= :since) AS scans,
          (SELECT count(*) FROM scans WHERE product_id IS NOT NULL) AS scan_hits,
          (SELECT count(*) FROM tester_events WHERE event_type = 'search' AND created_at >= :since) AS searches,
          (SELECT count(*) FROM tester_events WHERE event_type = 'search' AND created_at >= :since
             AND meta->>'results' = '0') AS zero_result_searches,
          (SELECT count(*) FROM product_submissions WHERE created_at >= :since) AS submissions
    """, since))[0]

    missed = await _rows(session, "WITH " + _SCANS + """
        SELECT barcode, count(DISTINCT device_id) AS testers, count(*) AS scans,
               max(created_at) AS last_seen
          FROM scans WHERE product_id IS NULL
         GROUP BY barcode
         ORDER BY testers DESC, scans DESC, last_seen DESC
    """, since)

    submissions = await _rows(session, """
        SELECT id::text AS id, barcode, name, brand, category, note, photo_paths, created_at
          FROM product_submissions WHERE created_at >= :since
         ORDER BY created_at DESC
    """, since)
    by_barcode: dict[str, list[dict[str, Any]]] = {}
    for sub in submissions:
        if sub["barcode"]:
            by_barcode.setdefault(sub["barcode"], []).append(sub)
    missed_barcodes = {row["barcode"] for row in missed}
    for row in missed:
        row["submissions"] = by_barcode.get(row["barcode"], [])
    unmatched_submissions = [s for s in submissions if s["barcode"] not in missed_barcodes]

    products = await _rows(session, "WITH " + _USED + """
        SELECT p.id::text AS id, p.name, p.brand, p.category,
               count(DISTINCT u.device_id) AS testers,
               (SELECT count(*) FROM product_ingredients pi WHERE pi.product_id = p.id) AS ingredients,
               (SELECT count(*) FROM product_ingredients pi
                 WHERE pi.product_id = p.id AND pi.ingredient_id IS NOT NULL) AS linked,
               (SELECT count(*) FROM product_ingredients pi JOIN ingredients i ON i.id = pi.ingredient_id
                 WHERE pi.product_id = p.id AND i.research_status = 'complete') AS researched
          FROM used u JOIN products p ON p.id = u.product_id
         GROUP BY p.id
         ORDER BY testers DESC, p.name
    """, since)

    research_priority = await _rows(session, "WITH " + _USED + """
        , needs AS (
            SELECT u.device_id, u.product_id,
                   CASE WHEN i.id IS NULL THEN lower(btrim(pi.name)) ELSE i.canonical_name END AS name,
                   CASE WHEN i.id IS NULL THEN 'unlinked'
                        WHEN i.research_status = 'failed' THEN 'research failed'
                        ELSE 'unresearched' END AS status
              FROM used u
              JOIN product_ingredients pi ON pi.product_id = u.product_id
              LEFT JOIN ingredients i ON i.id = pi.ingredient_id
             WHERE i.id IS NULL OR i.research_status <> 'complete'
        )
        SELECT name, status, count(DISTINCT device_id) AS testers, count(DISTINCT product_id) AS products
          FROM needs
         GROUP BY name, status
         ORDER BY testers DESC, products DESC, name
    """, since)

    categories = await _rows(session, "WITH " + _USED + """
        SELECT p.category AS category, count(DISTINCT u.device_id) AS testers,
               count(DISTINCT u.product_id) AS products
          FROM used u JOIN products p ON p.id = u.product_id
         GROUP BY p.category
         ORDER BY testers DESC, products DESC
    """, since)

    zero_searches = await _rows(session, """
        SELECT lower(btrim(query)) AS query, count(DISTINCT device_id) AS testers, count(*) AS searches
          FROM tester_events
         WHERE event_type = 'search' AND meta->>'results' = '0'
           AND query IS NOT NULL AND created_at >= :since
         GROUP BY lower(btrim(query))
         ORDER BY testers DESC, searches DESC, query
    """, since)

    feedback = await _rows(session, """
        SELECT e.created_at, left(e.device_id, 8) AS device, p.name AS product,
               e.meta->>'message' AS message, e.meta->>'context' AS context
          FROM tester_events e LEFT JOIN products p ON p.id = e.product_id
         WHERE e.event_type = 'feedback' AND e.created_at >= :since
         ORDER BY e.created_at DESC
    """, since)

    testers = await _rows(session, """
        SELECT left(device_id, 8) AS device,
               count(*) FILTER (WHERE event_type = 'scan') AS scans,
               count(*) FILTER (WHERE event_type = 'search') AS searches,
               count(*) FILTER (WHERE event_type = 'product_view') AS views,
               count(*) FILTER (WHERE event_type = 'stack_add') AS stack_adds,
               count(*) FILTER (WHERE event_type = 'feedback') AS feedback,
               min(created_at) AS first_seen, max(created_at) AS last_seen
          FROM tester_events WHERE created_at >= :since
         GROUP BY device_id
         ORDER BY last_seen DESC
    """, since)

    return {
        "generated_at": datetime.now(timezone.utc),
        "since": None if since == EPOCH else since,
        "overview": overview,
        "missed": missed,
        "unmatched_submissions": unmatched_submissions,
        "products": products,
        "research_priority": research_priority,
        "categories": categories,
        "zero_searches": zero_searches,
        "feedback": feedback,
        "testers": testers,
    }


# ─── HTML ─────────────────────────────────────────────────────────────────────

def _e(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, datetime):
        return value.strftime("%b %d, %H:%M")
    return html.escape(str(value))


def _table(headers: list[str], rows: list[list[str]], empty: str) -> str:
    if not rows:
        return f'<p class="empty">{_e(empty)}</p>'
    head = "".join(f"<th>{_e(h)}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>" for row in rows)
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


def _submission(sub: dict[str, Any], photo_urls: dict[str, str]) -> str:
    title = " · ".join(_e(v) for v in (sub.get("name"), sub.get("brand")) if v) or "Unnamed"
    extra = " · ".join(_e(v) for v in (sub.get("category"), sub.get("barcode")) if v)
    photos = "".join(
        f'<a href="{_e(photo_urls[p])}"><img src="{_e(photo_urls[p])}" alt="label photo"></a>'
        if p in photo_urls else f'<span class="path">{_e(p)}</span>'
        for p in sub.get("photo_paths") or []
    )
    note = f'<div class="note">“{_e(sub["note"])}”</div>' if sub.get("note") else ""
    return (
        f'<div class="sub"><div><strong>{title}</strong> <span class="muted">{extra}</span></div>'
        f'{note}<div class="photos">{photos}</div></div>'
    )


def render_html(report: dict[str, Any], photo_urls: dict[str, str]) -> str:
    o = report["overview"]
    hit_rate = f"{round(100 * o['scan_hits'] / o['scans'])}%" if o["scans"] else "—"
    window = f"since {_e(report['since'])}" if report.get("since") else "all time"
    stats = [
        ("Testers", o["testers"]), ("Scans", o["scans"]), ("Scan hit rate", hit_rate),
        ("Searches", o["searches"]), ("Searches with no result", o["zero_result_searches"]),
        ("Products sent to us", o["submissions"]),
    ]
    stat_html = "".join(f'<div class="stat"><b>{_e(v)}</b><span>{_e(k)}</span></div>' for k, v in stats)

    missed_rows = [
        [f"<code>{_e(r['barcode'])}</code>", _e(r["testers"]), _e(r["scans"]), _e(r["last_seen"]),
         "".join(_submission(s, photo_urls) for s in r["submissions"]) or '<span class="muted">no details sent</span>']
        for r in report["missed"]
    ]
    unmatched = "".join(_submission(s, photo_urls) for s in report["unmatched_submissions"])
    product_rows = [
        [f"<strong>{_e(p['name'])}</strong><div class='muted'>{_e(p['brand'])}</div>", _e(p["category"]),
         _e(p["testers"]), f"{p['linked']}/{p['ingredients']}", f"{p['researched']}/{p['ingredients']}"]
        for p in report["products"]
    ]
    priority_rows = [
        [_e(r["name"]), f'<span class="tag {r["status"].split()[0]}">{_e(r["status"])}</span>',
         _e(r["testers"]), _e(r["products"])]
        for r in report["research_priority"]
    ]
    category_rows = [[_e(c["category"]), _e(c["testers"]), _e(c["products"])] for c in report["categories"]]
    search_rows = [[_e(s["query"]), _e(s["testers"]), _e(s["searches"])] for s in report["zero_searches"]]
    feedback_rows = [
        [_e(f["created_at"]), _e(f["device"]), _e(f["product"]), _e(f["message"])] for f in report["feedback"]
    ]
    tester_rows = [
        [f"<code>{_e(t['device'])}</code>", _e(t["scans"]), _e(t["searches"]), _e(t["views"]),
         _e(t["stack_adds"]), _e(t["feedback"]), _e(t["first_seen"]), _e(t["last_seen"])]
        for t in report["testers"]
    ]

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Elory tester report</title>
<style>
  :root {{ --ink:#0E1F1E; --ink2:#51605E; --line:#E3DED3; --canvas:#F3F0E9; --surface:#FFFFFF;
          --accent:#0F5652; --warn:#B4562F; --soft:#E6EFEC; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--canvas); color:var(--ink);
         font:15px/1.5 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; }}
  main {{ max-width:1080px; margin:0 auto; padding:40px 16px 80px; }}
  h1 {{ font:400 40px/1.1 "Instrument Serif", Georgia, serif; margin:0 0 6px; }}
  h2 {{ font:400 26px/1.2 "Instrument Serif", Georgia, serif; margin:44px 0 6px; }}
  .lede, .muted {{ color:var(--ink2); }}
  .lede {{ margin:0 0 14px; }}
  .stats {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin-top:24px; }}
  .stat {{ background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:16px; }}
  .stat b {{ display:block; font-size:28px; font-weight:600; }}
  .stat span {{ color:var(--ink2); font-size:13px; }}
  .scroll {{ overflow-x:auto; }}
  table {{ width:100%; border-collapse:collapse; background:var(--surface); border:1px solid var(--line);
          border-radius:16px; overflow:hidden; }}
  th, td {{ text-align:left; padding:10px 12px; border-bottom:1px solid var(--line); vertical-align:top; }}
  th {{ font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink2); background:#FAF8F3; }}
  tr:last-child td {{ border-bottom:0; }}
  code {{ font:13px ui-monospace, SFMono-Regular, Menlo, monospace; }}
  .tag {{ font-size:12px; padding:2px 8px; border-radius:99px; background:var(--soft); color:var(--accent); white-space:nowrap; }}
  .tag.unlinked {{ background:#F6E7DF; color:var(--warn); }}
  .sub {{ padding:6px 0; }}
  .sub + .sub {{ border-top:1px dashed var(--line); }}
  .note {{ color:var(--ink2); font-style:italic; }}
  .photos {{ display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }}
  .photos img {{ width:84px; height:84px; object-fit:cover; border-radius:10px; border:1px solid var(--line); }}
  .path {{ font:12px ui-monospace, monospace; color:var(--ink2); }}
  .empty {{ color:var(--ink2); background:var(--surface); border:1px dashed var(--line); border-radius:16px; padding:16px; }}
</style></head>
<body><main>
<h1>What testers are using</h1>
<p class="lede">Generated {_e(report['generated_at'])} UTC · {window}</p>
<div class="stats">{stat_html}</div>

<h2>Research priority</h2>
<p class="lede">Ingredients in products testers scanned, opened or stacked that we can't explain yet —
ranked by how many testers they reach. <em>Unlinked</em> means no canonical ingredient matched.</p>
<div class="scroll">{_table(["Ingredient", "Status", "Testers", "Products"], priority_rows, "Nothing to research yet.")}</div>

<h2>Products we're missing</h2>
<p class="lede">Barcodes testers scanned that still have no product, with anything they sent us.</p>
<div class="scroll">{_table(["Barcode", "Testers", "Scans", "Last scan", "What they sent"], missed_rows, "No missed scans.")}</div>
{f'<h2>Other product requests</h2><p class="lede">Sent from search or without a barcode.</p><div class="empty" style="border-style:solid">{unmatched}</div>' if unmatched else ''}

<h2>Most-used products</h2>
<p class="lede">Linked = ingredients matched to our library; researched = with completed evidence review.</p>
<div class="scroll">{_table(["Product", "Category", "Testers", "Linked", "Researched"], product_rows, "No products used yet.")}</div>

<h2>Category mix</h2>
<div class="scroll">{_table(["Category", "Testers", "Products"], category_rows, "No products used yet.")}</div>

<h2>Searches with no result</h2>
<div class="scroll">{_table(["Query", "Testers", "Searches"], search_rows, "Every search found something.")}</div>

<h2>Feedback</h2>
<div class="scroll">{_table(["When", "Tester", "Product", "Message"], feedback_rows, "No feedback yet.")}</div>

<h2>Testers</h2>
<div class="scroll">{_table(["Device", "Scans", "Searches", "Views", "Stack adds", "Feedback", "First seen", "Last seen"], tester_rows, "No testers yet.")}</div>
</main></body></html>
"""


# ─── CLI ──────────────────────────────────────────────────────────────────────

async def _photo_urls(report: dict[str, Any]) -> dict[str, str]:
    from app.services.submission_storage import SubmissionPhotoStore

    store = SubmissionPhotoStore()
    if not store.configured:
        return {}
    paths = {
        path
        for sub in report["unmatched_submissions"] + [s for m in report["missed"] for s in m["submissions"]]
        for path in (sub.get("photo_paths") or [])
    }
    urls = await asyncio.gather(*(store.signed_url(p) for p in paths))
    return {p: u for p, u in zip(paths, urls) if u}


async def _main(days: int | None, out: Path | None) -> Path:
    from app.db.session import async_session_factory

    since = datetime.now(timezone.utc) - timedelta(days=days) if days else None
    async with async_session_factory() as session:
        report = await gather_report(session, since)
    html_text = render_html(report, await _photo_urls(report))

    target = out or REPORTS_DIR / f"tester-report-{datetime.now():%Y-%m-%d}.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html_text, encoding="utf-8")

    o = report["overview"]
    print(f"Testers {o['testers']} · scans {o['scans']} ({o['scan_hits']} found) · "
          f"searches {o['searches']} ({o['zero_result_searches']} empty) · submissions {o['submissions']}")
    for row in report["research_priority"][:10]:
        print(f"  research: {row['name']:<40} {row['status']:<16} {row['testers']} tester(s)")
    for row in report["missed"][:10]:
        print(f"  missing:  {row['barcode']:<40} {row['testers']} tester(s), {row['scans']} scan(s)")
    print(f"Report written to {target}")
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarise tester activity into an HTML report")
    parser.add_argument("--days", type=int, default=None, help="Only include the last N days")
    parser.add_argument("--out", type=Path, default=None, help="Output HTML path")
    args = parser.parse_args()
    asyncio.run(_main(args.days, args.out))


if __name__ == "__main__":
    main()
