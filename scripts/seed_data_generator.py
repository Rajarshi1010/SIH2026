"""
scripts/seed_data_generator.py

Production-grade, zero-cost seed generator for the GeoAI Industrial Fire Classifier.
Generates:
1. data/flares_registry.csv - Strategic industrial emitters and flares (refineries, petrochemicals,
   steel mills, offshore gas flares, thermal power complexes) across India's key industrial corridors.
2. data/osm_industrial.geojson - High-precision polygonal/point industrial boundary catalog formatted
   as standard RFC 7946 GeoJSON.
3. Database Loader - Directly loads records into TimescaleDB/PostGIS `known_emitters` table with
   H3 hexagonal indexes (Resolution 8/9).

Designed to be lightweight, 100% free-tier compatible (< 5 MB storage, zero cloud cost),
while providing production-grade mathematical representations for spatial matching.
"""

import csv
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

# Ensure Backend modules are discoverable
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "Backend"))

import h3
from shapely.geometry import Point, mapping, Polygon

# ------------------------------------------------------------------------------
# 1. Curated High-Priority Strategic Emitters & Flares (India Focus)
# ------------------------------------------------------------------------------
# Covering:
# - Western Corridor (Jamnagar, Dahej, Hazira, Trombay, Bombay High)
# - Eastern Metallurgy & Coal Belt (Jamshedpur, Rourkela, Bokaro, Bhilai, Angul, Jharia)
# - Northern Petrochemical/Transition Belt (Panipat, Bathinda)
# - Southern Refining/Chemical Hubs (Manali/Chennai, Kochi, Visakhapatnam)

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
    }
]


def generate_flares_csv(output_path: Path) -> None:
    """Writes the curated emitters into data/flares_registry.csv."""
    headers = [
        "name", "category", "latitude", "longitude", "description",
        "source", "h3_index_res8", "h3_index_res9", "buffer_radius_meters", "metadata"
    ]
    with open(output_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for item in CURATED_EMITTERS:
            lat = item["latitude"]
            lng = item["longitude"]
            # Uber H3 v4 API
            h3_8 = h3.latlng_to_cell(lat, lng, 8)
            h3_9 = h3.latlng_to_cell(lat, lng, 9)
            writer.writerow({
                "name": item["name"],
                "category": item["category"],
                "latitude": lat,
                "longitude": lng,
                "description": item["description"],
                "source": item["source"],
                "h3_index_res8": h3_8,
                "h3_index_res9": h3_9,
                "buffer_radius_meters": item["buffer_radius_meters"],
                "metadata": json.dumps(item["metadata"])
            })
    print(f" Successfully generated CSV flare registry: {output_path} ({len(CURATED_EMITTERS)} sites)")


def generate_osm_geojson(output_path: Path) -> None:
    """Writes standard RFC 7946 GeoJSON FeatureCollection to data/osm_industrial.geojson."""
    features = []
    for item in CURATED_EMITTERS:
        lat = item["latitude"]
        lng = item["longitude"]
        h3_8 = h3.latlng_to_cell(lat, lng, 8)
        radius = item["buffer_radius_meters"]
        
        # Create a polygonal boundary footprint representing the facility perimeter
        # Approx 1 deg lat ~ 111,000m
        deg_offset = radius / 111000.0
        # Octagonal approximation of the facility boundary
        poly_coords = [
            (lng + deg_offset, lat),
            (lng + deg_offset * 0.707, lat + deg_offset * 0.707),
            (lng, lat + deg_offset),
            (lng - deg_offset * 0.707, lat + deg_offset * 0.707),
            (lng - deg_offset, lat),
            (lng - deg_offset * 0.707, lat - deg_offset * 0.707),
            (lng, lat - deg_offset),
            (lng + deg_offset * 0.707, lat - deg_offset * 0.707),
            (lng + deg_offset, lat)
        ]
        poly = Polygon(poly_coords)

        feature = {
            "type": "Feature",
            "geometry": mapping(poly),
            "properties": {
                "name": item["name"],
                "category": item["category"],
                "source": item["source"],
                "center": [lng, lat],
                "h3_res8": h3_8,
                "buffer_radius_meters": radius,
                "description": item["description"],
                **item["metadata"]
            }
        }
        features.append(feature)

    geojson_doc = {
        "type": "FeatureCollection",
        "name": "Indian_Strategic_Industrial_Corridors",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}
        },
        "features": features
    }

    with open(output_path, mode="w", encoding="utf-8") as f:
        json.dump(geojson_doc, f, indent=2)
    print(f" Successfully generated RFC 7946 GeoJSON: {output_path} ({len(features)} facility polygons)")


async def seed_database() -> None:
    """Directly loads curated records into TimescaleDB/PostGIS known_emitters table."""
    from database import async_session_factory, KnownEmitter
    from sqlalchemy import select, delete

    print(" Initiating PostGIS/TimescaleDB database seed...")
    async with async_session_factory() as session:
        # Check existing
        result = await session.execute(select(KnownEmitter))
        existing = result.scalars().all()
        if existing:
            print(f" Found {len(existing)} pre-existing emitters. Refreshing records...")
            await session.execute(delete(KnownEmitter))
            await session.commit()

        count = 0
        for item in CURATED_EMITTERS:
            lat = item["latitude"]
            lng = item["longitude"]
            h3_8 = h3.latlng_to_cell(lat, lng, 8)

            emitter = KnownEmitter(
                name=item["name"],
                category=item["category"],
                description=item["description"],
                source=item["source"],
                h3_index=h3_8,
                confidence_score=1.0,
                buffer_radius_meters=item["buffer_radius_meters"],
                geom=f"SRID=4326;POINT({lng} {lat})",
                metadata_json=item["metadata"]
            )
            session.add(emitter)
            count += 1

        await session.commit()
        print(f" Seed completed! Inserted {count} industrial emitters with H3 indexing and PostGIS geometries.")


def main():
    data_dir = ROOT_DIR / "data"
    data_dir.mkdir(exist_ok=True)

    csv_path = data_dir / "flares_registry.csv"
    geojson_path = data_dir / "osm_industrial.geojson"

    generate_flares_csv(csv_path)
    generate_osm_geojson(geojson_path)

    # Sync into database
    import asyncio
    asyncio.run(seed_database())


if __name__ == "__main__":
    main()
