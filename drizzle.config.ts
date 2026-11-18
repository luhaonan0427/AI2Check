import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: ["./db/hosted-legacy-schema.ts", "./db/campus-schema.ts"],
  dialect: "sqlite",
});
