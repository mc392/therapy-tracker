# GroundWork — implementation task index

Orchestration plan produced from the 30 Aug 2026 release review. Each task file is
**self-contained**: give one file to one Claude Code session, in the order below.
Kickoff prompt for every session:

> Read `docs/tasks/<FILE>` and implement it exactly. Read CLAUDE.md first. Do not do
> anything the task marks out of scope.

Rules that apply to EVERY task in this repo (repeat offenders are called out per-task):

- The canonical app is `TherapyTracker-web/index.html` — one file, no build step. Use the
  Read/Edit file tools, never bash `cat`/`sed` (see CLAUDE.md § Known gotchas), and never
  script a bulk rewrite of the file.
- Run `npm run check` before finishing — it asserts every name the native iOS shell wraps.
- Do not bump the service-worker cache name unless you changed an icon or the manifest
  (HTML is network-first; `index.html` changes need no bump).
- Do not "fix" the multi-tab/multi-device overwrite opportunistically (CLAUDE.md § Known
  limitations) — T3 handles its user-facing edge deliberately.
- Existing installs must never lose a tab, a feature, or a figure. When in doubt, gate new
  behaviour on fresh installs only, the way `normalize()` and `settings.reveal` already do.
- Update the relevant CLAUDE.md section when you change behaviour it documents.

| # | Task file | Model | Depends on | One-line scope |
|---|---|---|---|---|
| 1 | T1-seed-cleanup.md | Sonnet | — | Remove Charlotte's personal data from the fresh-install seed |
| 2 | T2-beta-gate.md | Sonnet | T1 | Delete the beta gate; relocate its warnings for the store build |
| 3 | T3-restore-hardening.md | **Opus** | T2 | Restore-from-backup gets a real gate + freshness comparison |
| 4 | T4-native-auto-backup.md | **Opus** | — | Automatic on-device backups in the iOS app |
| 5 | T5-simple-home.md | **Opus** | — | Slim simple-mode Home; re-tier the gradual reveal |
| 6 | T7a-tax-at-a-glance.md | **Opus** | — | New default Tax view: three numbers + seasonal moment cards |
| 7 | T7b-tax-guided-flows.md | **Opus** | T7a | Guided wizards for the infrequent tax jobs |
| 8 | T6-copy-pass.md | Sonnet | T5, T7a | One-sentence rule per card; label renames |
| 9 | T9-tax-tests.md | Sonnet | — | Test coverage for cancellation charging |
| 10 | T8-listing-and-policy.md | Sonnet | T4 | True up App Store listing copy and privacy.html |

Sequencing notes:
- T1 → T2 → T3 in order (they touch adjacent regions of the init/restore code).
- T4, T5, T7a, T9 are independent of each other and of the T1–T3 chain.
- T6 must run **after** T5 and T7a (it edits copy on surfaces those tasks reshape).
- T8 last-ish (it documents what T4 shipped).

After each task: commit with a message naming the task id, and tick it off here.

- [x] T1 · [x] T2 · [x] T3 · [x] T4 · [x] T5 · [x] T7a · [x] T7b · [x] T6 · [x] T9 · [x] T8

**All ten tasks implemented (31 Aug 2026).** Also delivered outside this plan: schedule
sync with GroundWork Notes (`scripts/check-schedule-parity.mjs` asserts both apps predict
identically; the rule lives in the Notes repo's `docs/schedule-sync.md`).
