"""
api.py — FastAPI HTTP and WebSocket routes

This file defines all the API endpoints that the mobile app talks to:

  GET  /status                — Get current BedJet status as JSON
  POST /command/mode          — Change operating mode (Cool, Heat, etc.)
  POST /command/temperature   — Set target temperature
  POST /command/fan           — Set fan speed
  POST /command/timer         — Set auto-off timer
  POST /command/off           — Turn off (standby)
  WS   /ws                    — WebSocket for live status updates

This file does NOT contain any BLE logic. It only calls methods on the
BedJetBLE object (which lives in app.state.ble) that was set up in main.py.
"""

import logging
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from bedjet_ble import BedJetBLE, MODE_BUTTON_IDS, f_to_bedjet
from websocket_manager import WebSocketManager

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Temperature range (Fahrenheit) — BedJet hardware limits
# ---------------------------------------------------------------------------
TEMP_MIN_F = 66
TEMP_MAX_F = 104


# ---------------------------------------------------------------------------
# Request body models
#
# Pydantic validates these automatically. If the app sends bad data (e.g.
# a string instead of an int), FastAPI returns a clear 422 error with details.
# ---------------------------------------------------------------------------

class ModeRequest(BaseModel):
    mode: int = Field(..., ge=0, le=6, description="Mode integer: 0=Standby, 1=Heat, 2=Turbo, 3=Extended Heat, 4=Cool, 5=Dry, 6=Wait")

class TempRequest(BaseModel):
    temp_f: int = Field(..., ge=TEMP_MIN_F, le=TEMP_MAX_F, description="Target temperature in Fahrenheit (66–104)")

class FanRequest(BaseModel):
    step: int = Field(..., ge=0, le=19, description="Fan speed step: 0=5%, 19=100%")

class TimerRequest(BaseModel):
    hours: int   = Field(..., ge=0, le=9,  description="Hours for auto-off timer")
    minutes: int = Field(..., ge=0, le=59, description="Minutes for auto-off timer")


# ---------------------------------------------------------------------------
# Helper — get BedJetBLE instance from app state
#
# FastAPI lets us pass this as a dependency to route handlers instead of
# using a global variable. Cleaner and easier to test.
# ---------------------------------------------------------------------------

def get_ble(request: Request) -> BedJetBLE:
    return request.app.state.ble

def get_ws_manager(request: Request) -> WebSocketManager:
    return request.app.state.ws_manager


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------

@router.get("/status")
async def get_status(request: Request):
    """
    Returns the current BedJet status as JSON.

    Always returns HTTP 200. If the BedJet is not connected, returns
    {"connected": false} so the app always gets a predictable response.

    Example response when connected:
        {
            "connected": true,
            "mode": 4,
            "mode_name": "Cool",
            "actual_temp_f": 68,
            "set_temp_f": 70,
            "fan_step": 10,
            "fan_pct": 55,
            "timer_h": 0,
            "timer_m": 30,
            "timer_s": 0
        }
    """
    ble = get_ble(request)
    if ble.last_status is None:
        return {"connected": False}
    return ble.last_status


@router.post("/command/mode")
async def set_mode(body: ModeRequest, request: Request):
    """
    Change the BedJet operating mode.

    Body: {"mode": 4}   (0=Standby, 1=Heat, 2=Turbo, 3=Extended Heat, 4=Cool, 5=Dry, 6=Wait)
    """
    ble = get_ble(request)

    button_id = MODE_BUTTON_IDS.get(body.mode)
    if button_id is None:
        return {"success": False, "error": f"Unknown mode: {body.mode}"}

    # Button press command format: [0x01, BUTTON_ID]
    success = await ble.send_command([0x01, button_id])
    return _command_result(success)


@router.post("/command/temperature")
async def set_temperature(body: TempRequest, request: Request):
    """
    Set the target temperature.

    Body: {"temp_f": 72}   (valid range: 66°F–104°F)

    The temperature is converted from Fahrenheit to BedJet's half-degrees-
    Celsius format internally. The app always works in Fahrenheit.
    """
    ble = get_ble(request)
    value = f_to_bedjet(body.temp_f)

    # Temperature command format: [0x03, VALUE]
    success = await ble.send_command([0x03, value])
    logger.info("Set temperature: %d°F → BedJet value %d", body.temp_f, value)
    return _command_result(success)


@router.post("/command/fan")
async def set_fan(body: FanRequest, request: Request):
    """
    Set the fan speed.

    Body: {"step": 10}   (0=5%, 19=100%, each step is 5%)
    """
    ble = get_ble(request)
    # Fan speed command format: [0x07, STEP]
    success = await ble.send_command([0x07, body.step])
    logger.info("Set fan: step %d (%d%%)", body.step, body.step * 5 + 5)
    return _command_result(success)


@router.post("/command/timer")
async def set_timer(body: TimerRequest, request: Request):
    """
    Set the auto-off timer.

    Body: {"hours": 0, "minutes": 30}
    """
    ble = get_ble(request)
    # Timer command format: [0x02, HOURS, MINUTES]
    success = await ble.send_command([0x02, body.hours, body.minutes])
    logger.info("Set timer: %dh %dm", body.hours, body.minutes)
    return _command_result(success)


@router.post("/command/off")
async def turn_off(request: Request):
    """
    Turn the BedJet off (put it into Standby mode).

    No request body needed.
    """
    ble = get_ble(request)
    button_id = MODE_BUTTON_IDS[0]  # Standby = mode 0
    success = await ble.send_command([0x01, button_id])
    logger.info("Sent turn-off command")
    return _command_result(success)


@router.get("/health")
async def health_check(request: Request):
    """
    Quick health check endpoint.

    Returns whether the Pi is running and whether BedJet is connected.
    Useful for the app to poll as a heartbeat fallback.
    """
    ble = get_ble(request)
    return {
        "pi_ok": True,
        "bedjet_connected": ble.is_connected,
    }


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """
    WebSocket endpoint for live status updates.

    When a phone connects:
      1. It's added to the WebSocketManager
      2. It immediately receives the current status (so it doesn't have to
         wait for the next BedJet notification to see the current state)
      3. It stays connected, receiving a new JSON message every time the
         BedJet sends a status update

    When a phone disconnects (or the app is backgrounded):
      - The WebSocketDisconnect exception is caught and the phone is
        cleanly removed from the manager
    """
    app = ws.app
    ble: BedJetBLE = app.state.ble
    ws_manager: WebSocketManager = app.state.ws_manager

    await ws_manager.connect(ws)
    logger.info("New WebSocket connection accepted")

    try:
        # Send the current status immediately so the app doesn't show stale data
        if ble.last_status is not None:
            await ws.send_json(ble.last_status)
        else:
            await ws.send_json({"connected": False})

        # Keep the connection alive by waiting for messages from the client.
        # The client doesn't need to send anything — this loop just keeps the
        # connection open and detects when the client disconnects.
        while True:
            await ws.receive_text()

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected normally")
    except Exception as e:
        logger.warning("WebSocket connection closed unexpectedly: %s", e)
    finally:
        ws_manager.disconnect(ws)


# ---------------------------------------------------------------------------
# Private helper
# ---------------------------------------------------------------------------

def _command_result(success: bool) -> dict:
    """Return a consistent JSON response shape for all command endpoints."""
    if success:
        return {"success": True}
    else:
        return {"success": False, "error": "Command failed — BedJet may not be connected"}
