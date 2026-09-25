"""
Backend/ws.py - Real-Time WebSocket Connection & Broadcast Manager
Layer 6 GIS real-time alert distribution for MapLibre / OpenLayers / React UI.
"""

from typing import Any, Dict, Set
from fastapi import WebSocket


class ConnectionManager:
    """Manages active WebSocket connections for real-time fire alerting."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.active_connections.discard(connection)


# Global singleton instance
ws_manager = ConnectionManager()
