package picologs

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	_ "github.com/lib/pq"
	"sync"
	"time"
)

type LogEntry map[string]any

type Service struct {
	mu    sync.Mutex
	data  []LogEntry
	db    *sql.DB
	subs  map[chan LogEntry]struct{}
	subMu sync.Mutex
}

// New creates a picologs service. If dsn is empty, runs in-memory; otherwise uses Postgres.
func New(dsn string) (*Service, error) {
	s := &Service{data: make([]LogEntry, 0, 1024), subs: make(map[chan LogEntry]struct{})}
	if dsn == "" {
		return s, nil
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(2)
	s.db = db
	return s, nil
}

func (s *Service) GetRecent(limit int) []LogEntry {
	if s.db != nil {
		if limit <= 0 {
			limit = 50
		}
		q := `SELECT payload, received_at FROM pico_logs ORDER BY received_at DESC LIMIT $1;`
		rows, err := s.db.QueryContext(context.Background(), q, limit)
		if err != nil {
			return []LogEntry{}
		}
		defer rows.Close()
		out := make([]LogEntry, 0)
		for rows.Next() {
			var payloadBytes []byte
			var ts time.Time
			if err := rows.Scan(&payloadBytes, &ts); err != nil {
				continue
			}
			var m LogEntry
			if err := json.Unmarshal(payloadBytes, &m); err != nil {
				continue
			}
			m["received_at"] = ts.Format(time.RFC3339)
			out = append(out, m)
		}
		return out
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if limit <= 0 {
		limit = 50
	}
	n := len(s.data)
	if n == 0 {
		return []LogEntry{}
	}
	if limit > n {
		limit = n
	}
	out := make([]LogEntry, 0, limit)
	for i := n - limit; i < n; i++ {
		out = append(out, s.data[i])
	}
	return out
}

func (s *Service) StoreLog(ctx context.Context, entry LogEntry) (string, error) {
	id := fmt.Sprintf("pico-%d", time.Now().UnixNano())
	entry["id"] = id
	entry["received_at"] = time.Now().Format(time.RFC3339)

	if s.db != nil {
		b, err := json.Marshal(entry)
		if err != nil {
			return "", err
		}
		_, err = s.db.ExecContext(ctx, `INSERT INTO pico_logs (id, payload, received_at) VALUES ($1, $2::jsonb, $3)`, id, string(b), time.Now())
		if err != nil {
			return "", err
		}
	} else {
		s.mu.Lock()
		s.data = append(s.data, entry)
		s.mu.Unlock()
	}

	// publish to subscribers
	s.subMu.Lock()
	for ch := range s.subs {
		select {
		case ch <- entry:
		default:
		}
	}
	s.subMu.Unlock()

	return id, nil
}

func (s *Service) ClearLogs(ctx context.Context) error {
	if s.db != nil {
		_, err := s.db.ExecContext(ctx, `DELETE FROM pico_logs`)
		return err
	}
	s.mu.Lock()
	s.data = make([]LogEntry, 0)
	s.mu.Unlock()
	return nil
}

func (s *Service) GetStats(ctx context.Context) map[string]any {
	if s.db != nil {
		var cnt int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pico_logs`).Scan(&cnt); err != nil {
			return map[string]any{"count": 0}
		}
		return map[string]any{"count": cnt}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return map[string]any{"count": len(s.data)}
}

// Subscribe returns a channel that will receive new LogEntry objects. Caller should close the channel when done.
func (s *Service) Subscribe() chan LogEntry {
	ch := make(chan LogEntry, 8)
	s.subMu.Lock()
	s.subs[ch] = struct{}{}
	s.subMu.Unlock()
	return ch
}

func (s *Service) Unsubscribe(ch chan LogEntry) {
	s.subMu.Lock()
	delete(s.subs, ch)
	close(ch)
	s.subMu.Unlock()
}
