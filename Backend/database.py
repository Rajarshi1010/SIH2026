"""
backend/database.py - Asynchronous Database Infrastructure & GeoAlchemy2 ORM Models

Configures SQLAlchemy 2.0 async engine, scoped async sessionmaker,
and type-annotated ORM models mapping 1:1 to PostGIS and TimescaleDB tables.
"""

from datetime import datetime
from typing import Any, AsyncGenerator, Dict, Optional
import uuid

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from config import settings

# ------------------------------------------------------------------------------
# 1. Engine & Session Management
# ------------------------------------------------------------------------------
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for scoped asynchronous database sessions."""
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ------------------------------------------------------------------------------
# 2. Declarative Base
# ------------------------------------------------------------------------------
class Base(DeclarativeBase):
    """Base class for all SQLAlchemy declarative models."""
    pass


# ------------------------------------------------------------------------------
# 3. GeoAlchemy2 ORM Models
# ------------------------------------------------------------------------------
class KnownEmitter(Base):
    """
    Catalog of known persistent industrial thermal emitters.
    Indexed with spatial GIST on geometry and B-tree on H3 hexagonal index.
    """
    __tablename__ = "known_emitters"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(
        String(100), nullable=False, default="OSM"
    )
    h3_index: Mapped[Optional[str]] = mapped_column(
        String(15), nullable=True, index=True
    )
    confidence_score: Mapped[float] = mapped_column(
        Float, nullable=False, default=1.0
    )
    buffer_radius_meters: Mapped[float] = mapped_column(
        Float, nullable=False, default=500.0
    )
    geom: Mapped[Geometry] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=False,
    )
    metadata_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        "metadata", JSONB, nullable=True, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class ThermalIncident(Base):
    """
    TimescaleDB hypertable partition of satellite thermal telemetry.
    Composite primary key (id, detected_at) strictly required by TimescaleDB partitioning.
    """
    __tablename__ = "thermal_incidents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False, index=True
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    geom: Mapped[Geometry] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=False,
    )
    h3_index: Mapped[str] = mapped_column(String(15), nullable=False, index=True)
    brightness: Mapped[float] = mapped_column(Float, nullable=False)
    scan: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    track: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    satellite: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True, default="VIIRS"
    )
    instrument: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True, default="VIIRS"
    )
    confidence: Mapped[str] = mapped_column(String(20), nullable=False)
    version: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    bright_t31: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    frp: Mapped[float] = mapped_column(Float, nullable=False)
    daynight: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    classification: Mapped[str] = mapped_column(
        String(50), nullable=False, default="unclassified", index=True
    )
    classification_confidence: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    is_industrial: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, index=True
    )
    emitter_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("known_emitters.id", ondelete="SET NULL"),
        nullable=True,
    )
    distance_to_emitter_meters: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    raw_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ReviewQueue(Base):
    """
    Human-In-The-Loop triage queue for suspicious or high-impact thermal events.
    """
    __tablename__ = "review_queue"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    incident_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    incident_detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending", index=True
    )
    priority: Mapped[str] = mapped_column(
        String(20), nullable=False, default="medium", index=True
    )
    assigned_to: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reviewer_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_classification: Mapped[str] = mapped_column(String(50), nullable=False)
    ai_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    human_verdict: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    resolution_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        Index("idx_review_queue_incident", "incident_id", "incident_detected_at"),
    )
