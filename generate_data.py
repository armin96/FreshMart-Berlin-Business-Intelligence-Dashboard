"""
generate_data.py
================
Generates realistic synthetic datasets for FreshMart Berlin —
a fictional 10-branch grocery chain.

Datasets produced (in ./data/):
  - sales.csv         : daily sales per branch/category/product
  - inventory.csv     : daily stock levels per branch/product
  - footfall.csv      : hourly customer visits per branch
  - employees.csv     : daily staffing hours per branch
  - waste.csv         : daily waste/shrinkage per branch/category

Run:  python generate_data.py
"""

import os
import numpy as np
import pandas as pd
from datetime import date, timedelta

# ── Configuration ─────────────────────────────────────────────────────────────
SEED = 42
rng = np.random.default_rng(SEED)

BRANCHES = [
    "Mitte", "Prenzlauer Berg", "Kreuzberg", "Charlottenburg",
    "Friedrichshain", "Schöneberg", "Neukölln", "Spandau",
    "Steglitz", "Marzahn",
]

CATEGORIES = {
    "Produce":    ["Apples", "Bananas", "Carrots", "Tomatoes", "Lettuce", "Potatoes", "Onions", "Cucumber"],
    "Dairy":      ["Milk 1L", "Yoghurt", "Butter 250g", "Cheese Gouda", "Cream"],
    "Bakery":     ["White Bread", "Wholegrain Bread", "Croissants", "Rolls", "Cake Slice"],
    "Meat":       ["Chicken Breast", "Pork Chops", "Ground Beef", "Salami", "Ham"],
    "Beverages":  ["Mineral Water", "Orange Juice", "Cola 1.5L", "Beer 6pk", "Coffee 500g"],
    "Household":  ["Washing Powder", "Dish Soap", "Toilet Paper 8pk", "Kitchen Rolls", "Bin Bags"],
}

PRODUCTS = [
    {"product": p, "category": cat, "base_price": round(rng.uniform(0.5, 8.0), 2),
     "cost_ratio": round(rng.uniform(0.45, 0.70), 3)}
    for cat, products in CATEGORIES.items()
    for p in products
]
PRODUCT_DF = pd.DataFrame(PRODUCTS)

START_DATE = date(2023, 1, 1)
END_DATE   = date(2024, 12, 31)
DATES = pd.date_range(START_DATE, END_DATE, freq="D")

# Branch performance multipliers (simulate branch size / location popularity)
BRANCH_SCALE = {b: round(rng.uniform(0.7, 1.5), 2) for b in BRANCHES}

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

# ── Helpers ───────────────────────────────────────────────────────────────────

def seasonal_factor(dt):
    """Higher demand in summer and pre-Christmas."""
    doy = dt.day_of_year
    # Summer peak (Jun–Aug) + Christmas peak (Dec)
    summer  = 0.15 * np.sin(2 * np.pi * (doy - 90) / 365)
    xmas    = 0.20 * np.exp(-((doy - 355) ** 2) / (2 * 10**2))
    return 1.0 + summer + xmas

def weekend_factor(dt):
    return 1.25 if dt.dayofweek >= 5 else 1.0


# ── 1. Sales ──────────────────────────────────────────────────────────────────
print("Generating sales.csv …")
sales_rows = []
for dt in DATES:
    sf = seasonal_factor(dt)
    wf = weekend_factor(dt)
    for branch in BRANCHES:
        bscale = BRANCH_SCALE[branch]
        for _, prod in PRODUCT_DF.iterrows():
            base_units = rng.integers(5, 60)
            units = max(0, int(base_units * sf * wf * bscale
                               * rng.uniform(0.7, 1.3)))
            revenue = round(units * prod["base_price"], 2)
            cogs    = round(revenue * prod["cost_ratio"], 2)
            sales_rows.append({
                "date":     dt.date(),
                "branch":   branch,
                "category": prod["category"],
                "product":  prod["product"],
                "units_sold": units,
                "revenue":  revenue,
                "cogs":     cogs,
                "margin":   round(revenue - cogs, 2),
            })

sales_df = pd.DataFrame(sales_rows)
sales_df.to_csv(os.path.join(DATA_DIR, "sales.csv"), index=False)
print(f"  → {len(sales_df):,} rows written.")


# ── 2. Inventory ──────────────────────────────────────────────────────────────
print("Generating inventory.csv …")
inv_rows = []
# Starting stock level
stock = {
    (b, p): rng.integers(50, 300)
    for b in BRANCHES
    for p in PRODUCT_DF["product"]
}
REORDER_POINT = 30
MAX_STOCK = 300

# Map sales by (date, branch, product) for quick lookup
sales_lookup = (
    sales_df.groupby(["date", "branch", "product"])["units_sold"].sum().to_dict()
)

for dt in DATES:
    dt_date = dt.date()
    for branch in BRANCHES:
        for _, prod in PRODUCT_DF.iterrows():
            key = (branch, prod["product"])
            sold = sales_lookup.get((dt_date, branch, prod["product"]), 0)
            stock[key] = max(0, stock[key] - sold)
            # Reorder trigger
            if stock[key] < REORDER_POINT:
                reorder_qty = int(rng.integers(100, 200))
                stock[key] = min(stock[key] + reorder_qty, MAX_STOCK)
                reordered = True
            else:
                reordered = False
            inv_rows.append({
                "date":       dt_date,
                "branch":     branch,
                "category":   prod["category"],
                "product":    prod["product"],
                "stock_level": stock[key],
                "reordered":  reordered,
                "low_stock":  stock[key] < REORDER_POINT,
            })

inv_df = pd.DataFrame(inv_rows)
inv_df.to_csv(os.path.join(DATA_DIR, "inventory.csv"), index=False)
print(f"  → {len(inv_df):,} rows written.")


# ── 3. Footfall ───────────────────────────────────────────────────────────────
print("Generating footfall.csv …")
HOURS = list(range(7, 22))  # 07:00–21:00
footfall_rows = []
for dt in DATES:
    sf = seasonal_factor(dt)
    wf = weekend_factor(dt)
    for branch in BRANCHES:
        bscale = BRANCH_SCALE[branch]
        for hour in HOURS:
            # Rush hours: 12–13 and 17–19
            hour_factor = 1.0
            if 12 <= hour <= 13:
                hour_factor = 2.0
            elif 17 <= hour <= 19:
                hour_factor = 2.5
            elif hour < 9 or hour > 20:
                hour_factor = 0.4
            visitors = max(0, int(
                rng.integers(10, 60) * sf * wf * bscale * hour_factor
                * rng.uniform(0.8, 1.2)
            ))
            footfall_rows.append({
                "date":    dt.date(),
                "branch":  branch,
                "hour":    hour,
                "visitors": visitors,
            })

footfall_df = pd.DataFrame(footfall_rows)
footfall_df.to_csv(os.path.join(DATA_DIR, "footfall.csv"), index=False)
print(f"  → {len(footfall_df):,} rows written.")


# ── 4. Employees ──────────────────────────────────────────────────────────────
print("Generating employees.csv …")
emp_rows = []
for dt in DATES:
    for branch in BRANCHES:
        bscale = BRANCH_SCALE[branch]
        # Weekends need more staff
        base_staff = int(rng.integers(4, 10) * bscale)
        staff = base_staff + (2 if dt.dayofweek >= 5 else 0)
        emp_rows.append({
            "date":         dt.date(),
            "branch":       branch,
            "staff_count":  max(4, staff),
            "total_hours":  max(4, staff) * 8,
        })

emp_df = pd.DataFrame(emp_rows)
emp_df.to_csv(os.path.join(DATA_DIR, "employees.csv"), index=False)
print(f"  → {len(emp_df):,} rows written.")


# ── 5. Waste & Shrinkage ──────────────────────────────────────────────────────
print("Generating waste.csv …")
# Waste rates by category (% of units sold that are wasted)
WASTE_RATE = {
    "Produce": 0.12, "Dairy": 0.06, "Bakery": 0.10,
    "Meat": 0.05, "Beverages": 0.02, "Household": 0.01,
}
waste_rows = []
for _, row in sales_df.iterrows():
    rate = WASTE_RATE.get(row["category"], 0.05)
    # Add seasonal noise — more waste in summer (faster spoilage)
    dt = pd.Timestamp(row["date"])
    seasonal_noise = 1.0 + 0.15 * np.sin(2 * np.pi * (dt.day_of_year - 90) / 365)
    waste_units = max(0, int(row["units_sold"] * rate * seasonal_noise
                              * rng.uniform(0.8, 1.2)))
    waste_value = round(waste_units * PRODUCT_DF.loc[
        PRODUCT_DF["product"] == row["product"], "base_price"
    ].values[0], 2)
    waste_rows.append({
        "date":         row["date"],
        "branch":       row["branch"],
        "category":     row["category"],
        "product":      row["product"],
        "waste_units":  waste_units,
        "waste_value":  waste_value,
    })

waste_df = pd.DataFrame(waste_rows)
waste_df.to_csv(os.path.join(DATA_DIR, "waste.csv"), index=False)
print(f"  → {len(waste_df):,} rows written.")

print("\n✅ All datasets generated in ./data/")
