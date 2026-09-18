#!/usr/bin/env python3
"""
PlanetPulse Backend Server & Standard REST API
Implements zero-dependency REST endpoints for grading scripts and serves static web assets.
"""

import os
import json
import mimetypes
import sys
from datetime import datetime, timedelta, date
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("PORT", 8080))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data.json")

# Fixed emission factors specified by Hackathon Product Brief (kg CO2 per unit)
EMISSION_FACTORS = {
    "car": 0.20,          # kg CO2 / km
    "bus": 0.08,          # kg CO2 / km
    "flight": 0.25,       # kg CO2 / km
    "electricity": 0.80,  # kg CO2 / kWh
    "veg_meal": 0.50,     # kg CO2 / meal
    "non_veg_meal": 2.00  # kg CO2 / meal
}

CATEGORY_UNITS = {
    "car": "km",
    "bus": "km",
    "flight": "km",
    "electricity": "kWh",
    "veg_meal": "meals",
    "non_veg_meal": "meals"
}

# Physical plausibility thresholds for Decision Point 2 (DP2: Absurd Input)
PLAUSIBILITY_THRESHOLDS = {
    "car": {"max_single": 2000, "unit": "km", "benchmark": "2,000 km (over 24h continuous non-stop driving)"},
    "bus": {"max_single": 1500, "unit": "km", "benchmark": "1,500 km (continuous long-distance coach)"},
    "flight": {"max_single": 20000, "unit": "km", "benchmark": "20,000 km (Earth half-circumference)"},
    "electricity": {"max_single": 3000, "unit": "kWh", "benchmark": "3,000 kWh (typical household uses ~300 kWh/month)"},
    "veg_meal": {"max_single": 15, "unit": "meals", "benchmark": "15 meals (extreme single-day catering)"},
    "non_veg_meal": {"max_single": 15, "unit": "meals", "benchmark": "15 meals (extreme single-day catering)"}
}

DEFAULT_DATA = {
    "target": {
        "weekly_target_co2": 50.0,
        "week_start": "monday"
    },
    "activities": [
        {
            "id": "act-1",
            "type": "bus",
            "quantity": 15,
            "unit": "km",
            "co2_kg": 1.2,
            "date": (date.today() - timedelta(days=2)).isoformat(),
            "note": "Office commute via public bus"
        },
        {
            "id": "act-2",
            "type": "electricity",
            "quantity": 18,
            "unit": "kWh",
            "co2_kg": 14.4,
            "date": (date.today() - timedelta(days=1)).isoformat(),
            "note": "Home cooling & electronics"
        },
        {
            "id": "act-3",
            "type": "veg_meal",
            "quantity": 2,
            "unit": "meals",
            "co2_kg": 1.0,
            "date": (date.today() - timedelta(days=1)).isoformat(),
            "note": "Lunch and dinner"
        },
        {
            "id": "act-4",
            "type": "car",
            "quantity": 25,
            "unit": "km",
            "co2_kg": 5.0,
            "date": date.today().isoformat(),
            "note": "Grocery and errands run"
        },
        {
            "id": "act-5",
            "type": "non_veg_meal",
            "quantity": 1,
            "unit": "meals",
            "co2_kg": 2.0,
            "date": date.today().isoformat(),
            "note": "Dinner with friends"
        }
    ]
}


def load_data():
    if not os.path.exists(DATA_FILE):
        save_data(DEFAULT_DATA)
        return DEFAULT_DATA
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return DEFAULT_DATA


def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def calculate_co2(activity_type, quantity):
    factor = EMISSION_FACTORS.get(activity_type)
    if factor is None:
        raise ValueError(f"Unknown activity type: '{activity_type}'. Valid types: {list(EMISSION_FACTORS.keys())}")
    return round(float(quantity) * factor, 4)


def get_current_week_bounds():
    today = date.today()
    # ISO week: Monday is day 0, Sunday is day 6
    start_of_week = today - timedelta(days=today.weekday())
    end_of_week = start_of_week + timedelta(days=6)
    return start_of_week, end_of_week, today.weekday() + 1  # 1-indexed day of week (1=Mon..7=Sun)


class PlanetPulseHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, data):
        payload = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # Health / Root check
        if path == "/api/health":
            return self._send_json(200, {
                "status": "healthy",
                "app": "PlanetPulse",
                "track": "Climate tech - Carbon Footprint Tracker",
                "version": "1.0.0"
            })

        # Emission Factors
        if path == "/api/factors":
            return self._send_json(200, {
                "factors": EMISSION_FACTORS,
                "units": CATEGORY_UNITS,
                "plausibility_thresholds": PLAUSIBILITY_THRESHOLDS
            })

        # List Activities (Feature 5: History & Filter)
        if path == "/api/activities":
            data = load_data()
            activities = data.get("activities", [])

            # Filter by type
            type_filter = query.get("type", [None])[0]
            if type_filter and type_filter != "all":
                activities = [a for a in activities if a.get("type") == type_filter]

            # Filter by date range
            start_date = query.get("start_date", [None])[0]
            end_date = query.get("end_date", [None])[0]
            if start_date:
                activities = [a for a in activities if a.get("date") >= start_date]
            if end_date:
                activities = [a for a in activities if a.get("date") <= end_date]

            # Sort by date desc
            activities.sort(key=lambda x: x.get("date", ""), reverse=True)

            return self._send_json(200, {
                "count": len(activities),
                "activities": activities
            })

        # Target and Burn-rate (Feature 4 & DP1, DP3)
        if path == "/api/target":
            data = load_data()
            target_info = data.get("target", {"weekly_target_co2": 50.0})
            target_val = float(target_info.get("weekly_target_co2", 50.0))

            start_week, end_week, day_of_week = get_current_week_bounds()
            activities = data.get("activities", [])

            # Current week emissions
            week_co2 = sum(
                float(a.get("co2_kg", 0))
                for a in activities
                if start_week.isoformat() <= a.get("date", "") <= end_week.isoformat()
            )
            week_co2 = round(week_co2, 2)

            # DP3: Pace calculation (Expected vs Actual burn rate)
            expected_pace_pct = round((day_of_week / 7.0) * 100, 1)
            actual_pace_pct = round((week_co2 / target_val) * 100, 1) if target_val > 0 else 0
            is_exceeded = week_co2 > target_val
            surplus_co2 = round(week_co2 - target_val, 2) if is_exceeded else 0.0

            # DP1: Nudge recommendations
            mitigation_recommendations = []
            if is_exceeded:
                bus_km_swap = round(surplus_co2 / (EMISSION_FACTORS["car"] - EMISSION_FACTORS["bus"]), 1)
                veg_meals_swap = round(surplus_co2 / (EMISSION_FACTORS["non_veg_meal"] - EMISSION_FACTORS["veg_meal"]), 1)
                kwh_reduction = round(surplus_co2 / EMISSION_FACTORS["electricity"], 1)

                mitigation_recommendations = [
                    f"Substitute {bus_km_swap} km of car commuting with public bus (saves {surplus_co2} kg CO2)",
                    f"Swap {veg_meals_swap} meals from meat to plant-based options (saves {surplus_co2} kg CO2)",
                    f"Reduce electricity consumption by {kwh_reduction} kWh through conservation (saves {surplus_co2} kg CO2)"
                ]

            return self._send_json(200, {
                "weekly_target_co2": target_val,
                "current_week_co2": week_co2,
                "percentage_used": actual_pace_pct,
                "is_exceeded": is_exceeded,
                "surplus_co2": surplus_co2,
                "week_range": {
                    "start": start_week.isoformat(),
                    "end": end_week.isoformat(),
                    "day_of_week": day_of_week,
                    "days_in_week": 7
                },
                "pace": {
                    "expected_pace_pct": expected_pace_pct,
                    "actual_pace_pct": actual_pace_pct,
                    "pace_delta": round(actual_pace_pct - expected_pace_pct, 1),
                    "status": "exceeded" if is_exceeded else ("fast" if actual_pace_pct > expected_pace_pct + 15 else "healthy")
                },
                "nudge": {
                    "mode": "mitigation" if is_exceeded else "supportive",
                    "message": f"Target exceeded by +{surplus_co2} kg CO2. Let's make small swaps to balance out." if is_exceeded else "You are within your weekly carbon budget.",
                    "mitigation_recommendations": mitigation_recommendations
                }
            })

        # Dashboard Stats (Feature 3: Total & Per-Category Breakdown)
        if path == "/api/stats":
            data = load_data()
            activities = data.get("activities", [])
            total_co2 = round(sum(float(a.get("co2_kg", 0)) for a in activities), 2)

            breakdown = {}
            for cat in EMISSION_FACTORS.keys():
                cat_activities = [a for a in activities if a.get("type") == cat]
                cat_co2 = round(sum(float(a.get("co2_kg", 0)) for a in cat_activities), 2)
                cat_qty = round(sum(float(a.get("quantity", 0)) for a in cat_activities), 2)
                pct = round((cat_co2 / total_co2 * 100), 1) if total_co2 > 0 else 0.0
                breakdown[cat] = {
                    "co2_kg": cat_co2,
                    "total_quantity": cat_qty,
                    "unit": CATEGORY_UNITS.get(cat, ""),
                    "percentage": pct,
                    "activity_count": len(cat_activities)
                }

            top_cat = max(breakdown.items(), key=lambda x: x[1]["co2_kg"])[0] if breakdown and total_co2 > 0 else None
            trees_equivalent = round(total_co2 / 21.0, 1)

            return self._send_json(200, {
                "total_co2_kg": total_co2,
                "total_activities": len(activities),
                "breakdown": breakdown,
                "top_emission_category": top_cat,
                "environmental_equivalents": {
                    "tree_seedlings_to_offset_yearly": trees_equivalent,
                    "km_driven_in_avg_car": round(total_co2 / 0.20, 1)
                }
            })

        # Static File Serving
        self._serve_static_file(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get("Content-Length", 0))
        body = {}
        if content_length > 0:
            try:
                body_raw = self.rfile.read(content_length).decode("utf-8")
                body = json.loads(body_raw)
            except Exception as e:
                return self._send_json(400, {"error": f"Invalid JSON payload: {str(e)}"})

        # Feature 2 / Calculator endpoint
        if path == "/api/calculate":
            activity_type = body.get("type")
            quantity = body.get("quantity")

            if not activity_type or quantity is None:
                return self._send_json(400, {"error": "Missing required fields: 'type' and 'quantity'"})

            try:
                qty_float = float(quantity)
                if qty_float < 0:
                    return self._send_json(400, {"error": "Quantity must be non-negative"})
                co2 = calculate_co2(activity_type, qty_float)

                threshold = PLAUSIBILITY_THRESHOLDS.get(activity_type, {})
                max_val = threshold.get("max_single", 999999)
                is_absurd = qty_float > max_val

                return self._send_json(200, {
                    "type": activity_type,
                    "quantity": qty_float,
                    "unit": CATEGORY_UNITS.get(activity_type, ""),
                    "factor": EMISSION_FACTORS[activity_type],
                    "co2_kg": co2,
                    "is_absurd_input": is_absurd,
                    "plausibility_warning": f"Quantity {qty_float} exceeds typical human/daily threshold of {max_val} {threshold.get('unit')}" if is_absurd else None
                })
            except ValueError as e:
                return self._send_json(400, {"error": str(e)})

        # Feature 1: Log an Activity
        if path == "/api/activities":
            activity_type = body.get("type")
            quantity = body.get("quantity")
            activity_date = body.get("date", date.today().isoformat())
            note = body.get("note", "").strip()
            override_absurd = body.get("override_absurd", False)

            if not activity_type or quantity is None:
                return self._send_json(400, {"error": "Missing required fields: 'type' and 'quantity'"})

            if activity_type not in EMISSION_FACTORS:
                return self._send_json(400, {
                    "error": f"Invalid activity type. Choose from: {list(EMISSION_FACTORS.keys())}"
                })

            try:
                qty_float = float(quantity)
                if qty_float <= 0:
                    return self._send_json(400, {"error": "Quantity must be greater than zero"})
            except ValueError:
                return self._send_json(400, {"error": "Quantity must be a valid number"})

            # DP2: Absurd Input Check
            threshold = PLAUSIBILITY_THRESHOLDS.get(activity_type, {})
            max_val = threshold.get("max_single", 999999)
            if qty_float > max_val and not override_absurd:
                suggested_value = qty_float / 1000 if qty_float >= 1000 else qty_float
                return self._send_json(422, {
                    "error": "Plausibility Check Triggered (Decision Point 2)",
                    "type": "ABSURD_INPUT_DETECTED",
                    "details": f"Entered {qty_float} {threshold.get('unit')} is abnormally high compared to standard single-activity threshold ({max_val} {threshold.get('unit')}, benchmark: {threshold.get('benchmark')}).",
                    "suggested_correction": suggested_value,
                    "instructions": "Send 'override_absurd': true in your request body if this represents a verified aggregate or enterprise batch entry."
                })

            co2 = calculate_co2(activity_type, qty_float)

            data = load_data()
            new_activity = {
                "id": f"act-{int(datetime.now().timestamp() * 1000)}",
                "type": activity_type,
                "quantity": qty_float,
                "unit": CATEGORY_UNITS.get(activity_type, ""),
                "co2_kg": co2,
                "date": activity_date,
                "note": note
            }

            data["activities"].append(new_activity)
            save_data(data)

            return self._send_json(201, {
                "message": "Activity logged successfully",
                "activity": new_activity
            })

        # Feature 4: Update Weekly Target
        if path == "/api/target":
            target_val = body.get("weekly_target_co2")
            if target_val is None:
                return self._send_json(400, {"error": "Missing 'weekly_target_co2'"})
            try:
                target_float = float(target_val)
                if target_float <= 0:
                    return self._send_json(400, {"error": "Target must be greater than 0"})
            except ValueError:
                return self._send_json(400, {"error": "Target must be a valid number"})

            data = load_data()
            data["target"]["weekly_target_co2"] = target_float
            save_data(data)

            return self._send_json(200, {
                "message": "Target updated successfully",
                "weekly_target_co2": target_float
            })

        # Reset demo data endpoint
        if path == "/api/reset":
            save_data(DEFAULT_DATA)
            return self._send_json(200, {"message": "Data reset to standard demo dataset"})

        return self._send_json(404, {"error": f"Endpoint not found: POST {path}"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/activities/"):
            activity_id = path.split("/api/activities/")[1]
            data = load_data()
            initial_count = len(data["activities"])
            data["activities"] = [a for a in data["activities"] if a.get("id") != activity_id]

            if len(data["activities"]) == initial_count:
                return self._send_json(404, {"error": f"Activity with id '{activity_id}' not found"})

            save_data(data)
            return self._send_json(200, {"message": f"Activity '{activity_id}' deleted successfully"})

        return self._send_json(404, {"error": f"Endpoint not found: DELETE {path}"})

    def _serve_static_file(self, path):
        clean_path = path.lstrip("/")
        if not clean_path:
            clean_path = "index.html"

        filepath = os.path.normpath(os.path.join(BASE_DIR, clean_path))
        base_dir_norm = os.path.normpath(BASE_DIR) + os.sep

        # Path traversal guardrail
        if not (filepath == os.path.normpath(BASE_DIR) or filepath.startswith(base_dir_norm)):
            self.send_error(403, "Forbidden")
            return

        if not os.path.exists(filepath) or os.path.isdir(filepath):
            filepath = os.path.join(BASE_DIR, "index.html")

        mime_type, _ = mimetypes.guess_type(filepath)
        if not mime_type:
            mime_type = "application/octet-stream"

        try:
            with open(filepath, "rb") as f:
                content = f.read()

            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading file: {str(e)}")


def run_server():
    server_address = ("", PORT)
    httpd = HTTPServer(server_address, PlanetPulseHandler)
    print(f"============================================================")
    print(f" PlanetPulse Climate Tech Server started on port {PORT}")
    print(f" Open in browser: http://localhost:{PORT}")
    print(f" REST API endpoints: /api/activities, /api/target, /api/stats")
    print(f"============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
        httpd.server_close()


if __name__ == "__main__":
    run_server()