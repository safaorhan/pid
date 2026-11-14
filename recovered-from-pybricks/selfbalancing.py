from pybricks.hubs import InventorHub
from pybricks.pupdevices import Motor, UltrasonicSensor
from pybricks.parameters import Port, Direction, Button
from pybricks.tools import wait, StopWatch
from pybricks.iodevices import XboxController
from pybricks.tools import multitask, run_task
from PID import PID

# ---------- Helper functions ----------
def clamp(value, min_value, max_value):
    return max(min_value, min(value, max_value))

# ---------- Setup ----------
hub = InventorHub()

#distance = UltrasonicSensor(Port.D)

print("...")
controller = XboxController()
print("connected")

left = Motor(Port.A)
right = Motor(Port.E)

#distance.lights.on(100)

counter = 0
roll_pid = PID(22, 140, 0.22, 100)
speed_pid = PID(0.006, 0.0014, 0.000005, 30)

upright = 90
target_roll = upright
target_speed = 0
target_turn = 0
is_active = False
power = 0

while True:
    roll = hub.imu.tilt()[1]

    # Safety stop if robot falls
    if abs(upright - roll) > 45:
        power = roll_pid.reset()
        speed_pid.reset()
        target_roll = upright
        target_speed = 0
        is_active = False

    # Activate balance when upright
    if abs(upright - roll) < 20:
        is_active = True

    if is_active:
        power = roll_pid.compute(setpoint=target_roll, measurement=roll)

    # Update speed PID every few cycles
    counter = (counter + 1) % 10000

    if counter % 5 == 0:
        speed = (-left.speed() + right.speed())/2
        raw_target_roll = upright - speed_pid.compute(setpoint=target_speed, measurement=speed)
        target_roll = clamp(raw_target_roll, 60, 120)

    if counter % 10 == 0:
        target_speed = - controller.joystick_right()[1] * 6
        target_turn = controller.joystick_left()[0] / 2
        (left_trigger, right_trigger) = controller.triggers()

        if left_trigger > 10:
            hub.speaker.beep(left_trigger*6, -1)
        else:
            hub.speaker.beep(0,0)
    


    left.dc(-int(power)-target_turn)
    right.dc(int(power)-target_turn)

    wait(10)


