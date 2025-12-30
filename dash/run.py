from __future__ import division, print_function
import time
import random

from actions import AVAILABLE_COLORS

# Import the DashRobot wrapper class
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
            print("Place dash in a flat surface.")
            time.sleep(2)
            while True:
                sounds = ["systwhistle_a", "systwhistle_b", "bragging"]
                for sound in sounds:
                    print("Playing sound:", sound)
                    robot.morse_robot.say(sound, volume=0.5)
                    time.sleep(4)

        except KeyboardInterrupt:
            robot.stop()
            pass

if __name__ == "__main__":
    run(BT_ADDRESS)