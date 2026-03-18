package com.smarttrafficflow.backend.domain.trafficrecords.repository;

import com.smarttrafficflow.backend.domain.trafficrecords.entity.TrafficRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface TrafficRecordRepository extends JpaRepository<TrafficRecord, UUID> {
}
