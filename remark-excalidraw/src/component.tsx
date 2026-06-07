import { useEffect, useRef } from "react";

export interface ExcalidrawComponentProps {
  alt?: string;
  fileContent: string;
}

export function ExcalidrawComponent({
  alt,
  fileContent,
}: ExcalidrawComponentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

      containerRef.current.replaceChildren(svg);
    }

    void renderDrawing();

    return () => {
      isMounted = false;
    };
  }, [fileContent]);

  return (
    <div
      aria-label={alt}
      className="remark-excalidraw"
      ref={containerRef}
      role={alt ? "img" : undefined}
    />
  );
}
