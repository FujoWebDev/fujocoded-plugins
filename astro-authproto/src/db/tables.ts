import { defineDb, column, defineTable } from "astro:db";

export const AtProtoChallengesTable = defineTable({
  columns: {
    key: column.text(),
    state: column.text(),
  },
  indexes: [
    {
      on: ["key"],
      unique: true,
    },
  ],
});

export const AtProtoSessionsTable = defineTable({
  columns: {
    did: column.text(),
    session: column.text(),
  },
  indexes: [
    {
      on: ["did"],
      unique: true,
    },
  ],
});

// Export the Database Configuration for StudioCMS
export default defineDb({
  tables: {
    AtProtoChallenges: AtProtoChallengesTable,
    AtProtoSessions: AtProtoSessionsTable,
  },
});
