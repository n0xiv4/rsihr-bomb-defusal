from __future__ import division, print_function
import time
from morseapi import MorseRobot
from enum import Enum

class MovementType(Enum):
    TURN = "turn"
    MOVE = "move"

class DashMovement:
    def __init__(self, movement_type, value):
        self.movement_type = movement_type
        self.value = value  # e.g., distance in cm or angle in degrees

class DashStack:
    def __init__(self, robot):
        self.robot = robot
        self.stack = []

    def view_stack(self):
        print("Current Stack:", self.stack)

    def push(self, item):
        self.stack.append(item)

    def is_empty(self):
        """Check if the stack is empty."""
        return len(self.stack) == 0

    def pop(self):
        if not self.is_empty():
            return self.stack.pop()
        else:
            print("Stack is empty, cannot pop.")
            return None
        
    def rollback(self):
        while not self.is_empty():
            movement = self.pop()
            if movement.movement_type == MovementType.TURN:
                self.robot.turn(-movement.value, 50)
            elif movement.movement_type == MovementType.MOVE:
                self.robot.move(-movement.value, 200, True)
            time.sleep(.5)
    