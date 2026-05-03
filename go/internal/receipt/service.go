package receipt

import (
	"context"
	"database/sql"
	"fmt"
	_ "github.com/lib/pq"
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
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(2)
	return &Service{db: db}, nil
}

func (s *Service) Health(ctx context.Context) (map[string]string, error) {
	return map[string]string{"status": "ok", "service": "receipt_service"}, nil
}

func (s *Service) GetPrezziMinimi(ctx context.Context) ([]map[string]any, error) {
	if s.db == nil {
		return []map[string]any{}, nil
	}
	q := "SELECT * FROM prezzi_minimi ORDER BY prodotto"
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	out := []map[string]any{}
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		m := map[string]any{}
		for i, c := range cols {
			m[c] = vals[i]
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Service) GetStatisticheGenerali(ctx context.Context) (map[string]any, error) {
	if s.db == nil {
		return map[string]any{}, nil
	}
	// General stats
	general := map[string]any{}
	row := s.db.QueryRowContext(ctx, "SELECT * FROM statistiche_generali")
	// Use a simple scan into placeholders if schema unknown
	// If no rows, return empty
	var dummy interface{}
	if err := row.Scan(&dummy); err != nil {
		if err == sql.ErrNoRows {
			return map[string]any{"general": map[string]any{}, "top_products": []any{}, "supermarket_comparison": []any{}}, nil
		}
		// best-effort: return error
		return nil, err
	}
	_ = general
	// Top products
	top := []map[string]any{}
	trows, err := s.db.QueryContext(ctx, "SELECT * FROM top_prodotti LIMIT 10")
	if err == nil {
		defer trows.Close()
		cols, _ := trows.Columns()
		for trows.Next() {
			vals := make([]interface{}, len(cols))
			ptrs := make([]interface{}, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			if err := trows.Scan(ptrs...); err != nil {
				continue
			}
			m := map[string]any{}
			for i, c := range cols {
				m[c] = vals[i]
			}
			top = append(top, m)
		}
	}
	// Supermarket comparison
	comp := []map[string]any{}
	crows, err := s.db.QueryContext(ctx, "SELECT * FROM confronto_supermercati")
	if err == nil {
		defer crows.Close()
		cols, _ := crows.Columns()
		for crows.Next() {
			vals := make([]interface{}, len(cols))
			ptrs := make([]interface{}, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			if err := crows.Scan(ptrs...); err != nil {
				continue
			}
			m := map[string]any{}
			for i, c := range cols {
				m[c] = vals[i]
			}
			comp = append(comp, m)
		}
	}
	return map[string]any{"general": general, "top_products": top, "supermarket_comparison": comp}, nil
}

func (s *Service) GetScontriniList(ctx context.Context) ([]map[string]any, error) {
	if s.db == nil {
		return []map[string]any{}, nil
	}
	q := `SELECT s.*, sup.nome as supermercato_nome FROM scontrini s JOIN supermercati sup ON s.supermercato_id = sup.id ORDER BY s.data_acquisto DESC`
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	out := []map[string]any{}
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		m := map[string]any{}
		for i, c := range cols {
			m[c] = vals[i]
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ProcessReceiptFile currently not implemented (OCR heavy). Return error to indicate not supported.
func (s *Service) ProcessReceiptFile(ctx context.Context, filename string) (map[string]any, error) {
	return nil, fmt.Errorf("receipt processing (OCR) not implemented in Go yet")
}
