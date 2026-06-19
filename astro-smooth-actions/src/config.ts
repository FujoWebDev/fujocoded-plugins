export type AstroSmoothActionsInputOptions = {
  /**
   * Optional. Action names whose submitted fields are never stored, so
   * `getActionInput()` returns `undefined` for them. When omitted, every
   * action's input is stored, although individual values may still come back
   * `null` via `excludeFields`.
   *
   * Use the action's path: "login", or "user.login" for an action nested in a
   * group. "actions.login" works too, but the leading "actions." that Astro
   * adds is optional.
   *
   * To check the correct name, comment the integration out and submit the form.
   * The browser's address bar will show the name at the end of the url, like
   * `?_action=actions.login`. (With the integration on, you can look at the
   * POST request in the Network tab instead)
   * */
  excludeActions?: string[];
  /**
   * Optional. The full list of field names whose submitted values are never
   * stored. The field still comes back from `getActionInput()` as `null`, so you
   * can still tell it apart from a field that was never submitted. When
   * omitted, the built-in `DEFAULT_EXCLUDED_FIELDS` (password, token, etc.)
   * is used.
   *
   * Setting this replaces the defaults, it does not add to them. To keep them,
   * spread `DEFAULT_EXCLUDED_FIELDS` into your array. Names are matched after
   * lowercasing and stripping punctuation, so "backupEmail" and "backup-email"
   * are the same field.
   */
  excludeFields?: string[];
};

export type AstroSmoothActionsConfig = {
  input?: AstroSmoothActionsInputOptions;
};

type NormalizedAstroSmoothActionsConfig = {
  input: {
    excludeActions: string[];
    excludeFields: string[];
  };
};

export const DEFAULT_EXCLUDED_FIELDS = [
  "password",
  "currentPassword",
  "newPassword",
  "confirmPassword",
  "passcode",
  "secret",
  "token",
  "csrfToken",
  "apiKey",
  "pin",
  "otp",
] as const;

export const normalizeConfig = (
  config: AstroSmoothActionsConfig = {},
): NormalizedAstroSmoothActionsConfig => ({
  input: {
    excludeActions: config.input?.excludeActions ?? [],
    // An explicit list replaces the defaults, so callers can drop a
    // built-in name by spreading DEFAULT_EXCLUDED_FIELDS and leaving it out.
    excludeFields: config.input?.excludeFields ?? [...DEFAULT_EXCLUDED_FIELDS],
  },
});
