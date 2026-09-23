"""
backend/config.py - Production Configuration Management

Implements Pydantic v2 BaseSettings for type-safe environment configuration,
strict validation, and fallback derivations for PostgreSQL, Redis, and Geospatial parameters.
"""

from functools import lru_cache
import json
from typing import List, Literal, Optional, Union
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application Settings for GeoAI Industrial Fire Classifier.
    Reads environment variables from the OS environment and local .env files.
    """

    # --- Core Application ---
    APP_NAME: str = "GeoAI Industrial Fire Classifier"
    APP_ENV: str = "development"
    DEBUG: bool = False
    API_V1_STR: str = "/api/v1"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ADMIN_API_KEY: Optional[str] = None

    # --- Security & CORS ---
    SECRET_KEY: str = "insecure_dev_secret_key_please_override_in_production"
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            v_trimmed = v.strip()
            if v_trimmed.startswith("[") and v_trimmed.endswith("]"):
                try:
                    parsed = json.loads(v_trimmed)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed]
                except json.JSONDecodeError:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        elif isinstance(v, list):
            return [str(item).strip() for item in v]
        return []

    # --- Storage Engine (Pure DuckDB Vectorized In-Process) ---
    STORAGE_ENGINE: Literal["duckdb"] = "duckdb"
    DUCKDB_PATH: str = "data/india_geoai.db"

    @field_validator("STORAGE_ENGINE", mode="before")
    @classmethod
    def validate_storage_engine(cls, v: str) -> str:
        if v and str(v).lower() != "duckdb":
            raise ValueError(
                f"Unsupported STORAGE_ENGINE '{v}'. The platform has migrated exclusively to the "
                "embedded DuckDB engine ('duckdb'). PostgreSQL and TimescaleDB are deprecated and removed."
            )
        return "duckdb"

    # --- Redis Distributed Cache ---
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: Optional[str] = None
    REDIS_DB: int = 0
    REDIS_URL: Optional[str] = None

    # --- NASA FIRMS & Remote Sensing ---
    FIRMS_MAP_KEY: Optional[str] = "cc1453ca7f4aee96699a0c8d4a63b205"
    FIRMS_API_URL: str = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
    # Strategic Operational Bounding Box [min_lon, min_lat, max_lon, max_lat]
    # Encompasses the entire Indian territory (West: Gujarat 68E, South: Great Nicobar 6N, East: Arunachal 98E, North: Ladakh 38N)
    OPERATIONAL_BBOX: str = "68,6,98,38"

    # --- Layer 5: STAC API & Optical Verification (Sentinel-2) ---
    STAC_API_URL: str = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
    STAC_COLLECTION: str = "sentinel-2-l2a"
    DELTA_NBR_BURN_THRESHOLD: float = 0.27

    # --- Geospatial Parameters ---
    H3_RESOLUTION: int = Field(default=7, ge=0, le=15)
    SPATIAL_SEARCH_RADIUS_KM: float = Field(default=5.0, gt=0.0)
    EMITTER_MATCH_BUFFER_METERS: float = Field(default=500.0, gt=0.0)

    @model_validator(mode="after")
    def assemble_connection_strings(self) -> "Settings":
        """Derive and normalize Redis connection string if not explicitly configured."""
        if not self.REDIS_URL:
            auth = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
            self.REDIS_URL = (
                f"redis://{auth}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
            )
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )


@lru_cache()
def get_settings() -> Settings:
    """Cached accessor for singleton application settings."""
    return Settings()


settings = get_settings()
