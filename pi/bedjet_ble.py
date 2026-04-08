"""
bedjet_ble.py — BLE connection and command layer

This module owns everything related to the Bluetooth connection between the
Raspberry Pi and the BedJet V3. It handles:
  - Connecting to the BedJet
  - Receiving live status notifications
  - Sending commands (mode, temperature, fan speed, timer)
  - Auto-reconnecting if the connection drops

Nothing in this file knows about HTTP or WebSockets. That separation keeps
the code easy to test and understand.
"""

import asyncio
import logging
from bleak import BleakClient, BleakError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# BedJet V3 BLE UUIDs (from reverse-engineered protocol)
# ---------------------------------------------------------------------------
SERVICE_UUID = "00001000-bed0-0080-aa55-4265644a6574"
STATUS_CHAR  = "00002000-bed0-0080-aa55-4265644a6574"  # Pi subscribes for notifications
COMMAND_CHAR = "00002004-bed0-0080-aa55-4265644a6574"  # Pi writes commands here

# ---------------------------------------------------------------------------
# Mode constants  (integer sent in status packets, and used in commands)
# ---------------------------------------------------------------------------
MODE_STANDBY       = 0
MODE_HEAT          = 1
MODE_TURBO         = 2
MODE_EXTENDED_HEAT = 3
MODE_COOL          = 4
MODE_DRY           = 5
MODE_WAIT          = 6

MODE_NAMES = {
    MODE_STANDBY:       "Standby",
    MODE_HEAT:          "Heat",
    MODE_TURBO:         "Turbo",
    MODE_EXTENDED_HEAT: "Extended Heat",
    MODE_COOL:          "Cool",
    MODE_DRY:           "Dry",
    MODE_WAIT:          "Wait",
}

# ---------------------------------------------------------------------------
# Button IDs for mode changes (sent as [0x01, BUTTON_ID])
#
# These values are from the official BedJet V3 Android app (decompiled source).
# Reference: https://github.com/markus1189/bedjet-re
# ---------------------------------------------------------------------------
MODE_BUTTON_IDS = {
    MODE_STANDBY:       0x01,
    MODE_HEAT:          0x03,
    MODE_TURBO:         0x04,
    MODE_EXTENDED_HEAT: 0x06,
    MODE_COOL:          0x02,
    MODE_DRY:           0x05,
    MODE_WAIT:          0x07,
}

# ---------------------------------------------------------------------------
# Timing constants (from protocol analysis)
# ---------------------------------------------------------------------------
RETRY_DELAY_SECONDS  = 0.4   # Wait 400ms between retries
REPLY_TIMEOUT_SECONDS = 0.7  # Command reply timeout


# ---------------------------------------------------------------------------
# Temperature conversion helpers
#
# The BedJet protocol uses "half-degrees Celsius" — multiply Celsius by 2.
# Example: 20°C = 40, 37°C = 74
#
# These helpers are module-level (not inside a class) so they can be imported
# and tested independently. Never copy this math elsewhere — always import it.
# ---------------------------------------------------------------------------

def f_to_bedjet(temp_f: int) -> int:
    """
    Convert a Fahrenheit temperature to the BedJet protocol value.

    The BedJet uses half-degrees Celsius internally:
      - 66°F (19°C) → 38
      - 72°F (22°C) → 44
      - 95°F (35°C) → 70

    Args:
        temp_f: Temperature in Fahrenheit (valid range: 66–104)

    Returns:
        BedJet protocol value (half-degrees Celsius)
    """
    temp_c = (temp_f - 32) * 5 / 9
    return round(temp_c * 2)


def bedjet_to_f(value: int) -> int:
    """
    Convert a BedJet protocol value (half-degrees Celsius) to Fahrenheit.

    Args:
        value: BedJet half-degrees-Celsius value

    Returns:
        Temperature in Fahrenheit (rounded to nearest degree)
    """
    return round((value / 2) * 9 / 5 + 32)


# ---------------------------------------------------------------------------
# Main BLE class
# ---------------------------------------------------------------------------

class BedJetBLE:
    """
    Manages the persistent BLE connection to the BedJet V3.

    Usage in main.py:
        ble = BedJetBLE(address="XX:XX:XX:XX:XX:XX")
        ble.status_callback = ws_manager.broadcast   # optional
        asyncio.create_task(ble.maintain_connection())

    After connecting, the BedJet sends status notifications whenever its
    state changes. These are parsed and stored in self.last_status, and
    forwarded to status_callback if one is registered.
    """

    def __init__(self, address: str):
        """
        Args:
            address: Bluetooth MAC address of the BedJet (e.g. "AA:BB:CC:DD:EE:FF")
        """
        self.address = address

        # The bleak client object — None until connected
        self.client: BleakClient | None = None

        # The most recently received status from the BedJet.
        # Stored here so new WebSocket connections can immediately get the
        # current state without waiting for the next notification.
        self.last_status: dict | None = None

        # If set, this async function is called every time a new status
        # arrives. The WebSocket manager registers itself here.
        # Signature: async def callback(status: dict) -> None
        self.status_callback = None

        self._connected = False

    # -----------------------------------------------------------------------
    # Public API — called by api.py
    # -----------------------------------------------------------------------

    async def send_command(self, payload: list[int]) -> bool:
        """
        Send a raw command to the BedJet.

        Args:
            payload: List of bytes to send. Example: [0x07, 10] for fan step 10.

        Returns:
            True if the command was sent successfully, False otherwise.
        """
        if not self._connected or self.client is None or not self.client.is_connected:
            logger.warning("Cannot send command — BedJet is not connected")
            return False

        try:
            # response=True means "write with response" (the BedJet acknowledges receipt).
            # If commands appear to silently fail, try response=False.
            await self.client.write_gatt_char(COMMAND_CHAR, bytearray(payload), response=True)
            logger.debug("Sent command: %s", [hex(b) for b in payload])
            return True
        except BleakError as e:
            logger.error("BLE command failed: %s", e)
            return False

    @property
    def is_connected(self) -> bool:
        """True if currently connected to the BedJet."""
        return self._connected and self.client is not None and self.client.is_connected

    # -----------------------------------------------------------------------
    # Connection lifecycle — called once from main.py as a background task
    # -----------------------------------------------------------------------

    async def maintain_connection(self):
        """
        Keep the BedJet connected forever.

        This runs as a long-lived asyncio task. It connects, stays connected,
        and if the connection drops (e.g. BedJet power-cycled), it waits and
        tries again automatically.

        IMPORTANT: This function does NOT catch asyncio.CancelledError.
        That allows main.py to cleanly shut it down with task.cancel().
        """
        logger.info("Starting BedJet connection manager for %s", self.address)

        while True:
            try:
                await self._connect()
                # _connect succeeded — now just wait until the connection drops
                await self._run_until_disconnected()
            except BleakError as e:
                logger.error("BLE error: %s — retrying in %.1fs", e, RETRY_DELAY_SECONDS)
            except Exception as e:
                # Catch-all for unexpected errors (but NOT CancelledError, which is
                # a subclass of BaseException, not Exception — so it still propagates)
                logger.error("Unexpected error: %s — retrying in %.1fs", e, RETRY_DELAY_SECONDS)

            self._connected = False
            logger.info("Will retry connection in %.1f seconds...", RETRY_DELAY_SECONDS)
            await asyncio.sleep(RETRY_DELAY_SECONDS)

    # -----------------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------------

    async def _connect(self):
        """
        Establish the BLE connection and subscribe to status notifications.

        Raises BleakError if the connection fails (caller handles retry).
        """
        logger.info("Connecting to BedJet at %s...", self.address)

        self.client = BleakClient(self.address)
        await self.client.connect()

        # Subscribe to status notifications. _on_notification is called
        # automatically whenever the BedJet sends an update.
        await self.client.start_notify(STATUS_CHAR, self._on_notification)

        self._connected = True
        logger.info("Connected to BedJet at %s", self.address)

    async def _run_until_disconnected(self):
        """
        Block until the BedJet connection drops.

        Polls every second. When is_connected becomes False (e.g. the BedJet
        was turned off or went out of range), returns so maintain_connection
        can retry.
        """
        while self.client and self.client.is_connected:
            await asyncio.sleep(1)

        self._connected = False
        logger.warning("BedJet disconnected — will attempt to reconnect")

    def _on_notification(self, sender, data: bytearray):
        """
        Called by bleak whenever the BedJet sends a status notification.

        This is a synchronous callback (not async). It parses the raw bytes
        into a human-readable dict and forwards it to status_callback.

        The status packet structure (BedJet V3 protocol):
          Byte 0:    Magic byte 0x56 (validates this is a real status packet)
          Bytes 3-5: Timer remaining (hours, minutes, seconds)
          Byte 6:    Actual temperature (half-degrees Celsius)
          Byte 7:    Setpoint temperature (half-degrees Celsius)
          Byte 8:    Operating mode (0-6)
          Byte 9:    Fan step (0-19)
          Last byte: Checksum
        """
        # Validate the magic byte — ignore malformed packets
        if len(data) < 10 or data[0] != 0x56:
            logger.debug("Ignoring non-status notification (length=%d, byte0=%s)",
                         len(data), hex(data[0]) if data else "empty")
            return

        status = {
            "connected":     True,
            "timer_h":       data[3],
            "timer_m":       data[4],
            "timer_s":       data[5],
            "actual_temp_f": bedjet_to_f(data[6]),
            "set_temp_f":    bedjet_to_f(data[7]),
            "mode":          data[8],
            "mode_name":     MODE_NAMES.get(data[8], "Unknown"),
            "fan_step":      data[9],
            "fan_pct":       data[9] * 5 + 5,  # step 0 = 5%, step 19 = 100%
        }

        self.last_status = status
        logger.debug("Status update: mode=%s temp=%d°F fan=%d%%",
                     status["mode_name"], status["actual_temp_f"], status["fan_pct"])

        # Forward to the WebSocket manager so all connected phones get the update.
        # We use asyncio.create_task() because this callback is synchronous but
        # status_callback is an async function — we can't await it directly here.
        if self.status_callback is not None:
            asyncio.create_task(self.status_callback(status))
