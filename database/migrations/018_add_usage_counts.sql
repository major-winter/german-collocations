-- Decision #72: anonymous per-day usage counts (word-page lookups, parsed
-- checks), the traffic baseline #71's gates are set against. Only a day,
-- a kind and a number: nothing that identifies a visitor.
CREATE TABLE usage_counts (
    day   date    NOT NULL,
    kind  text    NOT NULL,
    count integer NOT NULL,
    PRIMARY KEY (day, kind)
);
