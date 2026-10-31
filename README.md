# Zip Drop

A ZIP code geography game. You get a random U.S. ZIP code. Drop a pin where you think it is on the map. Closer guesses score more, up to 5,000 points a round.

## Modes

- **Classic**: 10 random ZIP codes.
- **Daily**: the same 5 ZIP codes for every player that day, with a shareable emoji result.
- **Endless**: keep playing until you end the run. Your best per-round average counts once you've played at least 5 rounds.

The map is a zoomable satellite map. Switch between **Hybrid** (satellite plus roads, borders and place names), **Satellite** (imagery only, for a harder game) and **Streets**, and jump straight to the Lower 48, Alaska or Hawaii.

Options and extras: a 30-second timer per round, a "Reveal state" hint (halves that round's points), a full-map review of every guess, and best scores saved in the browser.

**Controls:** click or tap to place a pin, then press `Enter` / `Space` to guess and again to continue. Press `H` to reveal the state. Scroll or pinch to zoom, and drag to pan.

## Scoring

```
miles ≤ 5   → 5000
otherwise   → 5000 × e^(−(miles − 5) / 300)
```

Distance is the great-circle distance between your pin and the ZIP's center point.

## Run locally

The game loads its data with `fetch`, so opening `index.html` straight from disk won't work. Serve the folder instead:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Publish on GitHub Pages

1. Create a new GitHub repository and push the contents of this folder to it, with `index.html` at the repo root.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set Source to **Deploy from a branch**, choose `main` and `/ (root)`, then click **Save**.
4. After a minute the game is live at `https://<your-username>.github.io/<repo-name>/`.

Everything is static and uses relative paths, with no build step. Leaflet is bundled in `vendor/`. Map tiles load from Esri's public tile servers, which need no API key. Fonts come from Google Fonts, with a fallback to system fonts.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `style.css`, `game.js` | The game |
| `data/zips.txt` | 40,977 ZIP codes for the 50 states + DC: `zip\|city\|state\|county\|lat\|lon` |
| `data/states-10m.json` | U.S. state shapes for highlighting the answer's state (from [us-atlas](https://github.com/topojson/us-atlas)) |
| `vendor/` | [Leaflet](https://leafletjs.com) v1.9.4 and [topojson-client](https://github.com/topojson/topojson-client) v3.1.0 |

## Data credits

ZIP code locations are from [GeoNames](https://www.geonames.org/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). State boundaries are from the U.S. Census Bureau via us-atlas. Satellite imagery and the street map are © Esri and their data providers, credited on the map.
