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
    turn_off_lights(robot)
    robot.say(random.choice(THINKING_SOUNDS))
    time.sleep(0.1)
    
    # Start looking to the left
    robot.head_yaw(HEAD_YAW_LEFT)
    time.sleep(0.1)
    
    led_mask = 0
    for i in range(12):
        led_mask |= (1 << i)
        robot.eye(led_mask)
        time.sleep(0.2)
        
        if i % 6 == 0:
            head_position_index = i // 3  # 0-3 for i in 0, 3, 6, 9
            yaw_angle = HEAD_YAW_LEFT + (head_position_index / 3.0) * (HEAD_YAW_RIGHT - HEAD_YAW_LEFT)
            robot.head_yaw(int(yaw_angle))
            robot.say(random.choice(THINKING_SOUNDS))
            time.sleep(0.1)
        
        if i % 2 == 0:
            robot.move(25, 200, True)
            time.sleep(.8)
            robot.head_pitch(5)
            time.sleep(0.1)
            robot.head_pitch(-2)
            time.sleep(0.1)
            robot.head_pitch(0)
            time.sleep(0.1)    
        else:
            robot.move(-25, 200, True)
            time.sleep(0.8)
    
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
    turn_all_lights(robot, color)
    robot.say("bragging")
    robot.turn(180, 100)
    time.sleep(.2)

    robot.turn(90, 50)
    robot.head_yaw(-16)
    time.sleep(.3)
    robot.head_yaw(16)
    robot.turn(-90, 50)
    
    time.sleep(.5)
    robot.move(25, 200, True)
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
    robot.move(-25, 200, True)
    time.sleep(.3)
    
    # Keep lights on for a moment longer
    time.sleep(1)
    
    # Turn off all LEDs
    turn_off_lights(robot)


def turn_all_lights(robot, color):
    """Set all lights on the robot to the specified color."""
    robot.eye(0b111111111111)  # All 12 LEDs lit
    robot.neck_color(color)
    # robot.left_ear_color(color)
    robot.right_ear_color(color)

def turn_off_lights(robot):
    """Turn off all lights on the robot."""
    robot.eye(0)
    robot.neck_color("black")
    robot.left_ear_color("black")
    robot.right_ear_color("black")

def celebrate(robot):
    """Function that makes the robot celebrate with movements and sounds.
    
    :param robot: The MorseRobot instance
    """
    sounds = ["systexcited_01", "systexcited_02", "systexcited_06", "systfantastic"]
    
    # Neutral position
    robot.head_yaw(0)
    robot.head_pitch(0)
    time.sleep(0.1)
    
    # Head movement limits
    LEFT = -53
    RIGHT = -20
    UP = 5
    DOWN = -3
    
    TURN = 180
    TURN_SPEED = 200
    TIME = 0.2
    
    for i in range(2):        
        # Alternate spinning direction
        if i % 2 == 0:
            robot.say(random.choice(sounds), volume=0.5)
            robot.turn(TURN, TURN_SPEED)
        else:
            robot.turn(-TURN, TURN_SPEED)
        
        # Head movement sequence
        robot.head_yaw(LEFT)
        robot.head_pitch(DOWN)
        time.sleep(TIME)
        
        robot.head_yaw(RIGHT)
        robot.head_pitch(UP)
        time.sleep(TIME)
        
        robot.head_yaw(0)
        robot.head_pitch(0)
        time.sleep(TIME)
        
        robot.head_yaw(RIGHT)
        robot.head_pitch(DOWN)
        time.sleep(TIME)
        
        robot.head_yaw(LEFT)
        robot.head_pitch(UP)
        time.sleep(TIME)
    
    # Return to neutral position
    robot.head_yaw(0)
    robot.head_pitch(0)

    time.sleep(.2)
    robot.turn(-170, 50)

def feel_sad(robot):
    """Function that makes the robot express sadness with head movements and sounds.
    
    :param robot: The MorseRobot instance
    """
    sounds = [
        "systawww_04",
        "systoh_no_unh",
        "systnot_good",
        "systnotthatone",
        "systoops_03",
    ]
    
    turn_all_lights(robot, "red")
    # Reset to looking up position
    robot.head_pitch(5)
    robot.head_yaw(0)
    robot.say(random.choice(sounds), volume=0.5)
    turn_off_lights(robot)
    time.sleep(1)
    
    # Shake head "no" (left to right)
    turn_all_lights(robot, "red")
    robot.head_yaw(-15)
    time.sleep(0.5)
    robot.head_yaw(15)
    time.sleep(0.5)
    turn_off_lights(robot)
    robot.head_yaw(0)
    turn_all_lights(robot, "red")
    # Look down (sad posture)
    robot.head_pitch(-5)
    time.sleep(2.5)
    robot.say(random.choice(sounds), volume=0.5)
    turn_off_lights(robot)
    
    # Return to neutral position
    robot.head_yaw(0)
    time.sleep(.2)
    robot.turn(-170, 50)