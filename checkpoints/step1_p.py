from pybricks.hubs import InventorHub
from pybricks.pupdevices import Motor
from pybricks.parameters import Port
from pybricks.tools import wait
from PID import PID

# ---------- Step 1: P only ----------
# Motor power is proportional to how far we lean from upright.

# ---------- Setup ----------
hub = InventorHub()

left = Motor(Port.A)
right = Motor(Port.E)

roll_pid = PID(22, 0, 0, 100)

upright = 90
is_active = False
power = 0

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

    left.dc(-int(power))
    right.dc(int(power))

    wait(10)
