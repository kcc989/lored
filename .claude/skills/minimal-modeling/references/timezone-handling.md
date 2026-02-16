# Timezone Handling in Database Design

## The Core Distinction

Timestamps have different semantic needs based on whether they represent past or future events.

### Past Events (Already Happened)

Store in UTC. The event occurred at a definite moment in time.

```sql
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- UTC
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

**Examples:** message sent times, order placed times, login events, audit logs, file uploads.

**Why UTC:** The moment already happened. UTC is unambiguous and handles DST transitions correctly.

### Future Events (User-Scheduled)

Store local time + timezone identifier. The user's intent matters more than the UTC moment.

```sql
event_time TIMESTAMP,
event_timezone VARCHAR(50)  -- e.g., "America/New_York"
```

**Examples:** calendar events, reminders, alarms, scheduled meetings, concert times.

**Why local + timezone:**

- Timezone rules change (DST adjustments, political changes)
- User intent: "9am my time" not "14:00 UTC"
- Recalculate UTC at display/notification time

## Implementation Patterns

### Pattern 1: Simple Past Event

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  content TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- Always UTC
);
```

### Pattern 2: Future Event with Timezone

```sql
CREATE TABLE calendar_events (
  id INTEGER PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  event_time TIMESTAMP NOT NULL,          -- Local time (no TZ conversion)
  event_timezone VARCHAR(50) NOT NULL,    -- IANA timezone ID
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- UTC (past event)
);
```

### Pattern 3: User Preference Timezone

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  timezone VARCHAR(50) DEFAULT 'UTC',     -- User's default timezone
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Common Mistakes

**Mistake: Storing timezone as offset**

```
❌ BAD: "+05:00" or "-08:00"
✅ GOOD: "America/New_York" or "Asia/Kolkata"
```

Offsets don't capture DST rules.

**Mistake: Converting future events to UTC at insert**

```
❌ BAD: INSERT INTO events (time) VALUES ('2025-03-15 14:00:00+00')
✅ GOOD: INSERT INTO events (time, tz) VALUES ('2025-03-15 09:00:00', 'America/New_York')
```

If DST rules change between insert and event, UTC conversion will be wrong.

**Mistake: Using server timezone for user-facing times**

```
❌ BAD: Displaying raw database timestamps
✅ GOOD: Converting to user's timezone at display time
```

## Application Layer Handling

```typescript
// Past event: store UTC, display in user's timezone
const messageTime = new Date(); // UTC
await db.insert({ sent_at: messageTime });

// Future event: store local + timezone
const eventTime = "2025-06-15T09:00:00"; // No TZ info - local time
const timezone = "America/New_York";
await db.insert({ event_time: eventTime, event_timezone: timezone });

// Display: convert using timezone
import { formatInTimeZone } from "date-fns-tz";
const displayTime = formatInTimeZone(eventTime, timezone, "PPpp");
```

## Database-Specific Notes

**PostgreSQL:** Use `TIMESTAMPTZ` for past events (auto-converts to UTC), `TIMESTAMP` for future events (no conversion).

**MySQL:** Use `TIMESTAMP` for past events (stored as UTC), `DATETIME` for future events (stored as-is).

**SQLite:** Use TEXT in ISO 8601 format with explicit handling in application code.
