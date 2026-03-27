import subprocess
import re
import socket
import logging
import os
import json
import datetime

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
                    "status": "up",
                    "os": None,
                    "os_detail": None,
                    "open_ports": [],
                    "last_seen": datetime.datetime.utcnow().isoformat(),
                }

                if mac in fritz_devices:
                    fb = fritz_devices[mac]
                    if fb.get("hostname"):
                        device["hostname"] = fb["hostname"]
                    if fb.get("ip"):
                        device["ip"] = fb["ip"]

                if device["hostname"] == "unknown":
                    device["hostname"] = self._resolve_hostname(device["ip"])

                devices[mac] = device

        except FileNotFoundError:
            logger.warning("arp-scan not found → fallback ping scan")
            return self._fallback_ping_scan()

        return list(devices.values())

    # =========================
    # OS DETECTION (nmap -O)
    # =========================
    def scan_os(self, ip: str) -> dict:
        """Run nmap OS detection on a single IP. Requires root."""
        try:
            result = subprocess.run(
                ["nmap", "-O", "--osscan-guess", "-T4", ip],
                capture_output=True,
                text=True,
                timeout=60
            )
            return self._parse_nmap_os(result.stdout)
        except subprocess.TimeoutExpired:
            logger.warning(f"OS scan timed out for {ip}")
            return {"os": None, "os_detail": None}
        except Exception as e:
            logger.warning(f"OS scan failed for {ip}: {e}")
            return {"os": None, "os_detail": None}

    def _parse_nmap_os(self, output: str) -> dict:
        # Try exact match first
        os_match = re.search(r"OS details?: (.+)", output)
        if os_match:
            detail = os_match.group(1).strip()
            return {"os": self._classify_os(detail), "os_detail": detail}

        # Fall back to aggressive guess (first result)
        guess_match = re.search(r"Aggressive OS guesses?: ([^\n]+)", output)
        if guess_match:
            detail = guess_match.group(1).split(",")[0].strip()
            # Strip confidence percentage like "Linux 4.x (95%)"
            detail = re.sub(r"\s*\(\d+%\)", "", detail).strip()
            return {"os": self._classify_os(detail), "os_detail": detail}

        return {"os": None, "os_detail": None}

    def _classify_os(self, detail: str) -> str:
        detail_lower = detail.lower()
        if "windows" in detail_lower:
            return "Windows"
        if "linux" in detail_lower:
            return "Linux"
        if any(k in detail_lower for k in ["macos", "mac os", "darwin", "ios", "apple", "iphone", "ipad"]):
            return "Apple"
        if "android" in detail_lower:
            return "Android"
        if any(k in detail_lower for k in ["freebsd", "openbsd", "netbsd"]):
            return "BSD"
        if any(k in detail_lower for k in ["router", "cisco", "juniper", "dd-wrt", "openwrt"]):
            return "Network"
        return "Unknown"

    # =========================
    # PORT SCAN (nmap)
    # =========================
    def scan_ports(self, ip: str, top_ports: int = 100) -> list:
        """Run nmap port scan on a single IP."""
        try:
            result = subprocess.run(
                ["nmap", "-T4", f"--top-ports={top_ports}", ip],
                capture_output=True,
                text=True,
                timeout=120
            )
            return self._parse_nmap_ports(result.stdout)
        except subprocess.TimeoutExpired:
            logger.warning(f"Port scan timed out for {ip}")
            return []
        except Exception as e:
            logger.warning(f"Port scan failed for {ip}: {e}")
            return []

    def _parse_nmap_ports(self, output: str) -> list:
        ports = []
        for line in output.split("\n"):
            match = re.match(r"(\d+)/(tcp|udp)\s+open\s+(\S+)", line.strip())
            if match:
                ports.append({
                    "port": int(match.group(1)),
                    "proto": match.group(2),
                    "service": match.group(3),
                })
        return ports

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
                        "ip": ip,
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
        return {"ip": ip, "mac": mac, "vendor": vendor.strip()}

    def _normalize_mac(self, mac: str):
        return mac.strip().lower().replace("-", ":")

    def _resolve_hostname(self, ip):
        try:
            return socket.gethostbyaddr(ip)[0]
        except Exception:
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
                devices[ip] = {
                    "ip": ip,
                    "mac": "unknown",
                    "vendor": "unknown",
                    "hostname": self._resolve_hostname(ip),
                    "status": "up",
                    "os": None,
                    "os_detail": None,
                    "open_ports": [],
                    "last_seen": datetime.datetime.utcnow().isoformat(),
                }

        return list(devices.values())