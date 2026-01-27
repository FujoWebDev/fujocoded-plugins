
import type { LoaderContext } from "astro/loaders";

const PROGRESS_INTERVAL_MS = 15 * 1000; // 15 seconds

const PREFIX_ANSI_COLORS = {
  works: "\x1b[36m", // Cyan
  series: "\x1b[35m", // Magenta
  reset: "\x1b[0m", // Resets the terminal color to the original
};

/**
 * Get the name (with colors!) of the type of content we're loading so that it's
 * easier to distinguish the load state of our content.
 */
const getPrefix = (type: "works" | "series") => {
  const color = PREFIX_ANSI_COLORS[type];
  return `${color}[${type}]${PREFIX_ANSI_COLORS.reset}`;
};

/**
 * Logs download progress for "itemsType" to the command line, using
 * the appropriate prefix.
 */
export const getProgressTracker = ({
  logger,
  total,
  itemsType,
}: {
  logger: LoaderContext["logger"];
  total: number;
  itemsType: "works" | "series";
}) => {
  let successCount = 0;
  // TODO: add details of failed items
  let failCount = 0;
  let timeout: NodeJS.Timeout | undefined;
  const prefix = getPrefix(itemsType);

  const log = () => {
    const completed = successCount + failCount;
    logger.info(
      `${prefix} ${completed}/${total} ${itemsType} loaded ${
        failCount > 0 ? `(${failCount} failed)` : ""
      }`,
    );

    clearTimeout(timeout);
    if (completed < total) {
      timeout = setTimeout(log, PROGRESS_INTERVAL_MS);
    }
  };

  return {
    start: () => {
      logger.info(`${prefix} Loading ${total} ${itemsType}...`);
      timeout = setTimeout(log, PROGRESS_INTERVAL_MS);
    },
    incrementSuccess: () => {
      successCount++;
      log();
    },
    incrementFail: (id: string, error: unknown) => {
      failCount++;
      log();
      logger.error(
        `${prefix} Failed to fetch ${itemsType.slice(0, -1)} ${id}: ${error}`,
      );
    },
    finish: () => {
      clearTimeout(timeout);
      logger.info(
        `${prefix} Loaded ${successCount} of ${total} ${itemsType} (${failCount} failed)`,
      );
    },
  };
};
