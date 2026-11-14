from pybricks.tools import wait, StopWatch

# ---------- PID Controller ----------
class PID:
    def __init__(self, Kp, Ki, Kd, max_output):
        self.Kp = Kp
        self.Ki = Ki
        self.Kd = Kd
        self.integral = 0
        self.last_error = 0
        self.timer = StopWatch()

        if Ki == 0:
            self.integral_limit = 0
        else:
            self.integral_limit = abs(max_output / Ki)
        

    def compute(self, setpoint, measurement):
        dt = self.timer.time() / 1000  # seconds
        self.timer.reset()
        error = setpoint - measurement

        # Proportional
        P = self.Kp * error

        # Integral
        self.integral += error * dt
        
        if self.integral > self.integral_limit:
            self.integral = self.integral_limit
        
        if self.integral < -self.integral_limit:
            self.integral = -self.integral_limit

        I = self.Ki * self.integral

        # Derivative
        D = 0
        if dt > 0:
            D = self.Kd * (error - self.last_error) / dt

        self.last_error = error
        return P + I + D

    def reset(self):
        self.integral = 0
        self.last_error = 0
        self.timer.reset()
        return 0