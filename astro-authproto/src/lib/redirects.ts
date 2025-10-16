import {
  LOGGED_IN_HANDLE_TEMPLATE,
  REDIRECT_TO_REFERER_TEMPLATE,
  LOGGED_IN_DID_TEMPLATE,
} from "../index.js";
import { didToHandle } from "./auth.js";

const substituteRefererTemplate = (
  redirectToBase: string,
  referer: string
): string => {
  const [basePath, baseParams] = redirectToBase.split("?");
  const [refererBasePath, refererParams] = referer.split("?");

  // Replace the referer template with the actual referer in the base path
  // of the redirectToBase
  const processedBasePath = basePath.includes(REDIRECT_TO_REFERER_TEMPLATE)
    ? basePath.replaceAll(REDIRECT_TO_REFERER_TEMPLATE, refererBasePath)
    : basePath;

  const finalParams = new URLSearchParams(refererParams);

  if (baseParams) {
    const baseSearchParams = new URLSearchParams(baseParams);
    // Replace the referer template with the actual referer in the search params
    // of the given redirectToBase
    for (const [key, value] of baseSearchParams.entries()) {
      const processedValue = value.includes(REDIRECT_TO_REFERER_TEMPLATE)
        ? value.replaceAll(
            REDIRECT_TO_REFERER_TEMPLATE,
            encodeURIComponent(referer)
          )
        : value;
      finalParams.set(key, processedValue);
    }
  }

  // If there are any search params, return the base path with the search params
  // otherwise just return the base path
  return finalParams.size > 0
    ? `${processedBasePath}?${finalParams.toString()}`
    : processedBasePath;
};

const substituteUserTemplates = async (
  url: string,
  did: string
): Promise<string> => {
  let result = url;

  if (result.includes(LOGGED_IN_DID_TEMPLATE)) {
    result = result.replaceAll(LOGGED_IN_DID_TEMPLATE, did);
  }

  if (result.includes(LOGGED_IN_HANDLE_TEMPLATE)) {
    const handle = await didToHandle(did);
    result = result.replaceAll(LOGGED_IN_HANDLE_TEMPLATE, handle);
  }

  return result;
};

/**
 * Replace all the template variables in the redirect URL with the actual values.
 */
export const getRedirectUrl = async ({
  redirectToBase,
  did,
  referer,
}: {
  redirectToBase: string;
  did: string;
  referer: string;
}) => {
  let redirectTo = redirectToBase;

  if (referer && redirectTo.includes(REDIRECT_TO_REFERER_TEMPLATE)) {
    redirectTo = substituteRefererTemplate(redirectTo, referer);
  }

  redirectTo = await substituteUserTemplates(redirectTo, did);

  return redirectTo;
};
