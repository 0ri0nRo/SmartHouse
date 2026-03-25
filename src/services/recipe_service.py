"""
Recipe Service - Fetches a daily recipe from TheMealDB (free, no API key needed).
The recipe is stable for the whole day (same seed = same meal).
"""

import requests
import logging
from datetime import date

logger = logging.getLogger(__name__)

THEMEALDB_BASE = "https://www.themealdb.com/api/json/v1/1"


class RecipeService:
    def __init__(self):
        self._cache: dict = {}   # {"date": "2026-03-25", "meal": {...}}

    def get_daily_recipe(self) -> dict:
        """
        Return today's recipe. Cached in memory so we don't hammer TheMealDB.
        Uses the numeric day-of-year as a pseudo-random seed to pick a category,
        then fetches a random meal from that category.
        """
        today = date.today().isoformat()

        # Return cached value if still valid for today
        if self._cache.get("date") == today and self._cache.get("meal"):
            return self._cache["meal"]

        meal = self._fetch_meal_for_today()
        self._cache = {"date": today, "meal": meal}
        return meal

    # ──────────────────────────────────────────────────────────
    # Private helpers
    # ──────────────────────────────────────────────────────────

    def _fetch_meal_for_today(self) -> dict:
        """
        Pick a category deterministically based on the day-of-year,
        then grab a random meal from that category via TheMealDB.
        Falls back to a fully random meal if anything goes wrong.
        """
        try:
            categories = self._get_categories()
            if categories:
                day_index = date.today().timetuple().tm_yday  # 1–366
                category = categories[day_index % len(categories)]
                meal = self._get_random_meal_from_category(category)
                if meal:
                    return meal
        except Exception as e:
            logger.warning(f"RecipeService: category strategy failed: {e}")

        # Fallback: fully random meal
        return self._get_random_meal()

    def _get_categories(self) -> list[str]:
        """Return a sorted list of meal category names."""
        res = requests.get(f"{THEMEALDB_BASE}/categories.php", timeout=8)
        res.raise_for_status()
        data = res.json()
        return sorted([c["strCategory"] for c in data.get("categories", [])])

    def _get_random_meal_from_category(self, category: str) -> dict | None:
        """Return a random meal dict from a given category, or None on failure."""
        res = requests.get(
            f"{THEMEALDB_BASE}/filter.php",
            params={"c": category},
            timeout=8,
        )
        res.raise_for_status()
        meals = res.json().get("meals") or []
        if not meals:
            return None

        # Pick a meal deterministically within the category
        day_index = date.today().timetuple().tm_yday
        chosen = meals[day_index % len(meals)]
        return self._get_meal_by_id(chosen["idMeal"])

    def _get_meal_by_id(self, meal_id: str) -> dict | None:
        """Fetch full meal details by id."""
        res = requests.get(
            f"{THEMEALDB_BASE}/lookup.php",
            params={"i": meal_id},
            timeout=8,
        )
        res.raise_for_status()
        meals = res.json().get("meals") or []
        return meals[0] if meals else None

    def _get_random_meal(self) -> dict:
        """Fetch a completely random meal from TheMealDB."""
        res = requests.get(f"{THEMEALDB_BASE}/random.php", timeout=8)
        res.raise_for_status()
        meals = res.json().get("meals") or []
        if not meals:
            raise ValueError("TheMealDB returned no meals")
        return meals[0]