# Dashboard branch cleanup audit - 2026-09-12

Merged implementation remains on main. The following refs are eligible for removal;
SHA guards must reject deletion if a branch advances. Preserve open update PRs #10
and #11. This audit records recovery references without keeping obsolete branches.

| Branch | Tip | Integration proof |
|---|---|---|
| feat/free-cloudflare-observability | `1ae94530977a4a13e16077b13573d8e093e8f9e2` | PR #19 plus final Journal entry preserved |
| docs/current-implementation-handoff | `2686b68948221dd92e6d2cd2420cf7be4bea18f1` | Merged PRs #18 |
| fix/issue-filters-connections | `dc23073131a4052068998d404e914ec433a87af6` | Merged PRs #18 |
| tooling-rollout/7cc92da3ecb6229359e364d163d42a70c305c096 | `21f233f8561c4f74715891367ec8cc7e5487f7eb` | Merged PRs #16 |
| fix/portable-artifacts | `b0d5e38c9cc559cc3d7fc42173fb9d6403fc376d` | Merged PRs #18, #17 |
| fix/portable-runtime | `abe61731758edf4b2721a237ce311b8bb39389f3` | Merged PRs #6 |
| feature/portable-scanner-profiles | `a0315dcfcfd80a49d844618305c5d0b64f74e4ae` | d82be59 (PR #6) |
| feature/authenticated-report-cutover | `37ed071bacdb132327f6cffe5acd29fe2b692538` | Merged PRs #5 |
| fix/external-service-cutover | `b838dc89c237680dc2a412cac06773abd6f923a2` | Merged PRs #3 |
| feature/repository-owned-application | `41bb9838c88fadfa3fd02ef6cf726c880c3a2c6f` | Merged PRs #2 |
| extraction/standalone-analysis | `9c60589033d3948c5060739ac734834211bbac0e` | Merged PRs #19, #18, #17, #16, #15, #14, #13, #9, #8, #7, #6, #5, #4, #3, #2, #1 |
