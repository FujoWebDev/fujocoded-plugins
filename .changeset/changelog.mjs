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

export default {
  getReleaseLine: async (changeset, type, options) => {
    const credit = (
      await github.getReleaseLine({ ...changeset, summary: "" }, type, options)
    ).replace(/[\s-]+$/, "");

    const body = changeset.summary.trim();
    if (!body) return credit;

    return `${credit}\n\n${indent(body)}`;
  },
  getDependencyReleaseLine: github.getDependencyReleaseLine,
};
