from pybricks.hubs import InventorHub
from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor
from pybricks.parameters import Button, Color, Direction, Port, Side, Stop
from pybricks.robotics import DriveBase
from pybricks.tools import wait, StopWatch
from pybricks.iodevices import XboxController

hub = InventorHub()

print("...")
controller = XboxController()

print("connected")

while True:
    print(controller.joystick_right())
    wait(10)
