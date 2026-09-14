import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) }
  },
  test: {
    environment: "node",
    // Les tests du web seulement. Le mobile a ses propres dépendances et son propre lanceur ;
    // les ramasser ici ferait échouer la suite sur un import que Node ne sait pas résoudre.
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "mobile/**"]
  }
});
