interface ExcalidrawElement {
  angle?: number;
  height?: number;
  isDeleted?: boolean;
  points?: [number, number][];
  width?: number;
  x?: number;
  y?: number;
}

interface Bounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

interface Point {
  x: number;
  y: number;
}

export interface SceneDimensions {
  height: number;
  width: number;
}

export interface SceneDimensionOptions {
  exportPadding?: number;
}

const DEFAULT_EXCALIDRAW_EXPORT_PADDING = 10;

function getElementBounds(element: ExcalidrawElement): Bounds | undefined {
  const x = Number(element.x);
  const y = Number(element.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;

  const pointBounds = getPointElementBounds({ element, origin: { x, y } });
  if (pointBounds) return pointBounds;

  return getRectangleElementBounds({ element, origin: { x, y } });
}

function getPointElementBounds({
  element,
  origin,
}: {
  element: ExcalidrawElement;
  origin: Point;
}): Bounds | undefined {
  const points = element.points
    ?.filter(
      (point): point is [number, number] =>
        Number.isFinite(point[0]) && Number.isFinite(point[1]),
    )
    .map(([pointX, pointY]) => ({
      x: origin.x + pointX,
      y: origin.y + pointY,
    }));

  return points?.length ? boundsFromPoints(points) : undefined;
}

function getRectangleElementBounds({
  element,
  origin,
}: {
  element: ExcalidrawElement;
  origin: Point;
}): Bounds | undefined {
  const width = Number(element.width);
  const height = Number(element.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;

  if (element.angle) {
    return boundsFromPoints(
      getRotatedCorners({
        angle: element.angle,
        height,
        origin,
        width,
      }),
    );
  }

  return {
    maxX: origin.x + width,
    maxY: origin.y + height,
    minX: origin.x,
    minY: origin.y,
  };
}

function getRotatedCorners({
  angle,
  height,
  origin,
  width,
}: {
  angle: number;
  height: number;
  origin: Point;
  width: number;
}): Point[] {
  const centerX = origin.x + width / 2;
  const centerY = origin.y + height / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return [
    origin,
    { x: origin.x + width, y: origin.y },
    { x: origin.x + width, y: origin.y + height },
    { x: origin.x, y: origin.y + height },
  ].map((corner) => {
    const dx = corner.x - centerX;
    const dy = corner.y - centerY;

    return {
      x: centerX + dx * cos - dy * sin,
      y: centerY + dx * sin + dy * cos,
    };
  });
}

function boundsFromPoints(points: Point[]): Bounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    minX: Math.min(...xs),
    minY: Math.min(...ys),
  };
}

export function getSceneDimensions(
  fileContent: string,
  {
    exportPadding = DEFAULT_EXCALIDRAW_EXPORT_PADDING,
  }: SceneDimensionOptions = {},
): SceneDimensions | undefined {
  try {
    const scene = JSON.parse(fileContent) as { elements?: ExcalidrawElement[] };
    const bounds = scene.elements
      ?.filter((element) => !element.isDeleted)
      .map(getElementBounds)
      .filter((bound): bound is Bounds => Boolean(bound));

    if (!bounds?.length) return undefined;

    const minX = Math.min(...bounds.map((bound) => bound.minX));
    const minY = Math.min(...bounds.map((bound) => bound.minY));
    const maxX = Math.max(...bounds.map((bound) => bound.maxX));
    const maxY = Math.max(...bounds.map((bound) => bound.maxY));
    const width = Math.ceil(maxX - minX + exportPadding * 2);
    const height = Math.ceil(maxY - minY + exportPadding * 2);

    return width > 0 && height > 0 ? { height, width } : undefined;
  } catch {
    return undefined;
  }
}
