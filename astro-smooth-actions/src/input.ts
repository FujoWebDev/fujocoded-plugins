import { astroSmoothActionsConfig } from "fujocoded:astro-smooth-actions/config";
import { ACTION_INPUT_CONTROL, ACTION_INPUT_NONE } from "./controls.js";

export type ActionInput = Record<string, string | string[] | null>;

const normalizeFieldName = (fieldName: string) =>
  fieldName.toLowerCase().replace(/[^a-z0-9]/g, "");

const isExcludedFieldName = (fieldName: string) => {
  const normalized = normalizeFieldName(fieldName);
  const excludedFields: string[] = astroSmoothActionsConfig.input.excludeFields;
  return excludedFields.some(
    (excludedField) => normalized === normalizeFieldName(excludedField),
  );
};

const readInputControlValues = (formData: FormData) =>
  formData
    .getAll(ACTION_INPUT_CONTROL)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

const parseOmittedFields = (controlValues: string[]) => {
  const omittedFields = new Set<string>();

  controlValues.forEach((value) => {
    if (value.toLowerCase() === ACTION_INPUT_NONE) return;
    value
      .split(",")
      .map((fieldName) => fieldName.trim())
      .filter(Boolean)
      .forEach((fieldName) => omittedFields.add(fieldName));
  });

  return omittedFields;
};

const shouldHideFieldValue = ({
  fieldName,
  omittedFields,
}: {
  fieldName: string;
  omittedFields: Set<string>;
}) => omittedFields.has(fieldName) || isExcludedFieldName(fieldName);

const isInputStorageEnabledForForm = (controlValues: string[]) =>
  !controlValues.some((value) => value.toLowerCase() === ACTION_INPUT_NONE);

// Astro namespaces every action under `actions`, so `action.name` arrives as
// "actions.login". We strip that prefix on both sides so callers can configure
// the bare name ("login") without knowing Astro's internal naming.
const stripActionPrefix = (name: string) => name.replace(/^actions\./, "");

export const isInputStorageEnabledForAction = (actionName: string) =>
  !astroSmoothActionsConfig.input.excludeActions
    .map(stripActionPrefix)
    .includes(stripActionPrefix(actionName));

export const readPersistableActionInput = async (
  request: Request,
): Promise<ActionInput | undefined> => {
  try {
    const formData = await request.clone().formData();
    const inputControlValues = readInputControlValues(formData);
    if (!isInputStorageEnabledForForm(inputControlValues)) {
      return undefined;
    }

    const omittedFields = parseOmittedFields(inputControlValues);
    const input: ActionInput = {};

    formData.forEach((value, key) => {
      if (key === ACTION_INPUT_CONTROL) {
        return;
      }

      if (shouldHideFieldValue({ fieldName: key, omittedFields })) {
        input[key] = null;
        return;
      }

      const currentValue = input[key];

      // Files cannot be restored from a session store, so record the field as
      // present only when no string value for the same name has been kept.
      if (typeof value !== "string") {
        if (currentValue === undefined) {
          input[key] = null;
        }
        return;
      }

      if (currentValue === undefined || currentValue === null) {
        input[key] = value;
        return;
      }

      // A repeated field name (checkbox groups, multi-selects) becomes an array
      // on its second value, so submission order is preserved.
      input[key] = Array.isArray(currentValue)
        ? [...currentValue, value]
        : [currentValue, value];
    });

    if (Object.keys(input).length === 0) {
      return undefined;
    }

    return input;
  } catch {
    return undefined;
  }
};
