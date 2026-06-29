// Wraps @changesets/changelog-github. Upstream renders a changeset as one
// bullet whose first line is `Thanks @user! - <first line of body>`, which
// means a body starting with `### Heading` ends up as a heading mid-bullet
// and renders broken. This wrapper splits the credit and the body onto
// separate lines so markdown headings inside the body render correctly.

import * as upstream from "@changesets/changelog-github";

const github = upstream.default ?? upstream;

const indent = (text) =>
  text
    .split("\n")
    .map((line) => (line.length ? `  ${line}` : ""))
    .join("\n");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getReleaseCredit = async (changeset, type, options) => {
  const maxAttempts = 3;
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return (
        await github.getReleaseLine(
          { ...changeset, summary: "" },
          type,
          options,
        )
      ).replace(/[\s-]+$/, "");
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts - 1) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  throw lastError;
};

const fallbackReleaseLine = (summary) => {
  const body = summary.trim();

  if (!body) {
    return "- Release update.";
  }

  const [firstLine, ...rest] = body.split("\n");
  const extra = rest.length ? `\n${indent(rest.join("\n"))}` : "";

  return `- ${firstLine}${extra}`;
};

export default {
  getReleaseLine: async (changeset, type, options) => {
    const body = changeset.summary.trim();
    let credit;

    try {
      credit = await getReleaseCredit(changeset, type, options);
    } catch (error) {
      const cause = error?.message ? ` (${error.message})` : "";
      console.error(
        `Warning: could not fetch changelog metadata for ${changeset.id ?? "unknown changeset"}${cause}. Falling back to local summary.`,
      );
      return fallbackReleaseLine(body);
    }

    if (!body) return credit;

    return `${credit}\n\n${indent(body)}`;
  },
  getDependencyReleaseLine: github.getDependencyReleaseLine,
};
