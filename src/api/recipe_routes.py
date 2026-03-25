"""
Recipe Routes - /api/recipe/*
"""

from flask import Blueprint, jsonify
from services.recipe_service import RecipeService
import logging

logger = logging.getLogger(__name__)

recipe_bp = Blueprint("recipe", __name__, url_prefix="/api/recipe")
_service = RecipeService()


@recipe_bp.route("/daily", methods=["GET"])
def get_daily_recipe():
    """
    GET /api/recipe/daily
    Returns today's meal from TheMealDB (stable for the whole day).
    Response is the raw TheMealDB meal object, which already includes:
      strMeal, strCategory, strArea, strMealThumb, strInstructions,
      strSource, strYoutube, strIngredient1-20, strMeasure1-20, ...
    """
    try:
        meal = _service.get_daily_recipe()
        return jsonify(meal)
    except Exception as e:
        logger.error(f"recipe/daily error: {e}")
        return jsonify({"error": str(e)}), 500