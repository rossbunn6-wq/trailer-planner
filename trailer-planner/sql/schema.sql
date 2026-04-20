-- Run this once in your Neon SQL editor to set up the schema

CREATE TABLE IF NOT EXISTS gear_library (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  width_in NUMERIC NOT NULL,
  depth_in NUMERIC NOT NULL,
  height_in NUMERIC NOT NULL,
  weight_lbs NUMERIC NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#378ADD',
  rotation TEXT NOT NULL DEFAULT 'both',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_layouts (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  trailer_length_in NUMERIC NOT NULL,
  trailer_width_in NUMERIC NOT NULL,
  max_payload_lbs NUMERIC NOT NULL DEFAULT 45000,
  placements JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
