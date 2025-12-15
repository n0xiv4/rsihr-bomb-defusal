from __future__ import division, print_function
import time
import random

# Import the DashRobot wrapper class
try:
    from .robot import DashRobot
except Exception:
    from robot import DashRobot

BT_ADDRESS = "D7:A1:50:13:3B:F3"

def run(bot_address):
    """
    Main robot control loop.
    Creates a DashRobot instance and executes a sequence of movements and actions.
    """
    with DashRobot(bot_address) as robot:
        try:
            robot.connect()
            while True:
                print("Place dash in a flat surface.")
                time.sleep(3)
                robot.think()
                time.sleep(.5)
                robot.find_answer("red")  # Move forward 
                print("Found answer!")
                time.sleep(.5) 
                robot.rollback()

        except KeyboardInterrupt:
            robot.stop()
            pass

if __name__ == "__main__":
    run(BT_ADDRESS)