ALTER TABLE migration_demo.example_record
ADD COLUMN status text NOT NULL DEFAULT 'pending'
CONSTRAINT example_record_status_check CHECK (status IN ('pending', 'complete'));
