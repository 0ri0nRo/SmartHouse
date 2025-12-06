from flask import Blueprint, jsonify, render_template, request

shelly_bp = Blueprint('boiler', __name__)


@shelly_bp.route('/boiler')
def boiler():
    return render_template('shelly.html')  # Il file HTML della caldaia
