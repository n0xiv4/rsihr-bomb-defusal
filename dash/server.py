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
    def find_answer(self, color): print(f"MOCK: Found answer {color}")
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
                print(f"Failed to connect to Dash: {e}")
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
        threading.Thread(target=bot.find_answer, args=(color,)).start()
        return jsonify({"status": "suggesting", "color": color})
    return jsonify({"error": "Robot not connected"}), 503

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
