package com.smarttrafficflow.backend.api.controller;

import com.smarttrafficflow.backend.api.dto.TrafficStatsResponse;
import com.smarttrafficflow.backend.domain.analytics.service.AnalyticsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/traffic-stats")
public class AnalyticsController {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsController.class);

    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping
    public TrafficStatsResponse getStats(@RequestParam String groupBy) {
        log.info("GET /api/traffic-stats - requested groupBy={}", groupBy);
        TrafficStatsResponse response = analyticsService.getStats(groupBy);
        log.info("GET /api/traffic-stats - returning {} aggregated labels for groupBy={}",
                response.labels().size(), groupBy);
        return response;
    }
}
