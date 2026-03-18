package com.smarttrafficflow.backend.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.OffsetDateTime;

public record CreateTrafficRecordRequest(
        @NotNull OffsetDateTime timestamp,
        @NotBlank String roadType,
        @NotNull @Min(0) Integer vehicleVolume,
        String eventType,
        String weather,
        String region
) {
}
