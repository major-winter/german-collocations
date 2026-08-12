CREATE TABLE sentences (
    id int PRIMARY KEY,
    sentence text NOT NULL
);

CREATE TABLE collocation_examples (
    left_word_id int NOT NULL,
    right_word_id int NOT NULL,
    sentence_id int NOT NULL REFERENCES sentences(id),
    PRIMARY KEY (left_word_id, right_word_id, sentence_id),
    FOREIGN KEY (left_word_id, right_word_id) REFERENCES collocations(left_word_id, right_word_id)
);
