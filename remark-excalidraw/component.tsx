export function ExcalidrawComponent(props: { fileContent: string }) {
  return (
    <div
      className="remark-excalidraw"
      // @ts-expect-error
      ref={async (el) => {
        if (typeof document == "undefined") {
          return;
        }
        const { exportToSvg, THEME } = await import("@excalidraw/excalidraw");
        const file = await exportToSvg({
          ...JSON.parse(props.fileContent),
          appState: {
            theme: THEME.DARK,
            exportBackground: false,
          },
          type: "png",
        });
        el?.appendChild(file);
        return;
      }}
    ></div>
  );
}
