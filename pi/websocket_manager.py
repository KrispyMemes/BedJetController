"""
websocket_manager.py — WebSocket connection manager

This module keeps track of all the phones currently connected via WebSocket
and broadcasts BedJet status updates to all of them simultaneously.

How it fits in the system:
  - The FastAPI /ws endpoint calls manager.connect(ws) when a phone connects
  - The BedJetBLE class calls manager.broadcast(status) when the BedJet
    sends a status update
  - If a phone disconnects, it's automatically removed from the list
"""

import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """
    Tracks active WebSocket connections and broadcasts to all of them.

    This is intentionally simple — just a set of connections with connect,
    disconnect, and broadcast methods.
    """

    def __init__(self):
        # A set of all currently connected WebSocket clients (the phones).
        # We use a set so adding/removing is fast and duplicates are impossible.
        self.connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        """
        Accept a new WebSocket connection and add it to the active set.

        Must be called before you can send anything to this client.

        Args:
            ws: The WebSocket object from the FastAPI route handler.
        """
        await ws.accept()
        self.connections.add(ws)
        logger.info("WebSocket client connected. Total connected: %d", len(self.connections))

    def disconnect(self, ws: WebSocket):
        """
        Remove a WebSocket connection from the active set.

        Safe to call even if the connection isn't in the set (uses discard
        instead of remove so it won't raise an error).

        Args:
            ws: The WebSocket object to remove.
        """
        self.connections.discard(ws)
        logger.info("WebSocket client disconnected. Total connected: %d", len(self.connections))

    async def broadcast(self, data: dict):
        """
        Send a status update to every connected phone.

        This is registered as the status_callback on BedJetBLE, so it's
        called automatically every time the BedJet sends a status update.

        If a phone's connection has gone stale (e.g. phone went to sleep),
        the send will raise an exception and that phone is quietly removed.

        Args:
            data: The status dict from BedJetBLE._on_notification. Will be
                  sent as JSON to every connected client.
        """
        if not self.connections:
            return  # No phones connected — nothing to do

        # Iterate over a copy of the set. This is important: if we remove a
        # disconnected client mid-loop, iterating over the original set would
        # raise a "Set changed size during iteration" RuntimeError.
        dead_connections = set()

        for ws in set(self.connections):
            try:
                await ws.send_json(data)
            except Exception as e:
                # The connection is broken — mark it for removal
                logger.warning("Failed to send to WebSocket client, removing: %s", e)
                dead_connections.add(ws)

        # Clean up dead connections after the loop
        for ws in dead_connections:
            self.disconnect(ws)
