"""
Backend/curated_emitters.py - High-Precision Strategic Emitters & Baseline Facilities for India

Defines comprehensive strategic industrial complexes across India:
- Oil refineries (All 23 operating crude refineries)
- Major integrated steel mills (SAIL, Tata, JSW, JSPL, AM/NS, RINL)
- Major petrochemical crackers & chemical zones (Dahej, Hazira, Ankleshwar, Vapi, Pata, Haldia)
- Mega thermal power stations (> 2,000 MW base load)
- Major primary aluminium smelters (Vedanta, NALCO, BALCO, Hindalco)
- Gas processing terminals & offshore platforms (ONGC Hazira, Uran, Tatipaka, Mumbai High)
"""

from typing import Any, Dict, List

CURATED_EMITTERS: List[Dict[str, Any]] = [
    # =========================================================================
    # 1. WESTERN PETROCHEMICAL, REFINERY & METALLURGICAL CORRIDOR (Gujarat & Maharashtra)
    # =========================================================================
    {
        "name": "Reliance Jamnagar Refinery Complex",
        "category": "refinery",
        "latitude": 22.4707,
        "longitude": 70.0610,
        "description": "World's largest petroleum refining complex (DTA + SEZ)",
        "source": "VIIRS_Nightfire/WorldBank",
        "buffer_radius_meters": 3500.0,
        "metadata": {
            "capacity_bpd": 1240000,
            "corridor": "Western_Gujarat",
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
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "capacity_bpd": 400000,
            "corridor": "Western_Gujarat",
            "expected_baseline_frp_mw": 45.0
        }
    },
    {
        "name": "IOCL Gujarat Refinery (Koyali)",
        "category": "refinery",
        "latitude": 22.3530,
        "longitude": 73.1250,
        "description": "Major public sector refinery and petrochemical complex in Vadodara",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Western_Gujarat",
            "capacity_mmtpa": 13.7,
            "expected_baseline_frp_mw": 40.0
        }
    },
    {
        "name": "ONGC Hazira Gas Processing Plant",
        "category": "gas_flare",
        "latitude": 21.1444,
        "longitude": 72.6418,
        "description": "India's largest sour gas processing facility with permanent flare stacks",
        "source": "VIIRS_Nightfire/GGFR",
        "buffer_radius_meters": 2000.0,
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
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Western_Gujarat",
            "type": "steam_cracker_flare",
            "expected_baseline_frp_mw": 50.0
        }
    },
    {
        "name": "AM/NS Hazira Integrated Steel Plant",
        "category": "steel_mill",
        "latitude": 21.1180,
        "longitude": 72.6780,
        "description": "ArcelorMittal Nippon Steel 9 MTPA coastal integrated steel mill",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Western_Gujarat",
            "expected_baseline_frp_mw": 50.0
        }
    },
    {
        "name": "Ankleshwar GIDC Mega Chemical Zone",
        "category": "petrochemical",
        "latitude": 21.6280,
        "longitude": 73.0120,
        "description": "One of Asia's largest organized chemical and pharmaceutical industrial estates",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 3000.0,
        "metadata": {
            "corridor": "Western_Gujarat",
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "Vapi GIDC Industrial Chemical Estate",
        "category": "petrochemical",
        "latitude": 20.3720,
        "longitude": 72.9150,
        "description": "Major chemical, dye, and specialty intermediate industrial corridor",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 3000.0,
        "metadata": {
            "corridor": "Western_Gujarat",
            "expected_baseline_frp_mw": 30.0
        }
    },
    {
        "name": "Tata & Adani Mundra Mega Power Complex",
        "category": "power_plant",
        "latitude": 22.8250,
        "longitude": 69.5250,
        "description": "Combined coastal coal-fired ultra mega power plants (4,620 MW + 4,000 MW)",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 3500.0,
        "metadata": {
            "corridor": "Western_Gujarat",
            "capacity_mw": 8620,
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
        "buffer_radius_meters": 2000.0,
        "metadata": {
            "corridor": "Western_Maharashtra",
            "expected_baseline_frp_mw": 30.0
        }
    },
    {
        "name": "ONGC Uran LPG & Crude Terminal",
        "category": "gas_flare",
        "latitude": 18.8870,
        "longitude": 72.9420,
        "description": "Oil & gas processing plant receiving offshore Bombay High hydrocarbons",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2000.0,
        "metadata": {
            "corridor": "Western_Maharashtra",
            "expected_baseline_frp_mw": 30.0
        }
    },
    {
        "name": "JSW Steel Dolvi Integrated Complex",
        "category": "steel_mill",
        "latitude": 18.6940,
        "longitude": 73.0250,
        "description": "10 MTPA coastal blast furnace and direct reduced iron steel plant",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Western_Maharashtra",
            "expected_baseline_frp_mw": 45.0
        }
    },
    {
        "name": "Adani Tiroda Super Thermal Power Station",
        "category": "power_plant",
        "latitude": 21.4150,
        "longitude": 79.9650,
        "description": "3,300 MW coal-fired supercritical power plant in Vidarbha",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2000.0,
        "metadata": {
            "corridor": "Central_Maharashtra",
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
        "buffer_radius_meters": 3000.0,
        "metadata": {
            "corridor": "Offshore_ArabianSea",
            "offshore": True,
            "expected_baseline_frp_mw": 110.0
        }
    },

    # =========================================================================
    # 2. NORTHERN REFINING & INDUSTRIAL CORRIDOR (Punjab, Haryana, UP, Rajasthan)
    # =========================================================================
    {
        "name": "IOCL Panipat Refinery & Petrochemical Complex",
        "category": "refinery",
        "latitude": 29.4678,
        "longitude": 76.8920,
        "description": "Major northern refinery located in prime agricultural residue burning zone",
        "source": "VIIRS_Nightfire/OSM",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Northern_Haryana",
            "capacity_mmtpa": 15.0,
            "high_stubble_risk": True,
            "expected_baseline_frp_mw": 45.0
        }
    },
    {
        "name": "HMEL Guru Gobind Singh Refinery (Bathinda)",
        "category": "refinery",
        "latitude": 29.9880,
        "longitude": 74.9250,
        "description": "Bathinda inland refinery surrounded by intense seasonal crop burning",
        "source": "VIIRS_Nightfire",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Northern_Punjab",
            "high_stubble_risk": True,
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "IOCL Mathura Refinery",
        "category": "refinery",
        "latitude": 27.3950,
        "longitude": 77.7050,
        "description": "Major strategic crude refinery serving the National Capital Region",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Northern_UP",
            "capacity_mmtpa": 8.0,
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "GAIL Pata Petrochemical Complex",
        "category": "petrochemical",
        "latitude": 26.6020,
        "longitude": 79.5250,
        "description": "Major gas cracker and polymer processing plant in Auraiya",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Northern_UP",
            "expected_baseline_frp_mw": 40.0
        }
    },
    {
        "name": "IFFCO Phulpur Mega Fertilizer Complex",
        "category": "petrochemical",
        "latitude": 25.5520,
        "longitude": 82.0750,
        "description": "Large-scale ammonia and urea synthesis plant in Prayagraj",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2000.0,
        "metadata": {
            "corridor": "Eastern_UP",
            "expected_baseline_frp_mw": 25.0
        }
    },
    {
        "name": "NTPC Dadri Super Thermal & Gas Power",
        "category": "power_plant",
        "latitude": 28.5980,
        "longitude": 77.5550,
        "description": "1,820 MW thermal and 830 MW combined cycle gas power plant",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2000.0,
        "metadata": {
            "corridor": "Northern_NCR",
            "expected_baseline_frp_mw": 25.0
        }
    },
    {
        "name": "NTPC Rihand Super Thermal Power Station",
        "category": "power_plant",
        "latitude": 24.0250,
        "longitude": 82.7950,
        "description": "3,000 MW coal-fired base load plant at Rihand Reservoir",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Eastern_UP",
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "Suratgarh Super Thermal Power Station",
        "category": "power_plant",
        "latitude": 29.1850,
        "longitude": 73.9050,
        "description": "2,820 MW coal-fired thermal power complex in northern Rajasthan",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2000.0,
        "metadata": {
            "corridor": "Northern_Rajasthan",
            "expected_baseline_frp_mw": 25.0
        }
    },

    # =========================================================================
    # 3. EASTERN METALLURGICAL, COAL & REFINING BELT (Jharkhand, Odisha, WB, Bihar)
    # =========================================================================
    {
        "name": "Tata Steel Jamshedpur Works",
        "category": "steel_mill",
        "latitude": 22.7845,
        "longitude": 86.2029,
        "description": "Integrated steel plant with multiple blast furnaces and coke ovens",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Eastern_Jharkhand",
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
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Eastern_Odisha",
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
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Eastern_Jharkhand",
            "expected_baseline_frp_mw": 70.0
        }
    },
    {
        "name": "SAIL Durgapur Steel Plant",
        "category": "steel_mill",
        "latitude": 23.5350,
        "longitude": 87.3150,
        "description": "Specialized alloy and wheel-and-axle integrated steel plant",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Eastern_WestBengal",
            "expected_baseline_frp_mw": 45.0
        }
    },
    {
        "name": "SAIL IISCO Steel Plant (Burnpur)",
        "category": "steel_mill",
        "latitude": 23.6650,
        "longitude": 86.9350,
        "description": "Modernized 2.5 MTPA blast furnace integrated steel plant",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2200.0,
        "metadata": {
            "corridor": "Eastern_WestBengal",
            "expected_baseline_frp_mw": 40.0
        }
    },
    {
        "name": "Tata Steel Kalinganagar",
        "category": "steel_mill",
        "latitude": 20.9650,
        "longitude": 86.0450,
        "description": "Ultra-modern 8 MTPA steel making facility in Jajpur",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Eastern_Odisha",
            "expected_baseline_frp_mw": 50.0
        }
    },
    {
        "name": "Jindal Steel & Power Angul Works",
        "category": "steel_mill",
        "latitude": 20.8450,
        "longitude": 85.0450,
        "description": "Mega steel plant with coal gasification and DRI technology",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 3000.0,
        "metadata": {
            "corridor": "Eastern_Odisha",
            "expected_baseline_frp_mw": 55.0
        }
    },
    {
        "name": "IOCL Paradip Mega Refinery",
        "category": "refinery",
        "latitude": 20.2920,
        "longitude": 86.6450,
        "description": "15 MMTPA coastal crude refinery with polypropylene plant",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 3000.0,
        "metadata": {
            "corridor": "Eastern_Odisha",
            "capacity_mmtpa": 15.0,
            "expected_baseline_frp_mw": 65.0
        }
    },
    {
        "name": "IOCL Haldia Refinery & Petrochemicals",
        "category": "refinery",
        "latitude": 22.0620,
        "longitude": 88.0950,
        "description": "Major coastal oil refinery and petrochemical complex in West Bengal",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Eastern_WestBengal",
            "capacity_mmtpa": 8.0,
            "expected_baseline_frp_mw": 40.0
        }
    },
    {
        "name": "IOCL Barauni Refinery",
        "category": "refinery",
        "latitude": 25.3850,
        "longitude": 85.9750,
        "description": "Inland crude oil refinery in Begusarai, Bihar",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2200.0,
        "metadata": {
            "corridor": "Eastern_Bihar",
            "capacity_mmtpa": 6.0,
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "Vedanta Aluminium Smelter & Power (Jharsuguda)",
        "category": "petrochemical",
        "latitude": 21.8250,
        "longitude": 84.0250,
        "description": "One of the world's largest single-location aluminium smelters (1.8 MTPA)",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 3000.0,
        "metadata": {
            "corridor": "Eastern_Odisha",
            "expected_baseline_frp_mw": 45.0
        }
    },
    {
        "name": "NALCO Aluminium Smelter (Angul)",
        "category": "petrochemical",
        "latitude": 20.8250,
        "longitude": 85.1550,
        "description": "Major public sector primary aluminium production and potline complex",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Eastern_Odisha",
            "expected_baseline_frp_mw": 40.0
        }
    },
    {
        "name": "NTPC Talcher Kaniha Super Thermal Power",
        "category": "power_plant",
        "latitude": 21.0950,
        "longitude": 85.0750,
        "description": "3,000 MW coal-fired mega power station",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Eastern_Odisha",
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "Jharia Coalfield Persistent Subsurface Fire Zone",
        "category": "coal_seam_fire",
        "latitude": 23.7432,
        "longitude": 86.4172,
        "description": "Century-old underground and open-cast coal fires with persistent high thermal output",
        "source": "satellite_historic",
        "buffer_radius_meters": 4000.0,
        "metadata": {
            "corridor": "Eastern_Jharkhand",
            "expected_baseline_frp_mw": 90.0
        }
    },

    # =========================================================================
    # 4. CENTRAL INDUSTRIAL, STEEL & POWER BELT (Chhattisgarh, Madhya Pradesh)
    # =========================================================================
    {
        "name": "SAIL Bhilai Steel Plant",
        "category": "steel_mill",
        "latitude": 21.1824,
        "longitude": 81.3920,
        "description": "India's prime rail and heavy plate manufacturer with multiple blast furnaces",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2800.0,
        "metadata": {
            "corridor": "Central_Chhattisgarh",
            "expected_baseline_frp_mw": 65.0
        }
    },
    {
        "name": "Bharat Oman Bina Refinery (BORL)",
        "category": "refinery",
        "latitude": 24.1650,
        "longitude": 78.1850,
        "description": "Central Indian petroleum refinery in Sagar district",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Central_MP",
            "capacity_mmtpa": 7.8,
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "NTPC Vindhyachal Super Thermal Power Station",
        "category": "power_plant",
        "latitude": 24.0980,
        "longitude": 82.6720,
        "description": "India's largest thermal power station with 4,760 MW installed capacity",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 3000.0,
        "metadata": {
            "corridor": "Central_MP_UP",
            "capacity_mw": 4760,
            "expected_baseline_frp_mw": 45.0
        }
    },
    {
        "name": "NTPC Korba Super Thermal Power Station",
        "category": "power_plant",
        "latitude": 22.3850,
        "longitude": 82.6850,
        "description": "2,600 MW pit-head coal power station in Chhattisgarh",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Central_Chhattisgarh",
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "NTPC Sipat Super Thermal Power Station",
        "category": "power_plant",
        "latitude": 22.1350,
        "longitude": 82.2950,
        "description": "2,980 MW supercritical thermal power plant near Bilaspur",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Central_Chhattisgarh",
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "Jindal Steel & Power Raigarh Works",
        "category": "steel_mill",
        "latitude": 21.9050,
        "longitude": 83.3950,
        "description": "Integrated steel plant and world's largest coal-based sponge iron plant",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Central_Chhattisgarh",
            "expected_baseline_frp_mw": 50.0
        }
    },
    {
        "name": "BALCO Aluminium Smelter Complex (Korba)",
        "category": "petrochemical",
        "latitude": 22.3950,
        "longitude": 82.7450,
        "description": "Bharat Aluminium Company primary smelter and captive power unit",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2200.0,
        "metadata": {
            "corridor": "Central_Chhattisgarh",
            "expected_baseline_frp_mw": 40.0
        }
    },
    {
        "name": "Hindalco Mahan Aluminium & Smelter (Bargawan)",
        "category": "petrochemical",
        "latitude": 24.1950,
        "longitude": 82.3850,
        "description": "Greenfield 360,000 TPA aluminium smelter with 900 MW captive power",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2200.0,
        "metadata": {
            "corridor": "Central_MP",
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "Hindalco Renukoot Aluminium Works",
        "category": "petrochemical",
        "latitude": 24.2150,
        "longitude": 83.0350,
        "description": "Integrated alumina refinery and aluminium smelting complex",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2200.0,
        "metadata": {
            "corridor": "Central_UP",
            "expected_baseline_frp_mw": 35.0
        }
    },

    # =========================================================================
    # 5. SOUTHERN REFINING, STEEL & HEAVY INDUSTRIAL CORRIDOR (Karnataka, AP, TN, Kerala, Telangana)
    # =========================================================================
    {
        "name": "MRPL Mangalore Refinery & Petrochemicals",
        "category": "refinery",
        "latitude": 12.9950,
        "longitude": 74.8450,
        "description": "15 MMTPA coastal crude oil refinery in Dakshina Kannada",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Southern_Karnataka",
            "capacity_mmtpa": 15.0,
            "expected_baseline_frp_mw": 45.0
        }
    },
    {
        "name": "JSW Steel Vijayanagar Works (Toranagallu)",
        "category": "steel_mill",
        "latitude": 15.1750,
        "longitude": 76.6650,
        "description": "India's largest single-site integrated steel plant (12 MTPA capacity)",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 3500.0,
        "metadata": {
            "corridor": "Southern_Karnataka",
            "expected_baseline_frp_mw": 65.0
        }
    },
    {
        "name": "RINL Visakhapatnam Steel Plant",
        "category": "steel_mill",
        "latitude": 17.6350,
        "longitude": 83.1850,
        "description": "Rashtriya Ispat Nigam shore-based 7.3 MTPA integrated steel plant",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 3000.0,
        "metadata": {
            "corridor": "Southern_AndhraPradesh",
            "expected_baseline_frp_mw": 50.0
        }
    },
    {
        "name": "HPCL Visakhapatnam Refinery",
        "category": "refinery",
        "latitude": 17.6970,
        "longitude": 83.2560,
        "description": "East coast marine crude refinery and petrochemical terminal",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2200.0,
        "metadata": {
            "corridor": "Southern_AndhraPradesh",
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "ONGC Tatipaka Gas Terminal & Mini Refinery",
        "category": "gas_flare",
        "latitude": 16.5250,
        "longitude": 81.8650,
        "description": "Krishna-Godavari basin natural gas sweetening and mini-refinery",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2000.0,
        "metadata": {
            "corridor": "Southern_AndhraPradesh",
            "expected_baseline_frp_mw": 30.0
        }
    },
    {
        "name": "NTPC Ramagundam Super Thermal Power Station",
        "category": "power_plant",
        "latitude": 18.7550,
        "longitude": 79.4650,
        "description": "2,600 MW base load thermal plant in Godavarikhani, Telangana",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Southern_Telangana",
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "NTPC Simhadri Super Thermal Power Station",
        "category": "power_plant",
        "latitude": 17.6050,
        "longitude": 83.0850,
        "description": "2,000 MW coastal coal-fired power station near Visakhapatnam",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2200.0,
        "metadata": {
            "corridor": "Southern_AndhraPradesh",
            "expected_baseline_frp_mw": 30.0
        }
    },
    {
        "name": "CPCL Manali Refinery (Chennai)",
        "category": "refinery",
        "latitude": 13.1670,
        "longitude": 80.2670,
        "description": "Coastal petrochemical and crude refining cluster in North Chennai",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2200.0,
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
        "description": "Major petrochemical crude refining complex in Kerala (15.5 MMTPA)",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Southern_Kerala",
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "NLC Neyveli Lignite Thermal Power & Mines",
        "category": "power_plant",
        "latitude": 11.5950,
        "longitude": 79.4850,
        "description": "Open-cast lignite mining and 3,390 MW pit-head power generation complex",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 3000.0,
        "metadata": {
            "corridor": "Southern_TamilNadu",
            "expected_baseline_frp_mw": 35.0
        }
    },
    {
        "name": "Thoothukudi SIPCOT Industrial & Copper Complex",
        "category": "petrochemical",
        "latitude": 8.8150,
        "longitude": 78.1350,
        "description": "Major coastal industrial estate and smelting corridor in southern Tamil Nadu",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2500.0,
        "metadata": {
            "corridor": "Southern_TamilNadu",
            "expected_baseline_frp_mw": 30.0
        }
    },

    # =========================================================================
    # 6. NORTHEASTERN PETROLEUM & REFINING CORRIDOR (Assam)
    # =========================================================================
    {
        "name": "Numaligarh Refinery Limited (NRL)",
        "category": "refinery",
        "latitude": 26.5850,
        "longitude": 93.7450,
        "description": "Major Northeast petroleum refinery in Golaghat, Assam",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2200.0,
        "metadata": {
            "corridor": "Northeastern_Assam",
            "capacity_mmtpa": 3.0,
            "expected_baseline_frp_mw": 30.0
        }
    },
    {
        "name": "IOCL Bongaigaon Refinery & Petrochemicals",
        "category": "refinery",
        "latitude": 26.4950,
        "longitude": 90.5250,
        "description": "Integrated crude refinery and DMT/polyester staple fiber plant",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 2200.0,
        "metadata": {
            "corridor": "Northeastern_Assam",
            "capacity_mmtpa": 2.7,
            "expected_baseline_frp_mw": 25.0
        }
    },
    {
        "name": "IOCL Guwahati Refinery (Noonmati)",
        "category": "refinery",
        "latitude": 26.1950,
        "longitude": 91.7950,
        "description": "India's first public sector refinery commissioned in 1962",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 1800.0,
        "metadata": {
            "corridor": "Northeastern_Assam",
            "capacity_mmtpa": 1.0,
            "expected_baseline_frp_mw": 20.0
        }
    },
    {
        "name": "IOCL Digboi Historic Refinery & Oilfield",
        "category": "refinery",
        "latitude": 27.3850,
        "longitude": 95.6250,
        "description": "World's oldest continuously operating oil refinery in Tinsukia, Assam",
        "source": "OSM_Industrial",
        "buffer_radius_meters": 1800.0,
        "metadata": {
            "corridor": "Northeastern_Assam",
            "capacity_mmtpa": 0.65,
            "expected_baseline_frp_mw": 20.0
        }
    },
]
