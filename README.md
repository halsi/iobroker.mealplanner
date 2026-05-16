# iobroker.mealplanner

Essensplaner-Adapter für ioBroker — Wochenplanung für zwei Personen, Gerichtsdatenbank, Kategorien, CSV Import/Export.

---

## Datenspeicherung

Alle Daten werden in zwei ioBroker-States gespeichert:

### `mealplanner.0.info.database` (read/write, JSON)

Enthält die gesamte Datenbank:

```json
{
  "dishes": [
    { "id": "mp8cprtq6qdu", "name": "Spaghetti Carbonara", "kategorie": "Fleisch", "tags": [] }
  ],
  "sides": [
    { "id": "mp8cprtqabcd", "name": "Salat", "tags": [] }
  ],
  "categories": [
    { "name": "Vegetarisch", "color": "#43a047" },
    { "name": "Fisch",       "color": "#0288d1" },
    { "name": "Fleisch",     "color": "#e53935" },
    { "name": "Extern",      "color": "#f9a825" }
  ]
}
```

### `mealplanner.0.info.plan_json` (read/write, JSON)

Enthält den aktuellen Wochenplan:

```json
{
  "current": {
    "kw": 20,
    "days": {
      "Montag":     { "hauptspeise_id": "mp8cprtq6qdu", "beilage_id": "mp8cprtqabcd" },
      "Dienstag":   { "hauptspeise_id": "", "beilage_id": "" },
      "Mittwoch":   { "hauptspeise_id": "", "beilage_id": "" },
      "Donnerstag": { "hauptspeise_id": "", "beilage_id": "" },
      "Freitag":    { "hauptspeise_id": "", "beilage_id": "" },
      "Samstag":    { "hauptspeise_id": "", "beilage_id": "" },
      "Sonntag":    { "hauptspeise_id": "", "beilage_id": "" }
    }
  },
  "next": {
    "kw": 21,
    "days": { "..." : "..." }
  }
}
```

---

## States-Übersicht

| State | Typ | Beschreibung |
|-------|-----|--------------|
| `info.database` | JSON string | Gesamte Datenbank (Gerichte, Beilagen, Kategorien) |
| `info.plan_json` | JSON string | Wochenplan (aktuelle + nächste Woche) |
| `week.current.<Tag>.main` | string | Hauptspeise-ID (diese Woche) |
| `week.current.<Tag>.main_name` | string | Hauptspeise-Name |
| `week.current.<Tag>.side` | string | Beilage-ID |
| `week.current.<Tag>.side_name` | string | Beilage-Name |
| `week.current.<Tag>.category` | string | Kategorie |
| `week.next.<Tag>.*` | — | Gleiche Felder für nächste Woche |
| `today.main` / `today.main_name` | string | Heutiges Gericht |
| `today.side` / `today.side_name` | string | Heutige Beilage |
| `today.category` | string | Heutige Kategorie |
| `info.current_kw` | number | Aktuelle Kalenderwoche |
| `info.next_kw` | number | Nächste Kalenderwoche |
| `info.db_dishes` | number | Anzahl Gerichte |
| `info.db_sides` | number | Anzahl Beilagen |
| `cmd.suggest` | button | Zufallsvorschlag für heute auslösen |
| `cmd.export` | button | CSV Export auslösen |
| `cmd.import` | string | CSV Daten importieren |

---

## Admin-UI

Erreichbar über den ioBroker Admin unter dem Mealplanner-Adapter.

Tabs:
- **Gerichte** — Gerichte anlegen, bearbeiten, löschen, CSV Import/Export
- **Beilagen** — Beilagen verwalten
- **Kategorien** — Kategorien mit Farbe anlegen und verwalten
- **Import/Export** — Gesamtdaten als CSV exportieren/importieren

---

## Adapter-Kommunikation (sendTo)

Der Admin kommuniziert über `sendTo`-Messages mit dem Adapter:

| Command | Beschreibung |
|---------|--------------|
| `getDishes` | Alle Gerichte laden |
| `saveDish` | Gericht speichern (neu oder update per ID) |
| `deleteDish` | Gericht löschen |
| `getSides` | Alle Beilagen laden |
| `saveSide` | Beilage speichern |
| `deleteSide` | Beilage löschen |
| `getCategories` | Kategorien laden |
| `saveCategory` | Kategorie speichern (Umbenennung cascadiert auf alle Gerichte) |
| `deleteCategory` | Kategorie löschen |
| `importCsv` | CSV importieren |
| `exportCsv` | CSV exportieren |
