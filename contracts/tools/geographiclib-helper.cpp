// Reference helper for contracts/tools/generate-vectors.mjs.
//
// GeoConvert has no command-line mode for GARS, GEOREF or for UPS outside
// GeographicLib's own UPS policy range (about 83.5N / 79.5S). This program
// calls the same GeographicLib classes directly so that every expected value
// in contracts/test-vectors still comes from GeographicLib, never from the
// code under test.
//
// Build: c++ -std=c++17 -O2 -I<prefix>/include geographiclib-helper.cpp \
//          -L<prefix>/lib -lGeographicLib -o geographiclib-helper
//
// Usage (one record per stdin line, one result per stdout line; a line that
// GeographicLib rejects prints "ERROR"):
//   geographiclib-helper ups-forward          "north lat lon"  -> "easting northing"
//   geographiclib-helper ups-reverse          "north E N"      -> "lat lon"
//   geographiclib-helper gars-forward PREC    "lat lon"        -> "code"
//   geographiclib-helper gars-reverse         "code"           -> "lat lon prec"
//   geographiclib-helper georef-forward PREC  "lat lon"        -> "code"
//   geographiclib-helper georef-reverse       "code"           -> "lat lon prec"

#include <GeographicLib/Constants.hpp>
#include <GeographicLib/GARS.hpp>
#include <GeographicLib/Georef.hpp>
#include <GeographicLib/PolarStereographic.hpp>

#include <cstdio>
#include <exception>
#include <iostream>
#include <sstream>
#include <string>

using GeographicLib::GARS;
using GeographicLib::Georef;
using GeographicLib::PolarStereographic;

namespace {
constexpr double kUpsFalseOrigin = 2000000;

void print2(double first, double second) {
  std::printf("%.17g %.17g\n", first, second);
}
}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "missing mode\n");
    return 2;
  }
  const std::string mode = argv[1];
  const int prec = argc > 2 ? std::stoi(argv[2]) : 0;
  const PolarStereographic& ups = PolarStereographic::UPS();

  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream in(line);
    try {
      if (mode == "ups-forward") {
        int north;
        double lat, lon, x, y;
        in >> north >> lat >> lon;
        ups.Forward(north != 0, lat, lon, x, y);
        print2(x + kUpsFalseOrigin, y + kUpsFalseOrigin);
      } else if (mode == "ups-reverse") {
        int north;
        double easting, northing, lat, lon;
        in >> north >> easting >> northing;
        ups.Reverse(north != 0, easting - kUpsFalseOrigin,
                    northing - kUpsFalseOrigin, lat, lon);
        print2(lat, lon);
      } else if (mode == "gars-forward" || mode == "georef-forward") {
        double lat, lon;
        std::string code;
        in >> lat >> lon;
        if (mode == "gars-forward") {
          GARS::Forward(lat, lon, prec, code);
        } else {
          Georef::Forward(lat, lon, prec, code);
        }
        std::printf("%s\n", code.c_str());
      } else if (mode == "gars-reverse" || mode == "georef-reverse") {
        std::string code;
        double lat, lon;
        int outPrec;
        in >> code;
        if (mode == "gars-reverse") {
          GARS::Reverse(code, lat, lon, outPrec, true);
        } else {
          Georef::Reverse(code, lat, lon, outPrec, true);
        }
        std::printf("%.17g %.17g %d\n", lat, lon, outPrec);
      } else {
        std::fprintf(stderr, "unknown mode %s\n", mode.c_str());
        return 2;
      }
    } catch (const std::exception&) {
      std::printf("ERROR\n");
    }
  }
  return 0;
}
