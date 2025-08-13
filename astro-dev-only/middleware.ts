import { MiddlewareHandler, APIContext } from "astro-types-v5";
import { excludedPatterns } from "fujocoded:dev-only-routes";

const matchesPattern = (route: APIContext, pattern: Pattern) => {
  if (typeof pattern === "string") {
    return route.routePattern === pattern;
  }
  return pattern.test(route.routePattern);
};

// This middleware runs on every request, and if the route in context matches
// one of the "forbidden patterns", it will then redirect to 404.
export const onRequest: MiddlewareHandler = async (context, next) => {
  if (context.isPrerendered) {
    // Route is pre-rendered, we've already done what we need to do
    next();
  }
  if (excludedPatterns.some((pattern) => matchesPattern(context, pattern))) {
    return new Response(null, { status: 404 });
  }

  return next();
};
