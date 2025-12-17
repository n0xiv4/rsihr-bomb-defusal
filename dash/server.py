from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import time
import sys
import os

# Ensure we can import from local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Mock Robot for development/testing when dependencies are missing
class MockRobot:
    def connect(self): print("MOCK: Connected to Dash")
    def think(self): print("MOCK: Thinking...")
    def find_answer(self, color): print("MOCK: Found answer")
    def celebrate(self): print("MOCK: Celebrating!")
    def feel_sad(self): print("MOCK: Feeling sad :(")

try:
    from robot import DashRobot
except ImportError:
    print("WARNING: Could not import DashRobot (missing dependencies?). Using MockRobot.")
    DashRobot = MockRobot




app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Robot singleton
robot = None
robot_lock = threading.Lock()

# Track the last suggestion state so the web frontend can wait until Dash finishes
suggest_lock = threading.Lock()
suggest_state = {
    'status': 'idle',   # 'idle' | 'pending' | 'done'
    'color': None,
    'updated_at': None
}

BT_ADDRESS = "D7:A1:50:13:3B:F3"

def get_robot():
    global robot
    with robot_lock:
        if robot is None:
            try:
                print("Connecting to Dash...")
                robot = DashRobot(BT_ADDRESS)
                robot.connect()
                print("Dash Connected!")
            except Exception as e:
                print("Failed to connect to Dash:")
                print(e)
                robot = None
        return robot

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "robot_connected": robot is not None})

@app.route('/think', methods=['POST'])
def think():
    bot = get_robot()
    if bot:
        # Run in thread to not block response
        threading.Thread(target=bot.think).start()
        return jsonify({"status": "thinking"})
    return jsonify({"error": "Robot not connected"}), 503

@app.route('/suggest', methods=['POST'])
def suggest():
    data = request.json
    color = data.get('color')
    if not color:
        return jsonify({"error": "Missing color"}), 400
    
    bot = get_robot()
    if bot:
        # Dash logic involves finding the answer (moving/pointing)
        with suggest_lock:
            suggest_state['status'] = 'pending'
            suggest_state['color'] = color
            suggest_state['updated_at'] = time.time()

        def _find_and_mark(c):
            try:
                bot.find_answer(c)
            except Exception as e:
                print('Error during bot.find_answer:')
            finally:
                with suggest_lock:
                    suggest_state['status'] = 'done'
                    suggest_state['color'] = c
                    suggest_state['updated_at'] = time.time()

        threading.Thread(target=_find_and_mark, args=(color,)).start()
        return jsonify({"status": "suggesting", "color": color})
    return jsonify({"error": "Robot not connected"}), 503


@app.route('/suggest/status', methods=['GET'])
def suggest_status():
    """Return the status of the last suggestion.

    Optional query param `color` can be provided to check status for a specific color.
    """
    qcolor = request.args.get('color')
    with suggest_lock:
        state = dict(suggest_state)

    # If a color was requested and it doesn't match the tracked color, report idle
    if qcolor and state.get('color') and qcolor != state.get('color'):
        # There is a tracked suggestion but for a different color
        return jsonify({"status": "idle", "color": qcolor})

    return jsonify(state)

@app.route('/celebrate', methods=['POST'])
def celebrate():
    bot = get_robot()
    if bot:
        threading.Thread(target=bot.celebrate).start()
        return jsonify({"status": "celebrating"})
    return jsonify({"error": "Robot not connected"}), 503

@app.route('/sad', methods=['POST'])
def sad():
    bot = get_robot()
    if bot:
        threading.Thread(target=bot.feel_sad).start()
        return jsonify({"status": "sad"})
    return jsonify({"error": "Robot not connected"}), 503

if __name__ == '__main__':
    # Attempt initial connection
    get_robot()
    print("Starting Flask server on port 5000...")
    app.run(host='0.0.0.0', port=5000)
