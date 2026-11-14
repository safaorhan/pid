from pybricks.hubs import InventorHub
from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor
from pybricks.parameters import Button, Color, Direction, Port, Side, Stop
from pybricks.robotics import DriveBase
from pybricks.tools import wait, StopWatch
from pybricks.tools import multitask, run_task


hub = InventorHub()

async def loop1():
    global hub
    while True:
        print("loop1")
        await hub.speaker.beep(500, 100)
        await wait(1000)

async def loop2():
    global hub
    while True:
        print("loop2")
        await hub.speaker.beep(300, 100)
        await wait(2000)

async def main():
    await multitask(loop1(), loop2())

run_task(main())

