# Freight Intelligence & Vessel Chartering Platform (SIH26006 Demo)

Self-contained React demo of the freight forecasting and vessel-chartering
decision-support workflow. No backend required — all engines (forecast,
vessel compatibility, port compatibility, risk, idle-time, chartering
decision) run client-side on seeded demo data.

## Requirements
- Node.js 18+
- npm

## Setup

```bash
npm install
npm run dev
```

Open the printed local URL (usually http://localhost:5173).

## Build for production

```bash
npm run build
npm run preview
```

## Project structure

```
freight-demo/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .gitignore
├── README.md
└── src/
    ├── main.jsx      # React entry point
    ├── index.css     # Tailwind directives
    └── App.jsx       # Full platform: data, engines, UI
```

## Notes
All freight rates, BDI values, port specifications and vessel data shown
are prototype/demo data, clearly labeled in the UI, for hackathon
demonstration purposes.
