"""
main.py — Entry point for the BedJet Pi server

This file does three things:
  1. Reads the BedJet MAC address from the environment
  2. Starts a background task that maintains the BLE connection to the BedJet
  3. Starts the FastAPI web server so phones can connect

The key design decision here is the "lifespan" pattern. FastAPI's lifespan
context manager is the correct way to run startup/shutdown code — it ensures
the BLE task starts after uvicorn's event loop is ready, and gets cancelled
cleanly when the server shuts down (Ctrl+C or systemd stop).

Run this file directly:
    python main.py

Or via uvicorn (same thing, just explicit):
    uvicorn main:app --host 0.0.0.0 --port 8000
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI

from api import router
from bedjet_ble import BedJetBLE
from websocket_manager import WebSocketManager

# ---------------------------------------------------------------------------
# Logging setup
#
# Logs go to stdout, which systemd captures into the journal.
# View logs with: journalctl -u bedjet -f
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# Load .env file if present (useful for development)
# In production, BEDJET_MAC is set in bedjet.service instead
load_dotenv()


# ---------------------------------------------------------------------------
# Lifespan — startup and shutdown logic
#
# Everything inside "async with lifespan(app)" runs for the lifetime of the
# server. The code before "yield" runs at startup; after "yield" at shutdown.
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP ---

    # Read the BedJet MAC address from the environment.
    # Set this in your shell (export BEDJET_MAC=...) or in bedjet.service.
    mac_address = os.environ.get("BEDJET_MAC", "")
    if not mac_address:
        logger.error(
            "BEDJET_MAC environment variable is not set. "
            "Set it to your BedJet's Bluetooth MAC address, e.g.: "
            "export BEDJET_MAC=AA:BB:CC:DD:EE:FF"
        )
        # We still start the server so the app can show a "not connected" state
        # rather than refusing to start at all.

    logger.info("Starting BedJet server (BedJet MAC: %s)", mac_address or "NOT SET")

    # Create the two shared objects that the API routes need
    ble = BedJetBLE(address=mac_address)
    ws_manager = WebSocketManager()

    # Wire them together: whenever the BedJet sends a status update,
    # the WebSocket manager broadcasts it to all connected phones
    ble.status_callback = ws_manager.broadcast

    # Make them accessible to all route handlers via app.state
    app.state.ble = ble
    app.state.ws_manager = ws_manager

    # Start the BLE connection task in the background.
    # asyncio.create_task() schedules it on the current event loop.
    # It runs concurrently with the web server — both share the same event loop.
    ble_task = asyncio.create_task(ble.maintain_connection(), name="bedjet-ble")
    logger.info("BLE connection task started")

    # Hand control to FastAPI — the server runs until shutdown
    yield

    # --- SHUTDOWN ---
    logger.info("Shutting down BedJet server...")

    # Cancel the BLE background task cleanly.
    # This raises CancelledError inside maintain_connection(), which is not
    # caught there, so the task exits immediately.
    ble_task.cancel()
    try:
        await ble_task
    except asyncio.CancelledError:
        pass  # Expected — this is the clean shutdown path

    logger.info("BedJet server stopped")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="BedJet Controller",
    description="Raspberry Pi bridge between BedJet V3 and mobile app",
    version="1.0.0",
    lifespan=lifespan,
)

# Register all the API routes defined in api.py
app.include_router(router)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # host="0.0.0.0" makes the server reachable from other devices on the network.
    # If you only need local testing, change to host="127.0.0.1".
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
    )
