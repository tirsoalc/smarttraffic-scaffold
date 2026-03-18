package com.smarttrafficflow.backend.api.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record TrafficRecordResponse(
        UUID id,
        OffsetDateTime timestamp,
        String roadType,
        Integer vehicleVolume,
        String eventType,
        String weather,
        String region
) {
}
