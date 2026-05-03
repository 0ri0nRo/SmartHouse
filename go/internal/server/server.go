package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"smarthouse/internal/activity"
	"smarthouse/internal/airquality"
	"smarthouse/internal/config"
	"smarthouse/internal/expenses"
	"smarthouse/internal/gcalendar"
	"smarthouse/internal/honeypot"
	"smarthouse/internal/migrator"
	"smarthouse/internal/networkdevices"
	"smarthouse/internal/news"
	"smarthouse/internal/picologs"
	"smarthouse/internal/receipt"
	"smarthouse/internal/recipe"
	"smarthouse/internal/security"
	"smarthouse/internal/sensors"
	"smarthouse/internal/sunmoon"
	"smarthouse/internal/todolist"
	"smarthouse/internal/trains"
)

type Server struct {
	cfg      config.Config
	logger   *log.Logger
	http     *http.Server
	redis    *redis.Client
	network  *networkdevices.Service
	news     *news.Service
	calendar *gcalendar.Service
	sunMoon  *sunmoon.Service
	sensors  *sensors.Service
	air      *airquality.Service
	activity *activity.Service
	todo     *todolist.Service
	honeypot *honeypot.Service
	security *security.Service
	recipe   *recipe.Service
	picologs *picologs.Service
	expenses *expenses.Service
}

func New(cfg config.Config, logger *log.Logger) *Server {
	if logger == nil {
		logger = log.New(os.Stdout, "", log.LstdFlags)
	}

	// run DB migrations if Postgres DSN provided
	if cfg.PostgresDSN != "" {
		if err := migrator.ApplyAll(cfg.PostgresDSN); err != nil {
			logger.Printf("migrations apply failed: %v", err)
		} else {
			logger.Printf("migrations applied")
		}
	}

	s := &Server{cfg: cfg, logger: logger}
	redisAddr := fmt.Sprintf("%s:%d", cfg.RedisHost, cfg.RedisPort)
	s.redis = redis.NewClient(&redis.Options{Addr: redisAddr})
	s.network = networkdevices.New(redisAddr)
	s.news = news.New()
	if calSvc, err := gcalendar.New(cfg.CalendarCredsPath, cfg.CalendarTokenPath, cfg.CalendarID); err != nil {
		s.logger.Printf("calendar init: %v", err)
		s.calendar = calSvc
	} else {
		s.calendar = calSvc
	}
	s.sunMoon = sunmoon.New(cfg.HomeLat(), cfg.HomeLon())
	if svc, err := sensors.New(cfg.PostgresDSN, cfg.ShellyIP); err != nil {
		s.logger.Printf("sensors init: %v", err)
	} else {
		s.sensors = svc
	}
	if aSvc, err := airquality.New(cfg.PostgresDSN); err != nil {
		s.logger.Printf("airquality init: %v", err)
	} else {
		s.air = aSvc
	}
	if tSvc, err := todolist.New(cfg.MongoURI); err != nil {
		s.logger.Printf("todolist init: %v", err)
	} else {
		s.todo = tSvc
		s.logger.Printf("todolist initialized")
	}
	if actSvc, err := activity.New(cfg.PostgresDSN, cfg.CalendarCredsPath, cfg.CalendarTokenPath, cfg.CalendarID); err != nil {
		s.logger.Printf("activity init: %v", err)
	} else {
		s.activity = actSvc
	}
	// honeypot service (reads cowrie logs)
	if hp := honeypot.New(); hp != nil {
		s.honeypot = hp
	}
	if sec, err := security.New(cfg.PostgresDSN); err != nil {
		s.logger.Printf("security init: %v", err)
	} else {
		s.security = sec
	}
	// recipe service
	if rsvc := recipe.New(); rsvc != nil {
		s.recipe = rsvc
	}
	// pico logs - DB-backed if DSN provided
	if pls, err := picologs.New(cfg.PostgresDSN); err != nil {
		s.logger.Printf("picologs init: %v", err)
		s.picologs, _ = picologs.New("")
	} else {
		s.picologs = pls
	}

	// expenses service (Sheets or proxy)
	if esvc, err := expenses.New(); err != nil {
		s.logger.Printf("expenses init: %v", err)
	} else {
		s.expenses = esvc
	}
	s.http = &http.Server{
		Addr:           config.Address(cfg.Host, cfg.Port),
		Handler:        s,
		ReadTimeout:    cfg.ReadTimeout,
		WriteTimeout:   cfg.WriteTimeout,
		IdleTimeout:    cfg.IdleTimeout,
		MaxHeaderBytes: cfg.MaxHeaderBytes,
	}
	return s
}

func (s *Server) Run(ctx context.Context) error {
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := s.http.Shutdown(shutdownCtx); err != nil {
			s.logger.Printf("graceful shutdown failed: %v", err)
		}
	}()

	s.logger.Printf("starting server on %s", s.http.Addr)
	if err := s.http.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	return nil
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.applyCORS(w, r)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	switch {
	case r.URL.Path == "/health":
		s.handleHealth(w, r)
	case r.URL.Path == "/api/ping":
		s.handlePing(w, r)
	case r.URL.Path == "/api/air_quality":
		s.handleAirQuality(w, r)
	case r.URL.Path == "/api/air_quality/history":
		s.handleAirQualityHistory(w, r)
	case r.URL.Path == "/api/activity/all":
		s.handleActivityAll(w, r)
	case r.URL.Path == "/api/activity/add":
		s.handleActivityAdd(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/activity/delete/"):
		s.handleActivityDelete(w, r)
	case r.URL.Path == "/api/activity/categories":
		s.handleActivityCategories(w, r)
	case r.URL.Path == "/api/activity/sync":
		s.handleActivitySync(w, r)
	case r.URL.Path == "/api/activity/uncategorized":
		s.handleActivityUncategorized(w, r)
	case r.URL.Path == "/api/shopping-list/current":
		s.handleShoppingCurrent(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/shopping-list/complete/"):
		s.handleShoppingComplete(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/shopping-list/uncomplete/"):
		s.handleShoppingUncomplete(w, r)
	case r.URL.Path == "/api/shopping-list/history":
		s.handleShoppingHistory(w, r)
	case r.URL.Path == "/api/shopping-list/stats":
		s.handleShoppingStats(w, r)
	case r.URL.Path == "/api/shopping-list/clear-completed":
		s.handleShoppingClearCompleted(w, r)
	case r.URL.Path == "/security/alarm":
		s.handleSecurityAlarm(w, r)
	case r.URL.Path == "/api/shopping-list/bulk-complete":
		s.handleShoppingBulkComplete(w, r)
	case r.URL.Path == "/api/shopping/list":
		s.handleShoppingList(w, r)
	case r.URL.Path == "/api/shopping/add":
		s.handleShoppingAdd(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/shopping/delete/"):
		s.handleShoppingDelete(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/shopping/toggle/"):
		s.handleShoppingToggle(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/activity/stats/daily"):
		s.handleActivityStatsDaily(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/activity/stats/weekly"):
		s.handleActivityStatsWeekly(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/activity/stats/monthly"):
		s.handleActivityStatsMonthly(w, r)
	case r.URL.Path == "/api/last_air_quality_today":
		s.handleLastAirQualityToday(w, r)
	case r.URL.Path == "/api/air_quality_today":
		s.handleAirQualityToday(w, r)
	case r.URL.Path == "/api/gas_concentration_today":
		s.handleGasConcentrationToday(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/air_quality_monthly/"):
		s.handleAirQualityMonthly(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/air_quality_yearly/"):
		s.handleAirQualityYearly(w, r)
	case r.URL.Path == "/api_sensors":
		s.handleApiSensors(w, r)
	case r.URL.Path == "/api/today_temperature":
		s.handleTodayTemperature(w, r)
	case r.URL.Path == "/api/today_humidity":
		s.handleTodayHumidity(w, r)
	case r.URL.Path == "/last_temp":
		s.handleLastTemp(w, r)
	case r.URL.Path == "/api/target_temperature":
		s.handleTargetTemperature(w, r)
	case r.URL.Path == "/api/thermostat/on":
		s.handleThermostatOn(w, r)
	case r.URL.Path == "/api/thermostat/off":
		s.handleThermostatOff(w, r)
	case r.URL.Path == "/api/thermostat/status":
		s.handleThermostatStatus(w, r)
	case r.URL.Path == "/api/boiler/status":
		s.handleBoilerStatus(w, r)
	case r.URL.Path == "/api/boiler/set":
		s.handleBoilerSet(w, r)
	case r.URL.Path == "/api/news":
		s.handleNews(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/honeypot"):
		s.handleHoneypot(w, r)
	case r.URL.Path == "/api/calendar/today":
		s.handleCalendarToday(w, r)
	case r.URL.Path == "/api/calendar/week":
		s.handleCalendarWeek(w, r)
	case r.URL.Path == "/api/calendar/auth/start":
		s.handleCalendarAuthStart(w, r)
	case r.URL.Path == "/api/calendar/auth/callback":
		s.handleCalendarAuthCallback(w, r)
	case r.URL.Path == "/api/expenses/list":
		s.handleExpensesList(w, r)
	case r.URL.Path == "/api/expenses":
		s.handleExpenses(w, r)
	case r.URL.Path == "/api/receipts/list":
		s.handleReceiptsList(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/receipt"):
		s.handleReceipt(w, r)
	case r.URL.Path == "/api/recipe/daily":
		s.handleRecipeDaily(w, r)
	case r.URL.Path == "/api/pico-logs":
		s.handlePicoLogs(w, r)
	case r.URL.Path == "/api/pico-logs/batch":
		s.handlePicoLogsBatch(w, r)
	case r.URL.Path == "/api/pico-logs/stats":
		s.handlePicoLogsStats(w, r)
	case r.URL.Path == "/api/pico-logs/clear":
		s.handlePicoLogsClear(w, r)
	case r.URL.Path == "/api/pico-logs/stream":
		s.handlePicoLogsStream(w, r)
	case r.URL.Path == "/api/sunmoon":
		s.handleSunMoon(w, r)
	case r.URL.Path == "/api/scan":
		s.handleNetworkScan(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/devices/") && strings.HasSuffix(r.URL.Path, "/portscan"):
		s.handleDevicePortScan(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/devices/") && strings.HasSuffix(r.URL.Path, "/osscan"):
		s.handleDeviceOSScan(w, r)
	case r.URL.Path == "/api/devices":
		s.handleDevices(w, r)
	case r.URL.Path == "/api/devices/stats":
		s.handleDeviceStats(w, r)
	case r.URL.Path == "/api/devices/most_connected_days":
		s.handleMostConnectedDays(w, r)
	case r.URL.Path == "/api/devices/alerts":
		s.handleDeviceAlerts(w, r)
	case r.URL.Path == "/api/devices/history":
		s.handleDeviceHistory(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/devices/"):
		s.handleDeviceSubroute(w, r)
	case strings.HasPrefix(r.URL.Path, "/trains_data/"):
		s.handleTrainsData(w, r)
	case r.URL.Path == "/favicon.ico":
		s.serveFile(w, r, filepath.Join(s.cfg.StaticDir, "favicon.ico"))
	case strings.HasPrefix(r.URL.Path, "/api/"):
		s.writeJSON(w, http.StatusNotFound, map[string]string{"error": "endpoint not ported yet"})
	case strings.HasPrefix(r.URL.Path, "/api/monthly_temperature"):
		s.handleMonthlyTemperature(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/monthly_average_temperature"):
		s.handleMonthlyAverageTemperature(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/daily_temperature"):
		s.handleDailyTemperatureMonth(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/monthly_average_humidity"):
		s.handleMonthlyAverageHumidity(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/monthly_average_temperature/"):
		s.handleMonthlyAverageTemperature(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/monthly_average_humidity/"):
		s.handleMonthlyAverageHumidity(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/daily_temperature/"):
		s.handleDailyTemperatureMonth(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/monthly_average_temperature/"):
		s.handleMonthlyAverageTemperature(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/temperature_average/"):
		s.handleTemperatureAverage(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/humidity_average/"):
		s.handleHumidityAverage(w, r)
	default:
		s.serveSPA(w, r)
	}
}

func (s *Server) handleReceipt(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	// Initialize receipt service if not present
	var rsvc *receipt.Service
	if s.cfg.PostgresDSN != "" {
		rs, err := receipt.New(s.cfg.PostgresDSN)
		if err == nil {
			rsvc = rs
		}
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/receipt")
	switch {
	case path == "//upload" && r.Method == http.MethodPost:
		// accept multipart file and either proxy to Python OCR service or save locally
		if err := r.ParseMultipartForm(64 << 20); err != nil {
			http.Error(w, "invalid multipart form", http.StatusBadRequest)
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "file required", http.StatusBadRequest)
			return
		}
		defer file.Close()

		// If configured, proxy to external receipt service
		if s.cfg.ReceiptServiceURL != "" {
			// build multipart request
			var b bytes.Buffer
			mw := multipart.NewWriter(&b)
			fw, err := mw.CreateFormFile("file", header.Filename)
			if err != nil {
				s.logger.Printf("create form file: %v", err)
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			if _, err := io.Copy(fw, file); err != nil {
				s.logger.Printf("copy to form: %v", err)
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			mw.Close()

			proxyURL := strings.TrimRight(s.cfg.ReceiptServiceURL, "/") + "/api/receipt/upload"
			req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, proxyURL, &b)
			if err != nil {
				s.logger.Printf("build proxy request: %v", err)
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			req.Header.Set("Content-Type", mw.FormDataContentType())

			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				s.logger.Printf("proxy request failed: %v", err)
				http.Error(w, "proxy error", http.StatusBadGateway)
				return
			}
			defer resp.Body.Close()
			w.WriteHeader(resp.StatusCode)
			io.Copy(w, resp.Body)
			return
		}

		// ensure uploads dir
		uploadDir := "uploads"
		if err := os.MkdirAll(uploadDir, 0o755); err != nil {
			s.logger.Printf("mkdir uploads: %v", err)
			http.Error(w, "unable to create upload dir", http.StatusInternalServerError)
			return
		}
		// create unique filename
		fname := fmt.Sprintf("%d_%s", time.Now().UnixNano(), strings.ReplaceAll(header.Filename, " ", "_"))
		outPath := filepath.Join(uploadDir, fname)
		out, err := os.Create(outPath)
		if err != nil {
			s.logger.Printf("create upload file: %v", err)
			http.Error(w, "unable to save file", http.StatusInternalServerError)
			return
		}
		defer out.Close()
		if _, err := io.Copy(out, file); err != nil {
			s.logger.Printf("save upload file: %v", err)
			http.Error(w, "unable to save file", http.StatusInternalServerError)
			return
		}
		// OCR processing not implemented in Go yet — return saved path
		s.writeJSON(w, http.StatusCreated, map[string]any{"message": "file uploaded", "path": outPath})
	case path == "//prezzi-minimi" && r.Method == http.MethodGet:
		if rsvc == nil {
			s.writeJSON(w, http.StatusOK, []any{})
			return
		}
		res, err := rsvc.GetPrezziMinimi(ctx)
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)
	case path == "//statistiche" && r.Method == http.MethodGet:
		if rsvc == nil {
			s.writeJSON(w, http.StatusOK, map[string]any{})
			return
		}
		res, err := rsvc.GetStatisticheGenerali(ctx)
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)
	case path == "//scontrini" && r.Method == http.MethodGet:
		if rsvc == nil {
			s.writeJSON(w, http.StatusOK, []any{})
			return
		}
		res, err := rsvc.GetScontriniList(ctx)
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)
	case path == "//health" && r.Method == http.MethodGet:
		s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "receipt_service"})
	default:
		s.writeJSON(w, http.StatusNotFound, map[string]string{"error": "receipt endpoint not found"})
	}
}

func (s *Server) handleReceiptsList(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Method != http.MethodGet {
		s.writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	// initialize receipt service
	rs, err := receipt.New(s.cfg.PostgresDSN)
	if err != nil || rs == nil {
		s.writeJSON(w, http.StatusOK, []any{})
		return
	}
	list, err := rs.GetScontriniList(ctx)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleRecipeDaily(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.recipe == nil {
		http.Error(w, "recipe service not available", http.StatusNotImplemented)
		return
	}
	res, err := s.recipe.GetDailyRecipe()
	if err != nil {
		s.logger.Printf("recipe error: %v", err)
		http.Error(w, "unable to fetch recipe", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, res)
}

func (s *Server) handlePicoLogs(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		q := r.URL.Query()
		limit := 50
		if v := q.Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				limit = n
			}
		}
		out := s.picologs.GetRecent(limit)
		s.writeJSON(w, http.StatusOK, map[string]any{"success": true, "logs": out, "count": len(out)})
	case http.MethodPost:
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		id, err := s.picologs.StoreLog(r.Context(), payload)
		if err != nil {
			s.logger.Printf("pico log store error: %v", err)
			http.Error(w, "failed to store log", http.StatusInternalServerError)
			return
		}
		s.writeJSON(w, http.StatusCreated, map[string]any{"success": true, "log_id": id})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handlePicoLogsBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	logsRaw, ok := body["logs"].([]any)
	if !ok {
		http.Error(w, "logs array required", http.StatusBadRequest)
		return
	}
	stored := 0
	errors := []string{}
	for i, l := range logsRaw {
		if m, ok := l.(map[string]any); ok {
			if _, err := s.picologs.StoreLog(r.Context(), m); err == nil {
				stored++
			} else {
				errors = append(errors, fmt.Sprintf("log %d: %v", i, err))
			}
		} else {
			errors = append(errors, fmt.Sprintf("log %d: invalid format", i))
		}
	}
	s.writeJSON(w, http.StatusCreated, map[string]any{"success": true, "stored_count": stored, "total_logs": len(logsRaw), "errors": errors})
}

func (s *Server) handlePicoLogsStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	stats := s.picologs.GetStats(r.Context())
	s.writeJSON(w, http.StatusOK, map[string]any{"success": true, "stats": stats})
}

func (s *Server) handlePicoLogsClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := s.picologs.ClearLogs(r.Context()); err != nil {
		s.logger.Printf("pico logs clear error: %v", err)
		http.Error(w, "failed to clear logs", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"success": true, "message": "All logs cleared"})
}

func (s *Server) handlePicoLogsStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// SSE stream
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	ch := s.picologs.Subscribe()
	defer s.picologs.Unsubscribe(ch)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case entry := <-ch:
			b, err := json.Marshal(entry)
			if err != nil {
				continue
			}
			// write SSE data
			fmt.Fprintf(w, "data: %s\n\n", b)
			flusher.Flush()
		}
	}
}

func (s *Server) handleTrainsData(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Method != http.MethodGet {
		s.writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	dest := strings.TrimPrefix(r.URL.Path, "/trains_data/")
	fromStation := r.URL.Query().Get("from_station")
	if fromStation == "" {
		fromStation = "ROMA TERMINI"
	}
	svc, err := trains.New(s.cfg.PostgresDSN)
	if err != nil || svc == nil {
		s.writeJSON(w, http.StatusOK, map[string]any{"result": []any{}, "result_old": []any{}})
		return
	}
	res, err := svc.FetchAndSave(ctx, dest, fromStation)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleExpensesList(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if s.expenses == nil {
		s.writeJSON(w, http.StatusOK, map[string]any{})
		return
	}
	summary, err := s.expenses.GetSummary(ctx)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, summary)
}

func (s *Server) handleExpenses(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if s.expenses == nil {
		s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "expenses service not available"})
		return
	}
	svc := s.expenses
	switch r.Method {
	case http.MethodGet:
		summary, err := svc.GetSummary(ctx)
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, summary)
	case http.MethodPost:
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			s.writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		description, _ := payload["description"].(string)
		date, _ := payload["date"].(string)
		amount := payload["amount"]
		category, _ := payload["category"].(string)
		if err := svc.AddExpense(ctx, description, date, amount, category); err != nil {
			s.writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusCreated, map[string]string{"message": "Expense added"})
	default:
		s.writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
	}
}

// parseIntFromPath helper parses an integer segment from the path suffix
func parseIntFromPath(s string) (int, error) {
	return strconv.Atoi(s)
}

func (s *Server) applyCORS(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", s.cfg.AllowedOrigin)
	w.Header().Set("Access-Control-Allow-Methods", s.cfg.AllowedMethods)
	w.Header().Set("Access-Control-Allow-Headers", s.cfg.AllowedHeaders)
	w.Header().Set("Vary", "Origin")

	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Max-Age", "86400")
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]string{
		"status":  "healthy",
		"service": "smarthouse-go",
	})
}

func (s *Server) handlePing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleNews(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data, err := s.news.GetNews()
	if err != nil {
		s.logger.Printf("news error: %v", err)
		s.writeJSON(w, http.StatusInternalServerError, data)
		return
	}

	s.writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleHoneypot(w http.ResponseWriter, r *http.Request) {
	if s.honeypot == nil {
		s.writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "honeypot service not configured"})
		return
	}
	// normalize path to a clean token without leading slash
	path := strings.TrimPrefix(r.URL.Path, "/api/honeypot")
	path = strings.TrimPrefix(path, "/")

	switch {
	case path == "debug" && r.Method == http.MethodGet:
		data, err := s.honeypot.Debug()
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, data)

	case path == "events" && r.Method == http.MethodGet:
		limit := 200
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				limit = n
			}
		}
		tf := r.URL.Query().Get("type")
		ev, err := s.honeypot.Events(limit, tf)
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, ev)

	case path == "stats" && r.Method == http.MethodGet:
		st, err := s.honeypot.Stats()
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, st)

	case path == "attackers" && r.Method == http.MethodGet:
		limit := 50
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				limit = n
			}
		}
		res, err := s.honeypot.Attackers(limit)
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)

	case path == "credentials" && r.Method == http.MethodGet:
		res, err := s.honeypot.Credentials()
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)

	case path == "commands/top" && r.Method == http.MethodGet:
		res, err := s.honeypot.TopCommands()
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)

	case strings.HasPrefix(path, "sessions/") && r.Method == http.MethodGet:
		sid := strings.TrimPrefix(path, "sessions/")
		res, err := s.honeypot.Session(sid)
		if err != nil {
			s.writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)

	case path == "timeline/daily" && r.Method == http.MethodGet:
		days := 30
		if v := r.URL.Query().Get("days"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				days = n
			}
		}
		res, err := s.honeypot.DailyTimeline(days)
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)

	case path == "files" && r.Method == http.MethodGet:
		limit := 100
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				limit = n
			}
		}
		res, err := s.honeypot.Files(limit)
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)

	case path == "summary" && r.Method == http.MethodGet:
		res, err := s.honeypot.Summary()
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)

	case path == "alerts" && r.Method == http.MethodGet:
		hours := 24
		if v := r.URL.Query().Get("hours"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				hours = n
			}
		}
		limit := 50
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				limit = n
			}
		}
		res, err := s.honeypot.Alerts(hours, limit)
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)

	case path == "threats" && r.Method == http.MethodGet:
		days := 7
		if v := r.URL.Query().Get("days"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				days = n
			}
		}
		res, err := s.honeypot.Threats(days)
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)

	case strings.HasPrefix(path, "attackers/") && r.Method == http.MethodGet:
		ip := strings.TrimPrefix(path, "attackers/")
		res, err := s.honeypot.AttackerProfile(ip)
		if err != nil {
			s.writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)

	case path == "downloads/analysis" && r.Method == http.MethodGet:
		limit := 100
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				limit = n
			}
		}
		res, err := s.honeypot.DownloadsAnalysis(limit)
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)

	case path == "geoip" && r.Method == http.MethodGet:
		limit := 100
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				limit = n
			}
		}
		res, err := s.honeypot.GeoIP(limit)
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)

	case path == "banned" && r.Method == http.MethodGet:
		jail := r.URL.Query().Get("jail")
		active := r.URL.Query().Get("active")
		activeOnly := true
		if strings.ToLower(active) == "false" {
			activeOnly = false
		}
		res, err := s.honeypot.Banned(jail, activeOnly)
		if err != nil {
			s.writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, res)

	default:
		s.writeJSON(w, http.StatusNotFound, map[string]string{"error": "honeypot endpoint not implemented"})
	}
}

func (s *Server) handleDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()
	devices, err := s.network.GetDevices(ctx)
	if err != nil {
		s.logger.Printf("devices error: %v", err)
		http.Error(w, "unable to load devices", http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, devices)
}

func (s *Server) handleNetworkScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	devices, err := s.network.ScanNetwork(r.Context())
	if err != nil {
		s.logger.Printf("network scan error: %v", err)
		http.Error(w, "unable to scan network", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, devices)
}

func (s *Server) handleDevicePortScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !strings.HasPrefix(r.URL.Path, "/api/devices/") || !strings.HasSuffix(r.URL.Path, "/portscan") {
		http.NotFound(w, r)
		return
	}
	suffix := strings.TrimPrefix(r.URL.Path, "/api/devices/")
	mac := strings.TrimSuffix(suffix, "/portscan")
	mac = strings.Trim(mac, "/")
	device, err := s.findDeviceByMAC(r.Context(), mac)
	if err != nil {
		s.logger.Printf("portscan lookup error: %v", err)
		http.Error(w, "unable to look up device", http.StatusInternalServerError)
		return
	}
	if device == nil {
		http.Error(w, "Device not found", http.StatusNotFound)
		return
	}
	ports, err := s.network.ScanPorts(r.Context(), device.IP, 100)
	if err != nil {
		s.logger.Printf("portscan error: %v", err)
		http.Error(w, "unable to scan ports", http.StatusInternalServerError)
		return
	}
	if err := s.patchDeviceField(r.Context(), mac, "open_ports", ports); err != nil {
		s.logger.Printf("portscan cache update error: %v", err)
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"mac": mac, "ip": device.IP, "ports": ports})
}

func (s *Server) handleDeviceOSScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !strings.HasPrefix(r.URL.Path, "/api/devices/") || !strings.HasSuffix(r.URL.Path, "/osscan") {
		http.NotFound(w, r)
		return
	}
	suffix := strings.TrimPrefix(r.URL.Path, "/api/devices/")
	mac := strings.TrimSuffix(suffix, "/osscan")
	mac = strings.Trim(mac, "/")
	device, err := s.findDeviceByMAC(r.Context(), mac)
	if err != nil {
		s.logger.Printf("osscan lookup error: %v", err)
		http.Error(w, "unable to look up device", http.StatusInternalServerError)
		return
	}
	if device == nil {
		http.Error(w, "Device not found", http.StatusNotFound)
		return
	}
	if cached, err := s.network.GetDevices(r.Context()); err == nil {
		_ = cached
	}
	osInfo, err := s.network.ScanOS(r.Context(), device.IP)
	if err != nil {
		s.logger.Printf("osscan error: %v", err)
		http.Error(w, "unable to scan os", http.StatusInternalServerError)
		return
	}
	if err := s.patchDeviceFields(r.Context(), mac, osInfo); err != nil {
		s.logger.Printf("osscan cache update error: %v", err)
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"mac": mac, "ip": device.IP, "os": osInfo["os"], "os_detail": osInfo["os_detail"]})
}

func (s *Server) handleDeviceStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	stats, err := s.network.GetDeviceStats(r.Context())
	if err != nil {
		s.logger.Printf("device stats error: %v", err)
		http.Error(w, "unable to load device stats", http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleMostConnectedDays(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data, err := s.network.GetMostConnectedDays(r.Context())
	if err != nil {
		s.logger.Printf("weekly activity error: %v", err)
		http.Error(w, "unable to load weekly activity", http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleDeviceAlerts(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet, http.MethodHead:
		alerts, err := s.network.GetAlerts(r.Context())
		if err != nil {
			s.logger.Printf("alerts error: %v", err)
			http.Error(w, "unable to load alerts", http.StatusInternalServerError)
			return
		}
		s.writeJSON(w, http.StatusOK, alerts)
	case http.MethodDelete:
		if err := s.network.ClearAlerts(r.Context()); err != nil {
			s.logger.Printf("clear alerts error: %v", err)
			http.Error(w, "unable to clear alerts", http.StatusInternalServerError)
			return
		}
		s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleDeviceHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	history, err := s.network.GetHistory(r.Context())
	if err != nil {
		s.logger.Printf("history error: %v", err)
		http.Error(w, "unable to load history", http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, history)
}

func (s *Server) handleDeviceSubroute(w http.ResponseWriter, r *http.Request) {
	suffix := strings.TrimPrefix(r.URL.Path, "/api/devices/")
	if strings.HasSuffix(suffix, "/history") {
		mac := strings.TrimSuffix(suffix, "/history")
		mac = strings.TrimSuffix(mac, "/")
		if mac == "" {
			http.NotFound(w, r)
			return
		}

		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		history, err := s.network.GetDeviceHistory(r.Context(), mac)
		if err != nil {
			s.logger.Printf("single device history error: %v", err)
			http.Error(w, "unable to load history", http.StatusInternalServerError)
			return
		}

		s.writeJSON(w, http.StatusOK, history)
		return
	}

	http.Error(w, "endpoint not ported yet", http.StatusNotImplemented)
}

func (s *Server) handleSecurityAlarm(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		if s.security == nil {
			s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "security not configured"})
			return
		}
		res, err := s.security.GetAlarm(r.Context())
		if err != nil {
			s.logger.Printf("security get alarm error: %v", err)
			http.Error(w, "unable to load", http.StatusInternalServerError)
			return
		}
		s.writeJSON(w, http.StatusOK, res)
	case http.MethodPost:
		if s.security == nil {
			s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "security not configured"})
			return
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		st, ok := payload["status"].(bool)
		if !ok {
			// also accept numeric/other types
			if f, ok := payload["status"].(float64); ok {
				st = f != 0
			} else if sstr, ok := payload["status"].(string); ok {
				st = strings.ToLower(sstr) == "true" || sstr == "1"
			} else {
				http.Error(w, "missing or invalid status field", http.StatusBadRequest)
				return
			}
		}
		if err := s.security.SetAlarm(r.Context(), st); err != nil {
			s.logger.Printf("security set alarm error: %v", err)
			http.Error(w, "unable to update", http.StatusInternalServerError)
			return
		}
		// invalidate cache on client side handled elsewhere; just return created
		s.writeJSON(w, http.StatusCreated, map[string]string{"message": "Status updated"})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) findDeviceByMAC(ctx context.Context, mac string) (*networkdevices.Device, error) {
	devices, err := s.network.GetDevices(ctx)
	if err != nil {
		return nil, err
	}
	for _, device := range devices {
		if strings.EqualFold(device.MAC, mac) {
			copy := device
			return &copy, nil
		}
	}
	return nil, nil
}

func (s *Server) patchDeviceField(ctx context.Context, mac string, field string, value any) error {
	return s.patchDeviceFields(ctx, mac, map[string]any{field: value})
}

func (s *Server) patchDeviceFields(ctx context.Context, mac string, patch map[string]any) error {
	devices, err := s.network.GetDevices(ctx)
	if err != nil {
		return err
	}
	updated := make([]map[string]any, 0, len(devices))
	for _, device := range devices {
		data := map[string]any{
			"ip":               device.IP,
			"mac":              device.MAC,
			"hostname":         device.Hostname,
			"vendor":           device.Vendor,
			"status":           device.Status,
			"os":               device.OS,
			"os_detail":        device.OSDetail,
			"first_seen":       device.FirstSeen,
			"last_seen":        device.LastSeen,
			"connection_count": device.ConnectionCount,
			"open_ports":       device.OpenPorts,
		}
		if strings.EqualFold(device.MAC, mac) {
			for k, v := range patch {
				data[k] = v
			}
		}
		updated = append(updated, data)
	}
	payload, err := json.Marshal(updated)
	if err != nil {
		return err
	}
	return s.redis.Set(ctx, "network:devices", payload, 5*time.Minute).Err()
}

func (s *Server) handleSunMoon(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data, err := s.sunMoon.GetData()
	if err != nil {
		s.logger.Printf("sunmoon error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleApiSensors(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}

	ctx := r.Context()
	data, err := s.sensors.GetHourlyToday(ctx)
	if err != nil {
		s.logger.Printf("sensors hourly error: %v", err)
		http.Error(w, "unable to load sensors", http.StatusInternalServerError)
		return
	}

	last, err := s.sensors.GetLatest(ctx)
	if err != nil {
		s.logger.Printf("sensors latest error: %v", err)
	}

	if len(data) == 0 {
		s.writeJSON(w, http.StatusNotFound, map[string]string{"error": "No data available."})
		return
	}

	// compute min/max/avg arrays similar to Python implementation
	minTemp := data[0].AvgTemperature
	maxTemp := data[0].AvgTemperature
	var hums []float64
	chartTemp := make([]string, 0, len(data))
	chartHum := make([]string, 0, len(data))
	labels := make([]string, 0, len(data))

	for _, e := range data {
		if e.AvgTemperature < minTemp {
			minTemp = e.AvgTemperature
		}
		if e.AvgTemperature > maxTemp {
			maxTemp = e.AvgTemperature
		}
		if e.Humidity != nil {
			hums = append(hums, *e.Humidity)
		}
		chartTemp = append(chartTemp, fmt.Sprintf("%.2f", e.AvgTemperature))
		if e.Humidity != nil {
			chartHum = append(chartHum, fmt.Sprintf("%.2f", *e.Humidity))
		} else {
			chartHum = append(chartHum, fmt.Sprintf("%.2f", 0.0))
		}
		labels = append(labels, fmt.Sprintf("%d:00", e.Hour))
	}

	var minHum, maxHum, avgHum *float64
	if len(hums) > 0 {
		min := hums[0]
		max := hums[0]
		sum := 0.0
		for _, v := range hums {
			if v < min {
				min = v
			}
			if v > max {
				max = v
			}
			sum += v
		}
		a := sum / float64(len(hums))
		minHum = &min
		maxHum = &max
		avgHum = &a
	}

	var currentTemp string
	var currentHum string
	if last != nil {
		currentTemp = fmt.Sprintf("%.2f", last.Temperature)
		if last.Humidity != nil {
			currentHum = fmt.Sprintf("%.2f", *last.Humidity)
		} else {
			currentHum = "N/A"
		}
	} else {
		currentTemp = "N/A"
		currentHum = "N/A"
	}

	resp := map[string]any{
		"temperature": map[string]any{
			"current":           currentTemp,
			"minMaxLast24Hours": []string{fmt.Sprintf("%.2f", minTemp), fmt.Sprintf("%.2f", maxTemp)},
			"chartData":         chartTemp,
		},
		"humidity": map[string]any{
			"current": currentHum,
			"minMaxLast24Hours": func() []string {
				if minHum == nil {
					return []string{"N/A", "N/A"}
				}
				return []string{fmt.Sprintf("%.2f", *minHum), fmt.Sprintf("%.2f", *maxHum)}
			}(),
			"average": func() string {
				if avgHum == nil {
					return "N/A"
				}
				return fmt.Sprintf("%.2f", *avgHum)
			}(),
			"chartData": chartHum,
		},
		"labels": labels,
	}

	s.writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleTodayTemperature(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}
	data, err := s.sensors.GetTodayHourlyTemperature(r.Context())
	if err != nil {
		s.logger.Printf("today temp error: %v", err)
		http.Error(w, "unable to load data", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleTodayHumidity(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}
	data, err := s.sensors.GetTodayHourlyHumidity(r.Context())
	if err != nil {
		s.logger.Printf("today hum error: %v", err)
		http.Error(w, "unable to load data", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleLastTemp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}
	data, err := s.sensors.LastTempDB(r.Context())
	if err != nil {
		s.logger.Printf("last temp error: %v", err)
		http.Error(w, "unable to load data", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleTargetTemperature(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet, http.MethodHead:
		if s.sensors == nil {
			s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
			return
		}
		v, err := s.sensors.GetTargetTemperature(r.Context())
		if err != nil {
			s.logger.Printf("get target temp error: %v", err)
			http.Error(w, "unable to load target", http.StatusInternalServerError)
			return
		}
		s.writeJSON(w, http.StatusOK, map[string]any{"target_temperature": v})
	case http.MethodPost:
		if s.sensors == nil {
			s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
			return
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		val, ok := body["target_temperature"]
		if !ok {
			http.Error(w, "missing target_temperature", http.StatusBadRequest)
			return
		}
		var num float64
		switch t := val.(type) {
		case float64:
			num = t
		case int:
			num = float64(t)
		default:
			http.Error(w, "target_temperature must be a number", http.StatusBadRequest)
			return
		}
		if err := s.sensors.SetTargetTemperature(r.Context(), num); err != nil {
			s.logger.Printf("set target temp error: %v", err)
			http.Error(w, "unable to set target", http.StatusInternalServerError)
			return
		}
		s.writeJSON(w, http.StatusOK, map[string]any{"status": "success", "target_temperature": num})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleThermostatOn(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}
	// blackout check is not implemented; simply set enabled and call shelly
	if err := s.sensors.SetThermostatEnabled(r.Context(), true); err != nil {
		s.logger.Printf("set thermostat enabled error: %v", err)
		http.Error(w, "unable to set thermostat", http.StatusInternalServerError)
		return
	}
	// try control shelly
	if err := s.sensors.ControlShellyRelay(true); err != nil {
		s.logger.Printf("shelly on error: %v", err)
		http.Error(w, "shelly error", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"status": "success", "message": "Thermostat enabled, caldaia accesa"})
}

func (s *Server) handleThermostatOff(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}
	if err := s.sensors.SetThermostatEnabled(r.Context(), false); err != nil {
		s.logger.Printf("set thermostat disabled error: %v", err)
		http.Error(w, "unable to set thermostat", http.StatusInternalServerError)
		return
	}
	if err := s.sensors.ControlShellyRelay(false); err != nil {
		s.logger.Printf("shelly off error: %v", err)
		http.Error(w, "shelly error", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"status": "success", "message": "Thermostat disabled, caldaia spenta"})
}

func (s *Server) handleThermostatStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}
	enabled, err := s.sensors.GetThermostatEnabled(r.Context())
	if err != nil {
		s.logger.Printf("thermostat status error: %v", err)
		http.Error(w, "unable to load status", http.StatusInternalServerError)
		return
	}
	boilerOn, _ := s.sensors.GetBoilerStatus(r.Context())
	s.writeJSON(w, http.StatusOK, map[string]any{"thermostat_enabled": enabled, "boiler_on": boilerOn})
}

func (s *Server) handleBoilerStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}
	status, err := s.sensors.GetBoilerStatus(r.Context())
	if err != nil {
		s.logger.Printf("boiler status error: %v", err)
		http.Error(w, "unable to load status", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"is_on": status})
}

func (s *Server) handleBoilerSet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	val, ok := body["is_on"]
	if !ok {
		http.Error(w, "missing is_on value", http.StatusBadRequest)
		return
	}
	var isOn bool
	switch t := val.(type) {
	case bool:
		isOn = t
	default:
		http.Error(w, "is_on must be boolean", http.StatusBadRequest)
		return
	}
	if err := s.sensors.SetBoilerStatus(r.Context(), isOn); err != nil {
		s.logger.Printf("set boiler status error: %v", err)
		http.Error(w, "unable to set boiler status", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"status": "success", "is_on": isOn})
}

func (s *Server) handleMonthlyTemperature(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}
	// optional year suffix: /api/monthly_temperature or /api/monthly_temperature/<year>
	year := 0
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/monthly_temperature"), "/")
	if len(parts) >= 2 && parts[1] != "" {
		if v, err := strconv.Atoi(parts[1]); err == nil {
			year = v
		}
	}
	data, err := s.sensors.GetMonthlyTemperatureData(r.Context(), year)
	if err != nil {
		s.logger.Printf("monthly temp error: %v", err)
		http.Error(w, "unable to load data", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleMonthlyAverageTemperature(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}
	// /api/monthly_average_temperature or /api/monthly_average_temperature/<year> or /api/monthly_average_temperature/<month>/<year>
	suffix := strings.TrimPrefix(r.URL.Path, "/api/monthly_average_temperature")
	suffix = strings.Trim(suffix, "/")
	if suffix == "" {
		data, err := s.sensors.GetMonthlyAverageTemperature(r.Context(), 0)
		if err != nil {
			s.logger.Printf("monthly avg temp error: %v", err)
			http.Error(w, "unable to load", http.StatusInternalServerError)
			return
		}
		s.writeJSON(w, http.StatusOK, data)
		return
	}
	parts := strings.Split(suffix, "/")
	if len(parts) == 1 {
		if year, err := strconv.Atoi(parts[0]); err == nil {
			data, err := s.sensors.GetMonthlyAverageTemperature(r.Context(), year)
			if err != nil {
				s.logger.Printf("monthly avg temp error: %v", err)
				http.Error(w, "unable to load", http.StatusInternalServerError)
				return
			}
			s.writeJSON(w, http.StatusOK, data)
			return
		}
	}
	if len(parts) == 2 {
		// month/year -> delegate to daily for month
		month, err1 := strconv.Atoi(parts[0])
		year, err2 := strconv.Atoi(parts[1])
		if err1 == nil && err2 == nil {
			data, err := s.sensors.GetDailyForMonth(r.Context(), month, year)
			if err != nil {
				s.logger.Printf("daily temp error: %v", err)
				http.Error(w, "unable to load", http.StatusInternalServerError)
				return
			}
			s.writeJSON(w, http.StatusOK, data)
			return
		}
	}
	http.Error(w, "bad request", http.StatusBadRequest)
}

func (s *Server) handleDailyTemperatureMonth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}
	suffix := strings.TrimPrefix(r.URL.Path, "/api/daily_temperature")
	suffix = strings.Trim(suffix, "/")
	parts := strings.Split(suffix, "/")
	if len(parts) >= 1 {
		month, err := strconv.Atoi(parts[0])
		if err != nil || month < 1 || month > 12 {
			http.Error(w, "Invalid month.", http.StatusBadRequest)
			return
		}
		year := 0
		if len(parts) >= 2 {
			if y, err := strconv.Atoi(parts[1]); err == nil {
				year = y
			}
		}
		data, err := s.sensors.GetDailyForMonth(r.Context(), month, year)
		if err != nil {
			s.logger.Printf("daily temp error: %v", err)
			http.Error(w, "unable to load", http.StatusInternalServerError)
			return
		}
		if len(data) == 0 {
			s.writeJSON(w, http.StatusNotFound, map[string]string{"error": "No data for the month."})
			return
		}
		s.writeJSON(w, http.StatusOK, data)
		return
	}
	http.Error(w, "bad request", http.StatusBadRequest)
}

func (s *Server) handleTemperatureAverage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}
	// path: /api/temperature_average/<start>/<end>
	suffix := strings.TrimPrefix(r.URL.Path, "/api/temperature_average/")
	parts := strings.Split(suffix, "/")
	if len(parts) < 2 {
		http.Error(w, "missing dates", http.StatusBadRequest)
		return
	}
	start, err1 := time.Parse(time.RFC3339, parts[0])
	end, err2 := time.Parse(time.RFC3339, parts[1])
	if err1 != nil || err2 != nil {
		http.Error(w, "Invalid date format. Use ISO8601.", http.StatusBadRequest)
		return
	}
	data, err := s.sensors.GetAverageTemperatures(r.Context(), start, end)
	if err != nil {
		s.logger.Printf("avg temp range error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleHumidityAverage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}
	suffix := strings.TrimPrefix(r.URL.Path, "/api/humidity_average/")
	parts := strings.Split(suffix, "/")
	if len(parts) < 2 {
		http.Error(w, "missing dates", http.StatusBadRequest)
		return
	}
	start, err1 := time.Parse(time.RFC3339, parts[0])
	end, err2 := time.Parse(time.RFC3339, parts[1])
	if err1 != nil || err2 != nil {
		http.Error(w, "Invalid date format. Use ISO8601.", http.StatusBadRequest)
		return
	}
	data, err := s.sensors.GetAverageHumidity(r.Context(), start, end)
	if err != nil {
		s.logger.Printf("avg hum range error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleMonthlyAverageHumidity(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.sensors == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "sensors not configured"})
		return
	}
	suffix := strings.TrimPrefix(r.URL.Path, "/api/monthly_average_humidity")
	suffix = strings.Trim(suffix, "/")
	if suffix == "" {
		data, err := s.sensors.GetMonthlyAverageHumidity(r.Context(), 0)
		if err != nil {
			s.logger.Printf("monthly avg hum error: %v", err)
			http.Error(w, "unable to load", http.StatusInternalServerError)
			return
		}
		s.writeJSON(w, http.StatusOK, data)
		return
	}
	if year, err := strconv.Atoi(suffix); err == nil {
		data, err := s.sensors.GetMonthlyAverageHumidity(r.Context(), year)
		if err != nil {
			s.logger.Printf("monthly avg hum error: %v", err)
			http.Error(w, "unable to load", http.StatusInternalServerError)
			return
		}
		s.writeJSON(w, http.StatusOK, data)
		return
	}
	http.Error(w, "bad request", http.StatusBadRequest)
}

func (s *Server) handleAirQuality(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		if s.air == nil {
			s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "airquality not configured"})
			return
		}
		q := r.URL.Query()
		limit := 1000
		if v := q.Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				limit = n
			}
		}
		if limit > 5000 {
			limit = 5000
		}
		hours := 24
		if v := q.Get("hours"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				hours = n
			}
		}
		if hours > 168 {
			hours = 168
		}
		out, err := s.air.GetRecent(r.Context(), hours, limit)
		if err != nil {
			s.logger.Printf("air_quality list error: %v", err)
			http.Error(w, "unable to load", http.StatusInternalServerError)
			return
		}
		if len(out) == 0 {
			s.writeJSON(w, http.StatusNotFound, map[string]any{"error": "No data found", "message": fmt.Sprintf("No records in the last %d hours.", hours), "count": 0})
			return
		}
		s.writeJSON(w, http.StatusOK, map[string]any{"data": out, "count": len(out), "hours_requested": hours, "limit_applied": limit})
	case http.MethodPost:
		if s.air == nil {
			s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "airquality not configured"})
			return
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		res, err := s.air.InsertRecord(r.Context(), payload)
		if err != nil {
			s.logger.Printf("insert air error: %v", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		s.writeJSON(w, http.StatusCreated, map[string]any{"message": "Data saved", "id": res["id"], "timestamp": res["timestamp"], "data": payload})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleLastAirQualityToday(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.air == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "airquality not configured"})
		return
	}
	res, err := s.air.GetLatestToday(r.Context())
	if err != nil {
		s.logger.Printf("last air error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	if res == nil {
		s.writeJSON(w, http.StatusNotFound, map[string]string{"error": "No data found", "message": "No records for today"})
		return
	}
	s.writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleAirQualityToday(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.air == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "airquality not configured"})
		return
	}
	data, err := s.air.GetDailyAggregated(r.Context())
	if err != nil {
		s.logger.Printf("daily agg error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	if len(data) == 0 {
		s.writeJSON(w, http.StatusNotFound, map[string]string{"error": "No data", "message": "No records for today"})
		return
	}
	simplified := map[string]any{}
	for h, v := range data {
		if hv, ok := v["avg_air_quality_index"]; ok {
			simplified[fmt.Sprintf("%d", h)] = hv
		}
	}
	s.writeJSON(w, http.StatusOK, simplified)
}

func (s *Server) handleGasConcentrationToday(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.air == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "airquality not configured"})
		return
	}
	data, err := s.air.GetHourlyGasConcentration(r.Context())
	if err != nil {
		s.logger.Printf("gas conc error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleAirQualityMonthly(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.air == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "airquality not configured"})
		return
	}
	// path like /api/air_quality_monthly/<month>/<year>
	suffix := strings.TrimPrefix(r.URL.Path, "/api/air_quality_monthly/")
	parts := strings.Split(strings.Trim(suffix, "/"), "/")
	if len(parts) < 2 {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	month, err1 := strconv.Atoi(parts[0])
	year, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil {
		http.Error(w, "Invalid params", http.StatusBadRequest)
		return
	}
	data, err := s.air.GetMonthlyDailyAvg(r.Context(), month, year)
	if err != nil {
		s.logger.Printf("monthly avg error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	if len(data) == 0 {
		s.writeJSON(w, http.StatusNotFound, map[string]string{"error": "No data"})
		return
	}
	s.writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleAirQualityHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.air == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "airquality not configured"})
		return
	}
	q := r.URL.Query()
	limit := 1000
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > 5000 {
		limit = 5000
	}
	hours := 168
	if v := q.Get("hours"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			hours = n
		}
	}
	out, err := s.air.GetRecent(r.Context(), hours, limit)
	if err != nil {
		s.logger.Printf("air_quality history error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	if len(out) == 0 {
		s.writeJSON(w, http.StatusNotFound, map[string]any{"error": "No data found", "message": fmt.Sprintf("No records in the last %d hours.", hours), "count": 0})
		return
	}
	s.writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleActivityAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.activity == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "activity not configured"})
		return
	}
	out, err := s.activity.GetAll(r.Context())
	if err != nil {
		s.logger.Printf("activity all error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"events": out, "count": len(out)})
}

func (s *Server) handleActivityAdd(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.activity == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "activity not configured"})
		return
	}
	var payload map[string]any
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	res, err := s.activity.AddEvent(r.Context(), payload)
	if err != nil {
		s.logger.Printf("activity add error: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	s.writeJSON(w, http.StatusCreated, res)
}

func (s *Server) handleActivityDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.activity == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "activity not configured"})
		return
	}
	suffix := strings.TrimPrefix(r.URL.Path, "/api/activity/delete/")
	id, err := strconv.ParseInt(strings.Trim(suffix, "/"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := s.activity.DeleteEvent(r.Context(), id); err != nil {
		s.logger.Printf("activity delete error: %v", err)
		http.Error(w, "unable to delete", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"deleted": id})
}

func (s *Server) handleActivityCategories(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.activity == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "activity not configured"})
		return
	}
	out, err := s.activity.GetCategories(r.Context())
	if err != nil {
		s.logger.Printf("activity categories error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"data": out, "count": len(out)})
}

func (s *Server) handleActivitySync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.activity == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "activity not configured"})
		return
	}
	var body struct {
		StartDate string `json:"start_date"`
		EndDate   string `json:"end_date"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	start, end, err := parseSyncDates(body.StartDate, body.EndDate)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	stats, err := s.activity.SyncEvents(r.Context(), start, end)
	if err != nil {
		s.logger.Printf("activity sync error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"success": true, "stats": stats})
}

func (s *Server) handleCalendarToday(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.calendar == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "calendar not configured"})
		return
	}
	events, err := s.calendar.TodayEvents(r.Context())
	if err != nil {
		s.logger.Printf("calendar today error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	today := time.Now().In(time.FixedZone("CET/CEST", 2*3600)).Format("2006-01-02")
	s.writeJSON(w, http.StatusOK, map[string]any{"events": events, "count": len(events), "date": today})
}

func (s *Server) handleCalendarWeek(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.calendar == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "calendar not configured"})
		return
	}
	days, err := s.calendar.WeekEvents(r.Context())
	if err != nil {
		s.logger.Printf("calendar week error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	total := 0
	for _, entries := range days {
		total += len(entries)
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"days": days, "total": total})
}

func (s *Server) handleCalendarAuthStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.calendar == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "calendar not configured"})
		return
	}
	authURL, err := s.calendar.AuthURL()
	if err != nil {
		s.logger.Printf("calendar auth start error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"auth_url": authURL})
}

func (s *Server) handleCalendarAuthCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.calendar == nil {
		http.Redirect(w, r, "/#/calendar/auth?error=calendar_not_configured", http.StatusFound)
		return
	}
	if errText := strings.TrimSpace(r.URL.Query().Get("error")); errText != "" {
		http.Redirect(w, r, "/#/calendar/auth?error="+errText, http.StatusFound)
		return
	}
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if code == "" {
		http.Redirect(w, r, "/#/calendar/auth?error=missing_code", http.StatusFound)
		return
	}
	if err := s.calendar.ExchangeCode(r.Context(), code); err != nil {
		s.logger.Printf("calendar auth callback error: %v", err)
		http.Redirect(w, r, "/#/calendar/auth?error="+url.QueryEscape(err.Error()), http.StatusFound)
		return
	}
	http.Redirect(w, r, "/#/calendar/auth?success=1", http.StatusFound)
}

func parseSyncDates(startDate, endDate string) (*time.Time, *time.Time, error) {
	var start, end *time.Time
	if startDate != "" {
		t, err := time.Parse("2006-01-02", startDate)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid start_date")
		}
		start = &t
	}
	if endDate != "" {
		t, err := time.Parse("2006-01-02", endDate)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid end_date")
		}
		end = &t
	}
	return start, end, nil
}

func (s *Server) handleActivityUncategorized(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.activity == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "activity not configured"})
		return
	}
	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	out, err := s.activity.GetUncategorized(r.Context(), limit)
	if err != nil {
		s.logger.Printf("activity uncategorized error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"events": out, "count": len(out)})
}

func (s *Server) handleActivityStatsDaily(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.activity == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "activity not configured"})
		return
	}
	dateStr := r.URL.Query().Get("date")
	if dateStr == "" {
		dateStr = time.Now().Format("2006-01-02")
	}
	out, err := s.activity.GetDailyStats(r.Context(), dateStr)
	if err != nil {
		s.logger.Printf("activity daily stats error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"date": dateStr, "stats": out, "count": len(out)})
}

func (s *Server) handleActivityStatsWeekly(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.activity == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "activity not configured"})
		return
	}
	year := time.Now().Year()
	_, defaultWeek := time.Now().ISOWeek()
	week := defaultWeek
	if y := r.URL.Query().Get("year"); y != "" {
		if n, err := strconv.Atoi(y); err == nil {
			year = n
		}
	}
	if wq := r.URL.Query().Get("week"); wq != "" {
		if n, err := strconv.Atoi(wq); err == nil {
			week = n
		}
	}
	out, err := s.activity.GetWeeklyStats(r.Context(), year, week)
	if err != nil {
		s.logger.Printf("activity weekly stats error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"year": year, "week": week, "stats": out, "count": len(out)})
}

func (s *Server) handleActivityStatsMonthly(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.activity == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "activity not configured"})
		return
	}
	now := time.Now()
	year := now.Year()
	month := int(now.Month())
	if y := r.URL.Query().Get("year"); y != "" {
		if n, err := strconv.Atoi(y); err == nil {
			year = n
		}
	}
	if m := r.URL.Query().Get("month"); m != "" {
		if n, err := strconv.Atoi(m); err == nil {
			month = n
		}
	}
	out, err := s.activity.GetMonthlyStats(r.Context(), year, month)
	if err != nil {
		s.logger.Printf("activity monthly stats error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"year": year, "month": month, "stats": out, "count": len(out)})
}

func (s *Server) handleShoppingCurrent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.todo == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "shopping not configured"})
		return
	}
	out, err := s.todo.ReadCurrentItems(r.Context())
	if err != nil {
		s.logger.Printf("shopping current error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleShoppingComplete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.todo == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "shopping not configured"})
		return
	}
	suffix := strings.TrimPrefix(r.URL.Path, "/api/shopping-list/complete/")
	id := strings.Trim(suffix, "/")
	var info map[string]any
	_ = json.NewDecoder(r.Body).Decode(&info)
	ok, err := s.todo.MarkAsPurchased(r.Context(), id, info)
	if err != nil {
		s.logger.Printf("shopping complete error: %v", err)
		http.Error(w, "unable to update", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"updated": ok})
}

func (s *Server) handleShoppingUncomplete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.todo == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "shopping not configured"})
		return
	}
	suffix := strings.TrimPrefix(r.URL.Path, "/api/shopping-list/uncomplete/")
	id := strings.Trim(suffix, "/")
	ok, err := s.todo.MarkAsUnpurchased(r.Context(), id)
	if err != nil {
		s.logger.Printf("shopping uncomplete error: %v", err)
		http.Error(w, "unable to update", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"updated": ok})
}

func (s *Server) handleShoppingHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.todo == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "shopping not configured"})
		return
	}
	// optional start/end params as RFC3339
	var start, end *time.Time
	if v := r.URL.Query().Get("start"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			start = &t
		}
	}
	if v := r.URL.Query().Get("end"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			end = &t
		}
	}
	out, err := s.todo.FindPurchasedRange(r.Context(), start, end)
	if err != nil {
		s.logger.Printf("shopping history error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleShoppingStats(w http.ResponseWriter, r *http.Request) {
	http.Error(w, "not implemented", http.StatusNotImplemented)
}

func (s *Server) handleShoppingClearCompleted(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.todo == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "shopping not configured"})
		return
	}
	n, err := s.todo.ClearPurchased(r.Context())
	if err != nil {
		s.logger.Printf("shopping clear error: %v", err)
		http.Error(w, "unable to clear", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"cleared": n})
}

func (s *Server) handleShoppingBulkComplete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.todo == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "shopping not configured"})
		return
	}
	var payload struct {
		ItemIDs []string `json:"item_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	n, err := s.todo.BulkMarkPurchased(r.Context(), payload.ItemIDs)
	if err != nil {
		s.logger.Printf("shopping bulk error: %v", err)
		http.Error(w, "unable to update", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"updated": n})
}

// Simple compatibility endpoints under /api/shopping/*
func (s *Server) handleShoppingList(w http.ResponseWriter, r *http.Request) {
	s.handleShoppingCurrent(w, r)
}

func (s *Server) handleShoppingAdd(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.todo == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "shopping not configured"})
		return
	}
	var payload map[string]any
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	id, err := s.todo.InsertItem(r.Context(), payload)
	if err != nil {
		s.logger.Printf("shopping add error: %v", err)
		http.Error(w, "unable to insert", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (s *Server) handleShoppingDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.todo == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "shopping not configured"})
		return
	}
	suffix := strings.TrimPrefix(r.URL.Path, "/api/shopping/delete/")
	id := strings.Trim(suffix, "/")
	ok, err := s.todo.DeleteItem(r.Context(), id)
	if err != nil {
		s.logger.Printf("shopping delete error: %v", err)
		http.Error(w, "unable to delete", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"deleted": ok})
}

func (s *Server) handleShoppingToggle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.todo == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "shopping not configured"})
		return
	}
	suffix := strings.TrimPrefix(r.URL.Path, "/api/shopping/toggle/")
	id := strings.Trim(suffix, "/")
	cur, err := s.todo.GetByID(r.Context(), id)
	if err != nil {
		s.logger.Printf("shopping toggle lookup error: %v", err)
		http.Error(w, "unable to lookup", http.StatusInternalServerError)
		return
	}
	if cur == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	purchased, _ := cur["purchased"].(bool)
	if purchased {
		ok, err := s.todo.MarkAsUnpurchased(r.Context(), id)
		if err != nil {
			s.logger.Printf("shopping toggle error: %v", err)
			http.Error(w, "unable", http.StatusInternalServerError)
			return
		}
		s.writeJSON(w, http.StatusOK, map[string]any{"updated": ok, "purchased": false})
		return
	}
	ok, err := s.todo.MarkAsPurchased(r.Context(), id, map[string]any{"by": "toggle"})
	if err != nil {
		s.logger.Printf("shopping toggle error: %v", err)
		http.Error(w, "unable", http.StatusInternalServerError)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"updated": ok, "purchased": true})
}

func (s *Server) handleAirQualityYearly(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.air == nil {
		s.writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "airquality not configured"})
		return
	}
	suffix := strings.TrimPrefix(r.URL.Path, "/api/air_quality_yearly/")
	year, err := strconv.Atoi(strings.Trim(suffix, "/"))
	if err != nil {
		http.Error(w, "Invalid year", http.StatusBadRequest)
		return
	}
	data, err := s.air.GetYearlyMonthlyAvg(r.Context(), year)
	if err != nil {
		s.logger.Printf("yearly avg error: %v", err)
		http.Error(w, "unable to load", http.StatusInternalServerError)
		return
	}
	if len(data) == 0 {
		s.writeJSON(w, http.StatusNotFound, map[string]string{"error": "No data"})
		return
	}
	s.writeJSON(w, http.StatusOK, data)
}

func (s *Server) serveSPA(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	requestPath := strings.TrimPrefix(filepath.Clean(r.URL.Path), string(filepath.Separator))
	if requestPath != "." && requestPath != "" {
		assetPath := filepath.Join(s.cfg.StaticDir, filepath.FromSlash(requestPath))
		if info, err := os.Stat(assetPath); err == nil && !info.IsDir() {
			s.serveFile(w, r, assetPath)
			return
		}
	}

	s.serveFile(w, r, filepath.Join(s.cfg.StaticDir, "index.html"))
}

func (s *Server) serveFile(w http.ResponseWriter, r *http.Request, path string) {
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, fmt.Sprintf("stat file: %v", err), http.StatusInternalServerError)
		return
	}

	http.ServeFile(w, r, path)
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		s.logger.Printf("encode json: %v", err)
	}
}
