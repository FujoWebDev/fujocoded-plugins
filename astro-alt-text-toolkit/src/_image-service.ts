/**
 * DO NOT USE
 *
 * This was a valiant attempt on the path of trying to get this to work,
 * and it remains here for preservation. It was *almost* working, and it
 * might be worth exploring again in the future if we don't want to
 * make people to import a component for this.
 */
import type { AstroConfig, LocalImageService } from "astro";
import { isESMImportedImage, isRemoteAllowed } from "astro/assets/utils";
import path from "node:path";

const imageService: LocalImageService<AstroConfig["image"]> = {
  getURL(options, imageConfig) {
    console.log(options);
    const searchParams = new URLSearchParams();

    if (isESMImportedImage(options.src)) {
      searchParams.append("href", options.src.src);
    } else if (isRemoteAllowed(options.src, imageConfig)) {
      searchParams.append("href", options.src);
    } else {
      // If it's not an imported image, nor is it allowed using the current domains or remote patterns, we'll just return the original URL
      return options.src;
    }

    const params: Record<string, keyof typeof options> = {
      w: "width",
      h: "height",
      q: "quality",
      f: "format",
      fit: "fit",
      position: "position",
    };

    Object.entries(params).forEach(([param, key]) => {
      options[key] && searchParams.append(param, options[key].toString());
    });

    const imageEndpoint = path.join(
      import.meta.env.BASE_URL,
      imageConfig.endpoint.route
    );
    return `${imageEndpoint}?${searchParams}`;
  },
  parseURL(url) {
    const params = url.searchParams;

    if (!params.has("href")) {
      return undefined;
    }

    const transform = {
      src: params.get("href")!,
      width: params.has("w") ? parseInt(params.get("w")!) : undefined,
      height: params.has("h") ? parseInt(params.get("h")!) : undefined,
      format: params.get("f"),
      quality: params.get("q"),
      fit: params.get("fit"),
      position: params.get("position") ?? undefined,
    };

    return transform;
  },
  async transform(inputBuffer, options) {
    return {
      data: inputBuffer,
      format: options.format,
    };
  },
  getHTMLAttributes(options, imageConfig) {
    console.log(options);
    console.log(imageConfig);

    return {
      alt: "this is an alt",
    };
  },
};

// export const GET: APIRoute = async ({ request }) => {
//   const imageService = await getConfiguredImageService();

//   const imageTransform = imageService.parseURL(
//     new URL(request.url),
//     imageConfig
//   );
//   // ... fetch the image from imageTransform.src and store it in inputBuffer
//   const { data, format } = await imageService.transform(
//     inputBuffer,
//     imageTransform,
//     imageConfig
//   );
//   return new Response(data, {
//     status: 200,
//     headers: {
//       "Content-Type": mime.getType(format) || "",
//     },
//   });
// };

export default imageService;
