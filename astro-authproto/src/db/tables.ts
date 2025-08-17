import { asDrizzleTable } from "@astrojs/db/utils";
import { defineDb, column, defineTable } from "astro:db";

const AtProtoChallengesTable = defineTable({
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

const AtProtoSessionsTable = defineTable({
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

export const AtProtoChallenges = asDrizzleTable(
  "AtProtoChallenges",
  AtProtoChallengesTable
);
export const AtProtoSessions = asDrizzleTable(
  "AtProtoSessions",
  AtProtoSessionsTable
);

// Export the Database Configuration for StudioCMS
export default defineDb({
  tables: {
    AtProtoChallenges: AtProtoChallengesTable,
    AtProtoSessions: AtProtoSessionsTable,
  },
});
