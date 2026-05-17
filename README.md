# iobroker.mealplanner

Essensplaner-Adapter für ioBroker — Wochenplanung, Gerichtsdatenbank, Kategorien, CSV Import/Export.

---

## Webseiten

| URL | Beschreibung |
|-----|-------------|
| `http://<iobroker>:8082/mealplanner.0/plan.html` | Widget-Ansicht für Dashboard / VIS |
| `http://<iobroker>:8082/mealplanner.0/mobile.html` | Mobile-Ansicht für iPhone (Home Screen App) |

### plan.html — Widget

- Wochenplan mit KW, Datumsbereich und 7 Tagen
- Kategorie, Hauptspeise und Beilage pro Tag wählbar via Picker-Popup
- Picker flippt automatisch nach oben wenn unten kein Platz
- Kategorie **Extern** deaktiviert die Beilage-Auswahl automatisch
- Heutiger Tag wird hervorgehoben
- Schriftgrößen, Farben und Widget-Größe über Admin-Einstellungen konfigurierbar

### mobile.html — iPhone-Ansicht

- Für Touch optimiert — Bottom Sheets statt Dropdown-Menus
- Tabs für aktuelle und nächste Woche
- Gerichte und Beilagen direkt hinzufügen (Name + Kategorie)
- Kategorie **Extern** deaktiviert Beilage-Auswahl
- Home Screen fähig: Icon (Gabel + Messer, orange auf dunklem Hintergrund), Name „Essensplan"

---

## Datenspeicherung

Alle Daten werden in ioBroker-States gespeichert.

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
      "Montag":     { "hauptspeise_id": "mp8cprtq6qdu", "beilage_id": "mp8cprtqabcd", "kategorie": "Fleisch" },
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
    "days": { "...": "..." }
  }
}
```

### `mealplanner.0.info.settings` (read/write, JSON)

Enthält die Darstellungseinstellungen des Widgets:

```json
{
  "widget": { "width": 1480, "height": 650 },
  "fonts": {
    "kw_label":   { "size": 26, "color": "#FFCC99" },
    "date_range": { "size": 17, "color": "#FFCC99" },
    "col_header": { "size": 12, "color": "#FFCC99" },
    "day_name":   { "size": 17, "color": "#FF9900" },
    "day_date":   { "size": 13, "color": "#886600" },
    "category":   { "size": 17, "color": "#FF9900" },
    "dish":       { "size": 17, "color": "#FF9900" },
    "side":       { "size": 17, "color": "#FF9900" }
  },
  "picker": { "bg": "#1c1c1c", "fs": 16 }
}
```

---

## States-Übersicht

| State | Typ | Beschreibung |
|-------|-----|--------------|
| `info.database` | JSON string | Gesamte Datenbank (Gerichte, Beilagen, Kategorien) |
| `info.plan_json` | JSON string | Wochenplan (aktuelle + nächste Woche) |
| `info.settings` | JSON string | Widget-Einstellungen (Größe, Schriften, Picker) |
| `info.current_kw` | number | Aktuelle Kalenderwoche |
| `info.next_kw` | number | Nächste Kalenderwoche |
| `info.db_dishes` | number | Anzahl Gerichte in der Datenbank |
| `info.db_sides` | number | Anzahl Beilagen in der Datenbank |
| `info.last_export` | string | Zeitstempel des letzten CSV-Exports |
| `week.current.<Tag>.main` | string | Hauptspeise-ID (diese Woche) |
| `week.current.<Tag>.main_name` | string | Hauptspeise-Name |
| `week.current.<Tag>.side` | string | Beilage-ID |
| `week.current.<Tag>.side_name` | string | Beilage-Name |
| `week.current.<Tag>.category` | string | Kategorie |
| `week.current.<Tag>.type` | string | Typ (`normal` oder `extern`) |
| `week.current.<Tag>.note` | string | Notiz zum Tag |
| `week.next.<Tag>.*` | — | Gleiche Felder für nächste Woche |
| `today.main` | string | Heutige Hauptspeise-ID |
| `today.main_name` | string | Heutige Hauptspeise-Name |
| `today.side` | string | Heutige Beilage-ID |
| `today.side_name` | string | Heutige Beilage-Name |
| `today.category` | string | Heutige Kategorie |
| `today.type` | string | Heutiger Typ |
| `today.note` | string | Heutige Notiz |
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
- **Einstellungen** — Widget-Größe, Schriftgrößen & -farben, Picker-Hintergrund und Schriftgröße
- **Import/Export** — Gesamtdaten als CSV exportieren/importieren

---

## Adapter-Kommunikation (sendTo)

Der Admin und die Mobile-Ansicht kommunizieren über `sendTo`-Messages mit dem Adapter:

| Command | Payload | Beschreibung |
|---------|---------|-------------|
| `getDishes` | — | Alle Gerichte laden |
| `saveDish` | `{ name, kategorie, id? }` | Gericht speichern (neu oder update per ID) |
| `deleteDish` | `{ id }` | Gericht löschen |
| `getSides` | — | Alle Beilagen laden |
| `saveSide` | `{ name, id? }` | Beilage speichern |
| `deleteSide` | `{ id }` | Beilage löschen |
| `getCategories` | — | Kategorien laden |
| `saveCategory` | `{ name, color, oldName? }` | Kategorie speichern (Umbenennung cascadiert auf alle Gerichte) |
| `deleteCategory` | `{ name }` | Kategorie löschen |
| `sortAndSave` | — | Daten sortieren und speichern |
| `importCsv` | `{ csv }` | CSV importieren |
| `exportCsv` | — | CSV exportieren |
