"""Reference values for EPSG:3857 (WGS 84 / Pseudo-Mercator).

Independent of the code under test: Python's C math library and the
asinh(tan(phi)) form of the defining formula (EPSG Guidance Note 7-2,
method 1024), while the JavaScript/Java cores use log(tan(pi/4 + phi/2)).

stdin:  "latitude longitude" per line (degrees)
stdout: "x y" per line (metres, repr round-trip precision)
"""

import math
import sys

A = 6378137.0


def main() -> None:
    for line in sys.stdin:
        latitude, longitude = (float(token) for token in line.split())
        x = A * math.radians(longitude)
        y = A * math.asinh(math.tan(math.radians(latitude)))
        sys.stdout.write(f"{x!r} {y!r}\n")


if __name__ == "__main__":
    main()
