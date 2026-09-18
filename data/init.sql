-- ==============================================================================
-- GeoAI Industrial Fire Classifier - Database Initialization Script
-- Engine: PostgreSQL 16 + TimescaleDB + PostGIS
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ------------------------------------------------------------------------------
-- 2. Table: known_emitters
-- Reference catalog of persistent industrial thermal emitters (refineries,
-- power plants, steel mills, cement kilns, flare stacks).
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS known_emitters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- 'refinery', 'power_plant', 'steel_mill', 'cement_kiln', 'gas_flare', 'industrial'
    description TEXT,
    source VARCHAR(100) NOT NULL DEFAULT 'OSM', -- 'OSM', 'satellite_historic', 'regulatory', 'manual'
    h3_index VARCHAR(15), -- H3 spatial cell index for fast O(1) hexagonal lookup
    confidence_score DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    buffer_radius_meters DOUBLE PRECISION NOT NULL DEFAULT 500.0,
    geom geometry(Point, 4326) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for known_emitters
CREATE INDEX IF NOT EXISTS idx_known_emitters_geom ON known_emitters USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_known_emitters_h3 ON known_emitters (h3_index);
CREATE INDEX IF NOT EXISTS idx_known_emitters_category ON known_emitters (category);

-- ------------------------------------------------------------------------------
-- 3. Table: thermal_incidents
-- High-throughput ingest of remote sensing thermal anomalies (NASA FIRMS / VIIRS / MODIS).
-- Partitioned by detected_at as a TimescaleDB hypertable.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS thermal_incidents (
    id UUID DEFAULT gen_random_uuid(),
    detected_at TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geom geometry(Point, 4326) NOT NULL,
    h3_index VARCHAR(15) NOT NULL,
    brightness DOUBLE PRECISION NOT NULL,       -- Kelvin (Channel 21/I-4)
    scan DOUBLE PRECISION,
    track DOUBLE PRECISION,
    satellite VARCHAR(50) DEFAULT 'VIIRS',     -- e.g., 'SNPP', 'NOAA-20', 'Aqua', 'Terra'
    instrument VARCHAR(50) DEFAULT 'VIIRS',    -- 'VIIRS' or 'MODIS'
    confidence VARCHAR(20) NOT NULL,           -- 'low', 'nominal', 'high'
    version VARCHAR(20),
    bright_t31 DOUBLE PRECISION,               -- Channel I-5 / T31 (Kelvin)
    frp DOUBLE PRECISION NOT NULL,              -- Fire Radiative Power (MW)
    daynight VARCHAR(5),                       -- 'D' or 'N'
    classification VARCHAR(50) NOT NULL DEFAULT 'unclassified', -- 'forest_fire', 'industry', 'refinery', 'other', 'unclassified'
    classification_confidence DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    is_industrial BOOLEAN NOT NULL DEFAULT FALSE,
    emitter_id UUID REFERENCES known_emitters(id) ON DELETE SET NULL,
    distance_to_emitter_meters DOUBLE PRECISION,
    raw_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, detected_at)
);

-- Transform thermal_incidents into a TimescaleDB Hypertable partitioned by detected_at
SELECT create_hypertable(
    'thermal_incidents',
    'detected_at',
    if_not_exists => TRUE,
    migrate_data => TRUE
);

-- Indexes for thermal_incidents
CREATE INDEX IF NOT EXISTS idx_thermal_incidents_geom ON thermal_incidents USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_thermal_incidents_h3 ON thermal_incidents (h3_index);
CREATE INDEX IF NOT EXISTS idx_thermal_incidents_classification ON thermal_incidents (classification);
CREATE INDEX IF NOT EXISTS idx_thermal_incidents_is_industrial ON thermal_incidents (is_industrial);
CREATE INDEX IF NOT EXISTS idx_thermal_incidents_detected_at ON thermal_incidents (detected_at DESC);

-- ------------------------------------------------------------------------------
-- 4. Table: review_queue
-- Human-In-The-Loop (HITL) triage and verification audit trail for edge cases,
-- high-impact industrial fires, and ambiguous classifications.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL,
    incident_detected_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'under_review', 'verified_industrial', 'verified_wildfire', 'false_positive', 'dismissed'
    priority VARCHAR(20) NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    assigned_to VARCHAR(100),
    reviewer_notes TEXT,
    ai_classification VARCHAR(50) NOT NULL,
    ai_confidence DOUBLE PRECISION NOT NULL,
    human_verdict VARCHAR(50),
    resolution_reason TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for review_queue
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue (status);
CREATE INDEX IF NOT EXISTS idx_review_queue_priority ON review_queue (priority);
CREATE INDEX IF NOT EXISTS idx_review_queue_incident ON review_queue (incident_id, incident_detected_at);
