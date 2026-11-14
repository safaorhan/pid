from pybricks.hubs import InventorHub
from pybricks.pupdevices import Motor
from pybricks.parameters import Port, Button
from pybricks.tools import wait
from pybricks.iodevices import XboxController
from PID import PID

# ---------- Step 3: full PID, tuned live with the controller ----------
#   D-pad UP / DOWN : Kp +/- 2
#   Y / A           : Kd +/- 0.02
#   RB / LB         : Ki +/- 20
# The hub shows the gain you just changed (Kp, Kd x100, Ki /10).
# The exact values are printed to the Pybricks console.

# ---------- Setup ----------
hub = InventorHub()

print("...")
controller = XboxController()
print("connected")

left = Motor(Port.A)
right = Motor(Port.E)

roll_pid = PID(22, 0, 0.22, 100)

upright = 90
is_active = False
power = 0

counter = 0
last_pressed = []

while True:
    roll = hub.imu.tilt()[1]

    # Safety stop if robot falls
    if abs(upright - roll) > 45:
        power = roll_pid.reset()
        is_active = False

    # Activate balance when upright
    if abs(upright - roll) < 20:
        is_active = True

    if is_active:
        power = roll_pid.compute(setpoint=upright, measurement=roll)

    counter = (counter + 1) % 10000

    # Read the controller every few cycles, react only to new presses
    if counter % 10 == 0:
        pressed = controller.buttons.pressed()
        new = [b for b in pressed if b not in last_pressed]
        last_pressed = pressed

        if new:
            if Button.UP in new:
                roll_pid.Kp += 2
            if Button.DOWN in new:
                roll_pid.Kp = max(0, roll_pid.Kp - 2)
            if Button.Y in new:
                roll_pid.Kd = round(roll_pid.Kd + 0.02, 2)
            if Button.A in new:
                roll_pid.Kd = max(0, round(roll_pid.Kd - 0.02, 2))
            if Button.RB in new:
                roll_pid.Ki += 20
            if Button.LB in new:
                roll_pid.Ki = max(0, roll_pid.Ki - 20)

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
