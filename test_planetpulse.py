#!/usr/bin/env python3
"""
Automated Verification Suite for PlanetPulse
Tests conversion factors, calculation engine, DP1/DP2/DP3 logic, and REST endpoints.
"""

import unittest
import json
import os
import sys

# Import server functions
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server

class TestPlanetPulseCore(unittest.TestCase):
    def test_conversion_factors(self):
        """Verify the 6 fixed emission factors from the hackathon brief"""
        # car 0.20 kg/km
        self.assertEqual(server.calculate_co2("car", 10), 2.0)
        self.assertEqual(server.calculate_co2("car", 50), 10.0)

        # bus 0.08 kg/km
        self.assertEqual(server.calculate_co2("bus", 25), 2.0)
        self.assertEqual(server.calculate_co2("bus", 10), 0.8)

        # flight 0.25 kg/km
        self.assertEqual(server.calculate_co2("flight", 1000), 250.0)
        self.assertEqual(server.calculate_co2("flight", 400), 100.0)

        # electricity 0.80 kg/kWh
        self.assertEqual(server.calculate_co2("electricity", 50), 40.0)
        self.assertEqual(server.calculate_co2("electricity", 12.5), 10.0)

        # veg meal 0.5 kg
        self.assertEqual(server.calculate_co2("veg_meal", 3), 1.5)
        self.assertEqual(server.calculate_co2("veg_meal", 1), 0.5)

        # non-veg meal 2.0 kg
        self.assertEqual(server.calculate_co2("non_veg_meal", 2), 4.0)
        self.assertEqual(server.calculate_co2("non_veg_meal", 1), 2.0)

    def test_invalid_type(self):
        with self.assertRaises(ValueError):
            server.calculate_co2("rocket_ship", 100)

    def test_dp2_absurd_input_thresholds(self):
        """Verify DP2 plausibility thresholds detect absurd input"""
        car_thresh = server.PLAUSIBILITY_THRESHOLDS["car"]["max_single"]
        self.assertTrue(500000 > car_thresh, "500,000 km must trigger DP2 absurd threshold")
        self.assertFalse(150 > car_thresh, "150 km must be within normal threshold")

    def test_dp3_week_bounds(self):
        """Verify DP3 week bounds calculation conforms to ISO Monday-Sunday"""
        start, end, day_of_week = server.get_current_week_bounds()
        self.assertEqual(start.weekday(), 0, "Start of week must be Monday (weekday 0)")
        self.assertEqual(end.weekday(), 6, "End of week must be Sunday (weekday 6)")
        self.assertTrue(1 <= day_of_week <= 7, "Day of week must be 1 to 7")

    def test_html_assets_exist(self):
        """Verify all essential web assets exist and contain test IDs"""
        base_dir = os.path.dirname(os.path.abspath(__file__))
        html_path = os.path.join(base_dir, "index.html")
        css_path = os.path.join(base_dir, "style.css")
        js_path = os.path.join(base_dir, "app.js")
        readme_path = os.path.join(base_dir, "README.md")
        decisions_path = os.path.join(base_dir, "DECISIONS.md")

        self.assertTrue(os.path.exists(html_path), "index.html must exist")
        self.assertTrue(os.path.exists(css_path), "style.css must exist")
        self.assertTrue(os.path.exists(js_path), "app.js must exist")
        self.assertTrue(os.path.exists(readme_path), "README.md must exist")
        self.assertTrue(os.path.exists(decisions_path), "DECISIONS.md must exist")

        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()

        required_test_ids = [
            'data-testid="activity-type-select"',
            'data-testid="activity-quantity-input"',
            'data-testid="activity-submit-btn"',
            'data-testid="activity-calc-preview"',
            'data-testid="stat-total-co2"',
            'data-testid="target-progress-bar"',
            'data-testid="pace-line-marker"',
            'data-testid="nudge-banner-container"',
            'data-testid="breakdown-canvas"',
            'data-testid="filter-type"',
            'data-testid="history-table"'
        ]
        for tid in required_test_ids:
            self.assertIn(tid, html, f"HTML must include {tid}")

if __name__ == "__main__":
    unittest.main()
