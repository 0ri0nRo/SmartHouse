package honeypot

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

type Service struct {
	CowriePath   string
	Fail2banPath string
	MaxLines     int
}

func New() *Service {
	cp := os.Getenv("COWRIE_LOG_PATH")
	if cp == "" {
		cp = "/var/log/cowrie/cowrie.json"
	}
	fb := os.Getenv("FAIL2BAN_DB_PATH")
	if fb == "" {
		fb = "/var/lib/fail2ban/fail2ban.sqlite3"
	}
	return &Service{CowriePath: cp, Fail2banPath: fb, MaxLines: 50000}
}

// --- helpers ---
var dateSuffix = regexp.MustCompile(`\.\d{4}-\d{2}-\d{2}$`)

func (s *Service) findLogFiles() []string {
	base := filepath.Base(s.CowriePath)
	dir := filepath.Dir(s.CowriePath)
	if dir == "" || dir == "." {
		dir = "."
	}

	var found []string
	if _, err := os.Stat(s.CowriePath); err == nil {
		found = append(found, s.CowriePath)
	}

	pattern := filepath.Join(dir, base+".*")
	matches, _ := filepath.Glob(pattern)
	sort.Strings(matches)
	for _, f := range matches {
		if f == s.CowriePath {
			continue
		}
		suffix := strings.TrimPrefix(f, filepath.Join(dir, base))
		if dateSuffix.MatchString(suffix) {
			found = append(found, f)
		}
	}
	return found
}

func (s *Service) readEvents() ([]map[string]any, error) {
	files := s.findLogFiles()
	if len(files) == 0 {
		return nil, nil
	}

	var allLines []string
	for _, p := range files {
		fh, err := os.Open(p)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(fh)
		for scanner.Scan() {
			allLines = append(allLines, scanner.Text())
		}
		fh.Close()
	}

	if len(allLines) > s.MaxLines {
		allLines = allLines[len(allLines)-s.MaxLines:]
	}

	var events []map[string]any
	for _, line := range allLines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			continue
		}
		events = append(events, m)
	}
	return events, nil
}

func parseTS(ts any) (time.Time, bool) {
	if ts == nil {
		return time.Time{}, false
	}
	s, ok := ts.(string)
	if !ok || s == "" {
		return time.Time{}, false
	}
	// normalize Z
	s = strings.ReplaceAll(s, "Z", "+00:00")
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		// try more relaxed parse
		t2, err2 := time.Parse("2006-01-02T15:04:05-07:00", s)
		if err2 != nil {
			return time.Time{}, false
		}
		return t2.UTC(), true
	}
	return t.UTC(), true
}

// --- simple classification (port of python patterns, smaller set) ---
var patterns = map[string]*regexp.Regexp{
	"cryptominer": regexp.MustCompile(`(?i)\b(xmrig|minerd|cpuminer|ethminer|t-rex|nbminer|minergate|stratum\\+tcp|pool\\.minexmr|xmr\\.pool|monero|nicehash|--donate-level|hashrate)\b`),
	"backdoor":    regexp.MustCompile(`(?i)\b(nc |ncat|netcat|mkfifo|/dev/tcp|/dev/udp|bash -i|python.*socket|perl.*socket|socat|reverse.?shell)\b`),
	"botnet":      regexp.MustCompile(`(?i)\b(mirai|qbot|gafgyt|bashlite|tsunami|ddos|flooder|wget.*\\.sh|curl.*\\.sh|chmod \+x|\./[a-z0-9]{4,}|busybox)\b`),
	"scanner":     regexp.MustCompile(`(?i)\b(nmap|masscan|zmap|zgrab|shodan|censys|nuclei|nikto|gobuster|ffuf|sqlmap|hydra)\b`),
}
var highSeverity = regexp.MustCompile(`(?i)\b(rm -rf /|dd if=/dev/zero|mkfs|fork.?bomb|chmod 777 /|chown.*root|curl.*\|.*sh|wget.*\|.*sh|bash -i|nc.*-e)\b`)

func classifyCommand(cmd string) []string {
	var matched []string
	for k, re := range patterns {
		if re.MatchString(cmd) {
			matched = append(matched, k)
		}
	}
	if len(matched) == 0 {
		return []string{"other"}
	}
	return matched
}

func severityOf(cmd string) string {
	if highSeverity.MatchString(cmd) {
		return "high"
	}
	cats := classifyCommand(cmd)
	for _, c := range cats {
		if c == "backdoor" || c == "cryptominer" {
			return "high"
		}
		if c == "botnet" || c == "persistence" || c == "lateral_movement" {
			return "medium"
		}
	}
	return "low"
}

// --- exported helpers used by handlers ---
func (s *Service) Events(limit int, typeFilter string) ([]map[string]any, error) {
	ev, err := s.readEvents()
	if err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	var res []map[string]any
	for i := len(ev) - 1; i >= 0; i-- {
		e := ev[i]
		eid, _ := e["eventid"].(string)
		if eid == "" {
			continue
		}
		// feed events set similar to python
		switch eid {
		case "cowrie.session.connect", "cowrie.session.closed", "cowrie.login.failed", "cowrie.login.success", "cowrie.command.input", "cowrie.direct-tcpip.request", "cowrie.session.file_download", "cowrie.session.file_upload":
		default:
			continue
		}
		if typeFilter != "" && !strings.Contains(strings.ToLower(eid), strings.ToLower(typeFilter)) {
			continue
		}
		out := map[string]any{
			"eventid":   eid,
			"src_ip":    e["src_ip"],
			"src_port":  e["src_port"],
			"username":  e["username"],
			"password":  e["password"],
			"timestamp": e["timestamp"],
			"session":   e["session"],
			"input":     e["input"],
			"protocol":  e["protocol"],
			"duration":  e["duration"],
			"outfile":   e["outfile"],
			"url":       e["url"],
		}
		res = append(res, out)
		if len(res) >= limit {
			break
		}
	}
	return res, nil
}

func (s *Service) Stats() (map[string]any, error) {
	ev, _ := s.readEvents()
	now := time.Now().UTC()
	cutoff24 := now.Add(-24 * time.Hour)

	ipCount := map[string]int{}
	userCount := map[string]int{}
	passCount := map[string]int{}
	eventCount := map[string]int{}
	sessions := map[string]struct{}{}
	commands := []map[string]any{}
	loginAttempts := 0
	loginSuccess := 0
	hourly := map[int]int{}

	for _, e := range ev {
		eid, _ := e["eventid"].(string)
		ip, _ := e["src_ip"].(string)
		tsStr, _ := e["timestamp"].(string)
		if ip != "" {
			ipCount[ip]++
		}
		eventCount[eid]++
		if eid == "cowrie.login.failed" {
			loginAttempts++
			if u, _ := e["username"].(string); u != "" {
				userCount[u]++
			}
			if p, _ := e["password"].(string); p != "" {
				passCount[p]++
			}
		} else if eid == "cowrie.login.success" {
			loginSuccess++
		}
		if sID, ok := e["session"].(string); ok && sID != "" {
			sessions[sID] = struct{}{}
		}
		if eid == "cowrie.command.input" {
			commands = append(commands, map[string]any{"ip": ip, "input": e["input"], "timestamp": tsStr, "session": e["session"]})
		}
		if tsStr != "" {
			if t, ok := parseTS(tsStr); ok && t.After(cutoff24) {
				hourly[t.Hour()]++
			}
		}
	}

	// build timeline last 24 hours
	currentHour := now.Truncate(time.Hour)
	timeline := []map[string]any{}
	for offset := 23; offset >= 0; offset-- {
		slot := currentHour.Add(time.Duration(-offset) * time.Hour)
		timeline = append(timeline, map[string]any{"hour": slot.Format(time.RFC3339), "label": slot.Format("15:00"), "attacks": hourly[slot.Hour()]})
	}

	// convert top lists
	topIPs := []map[string]any{}
	type kv struct {
		k string
		v int
	}
	iplist := []kv{}
	for k, v := range ipCount {
		iplist = append(iplist, kv{k, v})
	}
	sort.Slice(iplist, func(i, j int) bool { return iplist[i].v > iplist[j].v })
	for i, it := range iplist {
		if i >= 10 {
			break
		}
		topIPs = append(topIPs, map[string]any{"ip": it.k, "count": it.v})
	}

	topUsers := []map[string]any{}
	ulist := []kv{}
	for k, v := range userCount {
		ulist = append(ulist, kv{k, v})
	}
	sort.Slice(ulist, func(i, j int) bool { return ulist[i].v > ulist[j].v })
	for i, it := range ulist {
		if i >= 10 {
			break
		}
		topUsers = append(topUsers, map[string]any{"username": it.k, "count": it.v})
	}

	topPass := []map[string]any{}
	plist := []kv{}
	for k, v := range passCount {
		plist = append(plist, kv{k, v})
	}
	sort.Slice(plist, func(i, j int) bool { return plist[i].v > plist[j].v })
	for i, it := range plist {
		if i >= 10 {
			break
		}
		topPass = append(topPass, map[string]any{"password": it.k, "count": it.v})
	}

	return map[string]any{
		"total_events":   len(ev),
		"unique_ips":     len(ipCount),
		"total_sessions": len(sessions),
		"login_attempts": loginAttempts,
		"login_success":  loginSuccess,
		"top_ips":        topIPs,
		"top_usernames":  topUsers,
		"top_passwords":  topPass,
		"event_types":    eventCount,
		"recent_commands": func() []map[string]any {
			if len(commands) > 20 {
				return commands[len(commands)-20:]
			}
			return commands
		}(),
		"hourly_timeline": timeline,
		"server_utc":      time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (s *Service) Debug() (map[string]any, error) {
	files := s.findLogFiles()
	fileInfo := []map[string]any{}
	for _, f := range files {
		st, err := os.Stat(f)
		if err != nil {
			fileInfo = append(fileInfo, map[string]any{"path": f, "error": err.Error()})
			continue
		}
		// count lines cheaply
		cnt := 0
		fh, err := os.Open(f)
		if err == nil {
			scanner := bufio.NewScanner(fh)
			for scanner.Scan() {
				cnt++
			}
			fh.Close()
		}
		fileInfo = append(fileInfo, map[string]any{"path": f, "size_bytes": st.Size(), "lines": cnt})
	}
	ev, _ := s.readEvents()
	// filter real events (not local docker ranges)
	var real map[string]any
	for i := len(ev) - 1; i >= 0; i-- {
		e := ev[i]
		sip, _ := e["src_ip"].(string)
		if sip == "" || strings.HasPrefix(sip, "172.") || sip == "127.0.0.1" {
			continue
		}
		real = e
		break
	}
	return map[string]any{"cowrie_log_path": s.CowriePath, "log_files_found": files, "file_details": fileInfo, "total_events_read": len(ev), "real_attacker_events": func() int {
		if real != nil {
			return 1
		}
		return 0
	}(), "sample_event": real, "server_utc": time.Now().UTC().Format(time.RFC3339)}, nil
}

// --- richer analysis endpoints (simplified ports of the python logic) ---

func (s *Service) buildSessions(events []map[string]any) map[string]map[string]any {
	sessions := map[string]map[string]any{}
	for _, e := range events {
		sid, _ := e["session"].(string)
		if sid == "" {
			continue
		}
		if _, ok := sessions[sid]; !ok {
			sessions[sid] = map[string]any{"session_id": sid, "src_ip": "", "first_seen": "", "last_seen": "", "login_success": false, "credentials": []map[string]any{}, "commands": []map[string]any{}, "files": []map[string]any{}, "threat_cats": map[string]int{}, "severity": "low"}
		}
		srec := sessions[sid]
		if ip, _ := e["src_ip"].(string); ip != "" {
			if srec["src_ip"] == "" {
				srec["src_ip"] = ip
			}
		}
		ts, _ := e["timestamp"].(string)
		if ts != "" {
			if srec["first_seen"].(string) == "" || ts < srec["first_seen"].(string) {
				srec["first_seen"] = ts
			}
			if srec["last_seen"].(string) == "" || ts > srec["last_seen"].(string) {
				srec["last_seen"] = ts
			}
		}
		eid, _ := e["eventid"].(string)
		if eid == "cowrie.login.success" {
			srec["login_success"] = true
			creds := srec["credentials"].([]map[string]any)
			creds = append(creds, map[string]any{"username": e["username"], "password": e["password"], "success": true})
			srec["credentials"] = creds
		} else if eid == "cowrie.login.failed" {
			creds := srec["credentials"].([]map[string]any)
			creds = append(creds, map[string]any{"username": e["username"], "password": e["password"], "success": false})
			srec["credentials"] = creds
		} else if eid == "cowrie.command.input" {
			cmd, _ := e["input"].(string)
			if cmd != "" {
				cats := classifyCommand(cmd)
				sev := severityOf(cmd)
				// update threat_cats
				tc := srec["threat_cats"].(map[string]int)
				for _, c := range cats {
					tc[c]++
				}
				srec["threat_cats"] = tc
				// append command
				cmds := srec["commands"].([]map[string]any)
				cmds = append(cmds, map[string]any{"cmd": cmd, "timestamp": ts, "categories": cats, "severity": sev})
				srec["commands"] = cmds
				if sev == "high" {
					srec["severity"] = "high"
				}
			}
		} else if eid == "cowrie.session.file_download" || eid == "cowrie.session.file_upload" {
			files := srec["files"].([]map[string]any)
			files = append(files, map[string]any{"type": func() string {
				if eid == "cowrie.session.file_download" {
					return "download"
				}
				return "upload"
			}(), "url": e["url"], "outfile": e["outfile"], "shasum": e["shasum"], "ts": ts})
			srec["files"] = files
		}
	}
	return sessions
}

func (s *Service) Attackers(limit int) ([]map[string]any, error) {
	ev, _ := s.readEvents()
	attackers := map[string]map[string]any{}
	for _, e := range ev {
		ip, _ := e["src_ip"].(string)
		if ip == "" {
			continue
		}
		a, ok := attackers[ip]
		if !ok {
			a = map[string]any{"ip": ip, "attempts": 0, "success": 0, "sessions": map[string]struct{}{}, "usernames": map[string]struct{}{}, "passwords": map[string]struct{}{}, "commands": []string{}, "files": []map[string]any{}, "first_seen": "", "last_seen": "", "protocol": "ssh", "src_ports": map[string]struct{}{}}
		}
		eid, _ := e["eventid"].(string)
		if eid == "cowrie.login.failed" {
			a["attempts"] = a["attempts"].(int) + 1
			if u, _ := e["username"].(string); u != "" {
				a["usernames"].(map[string]struct{})[u] = struct{}{}
			}
			if p, _ := e["password"].(string); p != "" {
				a["passwords"].(map[string]struct{})[p] = struct{}{}
			}
		} else if eid == "cowrie.login.success" {
			a["success"] = a["success"].(int) + 1
		}
		if sID, _ := e["session"].(string); sID != "" {
			a["sessions"].(map[string]struct{})[sID] = struct{}{}
		}
		if eid == "cowrie.command.input" {
			if cmd, _ := e["input"].(string); cmd != "" {
				a["commands"] = append(a["commands"].([]string), cmd)
			}
		}
		if eid == "cowrie.session.file_download" || eid == "cowrie.session.file_upload" {
			a["files"] = append(a["files"].([]map[string]any), map[string]any{"url": e["url"], "outfile": e["outfile"], "ts": e["timestamp"]})
		}
		if proto, _ := e["protocol"].(string); proto != "" {
			a["protocol"] = proto
		}
		if sp, ok := e["src_port"].(string); ok && sp != "" {
			a["src_ports"].(map[string]struct{})[sp] = struct{}{}
		}
		ts, _ := e["timestamp"].(string)
		if ts != "" {
			if a["first_seen"].(string) == "" || ts < a["first_seen"].(string) {
				a["first_seen"] = ts
			}
			if a["last_seen"].(string) == "" || ts > a["last_seen"].(string) {
				a["last_seen"] = ts
			}
		}
		attackers[ip] = a
	}
	// convert to list
	list := []map[string]any{}
	for ip, a := range attackers {
		sessionsSet := a["sessions"].(map[string]struct{})
		ipsrc := a["src_ports"].(map[string]struct{})
		// convert sets
		sessionIds := []string{}
		for sid := range sessionsSet {
			sessionIds = append(sessionIds, sid)
		}
		topCommands := []string{}
		if cmds, ok := a["commands"].([]string); ok && len(cmds) > 0 {
			topCommands = cmds[len(cmds)-5:]
		}
		list = append(list, map[string]any{"ip": ip, "attempts": a["attempts"], "success": a["success"], "sessions": len(sessionIds), "session_ids": sessionIds, "usernames": func() []string {
			out := []string{}
			for k := range a["usernames"].(map[string]struct{}) {
				out = append(out, k)
			}
			return out
		}(), "passwords": func() []string {
			out := []string{}
			for k := range a["passwords"].(map[string]struct{}) {
				out = append(out, k)
			}
			return out
		}(), "commands": topCommands, "files": a["files"], "first_seen": a["first_seen"], "last_seen": a["last_seen"], "protocol": a["protocol"], "src_ports": func() []string {
			out := []string{}
			for k := range ipsrc {
				out = append(out, k)
			}
			return out
		}()})
	}
	// sort by attempts
	sort.Slice(list, func(i, j int) bool { ai := list[i]["attempts"].(int); aj := list[j]["attempts"].(int); return ai > aj })
	if limit > 0 && len(list) > limit {
		list = list[:limit]
	}
	return list, nil
}

func (s *Service) Credentials() (map[string]any, error) {
	ev, _ := s.readEvents()
	pairCount := map[string]int{}
	userCount := map[string]int{}
	passCount := map[string]int{}
	total := 0
	for _, e := range ev {
		if eid, _ := e["eventid"].(string); eid != "cowrie.login.failed" {
			continue
		}
		u, _ := e["username"].(string)
		p, _ := e["password"].(string)
		total++
		if u != "" {
			userCount[u]++
		}
		if p != "" {
			passCount[p]++
		}
		if u != "" && p != "" {
			pairCount[u+"\x00"+p]++
		}
	}
	// convert top lists
	topPairs := []map[string]any{}
	for k, v := range pairCount {
		parts := strings.SplitN(k, "\x00", 2)
		topPairs = append(topPairs, map[string]any{"username": parts[0], "password": parts[1], "count": v})
	}
	sort.Slice(topPairs, func(i, j int) bool { return topPairs[i]["count"].(int) > topPairs[j]["count"].(int) })
	userList := []map[string]any{}
	for u, c := range userCount {
		userList = append(userList, map[string]any{"username": u, "count": c})
	}
	passList := []map[string]any{}
	for p, c := range passCount {
		passList = append(passList, map[string]any{"password": p, "count": c})
	}
	sort.Slice(userList, func(i, j int) bool { return userList[i]["count"].(int) > userList[j]["count"].(int) })
	sort.Slice(passList, func(i, j int) bool { return passList[i]["count"].(int) > passList[j]["count"].(int) })
	uniquePairs := len(pairCount)
	diversity := 0.0
	if total > 0 {
		diversity = float64(uniquePairs) / float64(total)
	}
	return map[string]any{"total_attempts": total, "unique_pairs": uniquePairs, "diversity_score": diversity, "top_pairs": topPairs, "top_usernames": userList, "top_passwords": passList}, nil
}

func (s *Service) TopCommands() (map[string]any, error) {
	ev, _ := s.readEvents()
	cmdCount := map[string]int{}
	total := 0
	categories := map[string]int{}
	for _, e := range ev {
		if eid, _ := e["eventid"].(string); eid != "cowrie.command.input" {
			continue
		}
		cmd, _ := e["input"].(string)
		cmd = strings.TrimSpace(cmd)
		if cmd == "" {
			continue
		}
		cmdCount[cmd]++
		total++
		// categorize
		if regexp.MustCompile(`(?i)\b(wget|curl|fetch|tftp|ftp|scp|nc |ncat)\b`).MatchString(cmd) {
			categories["download"]++
		} else if regexp.MustCompile(`(?i)\b(uname|whoami|id|hostname|ifconfig|ip a|cat /etc|ls|pwd|ps|netstat|ss |nmap|ping)\b`).MatchString(cmd) {
			categories["recon"]++
		} else if regexp.MustCompile(`(?i)\b(crontab|systemctl|service|rc\\.local|\\.bashrc|\\.profile|authorized_keys|adduser|useradd|passwd)\b`).MatchString(cmd) {
			categories["persistence"]++
		} else {
			categories["other"]++
		}
	}
	topCommands := []map[string]any{}
	for k, v := range cmdCount {
		topCommands = append(topCommands, map[string]any{"command": k, "count": v})
	}
	sort.Slice(topCommands, func(i, j int) bool { return topCommands[i]["count"].(int) > topCommands[j]["count"].(int) })
	return map[string]any{"total_commands": total, "unique_commands": len(cmdCount), "categories": categories, "top_commands": topCommands}, nil
}

func (s *Service) Session(sessionID string) (map[string]any, error) {
	ev, _ := s.readEvents()
	var session []map[string]any
	for _, e := range ev {
		if sid, _ := e["session"].(string); sid == sessionID {
			session = append(session, e)
		}
	}
	if len(session) == 0 {
		return nil, os.ErrNotExist
	}
	sort.Slice(session, func(i, j int) bool { return (session[i]["timestamp"].(string)) < (session[j]["timestamp"].(string)) })
	ip := session[0]["src_ip"].(string)
	first := session[0]["timestamp"].(string)
	last := session[len(session)-1]["timestamp"].(string)
	commands := []string{}
	loginOk := false
	credentials := []map[string]any{}
	files := []map[string]any{}
	for _, e := range session {
		if e["eventid"].(string) == "cowrie.command.input" {
			if c, _ := e["input"].(string); c != "" {
				commands = append(commands, c)
			}
		}
		if e["eventid"].(string) == "cowrie.login.success" {
			loginOk = true
		}
		if e["eventid"].(string) == "cowrie.login.failed" || e["eventid"].(string) == "cowrie.login.success" {
			credentials = append(credentials, map[string]any{"username": e["username"], "password": e["password"]})
		}
		if e["eventid"].(string) == "cowrie.session.file_download" || e["eventid"].(string) == "cowrie.session.file_upload" {
			files = append(files, map[string]any{"url": e["url"], "outfile": e["outfile"], "shasum": e["shasum"], "timestamp": e["timestamp"]})
		}
	}
	duration := 0.0
	t0, ok0 := parseTS(first)
	t1, ok1 := parseTS(last)
	if ok0 && ok1 {
		duration = t1.Sub(t0).Seconds()
	}
	return map[string]any{"session_id": sessionID, "src_ip": ip, "first_seen": first, "last_seen": last, "duration_s": duration, "login_success": loginOk, "credentials": credentials, "commands": commands, "files": files, "event_count": len(session), "events": session}, nil
}

func (s *Service) DailyTimeline(days int) (map[string]any, error) {
	if days <= 0 || days > 90 {
		days = 30
	}
	ev, _ := s.readEvents()
	now := time.Now().UTC()
	cutoff := now.Add(-time.Duration(days*24) * time.Hour)
	daily := map[string]int{}
	dailyLogins := map[string]int{}
	for _, e := range ev {
		tsStr, _ := e["timestamp"].(string)
		if tsStr == "" {
			continue
		}
		t, ok := parseTS(tsStr)
		if !ok || t.Before(cutoff) {
			continue
		}
		key := t.Format("2006-01-02")
		daily[key]++
		if e["eventid"].(string) == "cowrie.login.failed" {
			dailyLogins[key]++
		}
	}
	timeline := []map[string]any{}
	for offset := days - 1; offset >= 0; offset-- {
		day := now.AddDate(0, 0, -offset).Format("2006-01-02")
		timeline = append(timeline, map[string]any{"date": day, "attacks": daily[day], "login_failed": dailyLogins[day]})
	}
	peak := map[string]any{}
	maxAtt := 0
	for _, d := range timeline {
		if d["attacks"].(int) > maxAtt {
			maxAtt = d["attacks"].(int)
			peak = d
		}
	}
	total := 0
	for _, d := range timeline {
		total += d["attacks"].(int)
	}
	return map[string]any{"days": days, "timeline": timeline, "peak_day": peak, "total": total}, nil
}

func (s *Service) Files(limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	ev, _ := s.readEvents()
	fileEvents := []map[string]any{}
	for i := len(ev) - 1; i >= 0; i-- {
		e := ev[i]
		eid, _ := e["eventid"].(string)
		if eid != "cowrie.session.file_download" && eid != "cowrie.session.file_upload" {
			continue
		}
		fileEvents = append(fileEvents, map[string]any{"type": func() string {
			if eid == "cowrie.session.file_download" {
				return "download"
			}
			return "upload"
		}(), "src_ip": e["src_ip"], "session": e["session"], "url": e["url"], "outfile": e["outfile"], "shasum": e["shasum"], "timestamp": e["timestamp"]})
		if len(fileEvents) >= limit {
			break
		}
	}
	return fileEvents, nil
}

func (s *Service) Summary() (map[string]any, error) {
	ev, _ := s.readEvents()
	now := time.Now().UTC()
	cut1 := now.Add(-1 * time.Hour)
	cut24 := now.Add(-24 * time.Hour)
	counts := map[string]int{"1h": 0, "24h": 0, "total": len(ev)}
	logins := map[string]int{"1h": 0, "24h": 0}
	unique24 := map[string]struct{}{}
	for _, e := range ev {
		ts, _ := e["timestamp"].(string)
		t, ok := parseTS(ts)
		if !ok {
			continue
		}
		if t.After(cut24) {
			counts["24h"]++
			if ip, _ := e["src_ip"].(string); ip != "" {
				unique24[ip] = struct{}{}
			}
			if e["eventid"].(string) == "cowrie.login.success" {
				logins["24h"]++
			}
		}
		if t.After(cut1) {
			counts["1h"]++
			if e["eventid"].(string) == "cowrie.login.success" {
				logins["1h"]++
			}
		}
	}
	return map[string]any{"events_1h": counts["1h"], "events_24h": counts["24h"], "events_total": counts["total"], "login_success_1h": logins["1h"], "login_success_24h": logins["24h"], "unique_ips_24h": len(unique24), "server_utc": time.Now().UTC().Format(time.RFC3339)}, nil
}

func (s *Service) Alerts(hours, limit int) (map[string]any, error) {
	if hours <= 0 {
		hours = 24
	}
	ev, _ := s.readEvents()
	cutoff := time.Now().UTC().Add(-time.Duration(hours) * time.Hour)
	sessions := s.buildSessions(ev)
	alerts := []map[string]any{}
	for sid, rec := range sessions {
		first, _ := rec["first_seen"].(string)
		t, ok := parseTS(first)
		if !ok || t.Before(cutoff) {
			continue
		}
		reasons := []string{}
		if rec["login_success"].(bool) {
			reasons = append(reasons, "login_success")
		}
		cmds := rec["commands"].([]map[string]any)
		highCmds := []map[string]any{}
		for _, c := range cmds {
			if c["severity"].(string) == "high" {
				highCmds = append(highCmds, c)
			}
		}
		if len(highCmds) > 0 {
			reasons = append(reasons, "dangerous_command")
		}
		if files := rec["files"].([]map[string]any); len(files) > 0 {
			reasons = append(reasons, "file_transfer")
		}
		if len(reasons) == 0 {
			continue
		}
		sev := "medium"
		for _, r := range reasons {
			if r == "login_success" || r == "dangerous_command" {
				sev = "high"
			}
		}
		alerts = append(alerts, map[string]any{"session_id": sid, "src_ip": rec["src_ip"], "first_seen": rec["first_seen"], "last_seen": rec["last_seen"], "severity": sev, "reasons": reasons, "login_success": rec["login_success"], "command_count": len(cmds), "file_count": len(rec["files"].([]map[string]any)), "high_severity_commands": func() []string {
			out := []string{}
			for i, c := range highCmds {
				if i >= 5 {
					break
				}
				out = append(out, c["cmd"].(string))
			}
			return out
		}(), "files": rec["files"].([]map[string]any), "threat_categories": rec["threat_cats"]})
	}
	// sort alerts
	order := map[string]int{"high": 0, "medium": 1, "low": 2}
	sort.Slice(alerts, func(i, j int) bool {
		return order[alerts[i]["severity"].(string)] < order[alerts[j]["severity"].(string)]
	})
	if limit > 0 && len(alerts) > limit {
		alerts = alerts[:limit]
	}
	return map[string]any{"total": len(alerts), "hours": hours, "alerts": alerts}, nil
}

func (s *Service) Threats(days int) (map[string]any, error) {
	if days <= 0 {
		days = 7
	}
	ev, _ := s.readEvents()
	cutoff := time.Now().UTC().Add(-time.Duration(days*24) * time.Hour)
	sessions := s.buildSessions(ev)
	categories := map[string][]map[string]any{}
	severityCounts := map[string]int{"high": 0, "medium": 0, "low": 0}
	dailyThreats := map[string]map[string]int{}
	for _, rec := range sessions {
		first, _ := rec["first_seen"].(string)
		t, ok := parseTS(first)
		if !ok || t.Before(cutoff) {
			continue
		}
		sev := rec["severity"].(string)
		severityCounts[sev]++
		day := t.Format("2006-01-02")
		if _, ok := dailyThreats[day]; !ok {
			dailyThreats[day] = map[string]int{}
		}
		// dominant cats
		tc := rec["threat_cats"].(map[string]int)
		dominant := []map[string]any{}
		for k, v := range tc {
			dominant = append(dominant, map[string]any{"cat": k, "count": v})
		}
		if len(dominant) == 0 {
			categories["recon"] = append(categories["recon"], map[string]any{"session_id": rec["session_id"], "src_ip": rec["src_ip"], "first_seen": rec["first_seen"], "severity": sev, "commands": len(rec["commands"].([]map[string]any))})
			dailyThreats[day]["recon"]++
			continue
		}
		for _, d := range dominant {
			cat := d["cat"].(string)
			categories[cat] = append(categories[cat], map[string]any{"session_id": rec["session_id"], "src_ip": rec["src_ip"], "first_seen": rec["first_seen"], "severity": sev, "commands": len(rec["commands"].([]map[string]any)), "example_cmds": func() []string {
				res := []string{}
				for _, c := range rec["commands"].([]map[string]any) {
					if strings.Contains(c["cmd"].(string), cat) {
						res = append(res, c["cmd"].(string))
					}
				}
				if len(res) > 3 {
					return res[:3]
				}
				return res
			}()})
			dailyThreats[day][cat]++
		}
	}
	// build summary
	summary := []map[string]any{}
	for cat, list := range categories {
		ips := map[string]int{}
		for _, s := range list {
			ips[s["src_ip"].(string)]++
		}
		highCount := 0
		for _, it := range list {
			if it["severity"].(string) == "high" {
				highCount++
			}
		}
		summary = append(summary, map[string]any{"category": cat, "total": len(list), "unique_ips": len(ips), "top_ips": func() []map[string]any {
			out := []map[string]any{}
			for ip, c := range ips {
				out = append(out, map[string]any{"ip": ip, "count": c})
			}
			sort.Slice(out, func(i, j int) bool { return out[i]["count"].(int) > out[j]["count"].(int) })
			if len(out) > 5 {
				return out[:5]
			}
			return out
		}(), "high_count": highCount, "examples": list[:min(len(list), 5)]})
	}
	// daily timeline
	allDays := []map[string]any{}
	for offset := days - 1; offset >= 0; offset-- {
		day := time.Now().UTC().AddDate(0, 0, -offset).Format("2006-01-02")
		allDays = append(allDays, map[string]any{"date": day, "categories": dailyThreats[day], "total": func() int {
			sum := 0
			for _, v := range dailyThreats[day] {
				sum += v
			}
			return sum
		}()})
	}
	return map[string]any{"days": days, "severity": severityCounts, "categories": summary, "daily_timeline": allDays, "total_sessions": func() int {
		tot := 0
		for _, v := range categories {
			tot += len(v)
		}
		return tot
	}(), "server_utc": time.Now().UTC().Format(time.RFC3339)}, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (s *Service) AttackerProfile(ip string) (map[string]any, error) {
	ev, _ := s.readEvents()
	sessions := s.buildSessions(ev)
	ipSessions := []map[string]any{}
	for _, rec := range sessions {
		if rec["src_ip"].(string) == ip {
			ipSessions = append(ipSessions, rec)
		}
	}
	if len(ipSessions) == 0 {
		return nil, os.ErrNotExist
	}
	allCommands := []map[string]any{}
	allCreds := []map[string]any{}
	allFiles := []map[string]any{}
	threatTotals := map[string]int{}
	loginSuccesses := 0
	for _, srec := range ipSessions {
		for _, c := range srec["commands"].([]map[string]any) {
			allCommands = append(allCommands, c)
		}
		for _, c := range srec["credentials"].([]map[string]any) {
			allCreds = append(allCreds, c)
		}
		for _, f := range srec["files"].([]map[string]any) {
			allFiles = append(allFiles, f)
		}
		for k, v := range srec["threat_cats"].(map[string]int) {
			threatTotals[k] += v
		}
		if srec["login_success"].(bool) {
			loginSuccesses++
		}
	}
	uniqueCreds := map[string]map[string]any{}
	for _, c := range allCreds {
		k := c["username"].(string) + "\x00" + c["password"].(string)
		uniqueCreds[k] = c
	}
	// sort commands by timestamp
	sort.Slice(allCommands, func(i, j int) bool {
		return allCommands[i]["timestamp"].(string) < allCommands[j]["timestamp"].(string)
	})
	highCmds := []map[string]any{}
	medCmds := []map[string]any{}
	for _, c := range allCommands {
		if c["severity"].(string) == "high" {
			highCmds = append(highCmds, c)
		} else if c["severity"].(string) == "medium" {
			medCmds = append(medCmds, c)
		}
	}
	riskScore := 0
	riskScore = min(100, len(highCmds)*20+len(medCmds)*5+loginSuccesses*15)
	firstSeen := ""
	lastSeen := ""
	for _, srec := range ipSessions {
		if fs := srec["first_seen"].(string); fs != "" && (firstSeen == "" || fs < firstSeen) {
			firstSeen = fs
		}
		if ls := srec["last_seen"].(string); ls != "" && (lastSeen == "" || ls > lastSeen) {
			lastSeen = ls
		}
	}
	return map[string]any{"ip": ip, "first_seen": firstSeen, "last_seen": lastSeen, "total_sessions": len(ipSessions), "login_successes": loginSuccesses, "risk_score": riskScore, "threat_categories": threatTotals, "dominant_threat": func() string {
		for k, _ := range threatTotals {
			return k
		}
		return "unknown"
	}(), "credentials": map[string]any{"total_attempts": len(allCreds), "unique_pairs": len(uniqueCreds), "top_pairs": func() []map[string]any {
		out := []map[string]any{}
		i := 0
		for _, v := range uniqueCreds {
			out = append(out, v)
			i++
			if i >= 10 {
				break
			}
		}
		return out
	}()}, "commands": map[string]any{"total": len(allCommands), "high_severity": func() []string {
		out := []string{}
		for i, c := range highCmds {
			if i >= 10 {
				break
			}
			out = append(out, c["cmd"].(string))
		}
		return out
	}(), "all": func() []map[string]any {
		if len(allCommands) > 50 {
			return allCommands[len(allCommands)-50:]
		}
		return allCommands
	}()}, "files": map[string]any{"total": len(allFiles), "list": allFiles}, "sessions": ipSessions, "server_utc": time.Now().UTC().Format(time.RFC3339)}, nil
}

func (s *Service) DownloadsAnalysis(limit int) (map[string]any, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	ev, _ := s.readEvents()
	seen := map[string]map[string]any{}
	ipMap := map[string]map[string]struct{}{}
	for _, e := range ev {
		eid, _ := e["eventid"].(string)
		if eid != "cowrie.session.file_download" && eid != "cowrie.session.file_upload" {
			continue
		}
		sha, _ := e["shasum"].(string)
		url, _ := e["url"].(string)
		ip, _ := e["src_ip"].(string)
		key := sha
		if key == "" {
			key = url
		}
		if key == "" {
			continue
		}
		if _, ok := seen[key]; !ok {
			seen[key] = map[string]any{"sha256": nil, "url": url, "outfile": e["outfile"], "type": func() string {
				if eid == "cowrie.session.file_download" {
					return "download"
				}
				return "upload"
			}(), "first_seen": e["timestamp"], "last_seen": e["timestamp"], "session": e["session"], "count": 0, "virustotal_url": nil}
		}
		if e["timestamp"].(string) > seen[key]["last_seen"].(string) {
			seen[key]["last_seen"] = e["timestamp"]
		}
		seen[key]["count"] = seen[key]["count"].(int) + 1
		if ip != "" {
			if _, ok := ipMap[key]; !ok {
				ipMap[key] = map[string]struct{}{}
			}
			ipMap[key][ip] = struct{}{}
		}
	}
	out := []map[string]any{}
	for k, v := range seen {
		ips := []string{}
		for ip := range ipMap[k] {
			ips = append(ips, ip)
		}
		v["unique_ips"] = len(ips)
		v["source_ips"] = ips
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i]["count"].(int) > out[j]["count"].(int) })
	if len(out) > limit {
		out = out[:limit]
	}
	return map[string]any{"total_unique_files": len(out), "files": out, "server_utc": time.Now().UTC().Format(time.RFC3339)}, nil
}

func (s *Service) GeoIP(limit int) ([]map[string]any, error) {
	// GeoIP requires a GeoLite DB; return top attacking IPs without geodata for now
	ev, _ := s.readEvents()
	ipCount := map[string]int{}
	for _, e := range ev {
		if ip, _ := e["src_ip"].(string); ip != "" {
			ipCount[ip]++
		}
	}
	ips := []map[string]any{}
	for ip, c := range ipCount {
		ips = append(ips, map[string]any{"ip": ip, "count": c})
	}
	sort.Slice(ips, func(i, j int) bool { return ips[i]["count"].(int) > ips[j]["count"].(int) })
	if limit > 0 && len(ips) > limit {
		ips = ips[:limit]
	}
	return ips, nil
}

func (s *Service) Banned(jail string, activeOnly bool) (map[string]any, error) {
	// Fail2ban DB parsing is not implemented; return error if DB not present
	if _, err := os.Stat(s.Fail2banPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("fail2ban DB not found: %s", s.Fail2banPath)
	}
	return map[string]any{"error": "banned list via Fail2Ban not implemented in Go yet"}, nil
}
