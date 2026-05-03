package networkdevices

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

type Service struct {
	client *redis.Client
}

type ScanDevice struct {
	IP              string `json:"ip"`
	MAC             string `json:"mac"`
	Vendor          string `json:"vendor"`
	Hostname        string `json:"hostname"`
	Status          string `json:"status"`
	OS              string `json:"os,omitempty"`
	OSDetail        string `json:"os_detail,omitempty"`
	OpenPorts       any    `json:"open_ports,omitempty"`
	LastSeen        string `json:"last_seen"`
	FirstSeen       string `json:"first_seen,omitempty"`
	ConnectionCount int    `json:"connection_count,omitempty"`
}

type Device struct {
	IP              string `json:"ip,omitempty"`
	MAC             string `json:"mac,omitempty"`
	Hostname        string `json:"hostname,omitempty"`
	Vendor          string `json:"vendor,omitempty"`
	Status          string `json:"status,omitempty"`
	OS              string `json:"os,omitempty"`
	OSDetail        string `json:"os_detail,omitempty"`
	FirstSeen       string `json:"first_seen,omitempty"`
	LastSeen        string `json:"last_seen,omitempty"`
	ConnectionCount int    `json:"connection_count,omitempty"`
	OpenPorts       any    `json:"open_ports,omitempty"`
}

type Stats struct {
	IPAddress       string `json:"ip_address,omitempty"`
	Hostname        string `json:"hostname,omitempty"`
	MAC             string `json:"mac,omitempty"`
	Vendor          string `json:"vendor,omitempty"`
	ConnectionCount int    `json:"connection_count,omitempty"`
}

type Alert struct {
	MAC       string `json:"mac,omitempty"`
	Hostname  string `json:"hostname,omitempty"`
	IP        string `json:"ip,omitempty"`
	Vendor    string `json:"vendor,omitempty"`
	FirstSeen string `json:"first_seen,omitempty"`
}

type HistoryEntry struct {
	Timestamp string `json:"timestamp,omitempty"`
	IP        string `json:"ip,omitempty"`
	Status    string `json:"status,omitempty"`
}

func New(redisAddr string) *Service {
	return &Service{client: redis.NewClient(&redis.Options{Addr: redisAddr})}
}

func (s *Service) ScanNetwork(ctx context.Context) ([]ScanDevice, error) {
	devices, err := s.scanNetworkRaw(ctx)
	if err != nil {
		return nil, err
	}

	previous, _ := s.GetDevices(ctx)
	previousMACs := make(map[string]struct{}, len(previous))
	for _, d := range previous {
		if d.MAC != "" {
			previousMACs[d.MAC] = struct{}{}
		}
	}

	now := time.Now().UTC().Format(time.RFC3339)
	dayIndex := int((time.Now().UTC().Weekday() + 1) % 7)
	var enriched []ScanDevice

	for _, device := range devices {
		if device.MAC == "" || device.MAC == "unknown" {
			continue
		}
		if err := s.client.SetNX(ctx, "network:first_seen:"+device.MAC, now, 0).Err(); err != nil {
			return nil, err
		}
		if err := s.client.Incr(ctx, "network:connection_count:"+device.MAC).Err(); err != nil {
			return nil, err
		}
		if err := s.client.HIncrBy(ctx, "network:weekly:"+device.MAC, fmt.Sprintf("%d", dayIndex), 1).Err(); err != nil {
			return nil, err
		}

		entry, _ := json.Marshal(map[string]any{"timestamp": now, "ip": device.IP, "status": "up"})
		if err := s.client.LPush(ctx, "network:history:"+device.MAC, entry).Err(); err != nil {
			return nil, err
		}
		if err := s.client.LTrim(ctx, "network:history:"+device.MAC, 0, 99).Err(); err != nil {
			return nil, err
		}

		if len(previousMACs) > 0 {
			if _, seen := previousMACs[device.MAC]; !seen {
				alert, _ := json.Marshal(map[string]any{"mac": device.MAC, "hostname": device.Hostname, "ip": device.IP, "vendor": device.Vendor, "first_seen": now})
				if err := s.client.LPush(ctx, "network:new_devices_alert", alert).Err(); err != nil {
					return nil, err
				}
				if err := s.client.LTrim(ctx, "network:new_devices_alert", 0, 49).Err(); err != nil {
					return nil, err
				}
			}
		}

		if firstSeen, err := s.client.Get(ctx, "network:first_seen:"+device.MAC).Result(); err == nil {
			device.FirstSeen = firstSeen
		} else {
			device.FirstSeen = now
		}
		device.LastSeen = now
		if v, err := s.client.Get(ctx, "network:connection_count:"+device.MAC).Result(); err == nil {
			if parsed, parseErr := parseInt(v); parseErr == nil {
				device.ConnectionCount = parsed
			}
		}
		enriched = append(enriched, device)
	}

	weekly := make(map[string][]int)
	for _, device := range enriched {
		weekly[device.IP] = s.weeklyActivity(ctx, device.MAC)
	}

	if payload, err := json.Marshal(enriched); err == nil {
		if err := s.client.Set(ctx, "network:devices", payload, 5*time.Minute).Err(); err != nil {
			return nil, err
		}
	}
	if payload, err := json.Marshal(weekly); err == nil {
		if err := s.client.Set(ctx, "network:weekly_activity", payload, time.Hour).Err(); err != nil {
			return nil, err
		}
	}

	return enriched, nil
}

func (s *Service) ScanPorts(ctx context.Context, ip string, topPorts int) ([]map[string]any, error) {
	if topPorts <= 0 {
		topPorts = 100
	}
	cmd := exec.CommandContext(ctx, "nmap", "-T4", fmt.Sprintf("--top-ports=%d", topPorts), ip)
	output, err := cmd.CombinedOutput()
	if err != nil && len(output) == 0 {
		return []map[string]any{}, err
	}
	ports := parseNmapPorts(string(output))
	return ports, nil
}

func (s *Service) ScanOS(ctx context.Context, ip string) (map[string]any, error) {
	cmd := exec.CommandContext(ctx, "nmap", "-O", "--osscan-guess", "-T4", ip)
	output, err := cmd.CombinedOutput()
	if err != nil && len(output) == 0 {
		return map[string]any{"os": nil, "os_detail": nil}, err
	}
	return parseNmapOS(string(output)), nil
}

func (s *Service) scanNetworkRaw(ctx context.Context) ([]ScanDevice, error) {
	if devices := s.scanWithArpScan(ctx); len(devices) > 0 {
		return devices, nil
	}
	return s.fallbackPingScan(ctx), nil
}

func (s *Service) scanWithArpScan(ctx context.Context) []ScanDevice {
	cmd := exec.CommandContext(ctx, "arp-scan", "--localnet")
	output, err := cmd.CombinedOutput()
	if err != nil || len(output) == 0 {
		return nil
	}
	return parseARPScan(string(output))
}

func (s *Service) fallbackPingScan(ctx context.Context) []ScanDevice {
	var devices []ScanDevice
	for i := 1; i < 255; i++ {
		select {
		case <-ctx.Done():
			return devices
		default:
		}
		ip := fmt.Sprintf("192.168.178.%d", i)
		cmd := exec.CommandContext(ctx, "ping", "-c", "1", "-W", "1", ip)
		if err := cmd.Run(); err == nil {
			devices = append(devices, ScanDevice{
				IP:       ip,
				MAC:      "unknown",
				Vendor:   "unknown",
				Hostname: "unknown",
				Status:   "up",
				LastSeen: time.Now().UTC().Format(time.RFC3339),
			})
		}
	}
	return devices
}

func (s *Service) weeklyActivity(ctx context.Context, mac string) []int {
	if mac == "" || mac == "unknown" {
		return []int{0, 0, 0, 0, 0, 0, 0}
	}
	values, err := s.client.HGetAll(ctx, "network:weekly:"+mac).Result()
	if err != nil {
		return []int{0, 0, 0, 0, 0, 0, 0}
	}
	out := make([]int, 7)
	for i := 0; i < 7; i++ {
		if v, ok := values[fmt.Sprintf("%d", i)]; ok {
			if parsed, err := parseInt(v); err == nil {
				out[i] = parsed
			}
		}
	}
	return out
}

func (s *Service) GetDevices(ctx context.Context) ([]Device, error) {
	raw, err := s.client.Get(ctx, "network:devices").Result()
	if err == redis.Nil {
		return []Device{}, nil
	}
	if err != nil {
		return nil, err
	}

	var devices []Device
	if err := json.Unmarshal([]byte(raw), &devices); err != nil {
		return nil, fmt.Errorf("decode devices: %w", err)
	}
	return devices, nil
}

func (s *Service) GetDeviceStats(ctx context.Context) ([]Stats, error) {
	devices, err := s.GetDevices(ctx)
	if err != nil {
		return nil, err
	}

	stats := make([]Stats, 0, len(devices))
	for _, device := range devices {
		count := device.ConnectionCount
		if count == 0 && device.MAC != "" {
			if raw, err := s.client.Get(ctx, "network:connection_count:"+device.MAC).Result(); err == nil {
				if parsed, parseErr := parseInt(raw); parseErr == nil {
					count = parsed
				}
			}
		}

		stats = append(stats, Stats{
			IPAddress:       device.IP,
			Hostname:        device.Hostname,
			MAC:             device.MAC,
			Vendor:          device.Vendor,
			ConnectionCount: count,
		})
	}

	return stats, nil
}

func (s *Service) GetMostConnectedDays(ctx context.Context) (map[string][]int, error) {
	raw, err := s.client.Get(ctx, "network:weekly_activity").Result()
	if err == redis.Nil {
		return map[string][]int{}, nil
	}
	if err != nil {
		return nil, err
	}

	var out map[string][]int
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, fmt.Errorf("decode weekly activity: %w", err)
	}
	return out, nil
}

func (s *Service) GetAlerts(ctx context.Context) ([]Alert, error) {
	entries, err := s.client.LRange(ctx, "network:new_devices_alert", 0, 49).Result()
	if err == redis.Nil {
		return []Alert{}, nil
	}
	if err != nil {
		return nil, err
	}

	cutoff := time.Now().UTC().Add(-24 * time.Hour)
	alerts := make([]Alert, 0, len(entries))
	for _, raw := range entries {
		var alert Alert
		if err := json.Unmarshal([]byte(raw), &alert); err != nil {
			continue
		}
		if alert.FirstSeen == "" {
			continue
		}
		timestamp, err := time.Parse(time.RFC3339, alert.FirstSeen)
		if err != nil {
			continue
		}
		if timestamp.After(cutoff) || timestamp.Equal(cutoff) {
			alerts = append(alerts, alert)
		}
	}
	return alerts, nil
}

func (s *Service) ClearAlerts(ctx context.Context) error {
	return s.client.Del(ctx, "network:new_devices_alert").Err()
}

func (s *Service) GetHistory(ctx context.Context) (map[string][]HistoryEntry, error) {
	keys, err := s.client.Keys(ctx, "network:history:*").Result()
	if err == redis.Nil {
		return map[string][]HistoryEntry{}, nil
	}
	if err != nil {
		return nil, err
	}

	history := make(map[string][]HistoryEntry, len(keys))
	for _, key := range keys {
		mac := strings.TrimPrefix(key, "network:history:")
		entries, err := s.client.LRange(ctx, key, 0, 99).Result()
		if err != nil {
			continue
		}

		decoded := make([]HistoryEntry, 0, len(entries))
		for _, raw := range entries {
			var entry HistoryEntry
			if err := json.Unmarshal([]byte(raw), &entry); err == nil {
				decoded = append(decoded, entry)
			}
		}
		history[mac] = decoded
	}

	return history, nil
}

func (s *Service) GetDeviceHistory(ctx context.Context, mac string) ([]HistoryEntry, error) {
	entries, err := s.client.LRange(ctx, "network:history:"+mac, 0, 99).Result()
	if err == redis.Nil {
		return []HistoryEntry{}, nil
	}
	if err != nil {
		return nil, err
	}

	history := make([]HistoryEntry, 0, len(entries))
	for _, raw := range entries {
		var entry HistoryEntry
		if err := json.Unmarshal([]byte(raw), &entry); err == nil {
			history = append(history, entry)
		}
	}
	return history, nil
}

func parseARPScan(output string) []ScanDevice {
	var devices []ScanDevice
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "Interface:") || strings.HasPrefix(line, "Starting ") || strings.HasPrefix(line, "Ending ") {
			continue
		}
		var ip, mac string
		var vendor string
		if _, err := fmt.Sscanf(line, "%s %s %s", &ip, &mac, &vendor); err == nil {
			if strings.Count(mac, ":") == 5 {
				devices = append(devices, ScanDevice{IP: ip, MAC: strings.ToLower(mac), Vendor: strings.TrimSpace(strings.TrimPrefix(line, ip+" "+mac+" ")), Hostname: "unknown", Status: "up", LastSeen: time.Now().UTC().Format(time.RFC3339), OpenPorts: []any{}})
			}
		}
	}
	return devices
}

func parseNmapPorts(output string) []map[string]any {
	ports := make([]map[string]any, 0)
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		var port int
		var proto, state, service string
		if n, err := fmt.Sscanf(line, "%d/%s %s %s", &port, &proto, &state, &service); err == nil && n == 4 && state == "open" {
			ports = append(ports, map[string]any{"port": port, "proto": proto, "service": service})
		}
	}
	return ports
}

func parseNmapOS(output string) map[string]any {
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "OS details:") {
			detail := strings.TrimSpace(strings.TrimPrefix(line, "OS details:"))
			return map[string]any{"os": classifyOS(detail), "os_detail": detail}
		}
		if strings.HasPrefix(line, "Aggressive OS guesses:") {
			detail := strings.TrimSpace(strings.TrimPrefix(line, "Aggressive OS guesses:"))
			if idx := strings.Index(detail, ","); idx > 0 {
				detail = detail[:idx]
			}
			detail = strings.TrimSpace(strings.TrimSuffix(strings.TrimSuffix(detail, ")"), "%"))
			return map[string]any{"os": classifyOS(detail), "os_detail": detail}
		}
	}
	return map[string]any{"os": nil, "os_detail": nil}
}

func classifyOS(detail string) string {
	lower := strings.ToLower(detail)
	switch {
	case strings.Contains(lower, "windows"):
		return "Windows"
	case strings.Contains(lower, "linux"):
		return "Linux"
	case strings.Contains(lower, "macos"), strings.Contains(lower, "mac os"), strings.Contains(lower, "darwin"), strings.Contains(lower, "ios"), strings.Contains(lower, "apple"), strings.Contains(lower, "iphone"), strings.Contains(lower, "ipad"):
		return "Apple"
	case strings.Contains(lower, "android"):
		return "Android"
	case strings.Contains(lower, "freebsd"), strings.Contains(lower, "openbsd"), strings.Contains(lower, "netbsd"):
		return "BSD"
	case strings.Contains(lower, "router"), strings.Contains(lower, "cisco"), strings.Contains(lower, "juniper"), strings.Contains(lower, "dd-wrt"), strings.Contains(lower, "openwrt"):
		return "Network"
	default:
		return "Unknown"
	}
}

func parseInt(value string) (int, error) {
	var out int
	_, err := fmt.Sscanf(value, "%d", &out)
	if err != nil {
		return 0, err
	}
	return out, nil
}
