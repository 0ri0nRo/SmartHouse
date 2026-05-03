package activity

import (
	"context"
	"database/sql"
	"fmt"
	_ "github.com/lib/pq"
	"regexp"
	"strings"
	"time"

	"smarthouse/internal/gcalendar"
)

type Service struct {
	db       *sql.DB
	calendar *gcalendar.Service
}

func New(dsn, calendarCredsPath, calendarTokenPath, calendarID string) (*Service, error) {
	if dsn == "" {
		calSvc, _ := gcalendar.New(calendarCredsPath, calendarTokenPath, calendarID)
		return &Service{db: nil, calendar: calSvc}, nil
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(2)
	calSvc, _ := gcalendar.New(calendarCredsPath, calendarTokenPath, calendarID)
	return &Service{db: db, calendar: calSvc}, nil
}

// GetAll returns basic activity events. If DB not configured returns empty slice.
func (s *Service) GetAll(ctx context.Context) ([]map[string]any, error) {
	if s.db == nil {
		return []map[string]any{}, nil
	}
	q := `SELECT id, title, start_datetime, end_datetime, duration_minutes, calendar_name, category_id, is_all_day FROM activity_events ORDER BY start_datetime DESC LIMIT 1000;`
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var title sql.NullString
		var start sql.NullTime
		var end sql.NullTime
		var duration sql.NullInt64
		var cal sql.NullString
		var category sql.NullInt64
		var isAllDay sql.NullBool
		if err := rows.Scan(&id, &title, &start, &end, &duration, &cal, &category, &isAllDay); err != nil {
			return nil, err
		}
		item := map[string]any{"id": id}
		if title.Valid {
			item["title"] = title.String
		}
		if start.Valid {
			item["start_datetime"] = start.Time.Format(time.RFC3339)
		}
		if end.Valid {
			item["end_datetime"] = end.Time.Format(time.RFC3339)
		}
		if duration.Valid {
			item["duration_minutes"] = int(duration.Int64)
		}
		if cal.Valid {
			item["calendar_name"] = cal.String
		}
		if category.Valid {
			item["category_id"] = int(category.Int64)
		}
		if isAllDay.Valid {
			item["is_all_day"] = isAllDay.Bool
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// AddEvent inserts a new activity event. Minimal validation performed.
func (s *Service) AddEvent(ctx context.Context, payload map[string]any) (map[string]any, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	title, _ := payload["title"].(string)
	startStr, _ := payload["start_datetime"].(string)
	endStr, _ := payload["end_datetime"].(string)
	durationF, _ := payload["duration_minutes"].(float64)
	calendarName, _ := payload["calendar_name"].(string)
	isAllDay, _ := payload["is_all_day"].(bool)
	var startT, endT time.Time
	var err error
	if startStr != "" {
		startT, err = time.Parse(time.RFC3339, startStr)
		if err != nil {
			return nil, fmt.Errorf("invalid start_datetime: %w", err)
		}
	}
	if endStr != "" {
		endT, err = time.Parse(time.RFC3339, endStr)
		if err != nil {
			return nil, fmt.Errorf("invalid end_datetime: %w", err)
		}
	}
	duration := int64(durationF)

	q := `INSERT INTO activity_events (title, start_datetime, end_datetime, duration_minutes, calendar_name, is_all_day) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id;`
	row := s.db.QueryRowContext(ctx, q, title, nullableTime(startT), nullableTime(endT), duration, calendarName, isAllDay)
	var id int64
	if err := row.Scan(&id); err != nil {
		return nil, err
	}
	return map[string]any{"id": id}, nil
}

// DeleteEvent deletes by id
func (s *Service) DeleteEvent(ctx context.Context, id int64) error {
	if s.db == nil {
		return fmt.Errorf("no db configured")
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM activity_events WHERE id = $1`, id)
	return err
}

func nullableTime(t time.Time) interface{} {
	if t.IsZero() {
		return nil
	}
	return t
}

// GetCategories returns activity categories from DB
func (s *Service) GetCategories(ctx context.Context) ([]map[string]any, error) {
	if s.db == nil {
		return []map[string]any{}, nil
	}
	q := `SELECT id, code, macro_category, micro_category, color, icon FROM activity_categories ORDER BY macro_category, code;`
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var code, macro, micro, color, icon sql.NullString
		if err := rows.Scan(&id, &code, &macro, &micro, &color, &icon); err != nil {
			return nil, err
		}
		item := map[string]any{"id": id}
		if code.Valid {
			item["code"] = code.String
		}
		if macro.Valid {
			item["macro_category"] = macro.String
		}
		if micro.Valid {
			item["micro_category"] = micro.String
		}
		if color.Valid {
			item["color"] = color.String
		}
		if icon.Valid {
			item["icon"] = icon.String
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// GetUncategorized returns uncategorized events limited by `limit`
func (s *Service) GetUncategorized(ctx context.Context, limit int) ([]map[string]any, error) {
	if s.db == nil {
		return []map[string]any{}, nil
	}
	if limit <= 0 {
		limit = 50
	}
	q := `SELECT id, title, start_datetime, end_datetime, duration_minutes, calendar_name FROM activity_events WHERE category_id IS NULL AND is_all_day = FALSE ORDER BY start_datetime DESC LIMIT $1;`
	rows, err := s.db.QueryContext(ctx, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var title sql.NullString
		var start sql.NullTime
		var end sql.NullTime
		var duration sql.NullInt64
		var cal sql.NullString
		if err := rows.Scan(&id, &title, &start, &end, &duration, &cal); err != nil {
			return nil, err
		}
		item := map[string]any{"id": id}
		if title.Valid {
			item["title"] = title.String
		}
		if start.Valid {
			item["start_datetime"] = start.Time.Format(time.RFC3339)
		}
		if end.Valid {
			item["end_datetime"] = end.Time.Format(time.RFC3339)
		}
		if duration.Valid {
			item["duration_minutes"] = int(duration.Int64)
		}
		if cal.Valid {
			item["calendar_name"] = cal.String
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// GetDailyStats returns precomputed daily stats for a given date
func (s *Service) GetDailyStats(ctx context.Context, targetDate string) ([]map[string]any, error) {
	if s.db == nil {
		return []map[string]any{}, nil
	}
	q := `SELECT ds.date, ds.category_id, ds.total_minutes, ds.event_count, ds.percentage, c.code, c.macro_category, c.micro_category, c.icon FROM activity_daily_stats ds JOIN activity_categories c ON ds.category_id = c.id WHERE ds.date = $1 ORDER BY ds.total_minutes DESC;`
	rows, err := s.db.QueryContext(ctx, q, targetDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var dateVal string
		var categoryID sql.NullInt64
		var totalMinutes sql.NullInt64
		var eventCount sql.NullInt64
		var percentage sql.NullFloat64
		var code, macro, micro, icon sql.NullString
		if err := rows.Scan(&dateVal, &categoryID, &totalMinutes, &eventCount, &percentage, &code, &macro, &micro, &icon); err != nil {
			return nil, err
		}
		item := map[string]any{"date": dateVal}
		if categoryID.Valid {
			item["category_id"] = int(categoryID.Int64)
		}
		if totalMinutes.Valid {
			item["total_minutes"] = int(totalMinutes.Int64)
			item["total_hours"] = float64(totalMinutes.Int64) / 60.0
		}
		if eventCount.Valid {
			item["event_count"] = int(eventCount.Int64)
		}
		if percentage.Valid {
			item["percentage"] = float64(percentage.Float64)
		}
		if code.Valid {
			item["code"] = code.String
		}
		if macro.Valid {
			item["macro_category"] = macro.String
		}
		if micro.Valid {
			item["micro_category"] = micro.String
		}
		if icon.Valid {
			item["icon"] = icon.String
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// GetWeeklyStats and GetMonthlyStats mirror the aggregation queries
func (s *Service) GetWeeklyStats(ctx context.Context, year int, week int) ([]map[string]any, error) {
	if s.db == nil {
		return []map[string]any{}, nil
	}
	q := `SELECT c.code, c.macro_category, c.micro_category, c.icon, SUM(ds.total_minutes) as total_minutes, AVG(ds.total_minutes) as avg_daily_minutes, SUM(ds.event_count) as event_count FROM activity_daily_stats ds JOIN activity_categories c ON ds.category_id = c.id WHERE EXTRACT(YEAR FROM ds.date) = $1 AND EXTRACT(WEEK FROM ds.date) = $2 GROUP BY c.id, c.code, c.macro_category, c.micro_category, c.icon ORDER BY total_minutes DESC;`
	rows, err := s.db.QueryContext(ctx, q, year, week)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var code, macro, micro, icon sql.NullString
		var totalMinutes sql.NullInt64
		var avgDaily sql.NullFloat64
		var eventCount sql.NullInt64
		if err := rows.Scan(&code, &macro, &micro, &icon, &totalMinutes, &avgDaily, &eventCount); err != nil {
			return nil, err
		}
		item := map[string]any{}
		if code.Valid {
			item["code"] = code.String
		}
		if macro.Valid {
			item["macro_category"] = macro.String
		}
		if micro.Valid {
			item["micro_category"] = micro.String
		}
		if icon.Valid {
			item["icon"] = icon.String
		}
		if totalMinutes.Valid {
			item["total_minutes"] = int(totalMinutes.Int64)
			item["total_hours"] = float64(totalMinutes.Int64) / 60.0
		}
		if avgDaily.Valid {
			item["avg_daily_minutes"] = float64(avgDaily.Float64)
			item["avg_daily_hours"] = float64(avgDaily.Float64) / 60.0
		}
		if eventCount.Valid {
			item["event_count"] = int(eventCount.Int64)
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Service) GetMonthlyStats(ctx context.Context, year int, month int) ([]map[string]any, error) {
	if s.db == nil {
		return []map[string]any{}, nil
	}
	q := `SELECT c.code, c.macro_category, c.micro_category, c.icon, SUM(ds.total_minutes) as total_minutes, AVG(ds.total_minutes) as avg_daily_minutes, SUM(ds.event_count) as event_count, COUNT(DISTINCT ds.date) as days_tracked FROM activity_daily_stats ds JOIN activity_categories c ON ds.category_id = c.id WHERE EXTRACT(YEAR FROM ds.date) = $1 AND EXTRACT(MONTH FROM ds.date) = $2 GROUP BY c.id, c.code, c.macro_category, c.micro_category, c.icon ORDER BY total_minutes DESC;`
	rows, err := s.db.QueryContext(ctx, q, year, month)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var code, macro, micro, icon sql.NullString
		var totalMinutes sql.NullInt64
		var avgDaily sql.NullFloat64
		var eventCount sql.NullInt64
		var daysTracked sql.NullInt64
		if err := rows.Scan(&code, &macro, &micro, &icon, &totalMinutes, &avgDaily, &eventCount, &daysTracked); err != nil {
			return nil, err
		}
		item := map[string]any{}
		if code.Valid {
			item["code"] = code.String
		}
		if macro.Valid {
			item["macro_category"] = macro.String
		}
		if micro.Valid {
			item["micro_category"] = micro.String
		}
		if icon.Valid {
			item["icon"] = icon.String
		}
		if totalMinutes.Valid {
			item["total_minutes"] = int(totalMinutes.Int64)
			item["total_hours"] = float64(totalMinutes.Int64) / 60.0
		}
		if avgDaily.Valid {
			item["avg_daily_minutes"] = float64(avgDaily.Float64)
			item["avg_daily_hours"] = float64(avgDaily.Float64) / 60.0
		}
		if eventCount.Valid {
			item["event_count"] = int(eventCount.Int64)
		}
		if daysTracked.Valid {
			item["days_tracked"] = int(daysTracked.Int64)
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Service) SyncEvents(ctx context.Context, start, end *time.Time) (map[string]int, error) {
	if s.calendar == nil {
		return nil, fmt.Errorf("google calendar not configured")
	}
	if start == nil {
		defaultStart := time.Now().AddDate(0, 0, -30)
		start = &defaultStart
	}
	if end == nil {
		defaultEnd := time.Now()
		end = &defaultEnd
	}
	events, err := s.calendar.RangeEvents(ctx, *start, *end)
	if err != nil {
		return nil, err
	}
	stats := map[string]int{"added": 0, "updated": 0, "skipped": 0, "errors": 0}
	for _, event := range events {
		inserted, err := s.UpsertGoogleEvent(ctx, event)
		if err != nil {
			stats["errors"]++
			continue
		}
		if inserted {
			stats["added"]++
		} else {
			stats["updated"]++
		}
	}
	return stats, nil
}

func (s *Service) UpsertGoogleEvent(ctx context.Context, event gcalendar.Event) (bool, error) {
	if s.db == nil {
		return false, fmt.Errorf("no db configured")
	}
	if event.ID == "" {
		return false, fmt.Errorf("missing google event id")
	}
	startT, err := parseCalendarTime(event.Start)
	if err != nil {
		return false, err
	}
	endT, err := parseCalendarTime(event.End)
	if err != nil {
		return false, err
	}
	duration := int64(endT.Sub(startT).Minutes())
	if duration < 0 {
		duration = 0
	}
	categoryID, err := s.categoryIDFromTitle(ctx, event.Title)
	if err != nil {
		return false, err
	}
	q := `INSERT INTO activity_events (google_event_id, title, category_id, start_datetime, end_datetime, duration_minutes, calendar_name, is_all_day, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (google_event_id) DO UPDATE SET title = EXCLUDED.title, category_id = EXCLUDED.category_id, start_datetime = EXCLUDED.start_datetime, end_datetime = EXCLUDED.end_datetime, duration_minutes = EXCLUDED.duration_minutes, calendar_name = EXCLUDED.calendar_name, is_all_day = EXCLUDED.is_all_day, description = EXCLUDED.description, updated_at = NOW() RETURNING (xmax = 0) AS inserted;`
	row := s.db.QueryRowContext(ctx, q, event.ID, event.Title, categoryID, startT, endT, duration, defaultString(event.CalendarID, "Google Calendar"), event.AllDay, nullableString(event.Description))
	var inserted bool
	if err := row.Scan(&inserted); err != nil {
		return false, err
	}
	return inserted, nil
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func (s *Service) categoryIDFromTitle(ctx context.Context, title string) (any, error) {
	code := extractCategoryCode(title)
	if code == "" || s.db == nil {
		return nil, nil
	}
	row := s.db.QueryRowContext(ctx, `SELECT id FROM activity_categories WHERE code = $1 LIMIT 1`, code)
	var id int64
	if err := row.Scan(&id); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return id, nil
}

func extractCategoryCode(title string) string {
	re := regexp.MustCompile(`^\[([A-Z]+\.\d+)\]`)
	match := re.FindStringSubmatch(title)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(match[1])
}

func parseCalendarTime(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, fmt.Errorf("missing time value")
	}
	if len(value) == 10 {
		return time.Parse("2006-01-02", value)
	}
	return time.Parse(time.RFC3339, value)
}

func nullableString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}
