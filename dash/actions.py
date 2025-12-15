from __future__ import division, print_function
import sys
import os

from morseapi import MorseRobot
import time
import random

# Import stack for movement tracking
try:
    from . import stack
except Exception:
    import stack

AVAILABLE_COLORS = [
    "red",
    "green",
    "blue",
    "white",
    "fuchsia", # roxo
    "darkorange" # amarelo
]

# Head movement limits for thinking
HEAD_YAW_LEFT = -15   # Most left position
HEAD_YAW_RIGHT = 15   # Most right position

# Thinking sounds - using confused noises
THINKING_SOUNDS = [
    "confused2",
    "confused3",
    "confused5",
    "confused8",
]

def connect(robot):
    """Function to connect to the Morse robot with retries."""
    connected = False
    for _ in range(5):
        try:
            robot.connect()
            robot.reset()
            connected = True
            print("Connected to the robot successfully.")
            # TODO remove
            robot.neck_color("blue")
            robot.eye_brightness(5)
            break
        except Exception as e:
            time.sleep(2)  # Wait before retrying
    if not connected:
        robot.stop()
        raise Exception("Could not connect to the robot after multiple attempts.")
    return

def move(robot, distance_mm, speed_mmps=1000, no_turn=True, movement_stack=None):
    """
    Move the robot forward or backward by specified distance.
    Optionally track the movement in a stack for rollback.
    
    :param robot: The MorseRobot instance
    :param distance_mm: Distance to move in millimeters (positive forward, negative backward)
    :param speed_mmps: Speed in millimeters per second (default 1000)
    :param no_turn: If True, prevent turning when moving backward (default True)
    :param movement_stack: Optional DashStack instance to track movements
    """
    robot.move(distance_mm, speed_mmps, no_turn)
    if movement_stack is not None:
        movement_stack.push(
            stack.DashMovement(stack.MovementType.MOVE, distance_mm)
        )

def turn(robot, angle, speed=200, movement_stack=None):
    """
    Turn the robot by the specified angle.
    Optionally track the turn in a stack for rollback.
    
    :param robot: The MorseRobot instance
    :param angle: Angle to turn in degrees
    :param speed: Rotation speed (degrees per second)
    :param movement_stack: Optional DashStack instance to track movements
    """
    robot.turn(angle, speed)
    if movement_stack is not None:
        movement_stack.push(
            stack.DashMovement(stack.MovementType.TURN, angle)
        )

def think(robot):
    """Function that makes an eye movement to simulate thinking.
    
    The robot looks in 4 different positions while the LEDs progressively light up.
    Head yaw limits: HEAD_YAW_LEFT to HEAD_YAW_RIGHT (left to right)
    Head pitch limits: -5 to 10 (down to up)
    """
    # Play a random thinking noise at the start
    robot.say(random.choice(THINKING_SOUNDS))
    time.sleep(random.uniform(0.1, 0.4))
    
    # Start looking to the left
    robot.head_yaw(HEAD_YAW_LEFT)
    time.sleep(random.uniform(0.3, 0.6))
    
    # Create a rotating pattern through the 12 LEDs to simulate thinking
    # with progressively lighting LEDs
    led_mask = 0
    for i in range(12):
        # Add the next LED to the mask (progressively light up)
        led_mask |= (1 << i)
        robot.eye(led_mask)
        time.sleep(random.uniform(0.4, 0.7))  # Slower pause between each LED
        
        # Shift head position only at the start of each group (every 3 LEDs)
        if i % 6 == 0:
            head_position_index = i // 3  # 0-3 for i in 0, 3, 6, 9
            yaw_angle = HEAD_YAW_LEFT + (head_position_index / 3.0) * (HEAD_YAW_RIGHT - HEAD_YAW_LEFT)
            robot.head_yaw(int(yaw_angle))
            robot.say(random.choice(THINKING_SOUNDS))
            time.sleep(random.uniform(0.3, 0.6))
        
        # Add a simple nod every 4 LEDs to seem the robot is thinking
        if (i + 1) % 2 == 0:
            robot.head_pitch(5)  # Mid-range nod up
            time.sleep(random.uniform(0.3, 0.6))  # Slower head movement
            robot.head_pitch(-2)  # Nod down
            time.sleep(random.uniform(0.3, 0.6))  # Slower head movement
            robot.head_pitch(0)  # Return to neutral
            time.sleep(random.uniform(0.3, 0.6))    
            # Play random thinking sound occasionall
            robot.move(50, 200, True)
        else:
            robot.move(-50, 200, True)
            time.sleep(random.uniform(0.5, 0.8))
    
    # Turn off all LEDs at the end
    robot.eye(0)
    # Return head to neutral position
    robot.head_yaw(0)
    robot.head_pitch(0)

def found_answer(robot, color):
    """Function that makes the robot react happily when finding an answer.
    
    :param robot: The MorseRobot instance
    :param color: Color of the answer (6-digit e.g. #fa3b2c, 3-digit e.g. #fbb, 
                  or fully spelled color e.g. white)
    """
    # Light up all LEDs with the answer color
    all_leds = 0b111111111111  # All 12 LEDs lit (8191 in decimal)
    robot.eye(all_leds)
    robot.head_yaw(0)
    robot.head_pitch(0)
    robot.say("bragging")
    robot.turn(180, 50)
    time.sleep(.2)

    # Set all colored lights to the answer color
    robot.neck_color(color)
    robot.left_ear_color(color)
    robot.right_ear_color(color)

    robot.turn(90, 50)
    robot.head_yaw(-16)
    time.sleep(.3)
    robot.head_yaw(16)
    robot.turn(-90, 50)
    
    time.sleep(.5)
    robot.move(50, 200, True)
    time.sleep(.5)

    # Nod head up and down (happy nodding)
    robot.turn(45, 50)
    time.sleep(.1)
    robot.head_pitch(-53)
    time.sleep(.1)
    robot.head_pitch(53)
    time.sleep(.1)
    robot.head_pitch(-53)
    time.sleep(.1)
    robot.head_pitch(53)
    time.sleep(.1)
    robot.turn(-45, 50)

    time.sleep(.3)
    robot.move(-50, 200, True)
    time.sleep(.3)
    
    # Keep lights on for a moment longer
    time.sleep(1)
    
    # Turn off all LEDs
    turn_off_lights(robot)

    time.sleep(.2)
    robot.turn(-180, 50)


def turn_off_lights(robot):
    """Turn off all lights on the robot."""
    robot.eye(0)
    robot.neck_color("black")
    robot.left_ear_color("black")
    robot.right_ear_color("black")