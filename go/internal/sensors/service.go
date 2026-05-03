package sensors

import (
	"context"
	"database/sql"
	"fmt"
	_ "github.com/lib/pq"
	"net/http"
	"time"
)

type Service struct {
	db     *sql.DB
	shelly string
}

type HourEntry struct {
	Hour           int      `json:"hour"`
	AvgTemperature float64  `json:"avg_temperature"`
	Humidity       *float64 `json:"humidity,omitempty"`
}

type Reading struct {
	Temperature float64   `json:"temperature_c"`
	Humidity    *float64  `json:"humidity,omitempty"`
	Timestamp   time.Time `json:"timestamp"`
}

func New(dsn string, shelly string) (*Service, error) {
	if dsn == "" {
		return &Service{db: nil, shelly: shelly}, nil
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(2)
	return &Service{db: db, shelly: shelly}, nil
}

func (s *Service) GetHourlyToday(ctx context.Context) ([]HourEntry, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	q := `SELECT EXTRACT(HOUR FROM timestamp) AS hour, AVG(temperature_c) AS avg_temperature, AVG(humidity) AS humidity FROM sensor_readings WHERE DATE(timestamp) = CURRENT_DATE GROUP BY hour ORDER BY hour ASC;`
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []HourEntry
	for rows.Next() {
		var h float64
		var avg sql.NullFloat64
		var hum sql.NullFloat64
		if err := rows.Scan(&h, &avg, &hum); err != nil {
			return nil, err
		}
		var humPtr *float64
		if hum.Valid {
			v := hum.Float64
			humPtr = &v
		}
		out = append(out, HourEntry{Hour: int(h), AvgTemperature: avg.Float64, Humidity: humPtr})
	}
	return out, rows.Err()
}

func (s *Service) GetLatest(ctx context.Context) (*Reading, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	q := `SELECT temperature_c, humidity, timestamp FROM sensor_readings ORDER BY timestamp DESC LIMIT 1`
	row := s.db.QueryRowContext(ctx, q)
	var temp sql.NullFloat64
	var hum sql.NullFloat64
	var ts sql.NullTime
	if err := row.Scan(&temp, &hum, &ts); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if !temp.Valid || !ts.Valid {
		return nil, nil
	}
	var humPtr *float64
	if hum.Valid {
		v := hum.Float64
		humPtr = &v
	}
	return &Reading{Temperature: temp.Float64, Humidity: humPtr, Timestamp: ts.Time}, nil
}

func (s *Service) GetTodayHourlyTemperature(ctx context.Context) (map[int]float64, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	q := `SELECT EXTRACT(HOUR FROM timestamp) AS hour, ROUND(AVG(temperature_c)::numeric, 2) AS avg_temperature FROM sensor_readings WHERE DATE(timestamp) = CURRENT_DATE GROUP BY hour ORDER BY hour;`
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[int]float64)
	for rows.Next() {
		var h float64
		var avg sql.NullFloat64
		if err := rows.Scan(&h, &avg); err != nil {
			return nil, err
		}
		out[int(h)] = avg.Float64
	}
	return out, rows.Err()
}

func (s *Service) GetTodayHourlyHumidity(ctx context.Context) (map[int]float64, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	q := `SELECT EXTRACT(HOUR FROM timestamp) AS hour, ROUND(AVG(humidity)::numeric, 2) AS avg_humidity FROM sensor_readings WHERE DATE(timestamp) = CURRENT_DATE GROUP BY hour ORDER BY hour;`
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[int]float64)
	for rows.Next() {
		var h float64
		var avg sql.NullFloat64
		if err := rows.Scan(&h, &avg); err != nil {
			return nil, err
		}
		out[int(h)] = avg.Float64
	}
	return out, rows.Err()
}

func (s *Service) LastTempDB(ctx context.Context) (map[string]any, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	q := `SELECT temperature_c, timestamp FROM sensor_readings ORDER BY timestamp DESC LIMIT 1;`
	row := s.db.QueryRowContext(ctx, q)
	var temp sql.NullFloat64
	var ts sql.NullTime
	if err := row.Scan(&temp, &ts); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if !temp.Valid || !ts.Valid {
		return nil, nil
	}
	return map[string]any{"last_entry": map[string]any{"temperature_c": temp.Float64, "timestamp": ts.Time}}, nil
}

func (s *Service) GetMonthlyTemperatureData(ctx context.Context, year int) (map[int]map[int]float64, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	if year == 0 {
		year = time.Now().Year()
	}
	q := `SELECT EXTRACT(MONTH FROM timestamp) AS month, EXTRACT(DAY FROM timestamp) AS day, ROUND(AVG(temperature_c)::numeric, 2) AS avg_temperature FROM sensor_readings WHERE EXTRACT(YEAR FROM timestamp) = $1 GROUP BY month, day ORDER BY month, day;`
	rows, err := s.db.QueryContext(ctx, q, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[int]map[int]float64)
	for rows.Next() {
		var m float64
		var d float64
		var t sql.NullFloat64
		if err := rows.Scan(&m, &d, &t); err != nil {
			return nil, err
		}
		mm := int(m)
		dd := int(d)
		if _, ok := out[mm]; !ok {
			out[mm] = make(map[int]float64)
		}
		out[mm][dd] = t.Float64
	}
	return out, rows.Err()
}

func (s *Service) GetMonthlyAverageTemperature(ctx context.Context, year int) (map[int]float64, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	if year == 0 {
		year = time.Now().Year()
	}
	q := `SELECT EXTRACT(MONTH FROM timestamp) AS month, ROUND(AVG(temperature_c)::numeric, 2) AS avg_temperature FROM sensor_readings WHERE EXTRACT(YEAR FROM timestamp) = $1 GROUP BY month ORDER BY month;`
	rows, err := s.db.QueryContext(ctx, q, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[int]float64)
	for rows.Next() {
		var m float64
		var avg sql.NullFloat64
		if err := rows.Scan(&m, &avg); err != nil {
			return nil, err
		}
		out[int(m)] = avg.Float64
	}
	return out, rows.Err()
}

func (s *Service) GetDailyForMonth(ctx context.Context, month int, year int) (map[int]float64, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	if year == 0 {
		year = time.Now().Year()
	}
	q := `SELECT EXTRACT(DAY FROM timestamp) AS day, ROUND(AVG(temperature_c)::numeric, 2) AS avg_temperature FROM sensor_readings WHERE EXTRACT(MONTH FROM timestamp) = $1 AND EXTRACT(YEAR FROM timestamp) = $2 GROUP BY day ORDER BY day;`
	rows, err := s.db.QueryContext(ctx, q, month, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[int]float64)
	for rows.Next() {
		var d float64
		var avg sql.NullFloat64
		if err := rows.Scan(&d, &avg); err != nil {
			return nil, err
		}
		out[int(d)] = avg.Float64
	}
	return out, rows.Err()
}

func (s *Service) GetAverageTemperatures(ctx context.Context, start, end time.Time) ([]map[string]any, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	q := `SELECT DATE_TRUNC('hour', timestamp) AS hour, ROUND(AVG(temperature_c)::numeric, 2) AS avg_temp FROM sensor_readings WHERE timestamp BETWEEN $1 AND $2 GROUP BY hour ORDER BY hour;`
	rows, err := s.db.QueryContext(ctx, q, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var ts time.Time
		var avg sql.NullFloat64
		if err := rows.Scan(&ts, &avg); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"hour": ts.Format(time.RFC3339), "avg_temperature": avg.Float64})
	}
	return out, rows.Err()
}

func (s *Service) GetAverageHumidity(ctx context.Context, start, end time.Time) ([]map[string]any, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	q := `SELECT DATE_TRUNC('hour', timestamp) AS hour, ROUND(AVG(humidity)::numeric, 2) AS avg_humidity FROM sensor_readings WHERE timestamp BETWEEN $1 AND $2 GROUP BY hour ORDER BY hour;`
	rows, err := s.db.QueryContext(ctx, q, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var ts time.Time
		var avg sql.NullFloat64
		if err := rows.Scan(&ts, &avg); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"hour": ts.Format(time.RFC3339), "avg_humidity": avg.Float64})
	}
	return out, rows.Err()
}

func (s *Service) GetDailyHumidityForMonth(ctx context.Context, month int, year int) (map[int]float64, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	if year == 0 {
		year = time.Now().Year()
	}
	q := `SELECT EXTRACT(DAY FROM timestamp) AS day, ROUND(AVG(humidity)::numeric, 2) AS avg_humidity FROM sensor_readings WHERE EXTRACT(MONTH FROM timestamp) = $1 AND EXTRACT(YEAR FROM timestamp) = $2 GROUP BY day ORDER BY day;`
	rows, err := s.db.QueryContext(ctx, q, month, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[int]float64)
	for rows.Next() {
		var d float64
		var avg sql.NullFloat64
		if err := rows.Scan(&d, &avg); err != nil {
			return nil, err
		}
		out[int(d)] = avg.Float64
	}
	return out, rows.Err()
}

func (s *Service) GetMonthlyAverageHumidity(ctx context.Context, year int) (map[int]float64, error) {
	if s.db == nil {
		return nil, fmt.Errorf("no db configured")
	}
	if year == 0 {
		year = time.Now().Year()
	}
	q := `SELECT EXTRACT(MONTH FROM timestamp) AS month, ROUND(AVG(humidity)::numeric, 2) AS avg_humidity FROM sensor_readings WHERE EXTRACT(YEAR FROM timestamp) = $1 GROUP BY month ORDER BY month;`
	rows, err := s.db.QueryContext(ctx, q, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[int]float64)
	for rows.Next() {
		var m float64
		var avg sql.NullFloat64
		if err := rows.Scan(&m, &avg); err != nil {
			return nil, err
		}
		out[int(m)] = avg.Float64
	}
	return out, rows.Err()
}

// SetTargetTemperature upserts the target temperature value
func (s *Service) SetTargetTemperature(ctx context.Context, value float64) error {
	if s.db == nil {
		return fmt.Errorf("no db configured")
	}
	q := `INSERT INTO target_temperature (id, value, updated_at) VALUES (1, $1, NOW()) ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`
	_, err := s.db.ExecContext(ctx, q, value)
	return err
}

func (s *Service) GetTargetTemperature(ctx context.Context) (float64, error) {
	if s.db == nil {
		return 0, fmt.Errorf("no db configured")
	}
	q := `SELECT value FROM target_temperature ORDER BY updated_at DESC LIMIT 1;`
	row := s.db.QueryRowContext(ctx, q)
	var v sql.NullFloat64
	if err := row.Scan(&v); err != nil {
		return 0, err
	}
	if !v.Valid {
		return 0, fmt.Errorf("no value")
	}
	return v.Float64, nil
}

func (s *Service) SetThermostatEnabled(ctx context.Context, enabled bool) error {
	if s.db == nil {
		return fmt.Errorf("no db configured")
	}
	q := `INSERT INTO thermostat_status (id, enabled, updated_at) VALUES (1, $1, NOW()) ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW();`
	_, err := s.db.ExecContext(ctx, q, enabled)
	return err
}

func (s *Service) GetThermostatEnabled(ctx context.Context) (bool, error) {
	if s.db == nil {
		return false, fmt.Errorf("no db configured")
	}
	q := `SELECT enabled FROM thermostat_status WHERE id = 1;`
	row := s.db.QueryRowContext(ctx, q)
	var v sql.NullBool
	if err := row.Scan(&v); err != nil {
		return false, err
	}
	if !v.Valid {
		return false, nil
	}
	return v.Bool, nil
}

func (s *Service) SetBoilerStatus(ctx context.Context, isOn bool) error {
	if s.db == nil {
		return fmt.Errorf("no db configured")
	}
	q := `INSERT INTO boiler_status (id, is_on, updated_at) VALUES (1, $1, NOW()) ON CONFLICT (id) DO UPDATE SET is_on = EXCLUDED.is_on, updated_at = NOW();`
	_, err := s.db.ExecContext(ctx, q, isOn)
	return err
}

func (s *Service) GetBoilerStatus(ctx context.Context) (bool, error) {
	if s.db == nil {
		return false, fmt.Errorf("no db configured")
	}
	q := `SELECT is_on FROM boiler_status WHERE id = 1;`
	row := s.db.QueryRowContext(ctx, q)
	var v sql.NullBool
	if err := row.Scan(&v); err != nil {
		return false, err
	}
	if !v.Valid {
		return false, nil
	}
	return v.Bool, nil
}

// ControlShellyRelay performs a simple GET to the Shelly device to toggle relay
func (s *Service) ControlShellyRelay(turnOn bool) error {
	if s.shelly == "" {
		return fmt.Errorf("shelly not configured")
	}
	action := "off"
	if turnOn {
		action = "on"
	}
	url := fmt.Sprintf("http://%s/relay/0?turn=%s", s.shelly, action)
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("shelly returned status %d", resp.StatusCode)
	}
	return nil
}
