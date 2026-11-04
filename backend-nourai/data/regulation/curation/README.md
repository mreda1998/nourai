# Curation manifests

One JSON file per substance: which places to report on and which official documents to read.
`make curate-rules MANIFEST="data/regulation/curation/<file>.json"` drafts rules from them; nothing
is served until `make review-rules ARGS="--reviewer <name>"` approves it.

- `documents[].url` is the official page or PDF, and the citation shown in the app.
- `documents[].file` (optional) is a copy saved from a browser into `documents/` for sites that refuse
  automated clients. WADA's Prohibited List is one: save the current year's PDF from
  https://www.wada-ama.org/en/prohibited-list as `documents/wada-prohibited-list.pdf`.
  Saved copies are not committed.
- `substance.ingredient` links the substance to a researched ingredient by canonical name.
