---
name: minimal-modeling
description: Use when designing database schemas from business requirements, translating vague requirements into concrete SQL definitions, or validating database designs with non-technical stakeholders. Provides a systematic methodology that decouples logical business modeling from physical implementation to reduce cognitive load and ensure business-driven design.
---

# Minimal Modeling

Separate "what exists" (business logic) from "how to store it" (technical implementation). This reduces cognitive load and enables validation by non-technical stakeholders before writing SQL.

## Phase A: Logical Model

### Step 1: Find Anchors (The "Nouns")

Entities that exist independently with unique IDs—things you count, not data itself.

**Validation test:**

```
"We have 1,000 [Nouns] in our database."
"The system inserts another [Noun] into the database."
```

If both sound natural, it's an Anchor.

- ✅ User, Post, Order, Product
- ❌ Email, Title, Price (these are Attributes)

### Step 2: Find Attributes (The "Data")

Information describing an Anchor. Each attribute answers a human-readable question:

```
"What is the [attribute]?" → String, Number, Money
"Is this [condition]?"    → Boolean
```

**Type guidance:**

- Strings: names, descriptions, addresses
- Numbers: counts, quantities
- Money: prices, balances (always DECIMAL, never Float)
- Booleans: flags, yes/no
- Dates: created dates, scheduled events
- Binary: files/images (or external URLs)

### Step 3: Find Links (The "Relationships")

Connections between Anchors. Use two sentences to determine cardinality:

```
"A [Anchor A] has [one/several] [Anchor B]."
"A [Anchor B] belongs to [one/several] [Anchor A]."
```

| Pattern                          | Cardinality | Implementation     |
| -------------------------------- | ----------- | ------------------ |
| A has several B, B has one A     | 1:N         | FK in B table      |
| A has one B, B has one A         | 1:1         | FK in either table |
| A has several B, B has several A | N:M         | Junction table     |

**Example:**

```
User ↔ Order: "User has several Orders" + "Order belongs to one User"
→ 1:N → user_id foreign key in orders table

User ↔ Post (likes): "User likes several Posts" + "Post liked by several Users"
→ N:M → users_liked_posts junction table
```

### Step 4: Verify Completeness

Review original requirements. Every business concept should map to an Anchor, Attribute, or Link.

## Phase B: Physical Schema

### Table Names

Pluralize Anchors: User → `users`, Order → `orders`

### Column Types

| Logical          | SQL Type              | Notes                                                         |
| ---------------- | --------------------- | ------------------------------------------------------------- |
| ID               | `INTEGER`/`BIGINT`    | BIGINT for billions of rows                                   |
| String           | `VARCHAR(N)`          | Default to `''` not NULL                                      |
| Money            | `DECIMAL(M,D)`        | Never Float                                                   |
| Boolean          | `BOOLEAN`/`TINYINT`   | DB-dependent                                                  |
| Past timestamp   | `TIMESTAMP` UTC       | Server events                                                 |
| Future timestamp | Local time + timezone | User-scheduled events (see `references/timezone-handling.md`) |

### Implement Links

**1:N** — FK on the "Many" side:

```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  total DECIMAL(10,2)
);
```

**N:M** — Junction table:

```sql
CREATE TABLE users_liked_posts (
  user_id INTEGER NOT NULL REFERENCES users(id),
  post_id INTEGER NOT NULL REFERENCES posts(id),
  liked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, post_id)
);
```

**1:1** — FK with UNIQUE constraint:

```sql
CREATE TABLE profiles (
  id INTEGER PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
  bio TEXT
);
```

## Validation Checklist

**Anchors:** Pass counting/adding tests, have unique IDs, exist independently

**Attributes:** Have human-readable question, belong to one Anchor, single-valued

**Links:** Two-sentence validation done, cardinality determined, FK constraints set

**Schema:** Tables pluralized, PKs defined, types match logical model, defaults specified

## Common Mistakes

| Mistake                                         | Fix                                                     |
| ----------------------------------------------- | ------------------------------------------------------- |
| Deciding VARCHAR length during logical modeling | Stay in business terms first, choose types in Phase B   |
| Treating data as Anchor (EmailAddress entity)   | Test with counting sentence—"1,000 emails" sounds wrong |
| Using Float for money                           | Always DECIMAL for exact precision                      |
| FK on wrong side of 1:N                         | FK goes on the "Many" side                              |
| Array column for N:M                            | Create junction table instead                           |
| Storing timezone as offset ("+05:00")           | Use IANA ID ("America/New_York")                        |

## Secondary Data

Data duplicated/cached for performance (e.g., `total_posts` count on User). Not source of truth.

- Document as secondary
- Have rebuild mechanism from source
- Consider if indexing solves the problem first

## ORM/Query Builder Usage

The process is identical—complete logical model first, then translate to schema types. See `references/orm-patterns.md` for Kysely, Drizzle, and Prisma examples.

## Iteration Signs

Revisit schema if: queries need 5+ JOINs regularly, stakeholders confused by names, constant NULL checks, frequent "workaround" columns.
