# Freight Intelligence & Vessel Chartering Platform

Freight Intelligence is a decision-support platform designed to help users make smarter
Freight booking and vessel selection decisions using market forecasting, cost analysis, port 
compatability, and risk assessment. No backend required — all engines (forecast,
vessel compatibility, port compatibility, risk, idle-time, chartering
decision) run client-side on seeded demo data.

## Overview

Freight Intelligence brings multiple freight-planning factors into a single workflow

The platform analysis:
    -Historical freight and market trends
    -Future freight rate forecasts
    -Vessel Capacity and utilization 
    -Port compatabiity
    -Transit and port time
    -Estimated freight costs
    -Operational and market risks
    -Booking timing

Based on these factors , the platform provides on actionable recommendation such as **BOOK NOW**,**BOOK WITHIN WINDOW**, or **WAIT**.

## Key Features 

### FREIGHT MARKET ANALYSIS 
View historical freight and market trends through interactive charts

### FREIGHT FORECASTING
Generate short-term freight-rate forecasts with confidence ranges to support booking decisions

### VESSEL SELECTION
Compare available vessel options based on :

  -Capacity
  -Utilization
  -Port Compatability
  -Transmit time
  -Port time
  -Estimated cost
  -Cost per tonne
  
### PORT COMPATABILTY 
Evaluate whether a vessel is suitable for the selected port and identify compatability considerations

### RISK ASSESSMENT
Analyze operational and market factors and generate an overall risk assessments.

### COST OPTIMIZATION
Compare vessel alternatives and identify cost-effecient options based on estimated total freight costs.

### BOOKING DECISION
Combine forecasting , vessel analysis, cost, and risk factors into a recommended booking action 

### WHAT-IF ANALYSIS
Explore how changes to planning scenarios can affect freight decisions.

## Technology Stack

   -React
   -Vite
   -JavaScript
   -TailWind CSS
   -Recharts
   -Lucide React
  

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
freight-intelligence/
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

## Future Enhancements

  *Integration wth live freight-market data
  *Live vessel availability
  *Real-Time port information
  *Backend forecasting services
  *Production-grade machine-Learning pipelines
  *User authentication and saved scenarios 
  *Automated alerts for freight-rate changes
  *Cloud deployment and scalable data infrastructure


## Notes
All freight rates, BDI values, port specifications and vessel data shown
are prototype/demo data, clearly labeled in the UI, for hackathon
demonstration purposes.
