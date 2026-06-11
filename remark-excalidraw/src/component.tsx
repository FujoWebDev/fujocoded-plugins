import { useEffect, useRef } from "react";

export interface ExcalidrawComponentProps {
  alt?: string;
  fileContent: string;
  height?: number | string;
  width?: number | string;
}

function toPositiveNumber(value: number | string | undefined) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0
    ? numberValue
    : undefined;
}

export function ExcalidrawComponent({
  alt,
  fileContent,
  height,
  width,
}: ExcalidrawComponentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dimensions = {
    height: toPositiveNumber(height),
    width: toPositiveNumber(width),
  };

  useEffect(() => {
    let isMounted = true;

    async function renderDrawing() {
      const { exportToSvg, THEME } = await import("@excalidraw/excalidraw");
      const svg = await exportToSvg({
        ...JSON.parse(fileContent),
        appState: {
          theme: THEME.DARK,
          exportBackground: false,
        },
        type: "png",
      });

      if (!isMounted || !containerRef.current) return;

      svg.setAttribute("role", "img");
      if (alt) {
        svg.setAttribute("aria-label", alt);
      }
      if (dimensions.width) {
        svg.setAttribute("width", String(Math.round(dimensions.width)));
      }
      if (dimensions.height) {
        svg.setAttribute("height", String(Math.round(dimensions.height)));
      }

      containerRef.current.replaceChildren(svg);
    }

    void renderDrawing();

    return () => {
      isMounted = false;
    };
  }, [alt, dimensions.height, dimensions.width, fileContent]);

  const aspectRatio =
    dimensions.width && dimensions.height
      ? `${dimensions.width} / ${dimensions.height}`
      : undefined;

  return (
    <div
      aria-label={alt}
      className="remark-excalidraw"
      ref={containerRef}
      role={alt ? "img" : undefined}
      style={aspectRatio ? { aspectRatio } : undefined}
    />
  );
}
