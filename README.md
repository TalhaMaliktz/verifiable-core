# 🚀 verifiable-core

**verifiable-core** is an open-source memory and orchestration layer designed to securely run multi-agent RAG and verifiable AI workflows.

This repository provides the hardened backend infrastructure (event-driven ingestion, vector persistence, and retrieval orchestration) without the liability of monolithic frameworks or UI wrappers.

---

## 🗺️ The Living Manifesto (Roadmap)

We are building this engine in distinct phases to simulate a rigorous enterprise software lifecycle, prioritizing determinism, memory isolation, and infrastructure security over prototype speed.

### Currently Shipped (Production-Ready)

- [x] **Phase 1: The Foundation** (NestJS API Gateway, Strict DTO Validation, CORS).
- [x] **Phase 2: The Data Layer** (Dockerized Postgres, Prisma v7 Connection Pooling).
- [x] **Phase 3: Asynchronous Ingestion** (Redis + BullMQ, Decoupled File Processing).
- [x] **Phase 4: Vectorization Pipeline** (Native SDK Integration, pgvector 3072-dims, Defensive Parsing).
- [x] **Phase 5: Retrieval Engine** (Raw SQL Cosine Similarity, Quota Short-Circuit, LLM Synthesis).
- [x] **Phase 6: Multi-Format Ingestion & Memory Hardening** ($O(1)$ Disk Streaming Claim-Check, PDF/MD/TXT/DOCX extraction, UTF-8 Null-Byte sanitization, Worker Singleton lifecycle).

### The Horizon (Active R&D)

- [ ] **Phase 7: Vector Algorithmic Optimization** (HNSW indexing via `vector_cosine_ops` with sub-millisecond retrieval bounds).
- [ ] **Phase 8: Stateful Graph Orchestration** (LangGraph `PostgresSaver` integration for persistent agent memory).
- [ ] **Phase 9: Perimeter Security** (Standard stateless JWT authentication boundaries and tenant isolation).
- [ ] **Phase 10: Sovereign Infrastructure** (Local SGLang inference and bare-metal orchestration specs).

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
# Infrastructure Configurations
PORT=3000

# Connection string for local Docker container
DATABASE_URL="postgresql://postgres:password@localhost:5432/smartdocs?schema=public"

# Redis Connection (Required for BullMQ)
REDIS_HOST="localhost"
REDIS_PORT=6379

# External Model Providers
GEMINI_API_KEY="your_api_key_here"
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

To verify the **API <-> Database** connection is working, run this cURL command:

```bash
curl -X POST http://localhost:3000/users \
   -H "Content-Type: application/json" \
   -d '{"email": "engineer@verifiable.local", "name": "System Reviewer"}'
```

To verify the **Event-Driven Ingestion Pipeline** (Upload -> Postgres PENDING -> Redis Worker -> Postgres COMPLETED + Vectorized), upload a PDF:

```bash
curl -X POST http://localhost:3000/ingestion/upload \
  -F "file=@./path/to/your/test.pdf" \
  -H "Content-Type: multipart/form-data"
```

**Expected Output (Instant API Response):**

```json
{
  "status": "queued",
  "jobId": "30",
  "documentId": "263b4134-6511-44d8-8653-fcca93f100c8",
  "message": "File streamed to disk and job queued for processing."
}
```

**Worker Logs (Background Processing):**

```bash
[Nest] LOG [IngestionProcessor] --- [WORKER START] Job 1 (Attempt 1) ---
[Nest] LOG [IngestionService] Routing extraction for file: ephemeral-uploads/uuid.md (extension: .md)
[Nest] LOG [IngestionService] Successfully read plaintext/markdown. Extracted 5519 characters.
[Nest] LOG [IngestionProcessor] Split document into 10 valid chunks.
[Nest] LOG [IngestionProcessor] Throttling requests to Gemini (1 chunk every 4.2 seconds)...
[Nest] LOG [IngestionProcessor] [1/10] Successfully saved 3072-dim vector.
...
[Nest] LOG [IngestionProcessor] Ephemeral file unlinked: ephemeral-uploads/uuid.md
[Nest] LOG [IngestionProcessor] --- [WORKER COMPLETED] Document safely stored! ---
```

**Verify Persistence & Vectorization:**
Run Prisma Studio to view the securely stored document, its `COMPLETED` status, and the generated embeddings:

```bash
npx prisma studio
```

To verify the **RAG Read Path** (Vector Search + Hallucination-Free Synthesis), run this query:

```bash
curl -X POST http://localhost:3000/chat \
   -H "Content-Type: application/json" \
   -d '{"message": "What is this document about?"}'
```
