# ORM and Query Builder Patterns

When using query builders like Kysely or ORMs, the Minimal Modeling process remains the same:

1. **Logical Model first** (Anchors, Attributes, Links)
2. **Define schema types** instead of raw SQL
3. **Generate migrations** from type definitions

## Kysely Example

```typescript
// After logical modeling, translate to Kysely schema:

interface Database {
  users: UserTable; // Anchor: User
  orders: OrderTable; // Anchor: Order
  users_liked_posts: UserLikedPostTable; // Junction table for N:M
}

// Anchor: User
interface UserTable {
  id: Generated<number>;
  email: string; // Attribute
  created_at: Generated<Timestamp>;
}

// Anchor: Order
interface OrderTable {
  id: Generated<number>;
  user_id: number; // Link (1:N) - FK to users
  total: string; // Decimal as string for precision
  created_at: Generated<Timestamp>;
}

// Junction table for N:M relationship
interface UserLikedPostTable {
  user_id: number;
  post_id: number;
  liked_at: Generated<Timestamp>;
}

const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

// Query following 1:N relationship
const userOrders = await db
  .selectFrom("orders")
  .where("user_id", "=", userId)
  .selectAll()
  .execute();

// Query following N:M relationship
const likedPosts = await db
  .selectFrom("users_liked_posts")
  .innerJoin("posts", "posts.id", "users_liked_posts.post_id")
  .where("users_liked_posts.user_id", "=", userId)
  .selectAll("posts")
  .execute();
```

## Drizzle Example

```typescript
import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

// Anchor: User
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Anchor: Order (1:N with User)
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  total: text("total").notNull(), // Decimal as string
  createdAt: timestamp("created_at").defaultNow(),
});

// Junction table for N:M
export const usersLikedPosts = pgTable(
  "users_liked_posts",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id),
    likedAt: timestamp("liked_at").defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.postId] }),
  }),
);
```

## Prisma Example

```prisma
// Anchor: User
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  createdAt DateTime @default(now()) @map("created_at")

  orders    Order[]           // 1:N relationship
  likedPosts UserLikedPost[]  // N:M through junction

  @@map("users")
}

// Anchor: Order
model Order {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  total     Decimal  @db.Decimal(10, 2)
  createdAt DateTime @default(now()) @map("created_at")

  user      User     @relation(fields: [userId], references: [id])

  @@map("orders")
}

// Junction table for N:M
model UserLikedPost {
  userId  Int      @map("user_id")
  postId  Int      @map("post_id")
  likedAt DateTime @default(now()) @map("liked_at")

  user    User     @relation(fields: [userId], references: [id])
  post    Post     @relation(fields: [postId], references: [id])

  @@id([userId, postId])
  @@map("users_liked_posts")
}
```

## Key Principles

- **Complete logical model before writing any ORM code**
- **Type definitions mirror Anchors** - each table interface/model represents an Anchor
- **Foreign keys implement Links** - reference fields follow the cardinality rules
- **Junction tables for N:M** - even ORMs with implicit many-to-many benefit from explicit junction tables for additional attributes (like `liked_at`)
