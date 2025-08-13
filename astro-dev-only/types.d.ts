declare module "fujocoded:dev-only-routes" {
  export const excludedPatterns: (string | RegExp)[];
}

type Pattern = string | RegExp;
