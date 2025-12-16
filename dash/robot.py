"""
DashRobot: A wrapper around MorseRobot that orchestrates actions and maintains a movement stack.
This allows chaining robot actions and rolling back movements if needed.
"""
from __future__ import division, print_function

from morseapi import MorseRobot
import random

# Import local modules
try:
    from . import actions, stack
except Exception:
    import actions, stack


class DashRobot:
    """
    A high-level wrapper around MorseRobot that provides action orchestration
    and movement history tracking via an internal DashStack.
    
    Usage:
        robot = DashRobot("D7:A1:50:13:3B:F3")
        robot.connect()
        robot.think()
        robot.find_answer("red")
        robot.rollback()  # Undo last movements
    """
    
    def __init__(self, bluetooth_address):
        """
        Initialize DashRobot with a Bluetooth address.
        
        :param bluetooth_address: MAC address of the robot (e.g., "D7:A1:50:13:3B:F3")
        """
        self.morse_robot = MorseRobot(bluetooth_address)
        self.movement_stack = stack.DashStack(self.morse_robot)
    
    def __enter__(self):
        """Context manager entry."""
        self.morse_robot.__enter__()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        return self.morse_robot.__exit__(exc_type, exc_val, exc_tb)
    
    def connect(self):
        """
        Connect to the robot with automatic retries.
        
        :raises Exception: If connection fails after multiple attempts
        """
        actions.connect(self.morse_robot)
    
    def think(self):
        """
        Make the robot perform a thinking animation with LED patterns and head movements.
        """
        actions.think(self.morse_robot)
    
    def find_answer(self, color):
        """
        Make the robot react happily to finding an answer with the specified color.
        
        :param color: Color name (e.g., "red", "green"), hex code, or CSS color (e.g., "#fa3b2c")
        """
        actions.found_answer(self.morse_robot, color)
    
    def move(self, distance_mm, speed_mmps=1000, no_turn=True, track=False):
        """
        Move the robot forward or backward by specified distance.
        Optionally track the movement in the stack for rollback.
        
        :param distance_mm: Distance to move in millimeters (positive forward, negative backward)
        :param speed_mmps: Speed in millimeters per second (default 1000)
        :param no_turn: If True, prevent turning when moving backward (default True)
        :param track: If True, add movement to stack for potential rollback
        """
        actions.move(self.morse_robot, distance_mm, speed_mmps, no_turn,
                     self.movement_stack if track else None)
    
    def turn(self, angle, speed=200, track=True):
        """
        Turn the robot by the specified angle.
        Optionally tracks the turn in the stack for rollback.
        
        :param angle: Angle to turn in degrees
        :param speed: Rotation speed (degrees per second)
        :param track: If True, add turn to stack for potential rollback (default True)
        """
        actions.turn(self.morse_robot, angle, speed,
                     self.movement_stack if track else None)
    
    def drive(self, distance):
        """
        Drive the robot forward/backward by the specified distance.
        
        :param distance: Distance in mm (positive forward, negative backward)
        """
        self.morse_robot.drive(distance)
    
    def stop(self):
        """Stop all robot movement."""
        self.morse_robot.stop()
    
    def rollback(self):
        """
        Undo the last movements in reverse order using the movement stack.
        """
        self.movement_stack.rollback()

    def turn_all_lights(self, color):
        """Set all lights on the robot to the specified color."""
        actions.turn_all_lights(self.morse_robot, color)
    
    def celebrate(self):
        """
        Make the robot celebrate with movements and sounds.
        """
        actions.celebrate(self.morse_robot)

    def feel_sad(self):
        """
        Make the robot express sadness.
        """
        actions.feel_sad(self.morse_robot)

    def view_movement_history(self):
        """Display the current movement stack."""
        self.movement_stack.view_stack()
