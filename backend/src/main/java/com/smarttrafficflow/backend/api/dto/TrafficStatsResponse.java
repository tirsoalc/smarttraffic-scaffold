package com.smarttrafficflow.backend.api.dto;

import java.util.List;

public record TrafficStatsResponse(
        List<String> labels,
        List<Integer> values
) {
}
