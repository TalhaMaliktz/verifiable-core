# 📖 Deep Dives

Step-by-step implementation guides for individual `verifiable-core` features. Each guide covers the problem, the architecture, the trade-offs, and the code, so a feature can be understood and rebuilt without reading the whole source tree.

| Guide | Feature | Stack |
| :--- | :--- | :--- |
| [Hybrid Search & Reciprocal Rank Fusion](./hybrid-search-retrieval.md) | Add a PostgreSQL full-text (sparse) leg beside the dense pgvector leg, run both in parallel, and fuse the two ranked lists by **rank, not score** to cancel out the cosine-vs-`ts_rank` scale mismatch. | PostgreSQL, pgvector, GIN, Prisma, NestJS |

## Adding a guide

1. Create `docs/guides/<feature-name>.md`.
2. Cover, in order: **the problem → the architecture → the implementation → the trade-offs → verification**.
3. Add a row to the table above.
4. Link it from the matching roadmap phase in the root `README.md`.

## Conventions

- Pin every version-sensitive detail (index names, parameters, SQL) to the real source.
- Mark any explanation that is general practice rather than specific to this repo.
- No private data: use placeholders for IDs and test fixtures.
