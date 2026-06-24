"""
app.py
======
Flask backend for the FreshMart Berlin BI Dashboard.
All API endpoints return JSON consumed by the frontend.

Run:
    pip install -r requirements.txt
    python generate_data.py   # (first time only)
    flask run
"""

import os
import json
import random
from datetime import date, timedelta, datetime

import numpy as np
import pandas as pd
from flask import Flask, jsonify, render_template, request

# ── App setup ─────────────────────────────────────────────────────────────────
app = Flask(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# ── Load datasets once at startup ─────────────────────────────────────────────
def load_data():
    dfs = {}
    for name in ["sales", "inventory", "footfall", "employees", "waste"]:
        path = os.path.join(DATA_DIR, f"{name}.csv")
        if os.path.exists(path):
            df = pd.read_csv(path, parse_dates=["date"])
            dfs[name] = df
        else:
            dfs[name] = pd.DataFrame()
    return dfs

DATA = load_data()

BRANCHES = [
    "Mitte", "Prenzlauer Berg", "Kreuzberg", "Charlottenburg",
    "Friedrichshain", "Schöneberg", "Neukölln", "Spandau",
    "Steglitz", "Marzahn",
]

CATEGORIES = ["Produce", "Dairy", "Bakery", "Meat", "Beverages", "Household"]

# ── Helpers ───────────────────────────────────────────────────────────────────

def _date_range(period: str):
    """Convert period string ('7d','30d','90d','365d','all') to (start, end)."""
    end = DATA["sales"]["date"].max().date() if not DATA["sales"].empty else date.today()
    if period == "7d":
        start = end - timedelta(days=6)
    elif period == "30d":
        start = end - timedelta(days=29)
    elif period == "90d":
        start = end - timedelta(days=89)
    elif period == "365d":
        start = end - timedelta(days=364)
    else:  # all
        start = DATA["sales"]["date"].min().date() if not DATA["sales"].empty else end - timedelta(days=365)
    return pd.Timestamp(start), pd.Timestamp(end)


def _filter(df: pd.DataFrame, branch: str, period: str) -> pd.DataFrame:
    start, end = _date_range(period)
    mask = (df["date"] >= start) & (df["date"] <= end)
    if branch != "all" and "branch" in df.columns:
        mask &= df["branch"] == branch
    return df[mask]


def _safe_json(val):
    """Convert numpy types to Python natives for JSON serialisation."""
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    return val


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html", branches=BRANCHES)


# ── KPI Summary Cards ─────────────────────────────────────────────────────────
@app.route("/api/summary")
def summary():
    branch = request.args.get("branch", "all")
    period = request.args.get("period", "30d")

    s = _filter(DATA["sales"], branch, period)
    f = _filter(DATA["footfall"], branch, period)
    w = _filter(DATA["waste"], branch, period)

    total_revenue   = round(float(s["revenue"].sum()), 2)
    total_margin    = round(float(s["margin"].sum()), 2)
    margin_pct      = round(total_margin / total_revenue * 100, 1) if total_revenue else 0
    total_footfall  = int(f["visitors"].sum())
    total_waste_val = round(float(w["waste_value"].sum()), 2)
    waste_pct       = round(total_waste_val / total_revenue * 100, 2) if total_revenue else 0
    units_sold      = int(s["units_sold"].sum())

    # Revenue trend vs previous equal period
    start, end = _date_range(period)
    delta = end - start
    prev_start = start - delta - timedelta(days=1)
    prev_end   = start - timedelta(days=1)
    prev_mask  = (DATA["sales"]["date"] >= prev_start) & (DATA["sales"]["date"] <= prev_end)
    if branch != "all":
        prev_mask &= DATA["sales"]["branch"] == branch
    prev_revenue = float(DATA["sales"][prev_mask]["revenue"].sum())
    revenue_change = round(
        (total_revenue - prev_revenue) / prev_revenue * 100, 1
    ) if prev_revenue else 0

    return jsonify({
        "total_revenue":   total_revenue,
        "revenue_change":  revenue_change,
        "margin_pct":      margin_pct,
        "total_footfall":  total_footfall,
        "units_sold":      units_sold,
        "waste_pct":       waste_pct,
        "total_waste_val": total_waste_val,
    })


# ── Sales & Revenue ───────────────────────────────────────────────────────────
@app.route("/api/sales")
def sales():
    branch = request.args.get("branch", "all")
    period = request.args.get("period", "30d")
    granularity = request.args.get("granularity", "daily")  # daily | weekly | monthly

    s = _filter(DATA["sales"], branch, period)
    if s.empty:
        return jsonify({"labels": [], "revenue": [], "cogs": [], "margin": []})

    s = s.copy()
    if granularity == "weekly":
        s["group"] = s["date"].dt.to_period("W").apply(lambda p: str(p.start_time.date()))
    elif granularity == "monthly":
        s["group"] = s["date"].dt.to_period("M").apply(lambda p: str(p.start_time.date()))
    else:
        s["group"] = s["date"].dt.date.astype(str)

    agg = s.groupby("group").agg(
        revenue=("revenue", "sum"),
        cogs=("cogs", "sum"),
        margin=("margin", "sum"),
    ).reset_index().sort_values("group")

    return jsonify({
        "labels":  agg["group"].tolist(),
        "revenue": [round(v, 2) for v in agg["revenue"]],
        "cogs":    [round(v, 2) for v in agg["cogs"]],
        "margin":  [round(v, 2) for v in agg["margin"]],
    })


# ── Inventory & Stock Alerts ──────────────────────────────────────────────────
@app.route("/api/inventory")
def inventory():
    branch = request.args.get("branch", "all")

    inv = DATA["inventory"]
    latest_date = inv["date"].max()
    snap = inv[inv["date"] == latest_date]
    if branch != "all":
        snap = snap[snap["branch"] == branch]

    # Low-stock items
    low = snap[snap["low_stock"] == True].groupby(["branch", "category", "product"]).agg(
        stock_level=("stock_level", "mean")
    ).reset_index().sort_values("stock_level")

    # Average stock by category
    cat_avg = snap.groupby("category")["stock_level"].mean().round(1).to_dict()

    return jsonify({
        "low_stock_items": low.head(20).to_dict(orient="records"),
        "category_avg":    cat_avg,
        "snapshot_date":   str(latest_date.date()),
        "total_low_stock": int((snap["low_stock"] == True).sum()),
    })


# ── Footfall ──────────────────────────────────────────────────────────────────
@app.route("/api/footfall")
def footfall():
    branch = request.args.get("branch", "all")
    period = request.args.get("period", "30d")

    f = _filter(DATA["footfall"], branch, period)

    # Daily totals for area chart
    daily = f.groupby(f["date"].dt.date.astype(str))["visitors"].sum().reset_index()
    daily.columns = ["date", "visitors"]
    daily = daily.sort_values("date")

    # Hourly average heatmap data (hour vs day-of-week)
    f2 = f.copy()
    f2["dow"] = f2["date"].dt.dayofweek
    hourly_dow = f2.groupby(["hour", "dow"])["visitors"].mean().round(0).astype(int)
    heatmap = []
    for (hour, dow), val in hourly_dow.items():
        heatmap.append({"hour": int(hour), "dow": int(dow), "value": int(val)})

    # Peak hour
    peak_hour = int(f.groupby("hour")["visitors"].sum().idxmax())

    return jsonify({
        "daily_labels":   daily["date"].tolist(),
        "daily_visitors": daily["visitors"].tolist(),
        "heatmap":        heatmap,
        "peak_hour":      peak_hour,
        "total_visitors": int(f["visitors"].sum()),
    })


# ── Product Category Performance ──────────────────────────────────────────────
@app.route("/api/categories")
def categories():
    branch = request.args.get("branch", "all")
    period = request.args.get("period", "30d")

    s = _filter(DATA["sales"], branch, period)
    cat = s.groupby("category").agg(
        revenue=("revenue", "sum"),
        units=("units_sold", "sum"),
        margin=("margin", "sum"),
    ).reset_index().sort_values("revenue", ascending=False)

    total_rev = cat["revenue"].sum()
    cat["pct"] = (cat["revenue"] / total_rev * 100).round(1)

    return jsonify({
        "labels":   cat["category"].tolist(),
        "revenue":  [round(v, 2) for v in cat["revenue"]],
        "units":    [int(v) for v in cat["units"]],
        "margin":   [round(v, 2) for v in cat["margin"]],
        "pct":      cat["pct"].tolist(),
    })


# ── Branch Comparison ─────────────────────────────────────────────────────────
@app.route("/api/branches")
def branches():
    period = request.args.get("period", "30d")

    s = _filter(DATA["sales"], "all", period)
    f = _filter(DATA["footfall"], "all", period)
    w = _filter(DATA["waste"], "all", period)

    rev_by_branch = s.groupby("branch")["revenue"].sum()
    margin_by_branch = s.groupby("branch")["margin"].sum()
    footfall_by_branch = f.groupby("branch")["visitors"].sum()
    waste_by_branch = w.groupby("branch")["waste_value"].sum()

    # Normalise each metric to 0-100 for radar chart
    def norm(series):
        mn, mx = series.min(), series.max()
        if mx == mn:
            return (series * 0 + 50).round(1)
        return ((series - mn) / (mx - mn) * 100).round(1)

    radar = pd.DataFrame({
        "branch":    BRANCHES,
        "revenue":   [round(float(rev_by_branch.get(b, 0)), 2) for b in BRANCHES],
        "margin":    [round(float(margin_by_branch.get(b, 0)), 2) for b in BRANCHES],
        "footfall":  [int(footfall_by_branch.get(b, 0)) for b in BRANCHES],
        "waste":     [round(float(waste_by_branch.get(b, 0)), 2) for b in BRANCHES],
    })

    for col in ["revenue", "margin", "footfall"]:
        radar[f"{col}_norm"] = norm(radar[col]).tolist()
    # Waste: lower is better — invert
    radar["waste_norm"] = (100 - norm(radar["waste"])).round(1)

    return jsonify(radar.to_dict(orient="records"))


# ── Profitability & Margins ───────────────────────────────────────────────────
@app.route("/api/profitability")
def profitability():
    period = request.args.get("period", "30d")

    s = _filter(DATA["sales"], "all", period)
    agg = s.groupby("branch").agg(
        revenue=("revenue", "sum"),
        cogs=("cogs", "sum"),
        margin=("margin", "sum"),
    ).reset_index()
    agg["margin_pct"] = (agg["margin"] / agg["revenue"] * 100).round(1)
    agg = agg.sort_values("revenue", ascending=False)

    return jsonify({
        "labels":      agg["branch"].tolist(),
        "revenue":     [round(v, 2) for v in agg["revenue"]],
        "cogs":        [round(v, 2) for v in agg["cogs"]],
        "margin":      [round(v, 2) for v in agg["margin"]],
        "margin_pct":  agg["margin_pct"].tolist(),
    })


# ── Waste & Shrinkage ─────────────────────────────────────────────────────────
@app.route("/api/waste")
def waste():
    branch = request.args.get("branch", "all")
    period = request.args.get("period", "30d")

    w = _filter(DATA["waste"], branch, period)
    s = _filter(DATA["sales"], branch, period)

    # Waste % by category
    w_cat = w.groupby("category")["waste_value"].sum()
    s_cat = s.groupby("category")["revenue"].sum()
    cat_pct = (w_cat / s_cat * 100).fillna(0).round(2).reset_index()
    cat_pct.columns = ["category", "waste_pct"]

    # Daily waste trend
    daily = w.groupby(w["date"].dt.date.astype(str))["waste_value"].sum().reset_index()
    daily.columns = ["date", "waste_value"]
    daily = daily.sort_values("date")

    # Waste by branch (if showing all)
    branch_waste = w.groupby("branch")["waste_value"].sum().reset_index()
    branch_waste.columns = ["branch", "waste_value"]
    branch_waste = branch_waste.sort_values("waste_value", ascending=False)

    return jsonify({
        "category_pct":    cat_pct.to_dict(orient="records"),
        "daily_labels":    daily["date"].tolist(),
        "daily_waste":     [round(v, 2) for v in daily["waste_value"]],
        "branch_waste":    branch_waste.to_dict(orient="records"),
        "total_waste_val": round(float(w["waste_value"].sum()), 2),
    })


# ── Employees ─────────────────────────────────────────────────────────────────
@app.route("/api/employees")
def employees():
    branch = request.args.get("branch", "all")
    period = request.args.get("period", "30d")

    e = _filter(DATA["employees"], branch, period)
    s = _filter(DATA["sales"],     branch, period)

    # Daily staff trend
    daily = e.groupby(e["date"].dt.date.astype(str)).agg(
        staff_count=("staff_count", "sum"),
        total_hours=("total_hours", "sum"),
    ).reset_index().sort_values("date")
    daily.columns = ["date", "staff_count", "total_hours"]

    # Per-branch aggregates
    branch_staff = e.groupby("branch").agg(
        avg_staff=("staff_count", "mean"),
        total_hours=("total_hours", "sum"),
    ).reset_index()
    branch_staff["avg_staff"] = branch_staff["avg_staff"].round(1)

    rev_by_branch = s.groupby("branch")["revenue"].sum().reset_index()
    rev_by_branch.columns = ["branch", "revenue"]

    merged = branch_staff.merge(rev_by_branch, on="branch", how="left").fillna(0)
    merged["revenue_per_staff"] = (
        merged["revenue"] / merged["avg_staff"].replace(0, 1)
    ).round(0)
    merged["revenue_per_hour"] = (
        merged["revenue"] / merged["total_hours"].replace(0, 1)
    ).round(2)
    merged = merged.sort_values("revenue_per_hour", ascending=False)

    avg_daily_staff = round(float(e.groupby("date")["staff_count"].sum().mean()), 1)
    total_hours_sum = int(e["total_hours"].sum())

    return jsonify({
        "daily_labels":       daily["date"].tolist(),
        "daily_staff":        daily["staff_count"].tolist(),
        "branch_labels":      merged["branch"].tolist(),
        "avg_staff":          merged["avg_staff"].tolist(),
        "revenue_per_staff":  [int(v) for v in merged["revenue_per_staff"]],
        "revenue_per_hour":   [round(float(v), 2) for v in merged["revenue_per_hour"]],
        "avg_daily_staff":    avg_daily_staff,
        "total_hours":        total_hours_sum,
    })


# ── Live Ticker (simulated real-time) ─────────────────────────────────────────
@app.route("/api/live")
def live():
    """Returns a small snapshot of 'live' metrics with slight random variance
    to simulate a real-time data feed updating every few seconds."""
    s = DATA["sales"]
    latest = s["date"].max()
    snap = s[s["date"] == latest]

    base_rev = float(snap["revenue"].sum())
    noise = random.uniform(-0.03, 0.03)  # ±3 %

    # Random branch making a 'sale right now'
    active_branch = random.choice(BRANCHES)
    active_product = random.choice([
        "Milk 1L", "White Bread", "Apples", "Cola 1.5L",
        "Chicken Breast", "Yoghurt", "Bananas", "Coffee 500g"
    ])
    active_units = random.randint(1, 8)

    return jsonify({
        "timestamp":      datetime.now().strftime("%H:%M:%S"),
        "current_revenue": round(base_rev * (1 + noise), 2),
        "active_branch":  active_branch,
        "active_product": active_product,
        "active_units":   active_units,
        "transactions_today": random.randint(1800, 2400),
    })


if __name__ == "__main__":
    app.run(debug=True)
