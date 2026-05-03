package security

import (
	"context"
	"database/sql"
	"fmt"
	_ "github.com/lib/pq"
	"time"
)

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
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(1)
	return &Service{db: db}, nil
}

func (s *Service) GetAlarm(ctx context.Context) (map[string]any, error) {
	if s.db == nil {
		return map[string]any{"status": false, "timestamp": nil}, nil
	}
	row := s.db.QueryRowContext(ctx, `SELECT status, timestamp FROM alarms_status ORDER BY timestamp DESC LIMIT 1;`)
	var status sql.NullBool
	var ts sql.NullTime
	if err := row.Scan(&status, &ts); err != nil {
		if err == sql.ErrNoRows {
			return map[string]any{"status": false, "timestamp": nil}, nil
		}
		return nil, err
	}
	res := map[string]any{"status": false, "timestamp": nil}
	if status.Valid {
		res["status"] = status.Bool
	}
	if ts.Valid {
		res["timestamp"] = ts.Time.Format(time.RFC3339)
	}
	return res, nil
}

func (s *Service) SetAlarm(ctx context.Context, status bool) error {
	if s.db == nil {
		return fmt.Errorf("no db configured")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM alarms_status;`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO alarms_status (status) VALUES ($1);`, status); err != nil {
		return err
	}
	return tx.Commit()
}
