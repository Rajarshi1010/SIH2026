"""
backend/schemas.py - Data Validation Schemas & RFC 7946 GeoJSON Models

Implements Pydantic v2 schemas for spatial inputs, bounding boxes,
incident ingestion/retrieval, and standardized RFC 7946 GeoJSON representations.
"""

from datetime import datetime
from typing import Any, Dict, Generic, List, Literal, Optional, Tuple, TypeVar, Union
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ------------------------------------------------------------------------------
# 1. Coordinate & Spatial Query Schemas
# ------------------------------------------------------------------------------
class Coordinate(BaseModel):
    """Represents a standard WGS84 geographic coordinate pair."""
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude [-90.0 to 90.0]")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude [-180.0 to 180.0]")


class BoundingBox(BaseModel):
    """
    Geographic bounding box for spatial window queries.
    Enforces min <= max constraints on latitude and longitude.
    """
    min_lat: float = Field(..., ge=-90.0, le=90.0, description="Minimum latitude (South)")
    min_lon: float = Field(..., ge=-180.0, le=180.0, description="Minimum longitude (West)")
    max_lat: float = Field(..., ge=-90.0, le=90.0, description="Maximum latitude (North)")
    max_lon: float = Field(..., ge=-180.0, le=180.0, description="Maximum longitude (East)")

    @model_validator(mode="after")
    def validate_bounds(self) -> "BoundingBox":
        if self.min_lat > self.max_lat:
            raise ValueError(f"min_lat ({self.min_lat}) cannot exceed max_lat ({self.max_lat})")
        if self.min_lon > self.max_lon:
            raise ValueError(f"min_lon ({self.min_lon}) cannot exceed max_lon ({self.max_lon})")
        return self

    def to_rfc7946_bbox(self) -> List[float]:
        """Returns [min_lon, min_lat, max_lon, max_lat] per RFC 7946."""
        return [self.min_lon, self.min_lat, self.max_lon, self.max_lat]


class SpatialRadiusQuery(Coordinate):
    """Query model for radial nearest-neighbor or perimeter buffer searches."""
    radius_km: float = Field(default=5.0, gt=0.0, le=500.0, description="Radius in kilometers")


# ------------------------------------------------------------------------------
# 2. RFC 7946 Standard GeoJSON Models
# ------------------------------------------------------------------------------
GeoJsonPointCoordinates = Tuple[float, float]  # [lon, lat] per RFC 7946
GeoJsonPolygonRing = List[GeoJsonPointCoordinates]
GeoJsonPolygonCoordinates = List[GeoJsonPolygonRing]


class PointGeometry(BaseModel):
    """RFC 7946 GeoJSON Point Geometry."""
    type: Literal["Point"] = "Point"
    coordinates: GeoJsonPointCoordinates = Field(
        ..., description="[longitude, latitude] in WGS84"
    )

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(cls, v: GeoJsonPointCoordinates) -> GeoJsonPointCoordinates:
        lon, lat = v
        if not (-180.0 <= lon <= 180.0):
            raise ValueError(f"Longitude {lon} out of bounds [-180.0, 180.0]")
        if not (-90.0 <= lat <= 90.0):
            raise ValueError(f"Latitude {lat} out of bounds [-90.0, 90.0]")
        return v


class PolygonGeometry(BaseModel):
    """RFC 7946 GeoJSON Polygon Geometry."""
    type: Literal["Polygon"] = "Polygon"
    coordinates: GeoJsonPolygonCoordinates = Field(
        ..., description="List of linear rings, first is exterior, subsequent are interior holes"
    )


GeometryType = Union[PointGeometry, PolygonGeometry]
PropsT = TypeVar("PropsT", bound=Union[Dict[str, Any], BaseModel])
GeomT = TypeVar("GeomT", bound=GeometryType)


class Feature(BaseModel, Generic[GeomT, PropsT]):
    """Standard RFC 7946 GeoJSON Feature."""
    type: Literal["Feature"] = "Feature"
    geometry: GeomT
    properties: PropsT
    id: Optional[Union[str, int, uuid.UUID]] = None
    bbox: Optional[List[float]] = None

    model_config = ConfigDict(from_attributes=True)


class FeatureCollection(BaseModel, Generic[GeomT, PropsT]):
    """Standard RFC 7946 GeoJSON FeatureCollection."""
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[Feature[GeomT, PropsT]]
    bbox: Optional[List[float]] = None

    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------------------
# 3. Known Emitter Schemas
# ------------------------------------------------------------------------------
class KnownEmitterBase(BaseModel):
    name: str = Field(..., max_length=255)
    category: str = Field(..., max_length=100)
    description: Optional[str] = None
    source: str = Field(default="OSM", max_length=100)
    h3_index: Optional[str] = Field(default=None, max_length=15)
    confidence_score: float = Field(default=1.0, ge=0.0, le=1.0)
    buffer_radius_meters: float = Field(default=500.0, gt=0.0)
    metadata_json: Optional[Dict[str, Any]] = None


class KnownEmitterCreate(KnownEmitterBase):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)


class KnownEmitterResponse(KnownEmitterBase):
    id: uuid.UUID
    latitude: float
    longitude: float
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------------------
# 4. Thermal Incident Schemas
# ------------------------------------------------------------------------------
class ThermalIncidentBase(BaseModel):
    detected_at: datetime
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    h3_index: Optional[str] = Field(default=None, max_length=15)
    brightness: float = Field(..., gt=0.0, description="Kelvin brightness temperature")
    scan: Optional[float] = None
    track: Optional[float] = None
    satellite: Optional[str] = Field(default="VIIRS", max_length=50)
    instrument: Optional[str] = Field(default="VIIRS", max_length=50)
    confidence: str = Field(..., max_length=20)
    version: Optional[str] = Field(default=None, max_length=20)
    bright_t31: Optional[float] = None
    frp: float = Field(..., ge=0.0, description="Fire Radiative Power (MW)")
    daynight: Optional[str] = Field(default=None, max_length=5)
    classification: str = Field(default="unclassified", max_length=50)
    classification_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    is_industrial: bool = False
    emitter_id: Optional[uuid.UUID] = None
    distance_to_emitter_meters: Optional[float] = None
    raw_metadata: Optional[Dict[str, Any]] = None


class ThermalIncidentCreate(ThermalIncidentBase):
    """Input validation model for ingesting a thermal anomaly record."""
    pass


class ThermalIncidentResponse(ThermalIncidentBase):
    """Output serialization model for a thermal anomaly incident."""
    id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Incident GeoJSON Types
ThermalIncidentFeature = Feature[PointGeometry, ThermalIncidentResponse]
ThermalIncidentFeatureCollection = FeatureCollection[PointGeometry, ThermalIncidentResponse]


# ------------------------------------------------------------------------------
# 5. Review Queue & HITL Schemas
# ------------------------------------------------------------------------------
class ReviewQueueBase(BaseModel):
    incident_id: uuid.UUID
    incident_detected_at: datetime
    status: str = Field(default="pending", max_length=50)
    priority: str = Field(default="medium", max_length=20)
    assigned_to: Optional[str] = Field(default=None, max_length=100)
    reviewer_notes: Optional[str] = None
    ai_classification: str = Field(..., max_length=50)
    ai_confidence: float = Field(..., ge=0.0, le=1.0)
    human_verdict: Optional[str] = Field(default=None, max_length=50)
    resolution_reason: Optional[str] = None


class ReviewQueueCreate(ReviewQueueBase):
    pass


class ReviewQueueResponse(ReviewQueueBase):
    id: uuid.UUID
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------------------
# 6. System Health Response Schema
# ------------------------------------------------------------------------------
class SystemHealthResponse(BaseModel):
    status: Literal["healthy", "degraded", "unhealthy"]
    timestamp: datetime
    app_name: str
    environment: str
    database: Dict[str, Any]
    redis: Dict[str, Any]
