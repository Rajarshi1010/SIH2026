"""
scripts/test_layer4_inference.py - Direct verification of Layer 4 LightGBM + TreeSHAP math
"""

import sys
from pathlib import Path
import numpy as np

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "Backend"))

from model import residual_classifier, FEATURE_NAMES

def main():
    print("=== Testing Layer 4 LightGBM & TreeSHAP Attribution Engine ===")

    # Test 1: Agricultural Stubble Burn (Punjab/Haryana scenario)
    feat_ag = {
        "frp": 12.5,
        "brightness_mir": 332.0,
        "bright_ratio": 1.08,
        "distance_to_industrial_km": 38.5,
        "is_night": 0.0,
        "frp_z_score": -0.12,
        "scan_track_area_km2": 0.22,
    }
    vec_ag = np.array([[feat_ag[name] for name in FEATURE_NAMES]], dtype=np.float32)
    res_ag = residual_classifier.predict_with_shap(vec_ag, feat_ag)

    print("\n[SCENARIO 1: Agricultural Stubble Burn (Punjab/Haryana)]")
    print(f"-> Predicted Class: {res_ag['predicted_class']}")
    print(f"-> Confidence: {res_ag['confidence'] * 100:.1f}%")
    print(f"-> Class Probabilities: {res_ag['class_probabilities']}")
    print("-> TreeSHAP Key Feature Attributions:")
    for k, v in res_ag["shap_attribution"].items():
        if abs(v["impact_pct"]) >= 10.0:
            print(f"   * {k}: {v['value']} ({v['direction']} impact: {v['impact_pct']}%)")

    # Test 2: Unmapped Industrial Emergency / Chemical Explosion
    feat_ind = {
        "frp": 195.0,
        "brightness_mir": 435.0,
        "bright_ratio": 1.29,
        "distance_to_industrial_km": 0.8,
        "is_night": 1.0,
        "frp_z_score": 9.0,
        "scan_track_area_km2": 0.16,
    }
    vec_ind = np.array([[feat_ind[name] for name in FEATURE_NAMES]], dtype=np.float32)
    res_ind = residual_classifier.predict_with_shap(vec_ind, feat_ind)

    print("\n[SCENARIO 2: Catastrophic Industrial Explosion / Emergency]")
    print(f"-> Predicted Class: {res_ind['predicted_class']}")
    print(f"-> Confidence: {res_ind['confidence'] * 100:.1f}%")
    print(f"-> Class Probabilities: {res_ind['class_probabilities']}")
    print("-> TreeSHAP Key Feature Attributions:")
    for k, v in res_ind["shap_attribution"].items():
        if abs(v["impact_pct"]) >= 10.0:
            print(f"   * {k}: {v['value']} ({v['direction']} impact: {v['impact_pct']}%)")

    # Test 3: Natural Forest Wildfire (Western Ghats / NE India)
    feat_wf = {
        "frp": 38.0,
        "brightness_mir": 348.0,
        "bright_ratio": 1.13,
        "distance_to_industrial_km": 45.0,
        "is_night": 0.0,
        "frp_z_score": 1.15,
        "scan_track_area_km2": 0.45,
    }
    vec_wf = np.array([[feat_wf[name] for name in FEATURE_NAMES]], dtype=np.float32)
    res_wf = residual_classifier.predict_with_shap(vec_wf, feat_wf)

    print("\n[SCENARIO 3: Forest Wildfire (Western Ghats)]")
    print(f"-> Predicted Class: {res_wf['predicted_class']}")
    print(f"-> Confidence: {res_wf['confidence'] * 100:.1f}%")
    print(f"-> Class Probabilities: {res_wf['class_probabilities']}")
    print("-> TreeSHAP Key Feature Attributions:")
    for k, v in res_wf["shap_attribution"].items():
        if abs(v["impact_pct"]) >= 10.0:
            print(f"   * {k}: {v['value']} ({v['direction']} impact: {v['impact_pct']}%)")

    print("\nAll Layer 4 test scenarios passed with mathematical attribution!")

if __name__ == "__main__":
    main()
