CREATE TABLE generation_attempts (
    id BIGSERIAL PRIMARY KEY,
    game_id TEXT NOT NULL,
    puzzle_date DATE NOT NULL,
    provider_model TEXT NOT NULL,
    module_version INTEGER NOT NULL,
    validation_version INTEGER NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('started', 'published', 'rejected', 'failed', 'superseded')),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);
CREATE TABLE editions (
    game_id TEXT NOT NULL,
    puzzle_date DATE NOT NULL,
    puzzle JSONB NOT NULL,
    answer_tokens TEXT[] NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('bootstrap', 'llm')),
    attempt_id BIGINT REFERENCES generation_attempts(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(game_id, puzzle_date),
    CHECK (puzzle->>'date' = puzzle_date::text),
    CHECK (puzzle->>'game_id' = game_id)
);
CREATE INDEX editions_tokens ON editions USING GIN(answer_tokens);
CREATE FUNCTION immutable_edition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Published editions are immutable';
END;
$$;
CREATE TRIGGER protect_editions BEFORE UPDATE OR DELETE ON editions FOR EACH ROW EXECUTE FUNCTION immutable_edition();
