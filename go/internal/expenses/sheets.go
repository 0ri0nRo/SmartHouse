package expenses

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2/google"
	sheets "google.golang.org/api/sheets/v4"
)

type SheetsService struct {
	svc         *sheets.Service
	spreadsheet string
	redis       *redis.Client
}

// NewSheetsService constructs a SheetsService using a service-account JSON file and spreadsheet ID.
// Env vars used when empty args: EXPENSES_CREDENTIALS_PATH, EXPENSES_SPREADSHEET_ID, REDIS_HOST, REDIS_PORT
func NewSheetsService(ctx context.Context, credentialsPath, spreadsheetID string) (*SheetsService, error) {
	if credentialsPath == "" {
		credentialsPath = os.Getenv("EXPENSES_CREDENTIALS_PATH")
	}
	if spreadsheetID == "" {
		spreadsheetID = os.Getenv("EXPENSES_SPREADSHEET_ID")
	}
	if credentialsPath == "" || spreadsheetID == "" {
		return nil, errors.New("missing credentials path or spreadsheet id")
	}

	b, err := os.ReadFile(credentialsPath)
	if err != nil {
		return nil, err
	}
	cfg, err := google.JWTConfigFromJSON(b, sheets.SpreadsheetsScope, "https://www.googleapis.com/auth/drive")
	if err != nil {
		return nil, err
	}
	client := cfg.Client(ctx)
	svc, err := sheets.New(client)
	if err != nil {
		return nil, err
	}

	// optional redis
	redisHost := os.Getenv("REDIS_HOST")
	if redisHost == "" {
		redisHost = "localhost"
	}
	redisPort := os.Getenv("REDIS_PORT")
	if redisPort == "" {
		redisPort = "6379"
	}
	rdb := redis.NewClient(&redis.Options{Addr: redisHost + ":" + redisPort})

	return &SheetsService{svc: svc, spreadsheet: spreadsheetID, redis: rdb}, nil
}

// AddExpense appends a row to the month's worksheet (columns A-F) using USER_ENTERED.
func (s *SheetsService) AddExpense(ctx context.Context, name, dateStr string, amount float64, category string) error {
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return err
	}
	months := []string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}
	sheetName := months[int(t.Month())-1]

	// find first empty row in column A
	rng := fmt.Sprintf("%s!A:A", sheetName)
	resp, err := s.svc.Spreadsheets.Values.Get(s.spreadsheet, rng).Context(ctx).Do()
	if err != nil {
		return err
	}
	firstEmpty := len(resp.Values) + 1

	// eur with comma as in original code formula style
	eur := fmt.Sprintf("=%s", strings.ReplaceAll(strconv.FormatFloat(amount, 'f', 2, 64), ".", ","))
	row := []interface{}{name, t.Day(), eur, "", eur, category}
	vr := &sheets.ValueRange{Values: [][]interface{}{row}}
	writeRange := fmt.Sprintf("%s!A%d:F%d", sheetName, firstEmpty, firstEmpty)
	_, err = s.svc.Spreadsheets.Values.Update(s.spreadsheet, writeRange, vr).ValueInputOption("USER_ENTERED").Context(ctx).Do()
	return err
}

// GetSummary reads the summary worksheet for the given year and returns a structured map.
func (s *SheetsService) GetSummary(ctx context.Context, year int) (map[string]any, error) {
	if year == 0 {
		year = time.Now().Year()
	}
	sheetName := fmt.Sprintf("%d Expenses", year)
	rng := fmt.Sprintf("%s!A1:O", sheetName)
	resp, err := s.svc.Spreadsheets.Values.Get(s.spreadsheet, rng).Context(ctx).Do()
	if err != nil {
		return nil, err
	}
	if len(resp.Values) < 2 {
		return nil, fmt.Errorf("worksheet is empty or lacks sufficient data")
	}
	headers := make([]string, 0)
	for _, h := range resp.Values[0] {
		headers = append(headers, fmt.Sprintf("%v", h))
	}
	summary := map[string]any{}
	valid := map[string]struct{}{}
	for _, c := range []string{"Housing", "Leisure", "Health", "Transport", "University", "Bar", "Clothing", "Groceries", "Gifts", "Fees", "Bills", "Buoni pasto", "Other", "Restaurants", "Vacation"} {
		valid[c] = struct{}{}
	}

	for i := 1; i < len(resp.Values); i++ {
		row := resp.Values[i]
		if len(row) < 15 {
			continue
		}
		category := fmt.Sprintf("%v", row[0])
		if _, ok := valid[category]; !ok {
			continue
		}
		monthly := map[string]float64{}
		for m := 0; m < 12; m++ {
			val := 0.0
			if m+1 < len(row) {
				if row[m+1] != nil && row[m+1] != "" {
					f, _ := strconv.ParseFloat(fmt.Sprintf("%v", row[m+1]), 64)
					val = f
				}
			}
			key := ""
			if m+1 < len(headers) {
				key = headers[m+1]
			} else {
				key = fmt.Sprintf("M%d", m+1)
			}
			monthly[key] = val
		}
		total := 0.0
		average := 0.0
		if 13 < len(row) {
			if row[13] != nil && row[13] != "" {
				total, _ = strconv.ParseFloat(fmt.Sprintf("%v", row[13]), 64)
			}
		}
		if 14 < len(row) {
			if row[14] != nil && row[14] != "" {
				average, _ = strconv.ParseFloat(fmt.Sprintf("%v", row[14]), 64)
			}
		}
		summary[category] = map[string]any{"monthly": monthly, "total": total, "average": average}
	}
	return summary, nil
}

// GetP49 reads cached P49 value from Redis if present, otherwise fetches from summary sheet P50 cell and updates cache.
func (s *SheetsService) GetP49(ctx context.Context) (any, error) {
	// try redis
	if s.redis != nil {
		if v, err := s.redis.Get(ctx, "p49_value").Result(); err == nil {
			var out any
			if err := json.Unmarshal([]byte(v), &out); err == nil {
				return out, nil
			}
		}
	}
	year := time.Now().Year()
	sheetName := fmt.Sprintf("%d", year)
	rng := fmt.Sprintf("%s!P50", sheetName)
	resp, err := s.svc.Spreadsheets.Values.Get(s.spreadsheet, rng).Context(ctx).Do()
	if err != nil {
		return nil, err
	}
	if len(resp.Values) == 0 || len(resp.Values[0]) == 0 {
		return nil, fmt.Errorf("cell P50 not found")
	}
	val := resp.Values[0][0]
	// cache
	if s.redis != nil {
		b, _ := json.Marshal(val)
		_ = s.redis.Set(ctx, "p49_value", b, 600*time.Second).Err()
	}
	return val, nil
}
