#!/usr/bin/env python3
"""
Integration test for PlanetPulse REST API endpoints.
"""

import threading
import time
import urllib.request
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server

def run_integration_tests():
    # Use port 8089 to avoid conflicts
    server.PORT = 8089
    t = threading.Thread(target=server.run_server, daemon=True)
    t.start()
    time.sleep(0.5)

    base_url = "http://localhost:8089"

    # Test 1: GET /api/health
    req = urllib.request.urlopen(f"{base_url}/api/health")
    data = json.loads(req.read().decode())
    assert data["status"] == "healthy", "Health check failed"
    print("PASS: /api/health")

    # Test 2: GET /api/factors
    req = urllib.request.urlopen(f"{base_url}/api/factors")
    data = json.loads(req.read().decode())
    assert data["factors"]["car"] == 0.20
    assert data["factors"]["bus"] == 0.08
    assert data["factors"]["flight"] == 0.25
    assert data["factors"]["electricity"] == 0.80
    assert data["factors"]["veg_meal"] == 0.50
    assert data["factors"]["non_veg_meal"] == 2.00
    print("PASS: /api/factors")

    # Test 3: POST /api/calculate
    calc_payload = json.dumps({"type": "car", "quantity": 100}).encode("utf-8")
    req = urllib.request.Request(f"{base_url}/api/calculate", data=calc_payload, headers={"Content-Type": "application/json"})
    res = urllib.request.urlopen(req)
    data = json.loads(res.read().decode())
    assert data["co2_kg"] == 20.0
    print("PASS: /api/calculate car 100km -> 20.0 kg CO2")

    # Test 4: POST /api/calculate DP2 absurd input
    absurd_payload = json.dumps({"type": "car", "quantity": 500000}).encode("utf-8")
    req = urllib.request.Request(f"{base_url}/api/calculate", data=absurd_payload, headers={"Content-Type": "application/json"})
    res = urllib.request.urlopen(req)
    data = json.loads(res.read().decode())
    assert data["is_absurd_input"] is True
    print("PASS: /api/calculate DP2 absurd input correctly flagged")

    # Test 5: GET /api/target
    req = urllib.request.urlopen(f"{base_url}/api/target")
    data = json.loads(req.read().decode())
    assert "weekly_target_co2" in data
    assert "pace" in data
    assert "nudge" in data
    print("PASS: /api/target returns target, pace line, and nudge data")

    # Test 6: GET /api/stats
    req = urllib.request.urlopen(f"{base_url}/api/stats")
    data = json.loads(req.read().decode())
    assert "total_co2_kg" in data
    assert "breakdown" in data
    print("PASS: /api/stats returns totals and per-category breakdown")

    print("\nALL API INTEGRATION TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_integration_tests()
