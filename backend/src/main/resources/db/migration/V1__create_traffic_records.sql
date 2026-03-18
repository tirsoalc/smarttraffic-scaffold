CREATE TABLE traffic_records (
    id UUID PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    road_type VARCHAR(100) NOT NULL,
    vehicle_volume INTEGER NOT NULL,
    event_type VARCHAR(150),
    weather VARCHAR(100),
    region VARCHAR(150)
);
