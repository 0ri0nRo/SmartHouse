package migrator

import (
	"database/sql"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"sort"

	_ "github.com/lib/pq"
)

// ApplyAll runs all .sql files in the migrations directory against the provided DSN.
func ApplyAll(dsn string) error {
	if dsn == "" {
		return fmt.Errorf("empty DSN")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer db.Close()

	info, err := os.Stat("migrations")
	if err != nil || !info.IsDir() {
		return fmt.Errorf("migrations directory not found")
	}

	files, err := filepath.Glob("migrations/*.sql")
	if err != nil {
		return fmt.Errorf("glob migrations: %w", err)
	}
	sort.Strings(files)

	for _, f := range files {
		b, err := ioutil.ReadFile(f)
		if err != nil {
			return fmt.Errorf("read %s: %w", f, err)
		}
		if len(b) == 0 {
			continue
		}
		if _, err := db.Exec(string(b)); err != nil {
			return fmt.Errorf("exec %s: %w", f, err)
		}
	}

	return nil
}
