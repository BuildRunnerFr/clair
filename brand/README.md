# La marque Clair

L'initiale du logotype en Source Serif 4 semi-grasse, et un point carré qui reprend le point
final de « clair. ». Deux états, qui ne sont pas interchangeables.

## Les deux états, et pourquoi il en faut deux

**Pleine** — `clair-marque.svg`. Fond papier, lettre agrandie jusqu'à déborder du cadre à
gauche, en haut et en bas. On lit une forme avant de lire une lettre : c'est ce recadrage qui
sépare un monogramme d'une initiale posée dans une boîte. Le fond clair est délibéré — les
icônes de finance sont des tuiles sombres saturées, et celle-ci se remarque parce que les
autres crient.

**Contenue** — `clair-marque-contenue.svg`. Lettre claire sur fond marine, entière, avec une
marge de 29 % du côté. Elle existe parce que certaines consoles de tiers exigent un fond coloré
et une marge autour du contenu : ces deux règles interdisent exactement ce qui fait le
caractère de la pleine. Plutôt que de dénaturer celle-ci, on inverse.

## Quel fichier pour quoi

| Fichier | Emplacement |
| --- | --- |
| `clair-512.png` | icône d'application, coins arrondis |
| `clair-512-carre.png` | plateformes qui appliquent leur propre masque |
| `clair-512-sombre.png` | contextes où le fond clair disparaîtrait |
| `clair-192.png` · `clair-180.png` · `clair-64.png` · `clair-32.png` | Android · iOS · onglets |
| `clair-truelayer-512.png` | consoles exigeant fond coloré + marge (TrueLayer) |

Les copies que sert l'application vivent ailleurs, là où Next les repère par convention de nom :
`app/favicon.ico`, `app/icon.png`, `app/apple-icon.png`, `public/icon-192.png`,
`public/icon-512.png`. Ce dossier-ci est la source ; ces copies-là en descendent.

## Refabriquer les images

```bash
google-chrome --headless=new --remote-debugging-port=9222 --disable-gpu about:blank &

node scripts/render-png.mjs "file://$PWD/brand/rendu-marque.html?s=512" brand/clair-512.png 512
node scripts/render-png.mjs "file://$PWD/brand/rendu-marque.html?s=512&r=0" brand/clair-512-carre.png 512
node scripts/render-png.mjs "file://$PWD/brand/rendu-marque.html?s=512&sombre=1" brand/clair-512-sombre.png 512
node scripts/render-png.mjs "file://$PWD/brand/rendu-marque-contenue.html?s=512" brand/clair-truelayer-512.png 512
node scripts/render-png.mjs "file://$PWD/scripts/og-card.html" public/og.png 1200 630
```

Le `.ico` porte trois résolutions plutôt qu'une — Windows y prend la taille qu'il veut, et un
32 px étiré en 48 est laid là où un 48 dessiné ne l'est pas :

```bash
python3 -c "from PIL import Image; Image.open('brand/clair-512.png').convert('RGBA').save('app/favicon.ico', sizes=[(16,16),(32,32),(48,48)])"
```

## Les couleurs

| | |
| --- | --- |
| Encre de la marque | `#1b3a63` — l'accent de l'application |
| Papier | `#f3f5f7` — le fond de l'application |
| Point, sur fond clair | `#4a7fc1` |
| Point, sur fond marine | `#7fa6dc` |
| Lettre, sur fond marine ou sombre | `#f3f5f7` / `#e9e7e2` |

## Une réserve, à lever avant tout dépôt de marque

Le glyphe est un élément `<text>` : il suppose Source Serif 4 disponible au rendu, et retombe
sur Georgia sinon — ce n'est pas la même lettre. Pour une impression ou un dépôt, faire
vectoriser le contour ; la licence OFL de Source Serif 4 l'autorise. Et si Clair prend, un
dessinateur de caractères retravaillera ce `c` pour qu'il soit le sien et non celui d'Adobe.
