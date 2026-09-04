# 🚀 verifiable-core

**verifiable-core** is an open-source memory and orchestration layer designed to securely run multi-agent RAG and verifiable AI workflows.

This repository provides the hardened backend infrastructure (event-driven ingestion, vector persistence, and retrieval orchestration) without the liability of monolithic frameworks or UI wrappers.

---

## 🗺️ The Living Manifesto (Roadmap)

We build this engine in phases to prove enterprise software reliability. We prioritize determinism, memory safety, and infrastructure security over prototype speed.

### Currently Shipped (Production-Ready)

- [x] **Phase 1: The Foundation** (NestJS API Gateway, Strict DTO Validation, CORS).
- [x] **Phase 2: The Data Layer** (Dockerized Postgres, Prisma v7 Connection Pooling).
- [x] **Phase 3: Asynchronous Ingestion** (Redis + BullMQ, Decoupled File Processing).
- [x] **Phase 4: Vectorization Pipeline** (Native SDK Integration, Dynamic Dimensions, Defensive Parsing).
- [x] **Phase 5: Dynamic Retrieval Engine** (Model-matched search, Cosine Similarity, Quota Short-Circuit).
- [x] **Phase 6: Multi-Format Ingestion & Memory Hardening** ($O(1)$ Disk Streaming, PDF/MD/TXT/DOCX extraction, Null-Byte sanitization, Worker Singleton lifecycle).
- [x] **Phase 7: Vector Algorithmic Optimization** (Dual partial HNSW indexes for 768 and 1536 dims, `SET LOCAL hnsw.ef_search = 100`, `::text[]` array casting).
- [x] **Phase 8: Security & Fallback Orchestration** (Helmet, NestJS Throttler, strict prompt role separation, Ollama/Gemini fallback with 60-second abort timeouts).
- [x] **Phase 9: Ingestion Integrity & Hybrid Search** (SHA-256 byte stream hashing, PostgreSQL GIN full-text search, Scatter-Gather parallel retrieval, in-memory Reciprocal Rank Fusion with $k=60$).

### The Horizon (Active Open-Core R&D)

- [ ] **Phase 10: Perimeter Auth & Boundary Defense** (Stateless JWT token validation, loopback inference binding).
- [ ] **Phase 11: Sovereign Bare-Metal Serving** (Hetzner GPU setup, SGLang Docker serving with RadixAttention prefix caching).
- [ ] **Phase 12: Structure-Aware Chunking & LLM Factories** (Tree-sitter AST parsing, atomic table retention, dynamic NestJS factory providers).
- [ ] **Phase 13: Batch CLI & Scale Latency Benchmarks** (Python folder ingestion CLI, 600 financial reports testbed, empirical HNSW vs scan benchmarks, technical case study).

---

## 🏗️ Architecture

This system operates as a decoupled, asynchronous API layer. It contains no frontend presentation logic.

| Service      | Tech Stack            | Port   | Description                                                  |
| :----------- | :-------------------- | :----- | :----------------------------------------------------------- |
| **Backend**  | NestJS (v10)          | `3000` | API Gateway, Validation, and Domain Orchestration.           |
| **Queue**    | Redis + BullMQ        | `6379` | Asynchronous Job Queue for decoupled ingestion pipelines.    |
| **Database** | PostgreSQL + pgvector | `5432` | Dockerized DB. Stores Users, Documents, & Vector Embeddings. |

---

## ⚙️ Design Decisions & Hardened Constraints

To handle the rigorous demands of enterprise data sovereignty, high-volume ingestion, and agentic precision, this system enforces the following architectural constraints:

- **Native SDKs over Wrappers:** Bypassed high-level framework wrappers in favor of native API SDKs to eliminate silent abstraction failures and maintain strict control over the network layer.
- **$O(1)$ Memory Disk-Streaming:** Incoming uploads bypass V8 RAM heap buffers entirely. Files stream directly to disk via Multer and pass to workers using the Claim Check pattern (`{ storagePath, documentId }`), eliminating heap-exhaustion DoS vulnerabilities.
- **Worker Singleton Lifecycle:** SDK clients, text splitters, and configuration validations initialize strictly once within the worker constructor during boot. This enables fail-fast configuration assertions and eliminates runtime garbage collection pauses.
- **Multi-Format Extraction Pipeline:** Modular extraction strategy supporting `.pdf`, `.docx`, `.txt`, and `.md`. Word documents are parsed via OpenXML structure traversal, while PDFs enforce `%PDF-` magic-byte inspection to reject corrupted or spoofed payloads.
- **PostgreSQL Null-Byte Sanitization:** Every text extractor actively strips UTF-8 null bytes (`\0` / `0x00`) to prevent transaction abortion errors during raw SQL insertion into PostgreSQL.
- **Deterministic Queue Fault Isolation:** Background workers explicitly differentiate between transient network drops and deterministic validation errors. Bad payloads throw `UnrecoverableError` to halt redundant retry loops, while `finally` teardown blocks guarantee deterministic ephemeral file removal.
- **API Traffic Shaping (Tarpit Bypass):** Background workers execute scheduled rate throttling inside `finally` blocks to respect third-party embedding rate limits without blocking the Node.js event loop.
- **Raw SQL Vector Search:** Bypasses standard ORM limitations to execute raw PostgreSQL/pgvector Cosine Similarity (`<=>`) queries for maximum retrieval speed.
- **LLM API Short-Circuiting:** Zero-latency early return bypasses LLM generation when zero relevant chunks meet the similarity threshold, strictly protecting API rate limit quotas.
- **Hallucination Shields:** Enforces strict Distance Thresholds (`> 0.6`) and Top-K tuning (`LIMIT 10`) to physically prevent the synthesis of irrelevant context.
- **High-Fidelity Embedding:** Configures `pgvector` to accept high-dimension vectors (`vector(3072)`) natively.
- **Dockerized Persistence:** Uses the `ankane/pgvector` image for local, data-sovereign vector storage instead of third-party managed vector cloud services.
- **Sovereign State Machine:** Manages the entire document lifecycle (`PENDING` -> `PROCESSING` -> `COMPLETED` / `FAILED`) within a local Postgres database to guarantee data privacy, auditable failure logs, and job recovery.
- **Partial HNSW Vector Indexes:** Deployed two separate HNSW indexes (`m=16`, `ef_construction=64`) filtered by `vector_dims(embedding)`. This isolates 768-dimension local embeddings from 1536-dimension cloud embeddings in the same table.
- **Transaction-Scoped Search Depth:** Every vector query runs inside a database transaction with `SET LOCAL hnsw.ef_search = 100`. This prevents dropped chunks during filtered document searches.
- **Dynamic Model-Matched Retrieval:** The `ChatService` inspects the target document before vectorizing user queries. It matches the query embedding model to the document embedding model automatically.
- **Strict Prompt Role Separation:** Chat prompts split system instructions from user inputs across local and cloud providers. This blocks prompt injection attacks from malicious document text.
- **Provider Fallback & Timeout Guards:** Local Ollama generation runs with a 60-second `Promise.race` timeout guard. The system falls back cleanly to Gemini when configured in environment variables.
- **PostgreSQL Type-Safe Scoping:** Raw SQL search queries cast input document IDs to `::text[]`. This prevents type mismatch crashes against Prisma text columns.
- **Input UUID Deduplication:** Scoped document queries deduplicate input arrays before querying Prisma. This prevents false 404 errors on repeated document IDs.
- **Byte-Level Streaming Fingerprints:** Uploaded files stream through a cryptographic transform stream on the fly to compute SHA-256 hashes with flat $O(1)$ memory, preventing heap buffer exhaustion during duplicate checks.
- **Database-Enforced Invariants:** A PostgreSQL unique B-Tree index on `Document.fileHash` acts as the single source of truth, neutralizing concurrent upload race conditions directly at the storage engine layer.
- **Fail-Fast Disk Cleanup:** When duplicate file uploads trigger an HTTP 409 Conflict at the API gateway boundary, the ephemeral file is unlinked immediately via `fs.unlink()` to prevent storage leaks, since rejected jobs bypass the BullMQ worker lifecycle.
- **Expression-Based GIN Inverted Indexing:** Deployed a PostgreSQL Generalized Inverted Index on `to_tsvector('english', text)` to enable sub-millisecond keyword lookups, language-aware stemming, and stop-word filtering.
- **Scatter-Gather Parallel Retrieval:** The retrieval layer broadcasts queries to both the dense HNSW vector index and the sparse GIN full-text index concurrently over the PostgreSQL connection pool using `Promise.all`, reducing retrieval latency to the slowest query.
- **In-Memory Reciprocal Rank Fusion (RRF):** Replaced arbitrary score arithmetic with position-based rank fusion ($k=60$) using an in-memory TypeScript `Map`, combining disparate retrieval scales while avoiding database-level joins and window functions.

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js** v20+
- **Docker Desktop** (Must be running)

### 2. Installation

```bash
git clone https://github.com/<YOUR_USERNAME>/verifiable-core.git
cd verifiable-core
npm install
```

### 3. Environment Setup

Create a `.env` file in the root directory:

```env
# Application Port
PORT=3000

# Database Persistence
DATABASE_URL="postgresql://postgres:password@localhost:5432/verifiable_core?schema=public"

# Redis Queue
REDIS_HOST="localhost"
REDIS_PORT=6379

# Active Provider Routing
DEFAULT_EMBEDDING_PROVIDER="ollama"
DEFAULT_CHAT_PROVIDER="ollama"

# Local Inference Config
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_CHAT_MODEL="qwen2.5:7b"

# Cloud Model Keys & Names
GEMINI_API_KEY="your_gemini_api_key_here"
CHAT_MODEL="gemini-2.5-flash"
OPENAI_API_KEY="your_openai_api_key_here"
OPENROUTER_API_KEY="your_openrouter_api_key_here"
```

### 4. Infrastructure & Database

Start the decoupled infrastructure and sync the ORM.

```bash
# 1. Start Docker Containers
docker compose up -d

# 2. Run Prisma Migrations
npx prisma migrate dev --name init

# 3. Start the Backend Gateway
npm run start:dev
```

---

## 🧪 Verification

### 1. Verify API and Database Connection

Run this cURL command to create a test user:

```bash
curl -X POST http://localhost:3000/users \
   -H "Content-Type: application/json" \
   -d '{"email": "engineer@verifiable.local", "name": "System Reviewer"}'
```

### 2. Verify File Ingestion Pipeline

#### A. Default Ingestion (Local Ollama)

Upload a file to trigger disk streaming and background vector jobs:

```bash
curl -X POST http://localhost:3000/ingestion/upload \
  -F "file=@./path/to/your/test.pdf"
```

#### B. Ingestion with Custom Model Override

Specify a model provider (`gemini`, `openai`, `ollama`, or `openrouter`) in the multipart body:

```bash
curl -X POST http://localhost:3000/ingestion/upload \
  -F "file=@./path/to/your/test.pdf" \
  -F "model=gemini"
```

**Expected Instant API Response:**

```json
{
  "status": "queued",
  "jobId": "30",
  "documentId": "263b4134-6511-44d8-8653-fcca93f100c8",
  "message": "File streamed to disk and job queued for processing."
}
```

**Expected Worker Terminal Logs:**

```bash
[Nest] LOG [IngestionProcessor] --- [WORKER START] Job 1 (Attempt 1) ---
[Nest] LOG [IngestionProcessor] Active Embedding Provider: nomic-embed-text (768 dims)
[Nest] LOG [IngestionService] Routing extraction for file: ephemeral-uploads/uuid.pdf (extension: .pdf)
[Nest] LOG [IngestionService] Successfully read PDF text via magic-byte validator. Extracted 5519 characters.
[Nest] LOG [IngestionProcessor] Split document into 10 valid chunks.
[Nest] LOG [IngestionProcessor] [1/10] Persisted 768-dim vector.
...
[Nest] LOG [IngestionProcessor] Ephemeral file unlinked: ephemeral-uploads/uuid.pdf
[Nest] LOG [IngestionProcessor] --- [WORKER COMPLETED] Document safely stored! ---
```

### 3. Verify Database Persistence

Open Prisma Studio to inspect stored records, vector chunk indexes, and document statuses:

```bash
npx prisma studio
```

### 4. Verify the Dynamic RAG Engine

#### A. Global Knowledge Base Search

Queries all completed documents across the database:

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the main technical points in these documents?"
  }'
```

**Expected Response (with verified chunk citations):**

```json
{
  "query": "What are the main technical points in these documents?",
  "answer": "The main technical points include:\n\n1. Document Ingestion and Parsing Validation [Document: \"test-docs.docx\", Chunk: 0]...\n2. Verification and Reliability Strategies [Document: \"test-txt.txt\", Chunk: 1]...",
  "sourcesUsed": 5,
  "citations": [
    {
      "documentId": "f5c913c4-facd-4cb4-86eb-e2a990befff1",
      "documentTitle": "test-docs.docx",
      "chunkIndex": 0,
      "similarity": 0.5584
    },
    {
      "documentId": "714873d2-0229-4f9d-ba50-a0b34518fd6d",
      "documentTitle": "test-txt.txt",
      "chunkIndex": 1,
      "similarity": 0.5525
    }
  ]
}
```

#### B. Scoped Document Search

Restricts semantic retrieval to specific document IDs:

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What does this file discuss?",
    "documentIds": ["YOUR_DOCUMENT_UUID"]
  }'
```

#### C. Duplicate ID Deduplication Test

Sends repeated document UUIDs to prove deduplication safety:

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What does this file discuss?",
    "documentIds": [
      "YOUR_DOCUMENT_UUID",
      "YOUR_DOCUMENT_UUID"
    ]
  }'
```

#### D. Input Validation Check

Sends an invalid UUID identifier to verify DTO error handling:

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Tell me about this document.",
    "documentIds": ["00000000-0000-0000-0000-000000000000"]
  }'
```

**Expected Response (HTTP 400 Bad Request):**

```json
{
  "message": [
    "Every element in documentIds must be a valid UUIDv4 identifier."
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

### 5. Verify Ingestion Deduplication (SHA-256 Collision Rejection)

Attempting to upload an identical file returns an immediate HTTP 409 Conflict without triggering background processing:

```bash
curl -X POST http://localhost:3000/ingestion/upload \
  -F "file=@./test-assets/test-txt.txt"
```

**Expected Response (HTTP 409 Conflict):**

```json
{
  "message": "Duplicate file detected. This document matches existing document ID: df8c0f8c-b96d-4657-80a5-87549c8041b9",
  "error": "Conflict",
  "statusCode": 409
}
```

### 6. Verify Hybrid Retrieval & Reciprocal Rank Fusion (RRF)

#### A. Exact Keyword Retrieval (Lexical Dominance via GIN)

Queries for exact function names, acronyms, or error codes trigger dual-channel matches, producing higher RRF scores ($0.030+$):

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "getInfo"
  }'
```

**Expected Response (Dual-Channel Boost)**

```json
{
  "query": "getInfo",
  "answer": "The `getInfo` function in the `pdf-parse` library is used to extract metadata...",
  "sourcesUsed": 5,
  "citations": [
    {
      "documentId": "5bd8b863-a47e-4793-9b95-f4f36eb9dd2d",
      "documentTitle": "pdf-parse - npm.pdf",
      "chunkIndex": 4,
      "rrfScore": 0.032522
    }
  ]
}
```

#### B. Conceptual Retrieval (Semantic Dominance via HNSW)

Queries phrased with abstract synonyms retrieve conceptually related chunks even when exact keywords are missing from the source text:

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How do security leaders buy software?"
  }'
```

**Expected Response (Single-Channel Vector Match)**

```json
{
  "query": "How do security leaders buy software?",
  "answer": "Security leaders, particularly CISOs and security-minded engineering leads, tend to prioritize self-hostability...",
  "sourcesUsed": 5,
  "citations": [
    {
      "documentId": "df8c0f8c-b96d-4657-80a5-87549c8041b9",
      "documentTitle": "test-txt.txt",
      "chunkIndex": 1,
      "rrfScore": 0.016393
    }
  ]
}
```

#### C. Multi-Tenant Document Boundary Isolation

Queries restricted to specific document IDs strictly isolate retrieval scope, refusing to hallucinate or return matching chunks from unselected documents

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How do security leaders buy software?",
    "documentIds": ["5bd8b863-a47e-4793-9b95-f4f36eb9dd2d"]
  }'
```

**Expected Response (Single-Channel Vector Match)**

```json
{
  "query": "How do security leaders buy software?",
  "answer": "The provided context does not contain any information about how security leaders buy software. Therefore, I do not know based on the given information.",
  "sourcesUsed": 5
}
```
