package airquality

import (
	"context"
	"database/sql"
	"fmt"
	_ "github.com/lib/pq"
	"strconv"
	"strings"
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
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(2)
	return &Service{db: db}, nil
}

func (s *Service) GetLatest(ctx context.Context) (map[string]any, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	q := `SELECT smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp, EXTRACT(EPOCH FROM (NOW() - timestamp)) as seconds_ago FROM air_quality ORDER BY timestamp DESC, id DESC LIMIT 1;`
	row := s.db.QueryRowContext(ctx, q)
	var smoke, lpg, methane, hydrogen sql.NullFloat64
	var aqi sql.NullFloat64
	var desc sql.NullString
	var ts sql.NullTime
	var seconds sql.NullFloat64
	if err := row.Scan(&smoke, &lpg, &methane, &hydrogen, &aqi, &desc, &ts, &seconds); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if !ts.Valid {
		return nil, nil
	}
	res := map[string]any{
		"smoke":                   float64(0),
		"lpg":                     float64(0),
		"methane":                 float64(0),
		"hydrogen":                float64(0),
		"air_quality_index":       float64(0),
		"air_quality_description": "",
		"timestamp":               ts.Time.Format(time.RFC3339),
		"data_age_seconds":        nil,
		"is_recent":               false,
	}
	if smoke.Valid {
		res["smoke"] = smoke.Float64
	}
	if lpg.Valid {
		res["lpg"] = lpg.Float64
	}
	if methane.Valid {
		res["methane"] = methane.Float64
	}
	if hydrogen.Valid {
		res["hydrogen"] = hydrogen.Float64
	}
	if aqi.Valid {
		res["air_quality_index"] = aqi.Float64
	}
	if desc.Valid {
		res["air_quality_description"] = desc.String
	}
	if seconds.Valid {
		res["data_age_seconds"] = int(seconds.Float64)
		res["is_recent"] = seconds.Float64 < 300
	}
	return res, nil
}

func (s *Service) InsertRecord(ctx context.Context, payload map[string]any) (map[string]any, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	required := []string{"smoke", "lpg", "methane", "hydrogen", "air_quality_index", "air_quality_description"}
	for _, k := range required {
		if _, ok := payload[k]; !ok {
			return nil, fmt.Errorf("missing field: %s", k)
		}
	}

	toFloat := func(v any) (float64, error) {
		switch t := v.(type) {
		case float64:
			return t, nil
		case float32:
			return float64(t), nil
		case int:
			return float64(t), nil
		case int64:
			return float64(t), nil
		case string:
			return strconv.ParseFloat(t, 64)
		default:
			return 0, fmt.Errorf("invalid numeric type")
		}
	}

	smoke, err := toFloat(payload["smoke"])
	if err != nil {
		return nil, fmt.Errorf("invalid smoke value: %w", err)
	}
	lpg, err := toFloat(payload["lpg"])
	if err != nil {
		return nil, fmt.Errorf("invalid lpg value: %w", err)
	}
	methane, err := toFloat(payload["methane"])
	if err != nil {
		return nil, fmt.Errorf("invalid methane value: %w", err)
	}
	hydrogen, err := toFloat(payload["hydrogen"])
	if err != nil {
		return nil, fmt.Errorf("invalid hydrogen value: %w", err)
	}
	aqi, err := toFloat(payload["air_quality_index"])
	if err != nil {
		return nil, fmt.Errorf("invalid air_quality_index value: %w", err)
	}
	descRaw, ok := payload["air_quality_description"]
	if !ok {
		return nil, fmt.Errorf("missing field: air_quality_description")
	}
	desc := fmt.Sprintf("%v", descRaw)
	desc = strings.TrimSpace(desc)

	// mirror Python validation ranges
	if !(0 <= smoke && smoke <= 1000) {
		return nil, fmt.Errorf("smoke out of range")
	}
	if !(0 <= lpg && lpg <= 1000) {
		return nil, fmt.Errorf("lpg out of range")
	}
	if !(0 <= methane && methane <= 1000) {
		return nil, fmt.Errorf("methane out of range")
	}
	if !(0 <= hydrogen && hydrogen <= 1000) {
		return nil, fmt.Errorf("hydrogen out of range")
	}
	if !(0 <= aqi && aqi <= 500) {
		return nil, fmt.Errorf("aqi out of range")
	}
	if desc == "" {
		return nil, fmt.Errorf("description is empty")
	}

	q := `INSERT INTO air_quality (smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp) VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id, timestamp;`
	row := s.db.QueryRowContext(ctx, q, smoke, lpg, methane, hydrogen, aqi, desc)
	var id int64
	var ts time.Time
	if err := row.Scan(&id, &ts); err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "timestamp": ts.Format(time.RFC3339)}, nil
}

func (s *Service) GetDailyAggregated(ctx context.Context) (map[int]map[string]any, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	q := `SELECT EXTRACT(HOUR FROM timestamp) AS hour, ROUND(AVG(air_quality_index)::numeric,2) AS avg_air_quality_index, COUNT(*) AS measurement_count, MIN(air_quality_index) AS min_aqi, MAX(air_quality_index) AS max_aqi FROM air_quality WHERE DATE(timestamp) = CURRENT_DATE GROUP BY EXTRACT(HOUR FROM timestamp) ORDER BY hour;`
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[int]map[string]any)
	for rows.Next() {
		var hour float64
		var avg sql.NullFloat64
		var count sql.NullInt64
		var min sql.NullFloat64
		var max sql.NullFloat64
		if err := rows.Scan(&hour, &avg, &count, &min, &max); err != nil {
			return nil, err
		}
		out[int(hour)] = map[string]any{
			"avg_air_quality_index": avg.Float64,
			"measurement_count":     int(count.Int64),
			"min_aqi":               min.Float64,
			"max_aqi":               max.Float64,
		}
	}
	return out, rows.Err()
}

func (s *Service) GetHourlyGasConcentration(ctx context.Context) (map[string]map[string]any, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	q := `SELECT EXTRACT(HOUR FROM timestamp) AS hour, ROUND(AVG(smoke)::numeric,2) AS avg_smoke, ROUND(AVG(lpg)::numeric,2) AS avg_lpg, ROUND(AVG(methane)::numeric,2) AS avg_methane, ROUND(AVG(hydrogen)::numeric,2) AS avg_hydrogen, COUNT(*) AS measurement_count FROM air_quality WHERE DATE(timestamp) = CURRENT_DATE GROUP BY EXTRACT(HOUR FROM timestamp) ORDER BY hour;`
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]map[string]any)
	for rows.Next() {
		var hour float64
		var avgSmoke, avgLPG, avgMethane, avgHydro sql.NullFloat64
		var count sql.NullInt64
		if err := rows.Scan(&hour, &avgSmoke, &avgLPG, &avgMethane, &avgHydro, &count); err != nil {
			return nil, err
		}
		key := fmt.Sprintf("%d", int(hour))
		out[key] = map[string]any{
			"avg_smoke":         avgSmoke.Float64,
			"avg_lpg":           avgLPG.Float64,
			"avg_methane":       avgMethane.Float64,
			"avg_hydrogen":      avgHydro.Float64,
			"measurement_count": int(count.Int64),
		}
	}
	// if empty, return zero placeholders for 24 hours
	if len(out) == 0 {
		for h := 0; h < 24; h++ {
			out[fmt.Sprintf("%d", h)] = map[string]any{"avg_smoke": 0.0, "avg_lpg": 0.0, "avg_methane": 0.0, "avg_hydrogen": 0.0, "measurement_count": 0}
		}
	}
	return out, rows.Err()
}

func (s *Service) GetMonthlyDailyAvg(ctx context.Context, month, year int) (map[string]float64, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	q := `SELECT EXTRACT(DAY FROM timestamp)::int AS day, ROUND(AVG(air_quality_index)::numeric,2) AS avg_aqi FROM air_quality WHERE EXTRACT(MONTH FROM timestamp) = $1 AND EXTRACT(YEAR FROM timestamp) = $2 GROUP BY EXTRACT(DAY FROM timestamp) ORDER BY day;`
	rows, err := s.db.QueryContext(ctx, q, month, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]float64)
	for rows.Next() {
		var day int
		var avg sql.NullFloat64
		if err := rows.Scan(&day, &avg); err != nil {
			return nil, err
		}
		out[fmt.Sprintf("%d", day)] = avg.Float64
	}
	return out, rows.Err()
}

func (s *Service) GetYearlyMonthlyAvg(ctx context.Context, year int) (map[string]float64, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	q := `SELECT EXTRACT(MONTH FROM timestamp)::int AS month, ROUND(AVG(air_quality_index)::numeric,2) AS avg_aqi FROM air_quality WHERE EXTRACT(YEAR FROM timestamp) = $1 GROUP BY EXTRACT(MONTH FROM timestamp) ORDER BY month;`
	rows, err := s.db.QueryContext(ctx, q, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]float64)
	for rows.Next() {
		var month int
		var avg sql.NullFloat64
		if err := rows.Scan(&month, &avg); err != nil {
			return nil, err
		}
		out[fmt.Sprintf("%d", month)] = avg.Float64
	}
	return out, rows.Err()
}

func (s *Service) GetRecent(ctx context.Context, hours int, limit int) ([]map[string]any, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	// build query with integers (sanitized upstream)
	q := fmt.Sprintf(`SELECT smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp, EXTRACT(EPOCH FROM (NOW() - timestamp)) as seconds_ago FROM air_quality WHERE timestamp >= NOW() - INTERVAL '%d hours' ORDER BY timestamp DESC LIMIT %d;`, hours, limit)
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var smoke, lpg, methane, hydrogen sql.NullFloat64
		var aqi sql.NullFloat64
		var desc sql.NullString
		var ts sql.NullTime
		var seconds sql.NullFloat64
		if err := rows.Scan(&smoke, &lpg, &methane, &hydrogen, &aqi, &desc, &ts, &seconds); err != nil {
			return nil, err
		}
		if !ts.Valid {
			continue
		}
		item := map[string]any{"smoke": smoke.Float64, "lpg": lpg.Float64, "methane": methane.Float64, "hydrogen": hydrogen.Float64, "air_quality_index": aqi.Float64, "air_quality_description": desc.String, "timestamp": ts.Time.Format(time.RFC3339)}
		if seconds.Valid {
			item["data_age_seconds"] = int(seconds.Float64)
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Service) GetLatestToday(ctx context.Context) (map[string]any, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	q := `SELECT smoke, lpg, methane, hydrogen, air_quality_index, air_quality_description, timestamp FROM air_quality WHERE DATE(timestamp) = CURRENT_DATE ORDER BY timestamp DESC LIMIT 1;`
	row := s.db.QueryRowContext(ctx, q)
	var smoke, lpg, methane, hydrogen sql.NullFloat64
	var aqi sql.NullFloat64
	var desc sql.NullString
	var ts sql.NullTime
	if err := row.Scan(&smoke, &lpg, &methane, &hydrogen, &aqi, &desc, &ts); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if !ts.Valid {
		return nil, nil
	}
	res := map[string]any{"smoke": smoke.Float64, "lpg": lpg.Float64, "methane": methane.Float64, "hydrogen": hydrogen.Float64, "air_quality_index": aqi.Float64, "air_quality_description": desc.String, "timestamp": ts.Time.Format(time.RFC3339)}
	return res, nil
}
