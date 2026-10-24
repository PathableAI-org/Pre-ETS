CREATE SCHEMA IF NOT EXISTS onsite;

CREATE TABLE onsite.visit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id text NOT NULL CHECK (char_length(tenant_id) > 0),
    coach_id text NOT NULL CHECK (char_length(coach_id) > 0),
    participant_ref text NOT NULL CHECK (char_length(participant_ref) > 0),
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    purpose_of_visit text,
    observations text,
    interventions text,
    next_steps text
);
