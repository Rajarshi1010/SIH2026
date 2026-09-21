"""
scripts/curated_emitters.py - High-Precision Strategic Emitters & Baseline Facilities for India

Defines strategic industrial complexes, oil refineries, gas processing plants,
steel mills, and offshore platforms across India with baseline thermal signatures.
"""

from typing import Any, Dict, List

CURATED_EMITTERS: List[Dict[str, Any]] = [
    # --- WESTERN PETROCHEMICAL & REFINERY CORRIDOR ---
    {
        "name": "Reliance Jamnagar Refinery Complex",
        "category": "refinery",
        "latitude": 22.4707,
        "longitude": 70.0610,
        "description": "World's largest petroleum refining complex (DTA + SEZ)",
        "source": "VIIRS_Nightfire/WorldBank",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "capacity_bpd": 1240000,
            "corridor": "Western_Gujarat",
            "primary_emitters": ["crude_distillation", "coker", "flare_stack_north", "flare_stack_south"],
            "expected_baseline_frp_mw": 85.0
        }
    },
    {
        "name": "Nayara Energy Vadinar Refinery",
        "category": "refinery",
        "latitude": 22.4230,
        "longitude": 69.7210,
        "description": "Vadinar complex second-largest single-site refinery in India",
        "source": "VIIRS_Nightfire",
        "buffer_radius_meters": 1800.0,
        "metadata": {
            "capacity_bpd": 400000,
            "corridor": "Western_Gujarat",
            "expected_baseline_frp_mw": 45.0
        }
    },
    {
        "name": "ONGC Hazira Gas Processing Plant",
        "category": "gas_flare",
        "latitude": 21.1444,
        "longitude": 72.6418,
        "description": "India's largest sour gas processing facility with permanent flare stacks",
        "source": "VIIRS_Nightfire/GGFR",
        "buffer_radius_meters": 1200.0,
        "metadata": {
            "corridor": "Western_Gujarat",
            "type": "sour_gas_sweetening_flare",
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "Dahej Petrochemical Complex (OPaL)",
        "category": "petrochemical",
        "latitude": 21.7052,
        "longitude": 72.5835,
        "description": "ONGC Petro additions Limited mega-dual feed cracker",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 1500.0,
        "metadata": {
            "corridor": "Western_Gujarat",
            "type": "steam_cracker_flare",
            "expected_baseline_frp_mw": 50.0
        }
    },
    {
        "name": "BPCL & HPCL Mumbai Trombay Refineries",
        "category": "refinery",
        "latitude": 19.0065,
        "longitude": 72.8988,
        "description": "Urban coastal refining hub with regulated marine flare systems",
        "source": "VIIRS_Nightfire",
        "buffer_radius_meters": 1500.0,
        "metadata": {
            "corridor": "Western_Maharashtra",
            "expected_baseline_frp_mw": 30.0
        }
    },
    {
        "name": "ONGC Mumbai High Offshore Flaring Platform (North)",
        "category": "gas_flare",
        "latitude": 19.4180,
        "longitude": 71.3320,
        "description": "Offshore crude extraction continuous associated gas flare",
        "source": "VIIRS_Nightfire/GGFR",
        "buffer_radius_meters": 2000.0,
        "metadata": {
            "corridor": "Offshore_ArabianSea",
            "offshore": True,
            "expected_baseline_frp_mw": 110.0
        }
    },

    # --- EASTERN METALLURGICAL & COAL BELT ---
    {
        "name": "Tata Steel Jamshedpur Works",
        "category": "steel_mill",
        "latitude": 22.7845,
        "longitude": 86.2029,
        "description": "Integrated steel plant with multiple blast furnaces and coke ovens",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2000.0,
        "metadata": {
            "corridor": "Eastern_Jharkhand",
            "facilities": ["blast_furnaces_H_I", "coke_ovens", "sinter_plant"],
            "expected_baseline_frp_mw": 60.0
        }
    },
    {
        "name": "SAIL Rourkela Steel Plant",
        "category": "steel_mill",
        "latitude": 22.2155,
        "longitude": 84.8690,
        "description": "Integrated steel complex with active basic oxygen furnaces",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2000.0,
        "metadata": {
            "corridor": "Eastern_Odisha",
            "facilities": ["blast_furnace_5", "sms_2"],
            "expected_baseline_frp_mw": 55.0
        }
    },
    {
        "name": "SAIL Bokaro Steel Plant",
        "category": "steel_mill",
        "latitude": 23.6693,
        "longitude": 86.1511,
        "description": "Large metallurgical complex with 5 blast furnaces",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2200.0,
        "metadata": {
            "corridor": "Eastern_Jharkhand",
            "expected_baseline_frp_mw": 70.0
        }
    },
    {
        "name": "SAIL Bhilai Steel Plant",
        "category": "steel_mill",
        "latitude": 21.1824,
        "longitude": 81.3920,
        "description": "India's sole producer of rails and heavy steel plates",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2200.0,
        "metadata": {
            "corridor": "Central_Chhattisgarh",
            "expected_baseline_frp_mw": 65.0
        }
    },
    {
        "name": "Jharia Coalfield Persistent Subsurface Fire Zone",
        "category": "coal_seam_fire",
        "latitude": 23.7432,
        "longitude": 86.4172,
        "description": "Century-old underground and open-cast coal fires with persistent high thermal output",
        "source": "satellite_historic",
        "buffer_radius_meters": 3500.0,
        "metadata": {
            "corridor": "Eastern_Jharkhand",
            "thermal_type": "continuous_coal_combustion",
            "expected_baseline_frp_mw": 90.0
        }
    },
    {
        "name": "NTPC Singrauli Super Thermal Power Station",
        "category": "power_plant",
        "latitude": 24.1030,
        "longitude": 82.6820,
        "description": "2,000 MW coal-fired base load thermal power complex",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 1500.0,
        "metadata": {
            "corridor": "Central_MP_UP",
            "capacity_mw": 2000,
            "expected_baseline_frp_mw": 25.0
        }
    },

    # --- NORTHERN INDUSTRIAL & TRANSITION CORRIDOR ---
    {
        "name": "IOCL Panipat Refinery & Petrochemical Complex",
        "category": "refinery",
        "latitude": 29.4678,
        "longitude": 76.8920,
        "description": "Major northern refinery located in prime agricultural residue burning zone",
        "source": "VIIRS_Nightfire/OSM",
        "buffer_radius_meters": 2000.0,
        "metadata": {
            "corridor": "Northern_Haryana",
            "capacity_mmtpa": 15.0,
            "high_stubble_risk": True,
            "expected_baseline_frp_mw": 40.0
        }
    },
    {
        "name": "HMEL Guru Gobind Singh Refinery (Bathinda)",
        "category": "refinery",
        "latitude": 29.9880,
        "longitude": 74.9250,
        "description": "Bathinda inland refinery surrounded by intense seasonal crop burning",
        "source": "VIIRS_Nightfire",
        "buffer_radius_meters": 1800.0,
        "metadata": {
            "corridor": "Northern_Punjab",
            "high_stubble_risk": True,
            "expected_baseline_frp_mw": 35.0
        }
    },

    # --- SOUTHERN REFINING & LNG CORRIDORS ---
    {
        "name": "CPCL Manali Refinery (Chennai)",
        "category": "refinery",
        "latitude": 13.1670,
        "longitude": 80.2670,
        "description": "Coastal petrochemical cluster in North Chennai",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 1500.0,
        "metadata": {
            "corridor": "Southern_TamilNadu",
            "expected_baseline_frp_mw": 30.0
        }
    },
    {
        "name": "BPCL Kochi Refinery (Ambalamugal)",
        "category": "refinery",
        "latitude": 9.9725,
        "longitude": 76.3680,
        "description": "Major petrochemical crude refining complex in Kerala",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 1600.0,
        "metadata": {
            "corridor": "Southern_Kerala",
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "HPCL Visakhapatnam Refinery",
        "category": "refinery",
        "latitude": 17.6970,
        "longitude": 83.2560,
        "description": "East coast marine crude refinery and petrochemical terminal",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 1400.0,
        "metadata": {
            "corridor": "Southern_AndhraPradesh",
            "expected_baseline_frp_mw": 32.0
        }
    },
]
