package io.github.mertc0604.converttools.coordinates.model;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;

public record CoordinatePoint(double latitude, double longitude) {
    public CoordinatePoint {
        if (!Double.isFinite(latitude) || latitude < -90 || latitude > 90) {
            throw new ConvertToolsException(ErrorCode.LATITUDE_OUT_OF_RANGE,
                    "Latitude must be between -90 and 90."
            );
        }
        if (!Double.isFinite(longitude)
                || longitude < -180
                || longitude > 180) {
            throw new ConvertToolsException(ErrorCode.LONGITUDE_OUT_OF_RANGE,
                    "Longitude must be between -180 and 180."
            );
        }
    }
}
