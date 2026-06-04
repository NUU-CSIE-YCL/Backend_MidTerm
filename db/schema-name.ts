const REQUIRED_SCHEMA_NAME = "bf_v10";

function resolveAppSchemaName() {
  const schemaName = process.env.PG_SCHEMA?.trim() || REQUIRED_SCHEMA_NAME;

  if (schemaName !== REQUIRED_SCHEMA_NAME) {
    throw new Error(
      `This V10.1 build must use PG_SCHEMA=${REQUIRED_SCHEMA_NAME}. ` +
        `Current PG_SCHEMA=${schemaName}. ` +
        "Update the Render environment variables and run the V10 migration before starting the app.",
    );
  }

  return schemaName;
}

export const APP_SCHEMA_NAME = resolveAppSchemaName();
