package sunmoon

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"
)

const (
	defaultLat = 41.7276
	defaultLon = 13.3681
	baseURL    = "https://api.sunrise-sunset.org/json"
	phaseDays  = 29.53058868
)

type Service struct {
	lat    float64
	lon    float64
	client *http.Client
	mu     sync.Mutex
	cache  map[string]Payload
}

type Payload struct {
	Sunrise       string  `json:"sunrise"`
	Sunset        string  `json:"sunset"`
	DayLength     string  `json:"day_length"`
	MoonPhase     float64 `json:"moon_phase"`
	MoonPhaseName string  `json:"moon_phase_name"`
	MoonEmoji     string  `json:"moon_emoji"`
	NextFullMoon  string  `json:"next_full_moon"`
	NextNewMoon   string  `json:"next_new_moon"`
}

type sunriseSunsetResponse struct {
	Results struct {
		Sunrise   string `json:"sunrise"`
		Sunset    string `json:"sunset"`
		DayLength string `json:"day_length"`
	} `json:"results"`
	Status string `json:"status"`
}

func New(lat, lon float64) *Service {
	if lat == 0 {
		lat = defaultLat
	}
	if lon == 0 {
		lon = defaultLon
	}

	return &Service{
		lat:    lat,
		lon:    lon,
		client: &http.Client{Timeout: 8 * time.Second},
		cache:  make(map[string]Payload),
	}
}

func (s *Service) GetData() (Payload, error) {
	today := time.Now().Format("2006-01-02")

	s.mu.Lock()
	if cached, ok := s.cache[today]; ok {
		s.mu.Unlock()
		return cached, nil
	}
	s.mu.Unlock()

	result := Payload{}
	sun, err := s.sunData(time.Now())
	if err != nil {
		return Payload{}, err
	}
	moon := s.moonData(time.Now())
	result = Payload{
		Sunrise:       sun.Sunrise,
		Sunset:        sun.Sunset,
		DayLength:     sun.DayLength,
		MoonPhase:     moon.MoonPhase,
		MoonPhaseName: moon.MoonPhaseName,
		MoonEmoji:     moon.MoonEmoji,
		NextFullMoon:  moon.NextFullMoon,
		NextNewMoon:   moon.NextNewMoon,
	}

	s.mu.Lock()
	s.cache = map[string]Payload{today: result}
	s.mu.Unlock()

	return result, nil
}

func (s *Service) sunData(now time.Time) (Payload, error) {
	query := url.Values{}
	query.Set("lat", strconv.FormatFloat(s.lat, 'f', -1, 64))
	query.Set("lng", strconv.FormatFloat(s.lon, 'f', -1, 64))
	query.Set("date", now.Format("2006-01-02"))
	query.Set("formatted", "0")

	requestURL := baseURL + "?" + query.Encode()
	resp, err := s.client.Get(requestURL)
	if err != nil {
		return Payload{Sunrise: "—", Sunset: "—", DayLength: "—"}, err
	}
	defer resp.Body.Close()

	var decoded sunriseSunsetResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return Payload{Sunrise: "—", Sunset: "—", DayLength: "—"}, err
	}

	if decoded.Status != "OK" {
		return Payload{Sunrise: "—", Sunset: "—", DayLength: "—"}, fmt.Errorf("unexpected sunrise-sunset status: %s", decoded.Status)
	}

	return Payload{
		Sunrise:   utcToLocal(decoded.Results.Sunrise),
		Sunset:    utcToLocal(decoded.Results.Sunset),
		DayLength: secondsToHM(decoded.Results.DayLength),
	}, nil
}

func (s *Service) moonData(now time.Time) Payload {
	phase := moonPhase(now)
	name, emoji := phaseName(phase)

	return Payload{
		MoonPhase:     math.Round(phase*1000) / 1000,
		MoonPhaseName: name,
		MoonEmoji:     emoji,
		NextFullMoon:  nextPhase(now, 0.5).Format("2006-01-02"),
		NextNewMoon:   nextPhase(now, 0.0).Format("2006-01-02"),
	}
}

func utcToLocal(iso string) string {
	parsed, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		if len(iso) >= 5 {
			return iso[:5]
		}
		return "—"
	}

	year := parsed.Year()
	start := lastSunday(year, time.March)
	end := lastSunday(year, time.October)
	offset := time.Hour
	if !parsed.Before(time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)) && parsed.Before(time.Date(end.Year(), end.Month(), end.Day(), 0, 0, 0, 0, time.UTC)) {
		offset = 2 * time.Hour
	}

	return parsed.Add(offset).Format("15:04")
}

func secondsToHM(seconds string) string {
	parsed, err := strconv.Atoi(seconds)
	if err != nil {
		return "—"
	}
	hours := parsed / 3600
	minutes := (parsed % 3600) / 60
	return fmt.Sprintf("%dh %dm", hours, minutes)
}

func moonPhase(day time.Time) float64 {
	year, month, date := day.Date()
	if month < time.March {
		year--
		month += 12
	}
	a := math.Floor(float64(year) / 100)
	b := 2 - a + math.Floor(a/4)
	jd := math.Floor(365.25*float64(year+4716)) + math.Floor(30.6001*float64(int(month)+1)) + float64(date) + b - 1524.5
	daysSinceNew := jd - 2451549.5
	return math.Mod(daysSinceNew, phaseDays) / phaseDays
}

func phaseName(phase float64) (string, string) {
	switch {
	case phase < 0.03 || phase >= 0.97:
		return "New Moon", "🌑"
	case phase < 0.22:
		return "Waxing Crescent", "🌒"
	case phase < 0.28:
		return "First Quarter", "🌓"
	case phase < 0.47:
		return "Waxing Gibbous", "🌔"
	case phase < 0.53:
		return "Full Moon", "🌕"
	case phase < 0.72:
		return "Waning Gibbous", "🌖"
	case phase < 0.78:
		return "Last Quarter", "🌗"
	default:
		return "Waning Crescent", "🌘"
	}
}

func nextPhase(from time.Time, target float64) time.Time {
	bestDate := from.AddDate(0, 0, 1)
	bestDiff := 1.0
	for i := 1; i <= 35; i++ {
		candidate := from.AddDate(0, 0, i)
		phase := moonPhase(candidate)
		diff := math.Min(math.Abs(phase-target), 1-math.Abs(phase-target))
		if diff < bestDiff {
			bestDiff = diff
			bestDate = candidate
		}
	}
	return bestDate
}

func lastSunday(year int, month time.Month) time.Time {
	lastDay := 31
	switch month {
	case time.April, time.June, time.September, time.November:
		lastDay = 30
	case time.February:
		if year%4 == 0 && (year%100 != 0 || year%400 == 0) {
			lastDay = 29
		} else {
			lastDay = 28
		}
	}
	d := time.Date(year, month, lastDay, 0, 0, 0, 0, time.UTC)
	for d.Weekday() != time.Sunday {
		d = d.AddDate(0, 0, -1)
	}
	return d
}
