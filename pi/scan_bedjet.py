#!/usr/bin/env python3
"""
Scan for nearby Bluetooth devices and find your BedJet's MAC address.

Run this script to discover all Bluetooth devices within range for 10 seconds.
Look for one named "BedJet V3" or similar — the address on the left is what
you need to set as BEDJET_MAC in bedjet.service.

Usage:
    python3 scan_bedjet.py
"""

import asyncio
from bleak import BleakScanner


async def scan():
    """Scan for BLE devices for 10 seconds and print results."""
    print("Scanning for Bluetooth devices (10 seconds)...")
    print()

    devices = await BleakScanner.discover(timeout=10)

    if not devices:
        print("No devices found.")
        return

    print("Found devices:")
    print("-" * 50)
    for device in devices:
        print(f"{device.address}  {device.name or '(unknown)'}")
    print("-" * 50)
    print()
    print("Look for 'BedJet V3' or similar. Copy its address (e.g. AA:BB:CC:DD:EE:FF)")
    print("and set it as BEDJET_MAC in bedjet.service or export it:")
    print("  export BEDJET_MAC=AA:BB:CC:DD:EE:FF")


if __name__ == "__main__":
    asyncio.run(scan())
