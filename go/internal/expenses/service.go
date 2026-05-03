package expenses

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type Service struct {
	BaseURL string
	client  *http.Client
	sheets  *SheetsService
}

// New creates an expenses service. If EXPENSES_SERVICE_URL is set, the service will proxy
// requests to that URL (expected to be the existing Python service). If not set, methods
// will return empty results or an error.
func New() (*Service, error) {
	base := os.Getenv("EXPENSES_SERVICE_URL")
	// try to initialize SheetsService if credentials provided
	creds := os.Getenv("EXPENSES_CREDENTIALS_PATH")
	sheetID := os.Getenv("EXPENSES_SPREADSHEET_ID")
	s := &Service{BaseURL: base, client: &http.Client{Timeout: 15 * time.Second}}
	if creds != "" && sheetID != "" {
		if ss, err := NewSheetsService(context.Background(), creds, sheetID); err == nil {
			s.sheets = ss
			return s, nil
		}
	}
	return s, nil
}

// GetSummary fetches the summary from the upstream service or returns an empty map if not configured.
func (s *Service) GetSummary(ctx context.Context) (map[string]any, error) {
	if s.sheets != nil {
		return s.sheets.GetSummary(ctx, 0)
	}
	if s.BaseURL == "" {
		return map[string]any{}, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.BaseURL+"/api/expenses", nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("upstream returned %d", resp.StatusCode)
	}
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}

// AddExpense forwards an add expense request to the upstream service.
func (s *Service) AddExpense(ctx context.Context, description, date string, amount any, category string) error {
	if s.sheets != nil {
		// convert amount to float64
		var f float64
		switch v := amount.(type) {
		case float64:
			f = v
		case int:
			f = float64(v)
		case string:
			// try parse replacing comma
			v2 := strings.ReplaceAll(v, ",", ".")
			if parsed, err := strconv.ParseFloat(v2, 64); err == nil {
				f = parsed
			} else {
				return fmt.Errorf("invalid amount format")
			}
		default:
			return fmt.Errorf("unsupported amount type")
		}
		return s.sheets.AddExpense(ctx, description, date, f, category)
	}
	if s.BaseURL == "" {
		return fmt.Errorf("expenses service not configured")
	}
	payload := map[string]any{
		"description": description,
		"date":        date,
		"amount":      amount,
		"category":    category,
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.BaseURL+"/api/expenses", bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("upstream returned %d", resp.StatusCode)
	}
	return nil
}

func (s *Service) GetP49(ctx context.Context) (any, error) {
	if s.sheets != nil {
		return s.sheets.GetP49(ctx)
	}
	// fallback to proxy
	if s.BaseURL == "" {
		return nil, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.BaseURL+"/api/p49", nil)
	if err != nil {
		return nil, err
	}
	if v := os.Getenv("EXPENSES_SERVICE_AUTH"); v != "" {
		req.Header.Set("Authorization", v)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("upstream returned status %d", resp.StatusCode)
	}
	var out any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}
