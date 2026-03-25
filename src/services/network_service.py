import subprocess
import re
import socket
import logging
import os
import requests
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)


class NetworkService:
    def __init__(self):
        self.fritzbox_host = os.getenv("FRITZBOX_HOST", "192.168.178.1")
        self.fritzbox_user = os.getenv("FRITZBOX_USER")
        self.fritzbox_password = os.getenv("FRITZBOX_PASSWORD")

    # =========================
    # MAIN SCAN
    # =========================
    def scan_network(self):
        devices = {}

        fritz_devices = self._get_fritzbox_devices()
        logger.info(f"FritzBox devices: {len(fritz_devices)}")

        try:
            result = subprocess.run(
                ["arp-scan", "--localnet"],
                capture_output=True,
                text=True
            )

            for line in result.stdout.split("\n"):
                parsed = self._parse_arp_line(line)
                if not parsed:
                    continue

                mac = self._normalize_mac(parsed["mac"])

                device = {
                    "ip": parsed["ip"],
                    "mac": mac,
                    "vendor": parsed["vendor"],
                    "hostname": "unknown",
                    "status": "up"
                }

                # =========================
                # FRITZBOX OVERRIDE (IMPORTANT)
                # =========================
                if mac in fritz_devices:
                    fb = fritz_devices[mac]

                    if fb.get("hostname"):
                        device["hostname"] = fb["hostname"]

                    if fb.get("ip"):
                        device["ip"] = fb["ip"]

                # fallback DNS
                if device["hostname"] == "unknown":
                    device["hostname"] = self._resolve_hostname(device["ip"])

                devices[mac] = device

        except FileNotFoundError:
            logger.warning("arp-scan not found → fallback ping scan")
            return self._fallback_ping_scan()

        return list(devices.values())

    # =========================
    # FRITZBOX DEVICES
    # =========================

    def _get_fritzbox_devices(self):
        try:
            from fritzconnection import FritzConnection

            fc = FritzConnection(
                address=self.fritzbox_host,
                user=self.fritzbox_user,
                password=self.fritzbox_password
            )

            # 🔥 lista host reali DHCP
            result = fc.call_action("Hosts", "GetHostNumberOfEntries")

            devices = {}
            count = int(result["NewHostNumberOfEntries"])

            for i in range(count):
                host = fc.call_action("Hosts", "GetGenericHostEntry", NewIndex=i)

                mac = host.get("NewMACAddress")
                ip = host.get("NewIPAddress")
                name = host.get("NewHostName")

                if mac:
                    mac = mac.strip().lower()

                    devices[mac] = {
                        "hostname": name if name else None,
                        "ip": ip
                    }

            return devices

        except Exception as e:
            logger.warning(f"FritzBox error: {e}")
            return {}

    # =========================
    # ARP PARSER
    # =========================
    def _parse_arp_line(self, line: str):
        match = re.search(
            r"(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:]{17})\s+(.+)",
            line
        )

        if not match:
            return None

        ip, mac, vendor = match.groups()

        return {
            "ip": ip,
            "mac": mac,
            "vendor": vendor.strip()
        }

    # =========================
    # NORMALIZE MAC (IMPORTANT FIX)
    # =========================
    def _normalize_mac(self, mac: str):
        return mac.strip().lower().replace("-", ":")

    # =========================
    # HOSTNAME RESOLVE
    # =========================
    def _resolve_hostname(self, ip):
        try:
            return socket.gethostbyaddr(ip)[0]
        except:
            return "unknown"

    # =========================
    # FALLBACK PING SCAN
    # =========================
    def _fallback_ping_scan(self):
        devices = {}
        base_ip = "192.168.178."

        for i in range(1, 255):
            ip = base_ip + str(i)

            res = subprocess.run(
                ["ping", "-c", "1", "-W", "1", ip],
                stdout=subprocess.DEVNULL
            )

            if res.returncode == 0:
                mac = "unknown"

                devices[ip] = {
                    "ip": ip,
                    "mac": mac,
                    "vendor": "unknown",
                    "hostname": self._resolve_hostname(ip),
                    "status": "up"
                }

        return list(devices.values())