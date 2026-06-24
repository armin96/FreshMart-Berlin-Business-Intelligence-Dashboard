# FreshMart Berlin — Business Intelligence Dashboard

> **M608 Business Project in Computer Science** · Gisma University of Applied Sciences
> <br><br>
SeyedArmin HosseiniLargani
> <br>
> GH1042143
> <br>
<br/>
A real-time Business Intelligence Dashboard for **FreshMart Berlin**, a fictional 10-branch grocery chain. Built with **Flask** (Python) and **Chart.js** (vanilla JS), the dashboard presents seven interactive KPI modules across sales, inventory, customer footfall, product categories, branch comparison, profitability, and waste/shrinkage.

---

##  Features

| Module | Charts |
|--------|--------|
| **Overview** | KPI summary cards, revenue line chart, category donut |
| **Sales & Revenue** | Revenue · COGS · Margin line + daily bar chart |
| **Inventory** | Stock levels by category, low-stock alert table |
| **Footfall** | Daily visitor area chart, hour × day-of-week heatmap |
| **Categories** | Revenue donut, units sold & margin bar |
| **Branch Comparison** | Multi-KPI radar (normalised), revenue ranking bar |
| **Profitability** | Stacked COGS/Margin per branch, margin % bar |
| **Waste & Shrinkage** | Daily waste trend, waste % by category, waste by branch |

All charts update in real-time when the **branch** or **period** filter changes.  
A **live ticker** polls `/api/live` every 5 seconds to simulate a real-time data feed.

---

## The 10 Berlin Branches

Mitte · Prenzlauer Berg · Kreuzberg · Charlottenburg · Friedrichshain  
Schöneberg · Neukölln · Spandau · Steglitz · Marzahn

---

## Project Structure

```
pr22/
├── app.py               # Flask backend — all REST API endpoints
├── generate_data.py     # Synthetic dataset generator
├── requirements.txt     # Python dependencies
├── data/                # Generated CSV datasets (created by generate_data.py)
│   ├── sales.csv
│   ├── inventory.csv
│   ├── footfall.csv
│   ├── employees.csv
│   └── waste.csv
├── static/
│   ├── css/style.css    # Dark-mode design system
│   └── js/
│       ├── charts.js    # Chart.js factory helpers
│       └── main.js      # Dashboard controller
└── templates/
    └── index.html       # Jinja2 SPA template
```

---

##  Setup & Run

### Prerequisites
- Python 3.9+
- pip

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Generate synthetic data (first run only)
```bash
python generate_data.py
```
This creates ~5 CSV files in `./data/` covering 2 years of daily data for all 10 branches (~3M rows total). Takes roughly 1–2 minutes.

### 3. Start the Flask server
```bash
flask run
```

Open your browser at **http://localhost:5000**

---

## 🔌 REST API Endpoints

| Endpoint | Parameters | Description |
|----------|-----------|-------------|
| `GET /` | — | Serves the dashboard HTML |
| `GET /api/summary` | `branch`, `period` | KPI summary card values |
| `GET /api/sales` | `branch`, `period`, `granularity` | Revenue / COGS / Margin time series |
| `GET /api/inventory` | `branch` | Stock levels and low-stock alerts |
| `GET /api/footfall` | `branch`, `period` | Daily visitors + heatmap data |
| `GET /api/categories` | `branch`, `period` | Revenue by product category |
| `GET /api/branches` | `period` | Branch comparison metrics (normalised) |
| `GET /api/profitability` | `period` | Revenue · COGS · Margin per branch |
| `GET /api/waste` | `branch`, `period` | Waste/shrinkage metrics |
| `GET /api/live` | — | Simulated real-time feed (polled every 5s) |

**Common parameters:**
- `branch`: `all` | branch name (e.g., `Mitte`)
- `period`: `7d` | `30d` | `90d` | `365d` | `all`
- `granularity`: `daily` | `weekly` | `monthly`

---

##  Dataset Description

All data is **synthetically generated** using `numpy` and `pandas` to simulate realistic patterns:

| File | Rows (approx.) | Description |
|------|---------------|-------------|
| `sales.csv` | ~2.6M | Daily sales per branch × product (revenue, COGS, margin) |
| `inventory.csv` | ~2.6M | Daily stock levels per branch × product |
| `footfall.csv` | ~110k | Hourly visitor counts per branch (07:00–21:00) |
| `employees.csv` | ~7.3k | Daily staffing per branch |
| `waste.csv` | ~2.6M | Daily waste value per branch × product |

**Realistic patterns include:**
- Seasonal demand (summer peak, Christmas peak)
- Weekend uplift (+25% footfall, +25% sales)
- Rush-hour footfall spikes (12:00–13:00, 17:00–19:00)
- Category-specific waste rates (Produce 12%, Dairy 6%, etc.)
- Branch performance multipliers (size/location differences)

---

##  Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3, Flask 3, pandas, numpy |
| Frontend | Vanilla HTML5/CSS3/JavaScript (ES6+) |
| Charting | Chart.js 4.4 |
| Fonts | Inter (Google Fonts) |
| Design | Custom dark-mode CSS, glassmorphism |

---

##  License

Academic project — Gisma University of Applied Sciences, 2026.
