from __future__ import division, print_function
import time
import random

from actions import AVAILABLE_COLORS, celebrate, feel_sad, think, found_answer

# Import the DashRobot wrapper class
from robot import DashRobot

BT_ADDRESS = "D7:A1:50:13:3B:F3"

def test(bot_address):
    """
    Main robot control loop.
    Creates a DashRobot instance and executes a sequence of movements and actions.
    """
    with DashRobot(bot_address) as robot:
        try:
            robot.connect()
            print("Place dash in a flat surface.")
            while True:
                start_time = time.time()
                
                # Call the feel_sad action from actions.py
                think(robot.morse_robot)
                found_answer(robot.morse_robot, "red")

                if random.randint(0, 1) == 0:
                    celebrate(robot.morse_robot)
                else:
                    feel_sad(robot.morse_robot)
                end_time = time.time()
                time.sleep(2)
                print("Loop duration: {:.2f} seconds".format(end_time - start_time))
                # robot.rollback()

        except KeyboardInterrupt:
            robot.stop()
            pass

if __name__ == "__main__":
    test(BT_ADDRESS)