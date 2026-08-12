# 🚀 verifiable-core

**verifiable-core** is an open-source memory and orchestration layer designed to securely run multi-agent RAG and verifiable AI workflows.

This repository provides the hardened backend infrastructure (event-driven ingestion, vector persistence, and retrieval orchestration) without the liability of monolithic frameworks or UI wrappers.

---

## 🗺️ The Living Manifesto (Roadmap)

We are building this engine in distinct phases to simulate a rigorous enterprise software lifecycle, prioritizing determinism and infrastructure security over prototype speed.

### Currently Shipped (Production-Ready)

- [x] **Phase 1: The Foundation** (NestJS API Gateway, Strict DTO Validation, CORS).
- [x] **Phase 2: The Data Layer** (Dockerized Postgres, Prisma v7 Connection Pooling).
- [x] **Phase 3: Asynchronous Ingestion** (Redis + BullMQ, Decoupled File Processing).
- [x] **Phase 4: Vectorization Pipeline** (Native SDK Integration, pgvector 3072-dims, Defensive Parsing).
- [x] **Phase 5: Retrieval Engine** (Raw SQL Cosine Similarity, Quota Short-Circuit, LLM Synthesis).

### The Horizon (Active R&D)

- [ ] **Phase 6: Memory Stream Hardening** (Replacing RAM buffers with streaming multipart parsers).
- [ ] **Phase 7: Vector Algorithmic Optimization** (HNSW indexing via `vector_cosine_ops`).
- [ ] **Phase 8: Stateful Graph Orchestration** (LangGraph `PostgresSaver` integration for persistent agent memory).
- [ ] **Phase 9: Perimeter Security** (Standard stateless JWT authentication boundaries).
- [ ] **Phase 10: Sovereign Infrastructure** (Local SGLang inference and bare-metal orchestration specs).

---

## 🏗️ Architecture

This system operates as a decoupled, asynchronous API layer. It contains no frontend presentation logic.

| Service      | Tech Stack            | Port   | Description                                                  |
| :----------- | :-------------------- | :----- | :----------------------------------------------------------- |
| **Backend**  | NestJS (v10)          | `3000` | API Gateway, Validation, and Business Logic.                 |
| **Queue**    | Redis + BullMQ        | `6379` | Async Job Queue for decoupling ingestion tasks.              |
| **Database** | PostgreSQL + pgvector | `5432` | Dockerized DB. Stores Users, Documents, & Vector Embeddings. |

---

## ⚙️ Design Decisions & Constraints

To handle the rigorous demands of enterprise data sovereignty and high-volume AI ingestion, this system enforces the following architectural constraints:

- **Native SDKs over Wrappers:** Bypassed popular abstraction layers in favor of native API SDKs to eliminate silent failures and maintain absolute control over the network layer.
- **API Traffic Shaping (Tarpit Bypass):** Engineered an event-loop aware rate limiter via `finally` blocks in the background worker. This gracefully handles enterprise API "tarpitting" without crashing the queue or triggering `429 Too Many Requests`.
- **Raw SQL Vector Search:** Bypassed standard ORM limitations to execute raw PostgreSQL/pgvector Cosine Similarity (`<=>`) queries for maximum retrieval speed.
- **LLM API Short-Circuiting:** Engineered a zero-latency early return that bypasses LLM generation when zero relevant chunks are found, strictly protecting API rate limit quotas.
- **Hallucination Shields:** Enforces strict Distance Thresholds (`> 0.6`) and Top-K tuning (`LIMIT 10`) to physically prevent the synthesis of irrelevant data.
- **High-Fidelity Embedding:** Configures `pgvector` to accept `vector(3072)` dimensions natively.
- **Dockerized Persistence:** Uses the `ankane/pgvector` image for local, data-sovereign vector support instead of managed cloud services.
- **Defensive Parsing:** Implements **"Magic Byte" inspection** to validate file integrity (preventing "fake PDF" container crashes) before processing.
- **Sovereign State Machine:** Manages the document lifecycle (`PENDING` -> `PROCESSING` -> `COMPLETED`) entirely within a local Postgres database to guarantee data privacy and job recovery.

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js** v20+
- **Docker Desktop** (Must be running)

### 2. Installation

```bash
git clone [https://github.com/talhamaliktz/verifiable-core.git](https://github.com/talhamaliktz/verifiable-core.git)
cd verifiable-core
npm install
```

### 3. Environment Setup

Create a `.env` file in the root directory:

```env
# Infrastructure Configurations
PORT=3000

# Connection string for local Docker container (Update to match your volume)
DATABASE_URL="postgresql://postgres:password@localhost:5432/smartdocs?schema=public"

# Redis Connection (Required for Queues)
REDIS_HOST="localhost"
REDIS_PORT=6379

# External APIs
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
  "message": "File accepted for processing. Check status later."
}
```

**Worker Logs (Background Processing):**

```bash
[Nest] LOG [IngestionProcessor] --- [WORKER START] Job 30 ---
[Nest] LOG [IngestionService] Received buffer size: 583199 bytes
[Nest] LOG [IngestionService] Extracted text, chunking into 1000-token blocks...
[Nest] LOG [IngestionService] Generating 3072-dim vectors...
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
