const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

/**
 * Metro doit voir le code partagé, qui vit un cran au-dessus.
 *
 * L'application web reste à la racine du dépôt et n'a pas bougé : la déplacer dans apps/web
 * pour obtenir un monorepo canonique aurait imposé de reconfigurer Vercel, les chemins Supabase
 * et les scripts — un risque gratuit sur une application en production. Le mobile s'installe
 * donc à côté et lit `../lib`, `../types` et `../messages` directement.
 *
 * Deux réglages sont nécessaires et ni l'un ni l'autre n'est optionnel. `watchFolders` autorise
 * Metro à sortir de son dossier ; `nodeModulesPaths` lui dit où chercher les dépendances, faute
 * de quoi il remonterait jusqu'à celles du web et chargerait deux copies de React.
 */
const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [repoRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
// Sans cela, un module partagé importé depuis ../lib résoudrait ses propres dépendances contre
// celles du web — dont Next.js, que React Native ne sait pas charger.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
