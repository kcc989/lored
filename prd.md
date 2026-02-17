# Cortex: The Product Brain for AI-Native Engineering Teams

## One-Liner

Cortex is the knowledge layer between product intent and AI code generation, turning scattered product context into structured, queryable facts that coding agents and engineers can use in real time.

---

## The Problem

### AI Coding Agents Are Fast. Context Is Not.

AI coding tools have compressed the implementation phase of software development from days to hours. Engineers working with Claude Code, Cursor, Codex, and GitHub Copilot can generate functional code in minutes. But a new bottleneck has emerged: these agents produce output that is only as good as the context they have. When the agent does not know the business rules, the design rationale, the competitive constraints, or the lessons learned from past experiments, it guesses. Those guesses create a new class of bugs that are harder to catch because they are not syntax errors or logic failures. They are _intent failures_: code that works perfectly but does the wrong thing.

Research bears this out. A study of AI-assisted development conversations found that 54.7% of prompts in unsuccessful sessions contained knowledge gaps, compared to only 13.2% in successful ones, with missing context being the most common gap type. The bottleneck has moved from "how do we build this?" to "does the builder understand what we are actually trying to accomplish and why?"

### The Frequency Problem

Before AI coding agents, an engineer might hit one or two context gaps per day. They would Slack the PM, wait for a response, and continue. That was manageable. With agents accelerating the build phase, an engineer might hit three or four context gaps _per hour_. Every gap is either a blocking interruption (the engineer asks someone and waits) or an undetected risk (the engineer or agent guesses and hopes it gets caught in review).

The Faros AI research team found that high AI adoption teams complete significantly more work but create a 91% increase in PR review time. The creation bottleneck has moved to the validation bottleneck, and the root cause is the same: insufficient context at the point of implementation.

### Context Exists but Dies Immediately

The cruel irony is that context gaps get resolved constantly. A PM answers a question in a Slack thread. A designer explains the rationale in a Figma comment. An engineering manager clarifies a constraint in a PR review. The answer exists for a brief moment, then disappears into the archive of whatever tool it was generated in.

The next engineer who hits the same gap asks the same question again. The AI agent that could have used that answer has no access to it. Organizational knowledge about "why we do it this way" lives in people's heads and in the sediment of old Slack threads. No system is designed to make it useful at the moment of implementation.

### PMs Have No Signal About What Context Is Missing

Product managers invest enormous effort writing PRDs, maintaining roadmaps, and communicating strategy. But they have almost zero visibility into whether that context reaches the people and agents who need it at the moment of implementation. A PM discovers their context was insufficient only when it surfaces as a bug, a misunderstanding in demo, or a frustrated question in Slack. There is no systematic feedback loop from implementation back to planning that says: "Here is where your context was insufficient."

### Knowledge Stays Local to Tickets

Even when context gets captured on a specific ticket, it stays local to that ticket. A product decision made during implementation ("free-tier partners should not see upgrade prompts until day 30") is relevant to dozens of future features but lives as a comment on a closed ticket that nobody will ever read again.

Teams accumulate deep knowledge about their product domain through building, but that knowledge stays fragmented across hundreds of tickets, PRs, and Slack threads. There is no mechanism for promoting a specific decision made on a specific ticket into a general fact about the product.

---

## The Product

### What Cortex Is

Cortex is a structured product knowledge base that builds itself through use. It has two interfaces:

**An MCP server** that AI coding agents (Claude Code, Cursor, Codex, Conductor) query during planning and implementation. The agent asks questions, the brain answers what it knows, and when it cannot answer, the question flows to humans who can.

**A web application** where PMs, designers, and engineering managers see incoming questions from agents and engineers, answer them, review auto-extracted facts, resolve conflicts, and curate their team's product knowledge.

The knowledge base grows as a natural byproduct of work. When a PM writes requirements, those become structured facts. When an engineer asks a question and the PM answers, that Q&A pair becomes a new fact. When a designer explains a rationale, that gets captured. Over time, the accumulation of these small, specific decisions creates a rich, queryable product brain that nobody had to sit down and write.

### How It Works

**1. Context goes in as raw input, not data entry.**

People dump in messy, unstructured context: a PRD, a paragraph of notes, a Slack export, a design spec. Cortex runs an LLM extraction pipeline that decomposes raw text into atomic fact candidates, classifies each one by type, and assigns trust scores based on source authority, corroboration with existing facts, and extraction confidence.

**2. Facts get auto-approved or routed for review based on trust.**

High-trust facts (extracted from authoritative sources, corroborated by existing knowledge, no conflicts detected) flow directly into the brain as active, queryable facts. Low-trust facts or those with detected conflicts get routed to the appropriate owner's review queue. The goal is that 80%+ of facts are auto-approved, and human attention is reserved for genuinely ambiguous or conflicting information.

**3. Agents query the brain via MCP during implementation.**

When a coding agent encounters a product decision it does not know, it calls the Cortex MCP server. The server runs hybrid search (semantic + keyword) against the brain, re-ranks results by recency, authority, and relevance, and returns structured context with confidence signals. If the brain does not have a good answer, the query automatically creates an entry in the context queue for human resolution.

**4. The context queue pulls human attention to where it matters.**

PMs, designers, and EMs see a prioritized feed of unresolved questions from agents and engineers, filtered by their domain ownership. Urgent/blocking questions surface prominently. Answering a question creates a new fact in the brain. The next time any agent asks something similar, the brain has the answer and no human is needed.

**5. Trust scores learn and improve over time.**

When humans confirm auto-approved facts, the system learns that its trust signals were correct. When humans reject facts, it learns to be more conservative with similar sources or extraction patterns. When agents use facts successfully (no reported mistakes), trust increases. When facts lead to reported mistakes, trust decays and facts get flagged for re-verification. The percentage of facts requiring human review shrinks over time.

---

## Context Type Taxonomy

Not all context is created equal. Cortex differentiates between six types of knowledge because they have different owners, different rates of change, and different implications for how agents should weight them.

| Type                   | Owner         | Rate of Change | Agent Treatment             | Example                                                 |
| ---------------------- | ------------- | -------------- | --------------------------- | ------------------------------------------------------- |
| Product Requirements   | PM            | Moderate       | Hard constraint             | "Free-tier partners cannot access analytics"            |
| Business Needs         | Leadership/PM | Low            | Hard constraint             | "Must support SOC 2 for enterprise partners"            |
| Design Requirements    | Design        | Moderate       | Hard constraint             | "All modals must be dismissable via ESC key"            |
| Design Opinions        | Design        | High           | Soft preference             | "We prefer progressive disclosure over settings panels" |
| Technical Requirements | Engineering   | Low            | Non-negotiable              | "All API endpoints must respond under 200ms at p99"     |
| Technical Choices      | Engineering   | Moderate       | Authoritative until changed | "We use React Server Components for new pages"          |

This taxonomy matters because a product requirement and a design opinion should not carry the same weight when an agent makes an implementation decision. The brain serves context with appropriate confidence signals based on type.

---

## Key Features

### The Extraction Engine

The core value of Cortex is that people never do granular data entry. They provide raw input and the system produces structured facts.

- **Bulk document ingestion**: Upload a PRD, design spec, or architecture doc. The extraction pipeline reads the full document for context, then walks through it pulling out atomic fact candidates with type classification and scope assignment.
- **Freeform text entry**: Type a paragraph of context. The system decomposes it into individual facts, identifies relationships to existing knowledge, and flags potential conflicts.
- **Question-answer capture**: When a PM answers a question from the context queue, the answer gets extracted into one or more facts automatically.
- **Integration capture**: Slack threads, PR comments, Linear ticket discussions get monitored for knowledge events. Potential facts surface for lightweight confirmation.

### Trust-Based Approval

Every fact candidate receives a computed trust score based on:

- **Source authority**: Direct PM entry (0.9) vs. Slack thread extraction (0.4)
- **Corroboration**: Semantic similarity to existing verified facts in the brain
- **Conflict detection**: Contradictions with existing active facts tank the score
- **Extraction confidence**: The LLM's own assessment of how clearly stated the fact was
- **Recency**: Newer sources score higher than stale ones

Facts above the trust threshold are auto-approved. Facts below go to human review. Conflicts always require human resolution. The threshold is tunable per team and adapts over time based on human review patterns.

### The MCP Server

The agent-facing interface exposes four tools:

- **`query_context`**: Natural language question with optional ticket ID, domain scope, and urgency level. Returns matching facts with confidence scores, or creates a context queue entry if no good answer exists.
- **`report_assumption`**: The agent is making a guess and proceeding. Creates a soft signal in the queue for the PM to confirm or correct.
- **`report_mistake`**: A previous implementation was wrong due to missing context. High-value signal that triggers trust decay on related facts.
- **`get_ticket_context`**: Bulk retrieval of all brain context relevant to a ticket's domain, tags, or linked work.

### The Context Queue

The PM's prioritized inbox of things that need human judgment:

- Conflicts between facts (highest priority)
- Blocking questions from agents where no answer exists
- Low-trust extractions that need confirmation
- Facts where agents have reported mistakes
- Stale facts due for re-verification that are still being actively queried

The queue turns the PM's job from "push documentation into the void" into "spend ten minutes sharpening what the system already figured out." The leverage is enormous: a PM who answers a question once in Cortex helps every future engineer and agent who works in that domain.

### The Brain Explorer

Browse, search, and curate existing knowledge organized by domain, team, and context type. See the health of different domains: fact count, freshness, query frequency, gap rate. Identify where the brain is strong and where it is thin. Edit, deprecate, promote, or archive facts. Full version history and provenance chains for every fact.

### Fact Lifecycle Management

- **Versioning**: Facts are append-only. Updates create new versions with links to predecessors. Full audit trail of what was true and when.
- **Staleness detection**: Multi-signal staleness based on verification expiry, query frequency decay, related fact updates, and conflict detection.
- **Provenance chains**: Every fact carries its full history: source documents, extraction method, trust score at approval, who approved it (human or auto), corroborating evidence, and usage metrics.
- **Cascade analysis**: When a fact is marked incorrect, the system identifies other facts whose trust scores were boosted by corroboration with the bad fact and flags them for review.

---

## Technical Architecture

### Search: ChromaDB Cloud with Hybrid Retrieval

The agentic search layer is powered by ChromaDB Cloud, chosen for its native hybrid search capabilities and Cloudflare Workers AI integration.

**Collection structure**: Domain-scoped collections (e.g., `partner-onboarding`, `billing-api`, `design-system`) provide natural scope boundaries and clean permission models.

**Hybrid search**: Dense vectors (via Cloudflare Workers AI embedding models) for semantic similarity combined with sparse vectors (BM25) for keyword matching on technical terms, API names, and feature names that semantic search might miss. Reciprocal Rank Fusion (RRF) combines results with tunable weights.

**Metadata filtering**: Inverted indexes on `context_type`, `status`, `scope_team`, `scope_domain`, `confidence_score`, `verified_at`, and `owner_role` enable structured filtering layered on top of semantic search.

**Re-ranking**: After initial retrieval, results are re-ranked by verification recency, confidence score, context type authority (requirements outrank opinions), and query-fact semantic relevance.

### Compute and Storage: Cloudflare

- **Workers**: API layer serving both the MCP server and web application
- **D1**: Relational storage for users, teams, domains, fact metadata, context queue entries, query logs, and the trust scoring model
- **Queues**: Async processing for document extraction, integration capture, and trust score recomputation
- **R2**: Raw document storage for uploaded PRDs, specs, and source materials

### Extraction Pipeline

Cloudflare Workers call Claude's API for fact extraction and classification. The pipeline:

1. Accepts raw text input with source metadata
2. Retrieves existing facts from the same domain via ChromaDB for context
3. Sends text + existing context to Claude for decomposition and classification
4. Runs deduplication via ChromaDB similarity search (>0.92 threshold flags duplicates)
5. Computes trust scores for each candidate
6. Routes: auto-approve above threshold, queue for review below threshold, always queue conflicts

### Integrations

| Tool            | Integration Type     | Data Flow                                         |
| --------------- | -------------------- | ------------------------------------------------- |
| Claude Code     | MCP server           | Bidirectional: queries + gap reports              |
| Cursor          | MCP server           | Bidirectional: queries + gap reports              |
| OpenAI Codex    | MCP server           | Bidirectional: queries + gap reports              |
| Conductor       | MCP server           | Bidirectional: queries + gap reports              |
| Linear          | API integration      | Ingest ticket context, link facts to work items   |
| Jira            | API integration      | Ingest ticket context, link facts to work items   |
| GitHub          | API integration      | PR comments, issue discussions as context sources |
| GitHub Projects | API integration      | Project-level context ingestion                   |
| Slack           | Bot + event listener | Ambient capture of knowledge events               |
| Google Docs     | API integration      | Bulk document ingestion from shared drives        |
| Notion          | API integration      | Page and database ingestion                       |
| Figma           | API integration      | Design annotation and comment capture             |

---

## Data Patterns and Prior Art

### Products to Study

- **Guru**: Card-based knowledge management with subject-matter-expert verification workflows, trust scores, configurable expiration intervals, and auto-archive for stale content. Guru's verification model is the closest existing analog to Cortex's fact lifecycle, but Guru is designed for customer support teams, not engineering. Cortex adapts the verification concept for product development and adds the agent-facing query interface that Guru lacks.
- **Glean**: Enterprise knowledge graph with 100+ connectors, hybrid search (lexical + vector), and a personal graph layer. Glean's architecture of ingesting from many sources into a unified graph with signals like popularity, recency, and department affinity is a reference model for Cortex's multi-source indexing. The key difference is that Glean is a horizontal enterprise search tool. Cortex is a vertical product brain specifically designed for the product development workflow.
- **Greptile**: AI code review with full codebase context, rule inference from PR comments, and learning from engineer reactions. Greptile's model of building knowledge from the byproducts of work (rather than explicit documentation) directly informs Cortex's approach to ambient capture and trust-through-usage.
- **Question Base**: Captures knowledge from Slack conversations and automatically surfaces past answers when similar questions arise. Validates the Slack-as-knowledge-source pattern and the "answer once, available forever" model.
- **Stack Overflow for Teams**: Internal Q&A with AI-powered duplicate detection and content health monitoring. Validates the pattern of flagging outdated answers for review based on usage signals.

### Data Patterns to Follow

- **Event sourcing for fact lifecycle**: Facts are immutable events. Updates create new versions. The current state of the brain is a projection of the event log. This enables full audit trails, point-in-time queries ("what did the brain say about partner access rules on January 15?"), and cascade analysis when facts are invalidated.
- **Graph-based knowledge representation**: Facts are nodes. Relationships (corroborates, contradicts, supersedes, specializes, derived-from) are edges. This enables multi-hop reasoning, conflict detection, and the extrapolation engine that promotes local decisions to broader facts.
- **Hybrid retrieval with re-ranking**: The pattern used by Glean and validated in the information retrieval literature. Combine lexical and semantic search at the retrieval stage, then apply a learned re-ranker that weighs domain-specific signals. ChromaDB's Search API with RRF makes this straightforward.
- **Active learning for trust calibration**: Use human review decisions as labeled training data to improve the trust scoring model over time. This is a standard active learning loop: the system makes a prediction (auto-approve vs. route to review), the human provides the label (confirm vs. reject), and the model updates.
- **Domain-scoped collections**: Segment the vector store by team/domain rather than using one giant collection. This improves retrieval precision, simplifies permissions, and enables per-domain tuning of search weights and trust thresholds. Pattern validated by AWS Bedrock knowledge base architecture recommendations.

---

## Roadmap

### Phase 0: Prototype (Weeks 1-4)

**Goal**: Validate that the extraction pipeline produces useful facts and that engineers will actually query a brain during implementation.

Build:

- A single ChromaDB Cloud collection with the full schema (dense + sparse vectors, metadata indexes)
- The extraction endpoint: a Cloudflare Worker that accepts raw text, calls Claude for decomposition/classification, deduplicates against existing facts, and writes to ChromaDB
- A minimal MCP server with `query_context` and `report_assumption` tools
- A bare-bones web UI: paste text in, see extracted facts, approve/reject, browse existing facts

Test with:

- One PM and 2-3 engineers on a single team
- Seed the brain by having the PM paste in their existing PRD and key Slack answers
- Engineers configure the MCP server in Claude Code and use it for one sprint
- Measure: How many queries per day? What percentage get useful answers? How many gaps surface?

**Ship criteria**: Engineers query the brain at least 3x/day and report that answers are useful more than half the time.

### Phase 1: MVP (Weeks 5-10)

**Goal**: A usable product that one team can adopt end-to-end with the core feedback loop working.

Build:

- Trust scoring system with auto-approval and configurable thresholds
- The full context queue with priority routing (conflicts, blocking questions, low-trust facts, stale facts)
- Fact versioning and provenance tracking
- Urgency signaling from the MCP server ("I am blocked on this")
- Notification routing: Slack alerts when blocking questions arrive
- Domain-scoped collections (one per team/domain)
- `report_mistake` and `get_ticket_context` MCP tools
- Linear integration: link facts to tickets, ingest ticket descriptions as context sources

**Ship criteria**: PM spends less than 15 minutes per day on the context queue and the team's "intent bugs" decrease measurably over two sprints.

### Phase 2: Multi-Source Ingestion (Weeks 11-18)

**Goal**: The brain can be fed from the tools teams already use, reducing manual input.

Build:

- Google Docs integration: bulk document ingestion from shared drives
- Slack integration: ambient capture with knowledge event detection
- GitHub integration: PR descriptions and review comments as context sources
- Notion integration: page ingestion
- Jira integration: ticket descriptions and comments
- Improved extraction pipeline with source-specific prompting (Slack threads need different extraction than PRDs)
- Cross-source corroboration: facts that appear in multiple sources get automatic trust boosts
- Source freshness tracking: re-index when source documents are updated

**Ship criteria**: Over 60% of new facts in the brain originate from integrations rather than manual input.

### Phase 3: Multi-Team and Extrapolation (Weeks 19-28)

**Goal**: Cortex works across teams with cross-team knowledge sharing and pattern detection.

Build:

- Multi-team brain with cross-team visibility controls
- The extrapolation engine: detect when local decisions have broader implications ("you have made similar rate limiting decisions on 5 tickets, should this be a team-level rule?")
- Conflict detection across teams: surface contradictory decisions in adjacent domains
- Cross-team search: an agent working on a billing feature can query the partner team's brain for relevant context
- Fact promotion workflow: promote a ticket-level decision to team-level, team-level to division-level
- Role-based curation: PMs own product and business facts, designers own design facts, EMs own technical facts
- Analytics dashboard: query patterns, gap frequency by domain, trust score trends, time-to-answer metrics

**Ship criteria**: At least one cross-team knowledge sharing event per week that would not have happened without Cortex.

### Phase 4: Learning and Intelligence (Weeks 29-40)

**Goal**: The brain gets smarter autonomously and requires less human oversight over time.

Build:

- Trust model tuning based on human review history (active learning loop)
- Agent feedback integration: track which facts agents use and whether they lead to successful implementations
- Predictive gap detection: identify likely context gaps before engineers hit them, based on ticket content and brain coverage
- Smart re-verification: trigger fact review based on usage patterns, age, and domain activity rather than fixed intervals
- Suggested fact updates: when source documents change, automatically re-extract and suggest updates to affected facts
- Query analytics for PMs: "Your engineers asked 40 questions about partner onboarding this sprint. Here are the 5 domains with the worst coverage."

**Ship criteria**: Auto-approval rate exceeds 85% and the trust model's precision (percentage of auto-approved facts that are actually correct) exceeds 95%.

### Future Directions

- **Cursor/IDE plugin**: Surface relevant brain context directly in the editor as the engineer reads a ticket, before they even start the agent
- **Meeting integration**: Extract facts from recorded standups, planning sessions, and design reviews
- **Customer feedback loop**: Connect support tickets and user research to the brain so product context includes the voice of the customer
- **API-as-product**: Expose the brain as infrastructure that other tools can build on (the "picks and shovels" play)
- **Multi-brain federation**: Teams at different companies working on shared platforms or integrations can selectively share context across organizational boundaries

---

## Market

### Who Buys This

**Primary buyer**: Engineering leaders (VP Eng, Director of Engineering, Senior EM) at companies with 20-200 engineers who have adopted AI coding tools and are feeling the context gap.

**Primary user**: Product managers (who curate the brain and answer questions) and engineers (who query it through their coding agents).

**Design partners**: Fast-moving mid-stage startups (Series A through C) with strong AI coding tool adoption, multiple product teams, and enough organizational complexity that context transfer is a real problem, but not so much bureaucracy that adopting a new tool is a year-long procurement process.

### Why Now

Three trends are converging:

1. **AI coding agent adoption is accelerating.** Claude Code, Cursor, Codex, and Copilot are becoming standard developer tools. The more teams rely on agents for implementation, the more painful the context gap becomes.
2. **MCP is creating an integration standard.** The Model Context Protocol gives us a universal interface for AI agents to query external knowledge. Building an MCP server means every compliant coding tool gets access to the brain without custom integration work.
3. **PM-to-engineer ratios are shifting.** As Andrew Ng has noted, when building gets cheaper, the demand for people who can specify _what_ to build increases. Companies are hiring more PMs per engineer. The PM's output is shifting from "write tickets" to "maintain the product brain." Cortex makes that new job tractable.

### Competitive Positioning

Cortex is not an enterprise search tool (Glean), a general knowledge base (Guru, Confluence), a documentation platform (Notion, Readme), or a code review tool (Greptile). It is a **product context layer** purpose-built for the workflow between product planning and AI-assisted implementation. The closest existing workflows are "PM answers questions in Slack" and "engineer reads the PRD before starting work." Cortex makes both of those workflows structured, persistent, and queryable by machines.

---

## Team Requirements

To build Phase 0 and Phase 1, you need:

- **1 full-stack engineer** with experience in Cloudflare Workers, TypeScript, and React. Builds the extraction pipeline, MCP server, web UI, and ChromaDB integration.
- **1 product-minded founder** who understands the PM workflow deeply enough to design the context queue, trust scoring model, and fact lifecycle. Ideally someone who has lived the problem as a PM or EM at a company with 50+ engineers.

That is a two-person founding team shipping an MVP in 10 weeks.

---

## Metrics That Matter

- **Queries per engineer per day**: Are agents actually using the brain?
- **Answer hit rate**: What percentage of queries return useful context?
- **Gap-to-resolution time**: How quickly do unanswered questions get resolved?
- **Auto-approval rate**: What percentage of extracted facts are trusted enough to skip human review?
- **Auto-approval precision**: Of auto-approved facts, what percentage turn out to be correct?
- **Intent bug reduction**: Do teams using Cortex ship fewer features that "work but do the wrong thing"?
- **PM time-on-queue**: How many minutes per day does the PM spend curating the brain?
- **Fact reuse rate**: How often does a fact created from one question get retrieved for a different question?
