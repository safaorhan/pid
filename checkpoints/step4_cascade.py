from pybricks.hubs import InventorHub
from pybricks.pupdevices import Motor
from pybricks.parameters import Port, Button
from pybricks.tools import wait
from pybricks.iodevices import XboxController
from PID import PID

# ---------- Step 4: PID inside a PID ----------
# The outer speed loop picks the lean angle, the inner roll loop holds it.
# Fine-tune the roll PID live with the controller (finer steps than step 3):
#   D-pad UP / DOWN : Kp +/- 1
#   Y / A           : Kd +/- 0.01
#   RB / LB         : Ki +/- 10

# ---------- Helper functions ----------
def clamp(value, min_value, max_value):
    return max(min_value, min(value, max_value))

# ---------- Setup ----------
hub = InventorHub()

print("...")
controller = XboxController()
print("connected")

left = Motor(Port.A)
right = Motor(Port.E)

counter = 0
last_pressed = []
roll_pid = PID(22, 140, 0.22, 100)
speed_pid = PID(0.006, 0.0014, 0.000005, 30)

upright = 90
target_roll = upright
target_speed = 0
is_active = False
power = 0

while True:
    roll = hub.imu.tilt()[1]

    # Safety stop if robot falls
    if abs(upright - roll) > 45:
        power = roll_pid.reset()
        speed_pid.reset()
        target_roll = upright
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

    # Read the controller every few cycles, react only to new presses
    if counter % 10 == 0:
        pressed = controller.buttons.pressed()
        new = [b for b in pressed if b not in last_pressed]
        last_pressed = pressed

        if new:
            if Button.UP in new:
                roll_pid.Kp += 1
            if Button.DOWN in new:
                roll_pid.Kp = max(0, roll_pid.Kp - 1)
            if Button.Y in new:
                roll_pid.Kd = round(roll_pid.Kd + 0.01, 2)
            if Button.A in new:
                roll_pid.Kd = max(0, round(roll_pid.Kd - 0.01, 2))
            if Button.RB in new:
                roll_pid.Ki += 10
            if Button.LB in new:
                roll_pid.Ki = max(0, roll_pid.Ki - 10)

            # PID.py derives the integral limit from Ki, so refresh it
            if roll_pid.Ki == 0:
                roll_pid.integral_limit = 0
            else:
                roll_pid.integral_limit = abs(100 / roll_pid.Ki)

            # display.number() doesn't block; display.text() scrolls and would
            if Button.UP in new or Button.DOWN in new:
                hub.display.number(roll_pid.Kp)
            elif Button.Y in new or Button.A in new:
                hub.display.number(int(roll_pid.Kd * 100))
            elif Button.RB in new or Button.LB in new:
                hub.display.number(roll_pid.Ki // 10)

            print("Kp", roll_pid.Kp, "Ki", roll_pid.Ki, "Kd", roll_pid.Kd)

    left.dc(-int(power))
    right.dc(int(power))

    wait(10)
