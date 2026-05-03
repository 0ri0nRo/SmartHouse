package trains

import (
	"context"
	"database/sql"
	"fmt"
	_ "github.com/lib/pq"
	"time"
)

type TrainRow struct {
	TrainNumber string `json:"train_number"`
	Destination string `json:"destination"`
	Time        string `json:"time"`
	Delay       any    `json:"delay"`
	Platform    any    `json:"platform"`
	Stops       any    `json:"stops"`
	Timestamp   string `json:"timestamp"`
}

type Service struct {
	db *sql.DB
}

func New(dsn string) (*Service, error) {
	if dsn == "" {
		return &Service{db: nil}, nil
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(2)
	return &Service{db: db}, nil
}

// FetchAndSave: currently only reads from DB and returns upcoming and recent trains matching destination.
func (s *Service) FetchAndSave(ctx context.Context, trainDestination, fromStation string) (map[string]any, error) {
	if s.db == nil {
		return map[string]any{"result": []any{}, "result_old": []any{}}, nil
	}
	now := time.Now()
	resFuture, err := s.queryTrains(ctx, now, true, trainDestination, 4)
	if err != nil {
		return nil, err
	}
	resOld, err := s.queryTrains(ctx, now, false, trainDestination, 4)
	if err != nil {
		return nil, err
	}
	return map[string]any{"result": resFuture, "result_old": resOld}, nil
}

func (s *Service) queryTrains(ctx context.Context, now time.Time, future bool, trainDestination string, limit int) ([]TrainRow, error) {
	var q string
	if future {
		q = `SELECT train_number, destination, time, delay, platform, stops, timestamp FROM trains WHERE time > $1 AND stops ILIKE $2 ORDER BY time ASC LIMIT $3`
	} else {
		q = `SELECT train_number, destination, time, delay, platform, stops, timestamp FROM trains WHERE time < $1 AND stops ILIKE $2 ORDER BY time DESC LIMIT $3`
	}
	rows, err := s.db.QueryContext(ctx, q, now.Format("15:04:05"), "%"+trainDestination+"%", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TrainRow{}
	for rows.Next() {
		var tn sql.NullString
		var dest sql.NullString
		var t sql.NullTime
		var delay sql.NullString
		var platform sql.NullString
		var stops sql.NullString
		var ts sql.NullTime
		if err := rows.Scan(&tn, &dest, &t, &delay, &platform, &stops, &ts); err != nil {
			return nil, err
		}
		tr := TrainRow{}
		if tn.Valid {
			tr.TrainNumber = tn.String
		}
		if dest.Valid {
			tr.Destination = dest.String
		}
		if t.Valid {
			tr.Time = t.Time.Format("15:04")
		}
		if delay.Valid {
			tr.Delay = delay.String
		}
		if platform.Valid {
			tr.Platform = platform.String
		}
		if stops.Valid {
			tr.Stops = stops.String
		}
		if ts.Valid {
			tr.Timestamp = ts.Time.Format(time.RFC3339)
		}
		out = append(out, tr)
	}
	return out, rows.Err()
}
