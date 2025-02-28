export function ExcalidrawComponent(props: { fileContent: string }) {
  return (
    <div
      // @ts-expect-error
      ref={async (el) => {
        if (typeof document == "undefined") {
          return;
        }
        const { exportToSvg } = require("@excalidraw/excalidraw");
        const file = await exportToSvg({
          ...JSON.parse(props.fileContent),
          appState: {
            //   theme: colorMode == "dark" ? THEME.DARK : THEME.LIGHT,
            //   exportWithDarkMode: colorMode == "dark",
            //   exportBackground: false,
          },
          type: "png",
        });
        el?.appendChild(file);
        return;
      }}
    >
      "Hello from the!"
    </div>
  );
}
