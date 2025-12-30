from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import time
import sys
import os
import csv
from datetime import datetime

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

# Track think() state
think_lock = threading.Lock()
think_state = {
    'status': 'idle',   # 'idle' | 'thinking' | 'done'
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
        # Mark think as pending
        with think_lock:
            think_state['status'] = 'thinking'
            think_state['updated_at'] = time.time()
        
        def _do_think():
            try:
                bot.think()
            except Exception as e:
                print('Error during bot.think:')
                print(e)
            finally:
                with think_lock:
                    think_state['status'] = 'done'
                    think_state['updated_at'] = time.time()
        
        # Run in thread to not block response
        threading.Thread(target=_do_think).start()
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
        # CRITICAL: Mark as pending but DON'T start find_answer yet
        # We will wait for think() to complete first
        with suggest_lock:
            suggest_state['status'] = 'pending'
            suggest_state['color'] = color
            suggest_state['updated_at'] = time.time()

        def _wait_for_think_then_find(c):
            # STEP 1: Wait for think() to complete (max 20 seconds)
            print('[suggest] Waiting for think() to complete...')
            start_wait = time.time()
            while True:
                with think_lock:
                    if think_state['status'] == 'done':
                        print('[suggest] think() is done, proceeding to find_answer()')
                        break
                
                if time.time() - start_wait > 20:
                    print('[suggest] Timeout waiting for think(), proceeding anyway')
                    break
                
                time.sleep(0.1)  # Poll every 100ms
            
            # STEP 2: Now call find_answer() only after think() is complete
            try:
                bot.find_answer(c)
            except Exception as e:
                print('Error during bot.find_answer:')
                print(e)
            finally:
                with suggest_lock:
                    suggest_state['status'] = 'done'
                    suggest_state['color'] = c
                    suggest_state['updated_at'] = time.time()
                print('[suggest] find_answer({0}) complete'.format(c))

        threading.Thread(target=_wait_for_think_then_find, args=(color,)).start()
        return jsonify({"status": "suggesting", "color": color})
    return jsonify({"error": "Robot not connected"}), 503


@app.route('/suggest/status', methods=['GET'])
def suggest_status():
    """Return the status of the last suggestion and think action.
    
    Both think() and found_answer() (via suggest) must be 'done' for robot to be ready.
    """
    qcolor = request.args.get('color')
    
    with think_lock:
        think = dict(think_state)
    
    with suggest_lock:
        suggest = dict(suggest_state)

    # If a color was requested and it doesn't match the tracked color, report idle for suggest
    if qcolor and suggest.get('color') and qcolor != suggest.get('color'):
        # There is a tracked suggestion but for a different color
        suggest = {'status': 'idle', 'color': qcolor}

    # Robot is only completely idle when BOTH think and suggest are done
    combined_status = 'idle'
    if think.get('status') != 'idle' or suggest.get('status') != 'idle':
        combined_status = 'pending'
    
    return jsonify({
        'status': combined_status,
        'think': think,
        'suggest': suggest
    })

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

@app.route('/csv', methods=['POST'])
def save_csv():
    """Save round data to CSV file named after participant ID."""
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    try:
        participant_id = data.get('participantId', 'unknown')
        csv_file = '{0}.csv'.format(participant_id)
        file_exists = os.path.isfile(csv_file)
        
        # Define CSV columns
        fieldnames = [
            'participantId', 'roundId', 'roundIndex', 'condition', 'correctCable', 
            'cableChosen', 'outcome', 'timeTaken', 'llmSuggestion', 
            'dashSuggestion', 'cutBeforeFeedback', 'timestamp'
        ]
        
        # Add timestamp if not present
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now().isoformat()
        
        # Python 2 compatible file opening (no newline or encoding parameters)
        with open(csv_file, 'ab') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            
            # Write header if file is new
            if not file_exists:
                writer.writeheader()
            
            # Write the data row
            row = {k: data.get(k, '') for k in fieldnames}
            writer.writerow(row)
        
        print("CSV data saved to {0}".format(csv_file))
        return jsonify({"status": "saved", "file": csv_file}), 200
    
    except Exception as e:
        print("Error saving CSV: {0}".format(str(e)))
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Attempt initial connection
    get_robot()
    print("Starting Flask server on port 5000...")
    app.run(host='0.0.0.0', port=5000)
